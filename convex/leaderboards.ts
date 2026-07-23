import { mutationGeneric as mutation, queryGeneric as query } from 'convex/server';
import { v } from 'convex/values';

import { rankEntries, type LeaderboardEntry } from './leaderboardRules';

// TQ-45: written against mutationGeneric/queryGeneric from 'convex/server'
// rather than the generated ./_generated/server — same environment
// limitation (no `npx convex dev` codegen) documented across every other
// mutation/query in this project.

const METRIC_INDEX = { xp: 'by_total_xp', explorationUnits: 'by_exploration_units' } as const;
const MAX_LIMIT = 100;
// How far the country leaderboard scans (ordered by the global metric
// index) before filtering by country and taking the requested limit — docs
// 03 "Žebříčky" explicitly calls this a live-query-suffices-for-now
// approach ("při malém počtu uživatelů stačí živý indexovaný dotaz"),
// switching to a precomputed/denormalized-country approach only if this
// scan ever stops being cheap.
const COUNTRY_SCAN_LIMIT = 500;

const metricValidator = v.union(v.literal('xp'), v.literal('explorationUnits'));

const leaderboardEntryValidator = v.object({
  userId: v.id('users'),
  handle: v.string(),
  displayName: v.optional(v.string()),
  avatarId: v.string(),
  score: v.number(),
  rank: v.number(),
});

type StatsRow = { userId: any; totalXp: number; explorationUnits: number };
type UserRow = { handle: string; displayName?: string; avatarId: string; country?: string };

function scoreFor(stats: StatsRow, metric: 'xp' | 'explorationUnits'): number {
  return metric === 'xp' ? stats.totalXp : stats.explorationUnits;
}

async function buildEntry(
  ctx: any,
  stats: StatsRow,
  metric: 'xp' | 'explorationUnits',
): Promise<LeaderboardEntry<{ userId: any; handle: string; displayName?: string; avatarId: string }> | null> {
  const user: UserRow | null = await ctx.db.get(stats.userId);
  if (!user) return null;
  return {
    userId: stats.userId,
    handle: user.handle,
    displayName: user.displayName,
    avatarId: user.avatarId,
    score: scoreFor(stats, metric),
  };
}

/**
 * Global leaderboard, ranked strictly by userStats.totalXp/explorationUnits
 * — fields awardXp's confirmed-ledger recompute is the only writer of
 * (xpAward.ts), so "jen podle potvrzeného XP" is structural here, not a
 * filter that could be forgotten or bypassed by a boosted client value.
 */
export const listWorldLeaderboard = query({
  args: { metric: metricValidator, limit: v.optional(v.number()) },
  returns: v.array(leaderboardEntryValidator),
  handler: async (ctx: any, args: any) => {
    const limit = Math.min(args.limit ?? 50, MAX_LIMIT);
    const metric: 'xp' | 'explorationUnits' = args.metric;
    const statsRows: StatsRow[] = await ctx.db.query('userStats').withIndex(METRIC_INDEX[metric]).order('desc').take(limit);
    const entries = (await Promise.all(statsRows.map((stats) => buildEntry(ctx, stats, metric)))).filter(
      (entry): entry is NonNullable<typeof entry> => entry !== null,
    );
    return rankEntries(entries);
  },
});

/** Country leaderboard — requires the user to have set `country` on their profile (TQ-45's new optional field); users without one never appear here. */
export const listCountryLeaderboard = query({
  args: { metric: metricValidator, country: v.string(), limit: v.optional(v.number()) },
  returns: v.array(leaderboardEntryValidator),
  handler: async (ctx: any, args: any) => {
    const limit = Math.min(args.limit ?? 50, MAX_LIMIT);
    const metric: 'xp' | 'explorationUnits' = args.metric;
    const statsRows: StatsRow[] = await ctx.db
      .query('userStats')
      .withIndex(METRIC_INDEX[metric])
      .order('desc')
      .take(COUNTRY_SCAN_LIMIT);

    const entries: LeaderboardEntry<{ userId: any; handle: string; displayName?: string; avatarId: string }>[] = [];
    for (const stats of statsRows) {
      if (entries.length >= limit) break;
      const user: UserRow | null = await ctx.db.get(stats.userId);
      if (!user || user.country !== args.country) continue;
      entries.push({ userId: stats.userId, handle: user.handle, displayName: user.displayName, avatarId: user.avatarId, score: scoreFor(stats, metric) });
    }
    return rankEntries(entries);
  },
});

/**
 * Friends leaderboard — the "lightweight" follow graph (TQ-45's `follows`
 * table), not the full bidirectional friendships system. Includes the
 * requesting user themselves, since comparing yourself against who you
 * follow is the whole point of this view.
 */
export const listFriendsLeaderboard = query({
  args: { userId: v.id('users'), metric: metricValidator },
  returns: v.array(leaderboardEntryValidator),
  handler: async (ctx: any, args: any) => {
    const follows = await ctx.db
      .query('follows')
      .withIndex('by_follower_following', (q: any) => q.eq('followerId', args.userId))
      .collect();
    const userIds = [args.userId, ...follows.map((row: any) => row.followingId)];

    const entries: LeaderboardEntry<{ userId: any; handle: string; displayName?: string; avatarId: string }>[] = [];
    for (const userId of userIds) {
      const stats: StatsRow | null = await ctx.db
        .query('userStats')
        .withIndex('by_user', (q: any) => q.eq('userId', userId))
        .unique();
      if (!stats) continue;
      const entry = await buildEntry(ctx, stats, args.metric);
      if (entry) entries.push(entry);
    }
    return rankEntries(entries);
  },
});

/** Idempotent: following someone already followed just returns the existing relationship rather than erroring or duplicating. */
export const followByHandle = mutation({
  args: { followerId: v.id('users'), handle: v.string() },
  returns: v.object({ followingId: v.id('users'), handle: v.string() }),
  handler: async (ctx: any, args: any) => {
    const target = await ctx.db
      .query('users')
      .withIndex('by_handle', (q: any) => q.eq('handle', args.handle))
      .unique();
    if (!target) throw new Error('followByHandle: no user with that handle');
    if (target._id === args.followerId) throw new Error('followByHandle: cannot follow yourself');

    const existing = await ctx.db
      .query('follows')
      .withIndex('by_follower_following', (q: any) => q.eq('followerId', args.followerId).eq('followingId', target._id))
      .unique();
    if (!existing) {
      await ctx.db.insert('follows', { followerId: args.followerId, followingId: target._id, createdAt: Date.now() });
    }
    return { followingId: target._id, handle: target.handle };
  },
});

export const unfollow = mutation({
  args: { followerId: v.id('users'), followingId: v.id('users') },
  returns: v.null(),
  handler: async (ctx: any, args: any) => {
    const existing = await ctx.db
      .query('follows')
      .withIndex('by_follower_following', (q: any) => q.eq('followerId', args.followerId).eq('followingId', args.followingId))
      .unique();
    if (existing) await ctx.db.delete(existing._id);
    return null;
  },
});
