import { getAuthUserId } from '@convex-dev/auth/server';
import { mutationGeneric as mutation, queryGeneric as query } from 'convex/server';
import { v } from 'convex/values';

import { currentRingRadius } from './boostRules';
import { effectiveXpMultiplier, isVipActive } from './planRules';
import { DEFAULT_DAILY_STEP_GOAL } from './stepGoalRules';

// TQ-45: sets the profile's ISO 3166-1 alpha-2 country code, the field the
// country leaderboard filters on (convex/leaderboards.ts). Deliberately not
// validated against a hardcoded country-code list here — that's a client-side
// concern (a picker backed by a real list), and rejecting unknown codes
// server-side would just make this mutation the single point of failure for
// keeping that list in sync. userId comes from getAuthUserId(ctx) — a client
// can only ever set its OWN country, never another user's.
export const setCountry = mutation({
  args: { country: v.string() },
  returns: v.null(),
  handler: async (ctx: any, args: any) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error('setCountry: not authenticated');
    await ctx.db.patch(userId, { country: args.country, updatedAt: Date.now() });
    return null;
  },
});

/**
 * The Pokrok/Nastavení/Leaderboard screens' single source of truth for
 * "my own" identity + real lifetime stats — consolidates fields that
 * previously only existed as hardcoded demo values in progress.tsx.
 * `visualAreaSquareMeters` is deliberately NOT included here: it's never
 * actually written anywhere (grep confirms only ever initialized to 0),
 * since exploration area is tracked client-side via the H3 cell set
 * (explorer-context.tsx's revealedCells) instead — this profile just
 * covers the stats that genuinely live server-side.
 */
export const getMyProfile = query({
  args: {},
  returns: v.union(
    v.null(),
    v.object({
      userId: v.id('users'),
      handle: v.string(),
      displayName: v.optional(v.string()),
      avatarId: v.string(),
      avatarPhotoUrl: v.optional(v.string()),
      country: v.optional(v.string()),
      totalXp: v.number(),
      verifiedDistanceMeters: v.number(),
      explorationUnits: v.number(),
      poiDiscoveriesCount: v.number(),
      currentStreakDays: v.number(),
      longestStreakDays: v.number(),
      dailyStepGoal: v.number(),
      stepGoalCurrentStreakDays: v.number(),
      stepGoalLongestStreakDays: v.number(),
      isVip: v.boolean(),
      xpMultiplier: v.number(),
      planExpiresAt: v.optional(v.number()),
      // TQ-122: the ring radius fog reveal should use right now — base (1)
      // + any permanent per-level bump + an active temporary boost, not
      // expired. Computed server-side (same "client reads a ready number"
      // precedent as isVip/xpMultiplier above) so the boost-expiry check
      // has exactly one implementation (boostRules.ts).
      currentRingRadius: v.number(),
      permanentRadiusRingBonus: v.number(),
      activeRadiusBoostExpiresAt: v.optional(v.number()),
      activeXpBoostExpiresAt: v.optional(v.number()),
      activeXpBoostMultiplier: v.optional(v.number()),
    }),
  ),
  handler: async (ctx: any) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const user = await ctx.db.get(userId);
    if (!user) return null;
    const stats = await ctx.db
      .query('userStats')
      .withIndex('by_user', (q: any) => q.eq('userId', userId))
      .unique();
    const now = Date.now();
    const avatarPhotoUrl = user.avatarStorageId ? await ctx.storage.getUrl(user.avatarStorageId) : null;
    return {
      userId,
      handle: user.handle,
      displayName: user.displayName,
      avatarId: user.avatarId,
      avatarPhotoUrl: avatarPhotoUrl ?? undefined,
      country: user.country,
      totalXp: stats?.totalXp ?? 0,
      verifiedDistanceMeters: stats?.verifiedDistanceMeters ?? 0,
      explorationUnits: stats?.explorationUnits ?? 0,
      poiDiscoveriesCount: stats?.poiDiscoveriesCount ?? 0,
      currentStreakDays: stats?.currentStreakDays ?? 0,
      longestStreakDays: stats?.longestStreakDays ?? 0,
      dailyStepGoal: stats?.dailyStepGoal ?? DEFAULT_DAILY_STEP_GOAL,
      stepGoalCurrentStreakDays: stats?.stepGoalCurrentStreakDays ?? 0,
      stepGoalLongestStreakDays: stats?.stepGoalLongestStreakDays ?? 0,
      isVip: isVipActive(stats?.plan, stats?.planExpiresAt, now),
      xpMultiplier: effectiveXpMultiplier(stats?.xpMultiplier, stats?.plan, stats?.planExpiresAt, now),
      planExpiresAt: stats?.planExpiresAt,
      currentRingRadius: currentRingRadius(
        stats?.permanentRadiusRingBonus,
        stats?.activeRadiusBoostExpiresAt,
        stats?.activeRadiusBoostRingBonus,
        now,
      ),
      permanentRadiusRingBonus: stats?.permanentRadiusRingBonus ?? 0,
      activeRadiusBoostExpiresAt: stats?.activeRadiusBoostExpiresAt,
      activeXpBoostExpiresAt: stats?.activeXpBoostExpiresAt,
      activeXpBoostMultiplier: stats?.activeXpBoostMultiplier,
    };
  },
});
