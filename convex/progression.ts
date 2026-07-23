import { queryGeneric as query } from 'convex/server';
import { v } from 'convex/values';

import { levelProgress as computeLevelProgress, rankForLevel } from './progressionRules';

/** Level/rank/progress derived from the server-authoritative userStats.totalXp — the same source finishSession's XP events feed via applyXpEvent. */
export const getProgression = query({
  args: { userId: v.id('users') },
  returns: v.union(
    v.null(),
    v.object({
      totalXp: v.number(),
      level: v.number(),
      rankId: v.string(),
      rankLabel: v.string(),
      currentLevelXp: v.number(),
      requiredLevelXp: v.number(),
      ratio: v.number(),
    }),
  ),
  handler: async (ctx: any, args: any) => {
    const stats = await ctx.db
      .query('userStats')
      .withIndex('by_user', (q: any) => q.eq('userId', args.userId))
      .unique();
    if (!stats) return null;

    const progress = computeLevelProgress(stats.totalXp);
    const rank = rankForLevel(progress.level);
    return {
      totalXp: stats.totalXp,
      level: progress.level,
      rankId: rank.rankId,
      rankLabel: rank.label,
      currentLevelXp: progress.current,
      requiredLevelXp: progress.required,
      ratio: progress.ratio,
    };
  },
});

/** Every level this user has ever been granted a reward for — the audit trail behind "odemknutí je idempotentní". */
export const listLevelClaims = query({
  args: { userId: v.id('users') },
  returns: v.array(v.object({ level: v.number(), rankId: v.string(), claimedAt: v.number() })),
  handler: async (ctx: any, args: any) => {
    const rows = await ctx.db
      .query('userLevelClaims')
      .withIndex('by_user_level', (q: any) => q.eq('userId', args.userId))
      .collect();
    return rows
      .map((row: any) => ({ level: row.level, rankId: row.rankId, claimedAt: row.claimedAt }))
      .sort((a: { level: number }, b: { level: number }) => a.level - b.level);
  },
});
