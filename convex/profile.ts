import { getAuthUserId } from '@convex-dev/auth/server';
import { mutationGeneric as mutation, queryGeneric as query } from 'convex/server';
import { v } from 'convex/values';

import { currentRingRadius } from './boostRules';
import { effectiveXpMultiplier, isVipActive } from './planRules';
import { DEFAULT_DAILY_STEP_GOAL } from './stepGoalRules';

const DEFAULT_MAP_THEME = 'dark';

function defaultUserStatsRow(userId: any, now: number, overrides: Record<string, unknown> = {}) {
  return {
    userId,
    totalXp: 0,
    level: 1,
    rankId: 'tulak',
    verifiedSteps: 0,
    verifiedDistanceMeters: 0,
    explorationUnits: 0,
    visualAreaSquareMeters: 0,
    currentStreakDays: 0,
    longestStreakDays: 0,
    updatedAt: now,
    ...overrides,
  };
}

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
 * Consumes one map_theme_token to PERMANENTLY unlock the map's Dark/Light
 * toggle (settings.tsx) — a one-time unlock, not a timed boost like
 * items.ts's useItem. Idempotent: if already unlocked, this is a free no-op
 * (no inventory touched) rather than a second consumption, protecting a
 * double-tap and any leftover tokens sitting in inventory from being spent
 * on something already owned.
 */
export const unlockMapTheme = mutation({
  args: {},
  returns: v.union(v.object({ ok: v.literal(true) }), v.object({ ok: v.literal(false), reason: v.literal('not_owned') })),
  handler: async (ctx: any) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error('unlockMapTheme: not authenticated');

    const stats = await ctx.db
      .query('userStats')
      .withIndex('by_user', (q: any) => q.eq('userId', userId))
      .unique();
    if (stats?.mapThemeUnlocked) return { ok: true as const };

    const inventoryRow = await ctx.db
      .query('userInventoryItems')
      .withIndex('by_user_item', (q: any) => q.eq('userId', userId).eq('itemId', 'map_theme_token'))
      .unique();
    if (!inventoryRow || inventoryRow.quantity <= 0) {
      return { ok: false as const, reason: 'not_owned' as const };
    }

    const now = Date.now();
    await ctx.db.patch(inventoryRow._id, { quantity: inventoryRow.quantity - 1, updatedAt: now });
    const patch = { mapThemeUnlocked: true, mapTheme: 'light' as const, updatedAt: now };
    if (stats) {
      await ctx.db.patch(stats._id, patch);
    } else {
      await ctx.db.insert('userStats', defaultUserStatsRow(userId, now, patch));
    }
    return { ok: true as const };
  },
});

/** Free to flip once unlocked (see unlockMapTheme) — refuses if it never was. */
export const setMapTheme = mutation({
  args: { theme: v.union(v.literal('dark'), v.literal('light')) },
  returns: v.union(v.object({ ok: v.literal(true) }), v.object({ ok: v.literal(false), reason: v.literal('not_unlocked') })),
  handler: async (ctx: any, args: any) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error('setMapTheme: not authenticated');

    const stats = await ctx.db
      .query('userStats')
      .withIndex('by_user', (q: any) => q.eq('userId', userId))
      .unique();
    if (!stats?.mapThemeUnlocked) return { ok: false as const, reason: 'not_unlocked' as const };

    await ctx.db.patch(stats._id, { mapTheme: args.theme, updatedAt: Date.now() });
    return { ok: true as const };
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
      mapThemeUnlocked: v.boolean(),
      mapTheme: v.union(v.literal('dark'), v.literal('light')),
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
      mapThemeUnlocked: stats?.mapThemeUnlocked ?? false,
      mapTheme: stats?.mapTheme ?? DEFAULT_MAP_THEME,
    };
  },
});
