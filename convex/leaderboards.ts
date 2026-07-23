import { getAuthUserId } from '@convex-dev/auth/server';
import { mutationGeneric as mutation, queryGeneric as query } from 'convex/server';
import { v } from 'convex/values';

import { rankEntries, type LeaderboardEntry } from './leaderboardRules';
import { isVipActive } from './planRules';

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
  isVip: v.boolean(),
  score: v.number(),
  rank: v.number(),
});

type StatsRow = {
  userId: any;
  totalXp: number;
  explorationUnits: number;
  plan?: 'free' | 'vip';
  planExpiresAt?: number;
};
type UserRow = { handle: string; displayName?: string; avatarId: string; country?: string };

function scoreFor(stats: StatsRow, metric: 'xp' | 'explorationUnits'): number {
  return metric === 'xp' ? stats.totalXp : stats.explorationUnits;
}

async function buildEntry(
  ctx: any,
  stats: StatsRow,
  metric: 'xp' | 'explorationUnits',
): Promise<LeaderboardEntry<{ userId: any; handle: string; displayName?: string; avatarId: string; isVip: boolean }> | null> {
  const user: UserRow | null = await ctx.db.get(stats.userId);
  if (!user) return null;
  return {
    userId: stats.userId,
    handle: user.handle,
    displayName: user.displayName,
    avatarId: user.avatarId,
    isVip: isVipActive(stats.plan, stats.planExpiresAt, Date.now()),
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

    const entries: LeaderboardEntry<{ userId: any; handle: string; displayName?: string; avatarId: string; isVip: boolean }>[] = [];
    for (const stats of statsRows) {
      if (entries.length >= limit) break;
      const user: UserRow | null = await ctx.db.get(stats.userId);
      if (!user || user.country !== args.country) continue;
      entries.push({
        userId: stats.userId,
        handle: user.handle,
        displayName: user.displayName,
        avatarId: user.avatarId,
        isVip: isVipActive(stats.plan, stats.planExpiresAt, Date.now()),
        score: scoreFor(stats, metric),
      });
    }
    return rankEntries(entries);
  },
});

/**
 * Friends leaderboard — the "lightweight" follow graph (TQ-45's `follows`
 * table), not the full bidirectional friendships system. Includes the
 * requesting user themselves, since comparing yourself against who you
 * follow is the whole point of this view. userId comes from
 * getAuthUserId(ctx), not a client-supplied argument — this became the
 * first real client caller, so a caller can only ever see their OWN
 * friends leaderboard, never spoof another user's follow graph.
 */
export const listFriendsLeaderboard = query({
  args: { metric: metricValidator },
  returns: v.array(leaderboardEntryValidator),
  handler: async (ctx: any, args: any) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    const follows = await ctx.db
      .query('follows')
      .withIndex('by_follower_following', (q: any) => q.eq('followerId', userId))
      .collect();
    const userIds = [userId, ...follows.map((row: any) => row.followingId)];

    const entries: LeaderboardEntry<{ userId: any; handle: string; displayName?: string; avatarId: string; isVip: boolean }>[] = [];
    for (const otherId of userIds) {
      const stats: StatsRow | null = await ctx.db
        .query('userStats')
        .withIndex('by_user', (q: any) => q.eq('userId', otherId))
        .unique();
      if (!stats) continue;
      const entry = await buildEntry(ctx, stats, args.metric);
      if (entry) entries.push(entry);
    }
    return rankEntries(entries);
  },
});

/**
 * Idempotent: following someone already followed just returns the existing
 * relationship rather than erroring or duplicating. followerId comes from
 * getAuthUserId(ctx) — a client can only ever create a follow edge FROM
 * itself, matching every other identity-derivation in this project.
 */
export const followByHandle = mutation({
  args: { handle: v.string() },
  returns: v.object({ followingId: v.id('users'), handle: v.string() }),
  handler: async (ctx: any, args: any) => {
    const followerId = await getAuthUserId(ctx);
    if (!followerId) throw new Error('followByHandle: not authenticated');

    const target = await ctx.db
      .query('users')
      .withIndex('by_handle', (q: any) => q.eq('handle', args.handle))
      .unique();
    if (!target) throw new Error('followByHandle: no user with that handle');
    if (target._id === followerId) throw new Error('followByHandle: cannot follow yourself');

    const existing = await ctx.db
      .query('follows')
      .withIndex('by_follower_following', (q: any) => q.eq('followerId', followerId).eq('followingId', target._id))
      .unique();
    if (!existing) {
      await ctx.db.insert('follows', { followerId, followingId: target._id, createdAt: Date.now() });
    }
    return { followingId: target._id, handle: target.handle };
  },
});

export const unfollow = mutation({
  args: { followingId: v.id('users') },
  returns: v.null(),
  handler: async (ctx: any, args: any) => {
    const followerId = await getAuthUserId(ctx);
    if (!followerId) throw new Error('unfollow: not authenticated');
    const existing = await ctx.db
      .query('follows')
      .withIndex('by_follower_following', (q: any) => q.eq('followerId', followerId).eq('followingId', args.followingId))
      .unique();
    if (existing) await ctx.db.delete(existing._id);
    return null;
  },
});

/**
 * The friends leaderboard needs to show who you already follow (so the
 * invite UI can list/unfollow them), separate from the ranked-by-score
 * view above. Returns handle/displayName/avatarId per followed user —
 * enough for a simple list row, nothing else.
 */
export const listMyFollowing = query({
  args: {},
  returns: v.array(v.object({ userId: v.id('users'), handle: v.string(), displayName: v.optional(v.string()), avatarId: v.string() })),
  handler: async (ctx: any) => {
    const followerId = await getAuthUserId(ctx);
    if (!followerId) return [];
    const follows = await ctx.db
      .query('follows')
      .withIndex('by_follower_following', (q: any) => q.eq('followerId', followerId))
      .collect();
    const rows = [];
    for (const follow of follows) {
      const user: UserRow | null = await ctx.db.get(follow.followingId);
      if (user) rows.push({ userId: follow.followingId, handle: user.handle, displayName: user.displayName, avatarId: user.avatarId });
    }
    return rows;
  },
});
