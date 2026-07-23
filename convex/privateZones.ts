import { getAuthUserId } from '@convex-dev/auth/server';
import { mutationGeneric as mutation, queryGeneric as query } from 'convex/server';
import { v } from 'convex/values';

// TQ-34 (scoped MVP — see schema.ts's privateZones comment for what's
// deliberately not covered yet). userId always comes from getAuthUserId(ctx)
// — a client only ever manages its OWN zones, same identity pattern as
// every other mutation added alongside a first real client caller this
// session (discoverPoi, ensureDailyQuests, followByHandle, ...).

const zoneRowValidator = v.object({
  _id: v.id('privateZones'),
  label: v.string(),
  latitude: v.number(),
  longitude: v.number(),
  radiusMeters: v.number(),
});

export const listMyPrivateZones = query({
  args: {},
  returns: v.array(zoneRowValidator),
  handler: async (ctx: any) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const rows = await ctx.db
      .query('privateZones')
      .withIndex('by_user', (q: any) => q.eq('userId', userId))
      .collect();
    return rows.map((row: any) => ({ _id: row._id, label: row.label, latitude: row.latitude, longitude: row.longitude, radiusMeters: row.radiusMeters }));
  },
});

export const addPrivateZone = mutation({
  args: { label: v.string(), latitude: v.number(), longitude: v.number(), radiusMeters: v.number() },
  returns: v.id('privateZones'),
  handler: async (ctx: any, args: any) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error('addPrivateZone: not authenticated');
    return await ctx.db.insert('privateZones', {
      userId,
      label: args.label,
      latitude: args.latitude,
      longitude: args.longitude,
      radiusMeters: args.radiusMeters,
      createdAt: Date.now(),
    });
  },
});

export const removePrivateZone = mutation({
  args: { zoneId: v.id('privateZones') },
  returns: v.null(),
  handler: async (ctx: any, args: any) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error('removePrivateZone: not authenticated');
    const zone = await ctx.db.get(args.zoneId);
    if (zone && zone.userId === userId) await ctx.db.delete(args.zoneId);
    return null;
  },
});
