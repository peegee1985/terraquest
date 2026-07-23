import { queryGeneric as query } from 'convex/server';
import { v } from 'convex/values';

import { evaluateNewlyUnlocked, type AchievementMetrics } from './achievementRules';
import { grantItem } from './inventory';
import { PROGRESSION_VERSION } from './progressionRules';
import { awardXp } from './xpAward';

/**
 * TQ-30 acceptance criterion "tier se odemkne právě jednou": existence of a
 * (userId, achievementId) row in userAchievements IS the idempotency check
 * — same row-existence pattern as userLevelClaims/poiDiscoveries. Kept as a
 * plain function (not a mutation) so it's called inline from whichever
 * mutation just updated a tracked counter (discoverPoi, claimQuest,
 * recordQualifyingDay), committing the counter update and any newly-unlocked
 * achievement in the same atomic transaction — same pattern as awardXp.
 *
 * Returns [] rather than throwing when userStats doesn't exist yet, since
 * bumpUserStatsCounter/recordQualifyingDay always create it before this
 * runs in every real call site — but a defensive no-op is cheap insurance
 * against call-order mistakes rather than a hard crash.
 */
export async function checkAndGrantAchievements(
  ctx: any,
  args: { userId: any; occurredAt: number },
): Promise<{ id: string; category: string; rarity: string }[]> {
  const stats = await ctx.db
    .query('userStats')
    .withIndex('by_user', (q: any) => q.eq('userId', args.userId))
    .unique();
  if (!stats) return [];

  const metrics: AchievementMetrics = {
    longestStreakDays: stats.longestStreakDays ?? 0,
    poiDiscoveriesCount: stats.poiDiscoveriesCount ?? 0,
    dailyQuestsClaimedCount: stats.dailyQuestsClaimedCount ?? 0,
    weeklyQuestsClaimedCount: stats.weeklyQuestsClaimedCount ?? 0,
  };

  const existingRows = await ctx.db
    .query('userAchievements')
    .withIndex('by_user_achievement', (q: any) => q.eq('userId', args.userId))
    .collect();
  const alreadyUnlockedIds = new Set<string>(existingRows.map((row: any) => row.achievementId as string));

  const newlyUnlocked = evaluateNewlyUnlocked(metrics, alreadyUnlockedIds);
  const granted: { id: string; category: string; rarity: string }[] = [];

  for (const definition of newlyUnlocked) {
    // Re-check per definition (not just the snapshot above) — same defense
    // pattern as userLevelClaims' per-level check in xpAward.ts.
    const existing = await ctx.db
      .query('userAchievements')
      .withIndex('by_user_achievement', (q: any) => q.eq('userId', args.userId).eq('achievementId', definition.id))
      .unique();
    if (existing) continue;

    await ctx.db.insert('userAchievements', {
      userId: args.userId,
      achievementId: definition.id,
      category: definition.category,
      rarity: definition.rarity,
      unlockedAt: args.occurredAt,
    });

    if (definition.rewardXp > 0) {
      await awardXp(ctx, {
        userId: args.userId,
        eventId: `achievement:${definition.id}`,
        sourceType: 'achievement',
        sourceId: definition.id,
        amount: definition.rewardXp,
        reasonCode: 'achievement_unlock',
        rulesVersion: PROGRESSION_VERSION,
        occurredAt: args.occurredAt,
      });
    }

    if (definition.itemReward) {
      await grantItem(ctx, {
        userId: args.userId,
        itemId: definition.itemReward.itemId,
        quantity: definition.itemReward.quantity,
        now: args.occurredAt,
      });
    }

    granted.push({ id: definition.id, category: definition.category, rarity: definition.rarity });
  }

  return granted;
}

const achievementRowValidator = v.object({
  achievementId: v.string(),
  category: v.union(v.literal('consistency'), v.literal('exploration'), v.literal('quests')),
  rarity: v.union(v.literal('common'), v.literal('rare'), v.literal('epic'), v.literal('legendary')),
  unlockedAt: v.number(),
});

/** Read-only view of a user's unlocked achievements. */
export const listAchievementsForUser = query({
  args: { userId: v.id('users') },
  returns: v.array(achievementRowValidator),
  handler: async (ctx: any, args: any) => {
    const rows = await ctx.db
      .query('userAchievements')
      .withIndex('by_user_achievement', (q: any) => q.eq('userId', args.userId))
      .collect();
    return rows.map((row: any) => ({
      achievementId: row.achievementId,
      category: row.category,
      rarity: row.rarity,
      unlockedAt: row.unlockedAt,
    }));
  },
});

