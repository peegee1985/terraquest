import { getAuthUserId } from '@convex-dev/auth/server';
import { mutationGeneric as mutation } from 'convex/server';
import { v } from 'convex/values';

import {
  LEVEL_UP_ITEM_ID as SCANNER_PULSE_ITEM_ID,
  RADIUS_BOOST_DURATION_MS,
  RADIUS_BOOST_ITEM_ID,
  RADIUS_BOOST_RING_BONUS,
  SCANNER_PULSE_DURATION_MS,
  SCANNER_PULSE_RING_BONUS,
  XP_BOOST_DURATION_MS,
  XP_BOOST_ITEM_ID,
  XP_BOOST_MULTIPLIER,
} from './levelRewardRules';

// Not a level-up reward (never appears in levelRewardRules.ts's table) —
// granted separately (admin, achievements, etc.). Its "use" is a pure
// client-side fog reveal (explorer-context.tsx's revealAreaAt, driven by
// fog.ts's cellsRevealedByPoint with normalizedForXp: false so it can
// never earn exploration XP for ground never actually walked) — this
// mutation's only job for it is the authoritative inventory decrement.
export const SATELLITE_SCAN_ITEM_ID = 'satellite_scan';

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

const useItemResult = v.union(
  v.object({ ok: v.literal(true), expiresAt: v.optional(v.number()) }),
  v.object({ ok: v.literal(false), reason: v.literal('not_owned') }),
);

/**
 * Consumes one unit of an activatable item from inventory.
 *
 * Radius Boost Potion / Scanner Pulse both write into the SAME
 * userStats.activeRadiusBoost* fields ("one active slot" — using either
 * while one is already active resets the expiry/magnitude rather than
 * stacking), just with Scanner Pulse's smaller/shorter numbers since it's
 * the one granted on every level-up rather than only rank-tier levels.
 * XP Boost Potion writes into the separate activeXpBoost* fields.
 * Satellite Scan touches nothing here — see SATELLITE_SCAN_ITEM_ID above.
 */
export const useItem = mutation({
  args: {
    itemId: v.union(
      v.literal(RADIUS_BOOST_ITEM_ID),
      v.literal(XP_BOOST_ITEM_ID),
      v.literal(SCANNER_PULSE_ITEM_ID),
      v.literal(SATELLITE_SCAN_ITEM_ID),
    ),
  },
  returns: useItemResult,
  handler: async (ctx: any, args: any) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error('useItem: not authenticated');

    const inventoryRow = await ctx.db
      .query('userInventoryItems')
      .withIndex('by_user_item', (q: any) => q.eq('userId', userId).eq('itemId', args.itemId))
      .unique();
    if (!inventoryRow || inventoryRow.quantity <= 0) {
      return { ok: false as const, reason: 'not_owned' as const };
    }

    const now = Date.now();
    await ctx.db.patch(inventoryRow._id, { quantity: inventoryRow.quantity - 1, updatedAt: now });

    if (args.itemId === SATELLITE_SCAN_ITEM_ID) {
      return { ok: true as const };
    }

    const isXpBoost = args.itemId === XP_BOOST_ITEM_ID;
    const isScannerPulse = args.itemId === SCANNER_PULSE_ITEM_ID;
    const expiresAt =
      now + (isXpBoost ? XP_BOOST_DURATION_MS : isScannerPulse ? SCANNER_PULSE_DURATION_MS : RADIUS_BOOST_DURATION_MS);
    const patch = isXpBoost
      ? { activeXpBoostExpiresAt: expiresAt, activeXpBoostMultiplier: XP_BOOST_MULTIPLIER, updatedAt: now }
      : {
          activeRadiusBoostExpiresAt: expiresAt,
          activeRadiusBoostRingBonus: isScannerPulse ? SCANNER_PULSE_RING_BONUS : RADIUS_BOOST_RING_BONUS,
          updatedAt: now,
        };

    const stats = await ctx.db
      .query('userStats')
      .withIndex('by_user', (q: any) => q.eq('userId', userId))
      .unique();
    if (stats) {
      await ctx.db.patch(stats._id, patch);
    } else {
      await ctx.db.insert('userStats', defaultUserStatsRow(userId, now, patch));
    }

    return { ok: true as const, expiresAt };
  },
});
