import { getAuthUserId } from '@convex-dev/auth/server';
import { mutationGeneric as mutation, queryGeneric as query } from 'convex/server';
import { v } from 'convex/values';

// Kept in sync manually with src/domain/memory-marker.ts's
// MEMORY_MARKER_NOTE_MAX_LENGTH — same cross-bundle duplication this
// codebase already accepts elsewhere (levelRewardRules.ts / level-rewards.ts).
const MEMORY_MARKER_NOTE_MAX_LENGTH = 80;

const memoryMarkerView = v.object({
  markerId: v.id('memoryMarkers'),
  latitude: v.number(),
  longitude: v.number(),
  note: v.string(),
  createdAt: v.number(),
});

/** Always scoped to the caller's own userId — memoryMarkers has no visibility field at all (see schema.ts's comment): these notes are never shared or queried cross-user. */
export const listMyMemoryMarkers = query({
  args: {},
  returns: v.array(memoryMarkerView),
  handler: async (ctx: any) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const rows = await ctx.db
      .query('memoryMarkers')
      .withIndex('by_user', (q: any) => q.eq('userId', userId))
      .collect();
    return rows.map((row: any) => ({
      markerId: row._id,
      latitude: row.latitude,
      longitude: row.longitude,
      note: row.note,
      createdAt: row.createdAt,
    }));
  },
});

const placeMemoryMarkerResult = v.union(
  v.object({ ok: v.literal(true) }),
  v.object({ ok: v.literal(false), reason: v.literal('not_owned') }),
);

/**
 * Consumes one Memory Marker from inventory and drops a personal note pin
 * at the given point. A dedicated mutation rather than a branch inside
 * items.ts's useItem — that one only takes {itemId}, and this needs a
 * lat/lng/note payload, so reusing it would mean threading optional args
 * through a mutation that otherwise never needs them.
 */
export const placeMemoryMarker = mutation({
  args: { latitude: v.number(), longitude: v.number(), note: v.string() },
  returns: placeMemoryMarkerResult,
  handler: async (ctx: any, args: any) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error('placeMemoryMarker: not authenticated');

    const note = args.note.trim().slice(0, MEMORY_MARKER_NOTE_MAX_LENGTH);
    if (!note) throw new Error('placeMemoryMarker: note must not be empty');

    const inventoryRow = await ctx.db
      .query('userInventoryItems')
      .withIndex('by_user_item', (q: any) => q.eq('userId', userId).eq('itemId', 'memory_marker'))
      .unique();
    if (!inventoryRow || inventoryRow.quantity <= 0) {
      return { ok: false as const, reason: 'not_owned' as const };
    }

    const now = Date.now();
    await ctx.db.patch(inventoryRow._id, { quantity: inventoryRow.quantity - 1, updatedAt: now });
    await ctx.db.insert('memoryMarkers', {
      userId,
      latitude: args.latitude,
      longitude: args.longitude,
      note,
      createdAt: now,
    });

    return { ok: true as const };
  },
});

/** Ownership-checked delete — "smazat" once the reminder's been acted on (milk bought, whatever). Silently no-ops on a marker that isn't the caller's own or no longer exists, rather than erroring, since a double-tap on the same delete button is a real, harmless UI race. */
export const deleteMemoryMarker = mutation({
  args: { markerId: v.id('memoryMarkers') },
  returns: v.null(),
  handler: async (ctx: any, args: any) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error('deleteMemoryMarker: not authenticated');
    const marker = await ctx.db.get(args.markerId);
    if (marker && marker.userId === userId) {
      await ctx.db.delete(args.markerId);
    }
    return null;
  },
});
