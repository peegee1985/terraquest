import { getAuthUserId } from '@convex-dev/auth/server';
import { mutationGeneric as mutation } from 'convex/server';
import { v } from 'convex/values';

import {
  RADIUS_BOOST_DURATION_MS,
  RADIUS_BOOST_ITEM_ID,
  RADIUS_BOOST_RING_BONUS,
  XP_BOOST_DURATION_MS,
  XP_BOOST_ITEM_ID,
  XP_BOOST_MULTIPLIER,
} from './levelRewardRules';

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
  v.object({ ok: v.literal(true), expiresAt: v.number() }),
  v.object({ ok: v.literal(false), reason: v.literal('not_owned') }),
);

/**
 * Activates one Radius/XP Boost Potion from inventory — consumes one unit
 * and writes the effect straight into userStats' active-boost fields
 * (fog reveal / awardXp read those, not the inventory row itself, so
 * simply owning an unused potion never affects anything). Using another
 * potion of the same kind while one is still active just resets the
 * expiry/magnitude rather than stacking — same "one active slot per kind"
 * model the schema comment documents.
 */
export const useItem = mutation({
  args: { itemId: v.union(v.literal(RADIUS_BOOST_ITEM_ID), v.literal(XP_BOOST_ITEM_ID)) },
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

    const isRadiusBoost = args.itemId === RADIUS_BOOST_ITEM_ID;
    const expiresAt = now + (isRadiusBoost ? RADIUS_BOOST_DURATION_MS : XP_BOOST_DURATION_MS);
    const patch = isRadiusBoost
      ? { activeRadiusBoostExpiresAt: expiresAt, activeRadiusBoostRingBonus: RADIUS_BOOST_RING_BONUS, updatedAt: now }
      : { activeXpBoostExpiresAt: expiresAt, activeXpBoostMultiplier: XP_BOOST_MULTIPLIER, updatedAt: now };

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
