import { queryGeneric as query } from 'convex/server';
import { v } from 'convex/values';

const itemIdValidator = v.union(
  v.literal('map_theme_token'),
  v.literal('scanner_pulse'),
  v.literal('memory_marker'),
  v.literal('radius_boost_potion'),
  v.literal('xp_boost_potion'),
  v.literal('satellite_scan'),
);

/**
 * TQ-30: quantity-stacking grant, insert-or-patch by (userId, itemId).
 *
 * Idempotency note: this function itself has no dedup guard — it always
 * adds `quantity`. That's intentional and safe because its only caller
 * (achievements.ts's checkAndGrantAchievements) only ever reaches this line
 * from inside an already-idempotent unlock: the userAchievements
 * row-existence check runs first and short-circuits on a repeat, so
 * grantItem never re-runs for the same achievement. "Inventář přežije
 * opakovanou synchronizaci" holds because the thing that could repeat
 * (replaying the same discoverPoi/claimQuest call) is itself guarded
 * upstream, not because this function re-derives idempotency on its own.
 *
 * Kept as a plain function, not a mutation, so it runs inside the caller's
 * own transaction — same pattern as awardXp/bumpUserStatsCounter.
 */
export async function grantItem(
  ctx: any,
  args: { userId: any; itemId: string; quantity: number; now: number },
): Promise<void> {
  const existing = await ctx.db
    .query('userInventoryItems')
    .withIndex('by_user_item', (q: any) => q.eq('userId', args.userId).eq('itemId', args.itemId))
    .unique();

  if (existing) {
    await ctx.db.patch(existing._id, { quantity: existing.quantity + args.quantity, updatedAt: args.now });
  } else {
    await ctx.db.insert('userInventoryItems', {
      userId: args.userId,
      itemId: args.itemId,
      quantity: args.quantity,
      updatedAt: args.now,
    });
  }
}

/** Read-only view of a user's MVP inventory. Never includes anything that could affect XP or a leaderboard — see schema.ts's userInventoryItems comment. */
export const listInventoryForUser = query({
  args: { userId: v.id('users') },
  returns: v.array(v.object({ itemId: itemIdValidator, quantity: v.number() })),
  handler: async (ctx: any, args: any) => {
    const rows = await ctx.db
      .query('userInventoryItems')
      .withIndex('by_user_item', (q: any) => q.eq('userId', args.userId))
      .collect();
    return rows.map((row: any) => ({ itemId: row.itemId, quantity: row.quantity }));
  },
});
