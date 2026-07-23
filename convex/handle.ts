import { getAuthUserId } from '@convex-dev/auth/server';
import { mutationGeneric as mutation, queryGeneric as query } from 'convex/server';
import { v } from 'convex/values';

import { canChangeHandle, isValidHandleFormat, normalizeHandle } from './handleRules';
import { isVipActive } from './planRules';

const changeHandleResult = v.union(
  v.object({ ok: v.literal(true) }),
  v.object({
    ok: v.literal(false),
    reason: v.union(
      v.literal('guests_cannot_change_handle'),
      v.literal('invalid_format'),
      v.literal('same_handle'),
      v.literal('taken'),
      v.literal('limit_reached'),
    ),
  }),
);

/**
 * Nice-to-have username-change feature: guests are excluded entirely (a
 * guest handle is a throwaway per-install id, not an identity worth
 * spending a rate-limited change on); registered players get one change
 * ever, VIP players get up to two per rolling year — see handleRules.ts.
 * Availability is re-checked here (not just client-side via
 * checkHandleAvailability) since a race between two users picking the
 * same name is only actually prevented by this server-side check.
 */
export const changeHandle = mutation({
  args: { newHandle: v.string() },
  returns: changeHandleResult,
  handler: async (ctx: any, args: any) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error('changeHandle: not authenticated');
    const user = await ctx.db.get(userId);
    if (!user) throw new Error('changeHandle: user not found');

    if (user.isAnonymous) return { ok: false, reason: 'guests_cannot_change_handle' as const };
    if (!isValidHandleFormat(args.newHandle)) return { ok: false, reason: 'invalid_format' as const };

    const normalized = normalizeHandle(args.newHandle);
    if (normalized === normalizeHandle(user.handle)) return { ok: false, reason: 'same_handle' as const };

    const stats = await ctx.db
      .query('userStats')
      .withIndex('by_user', (q: any) => q.eq('userId', userId))
      .unique();
    const vip = isVipActive(stats?.plan, stats?.planExpiresAt, Date.now());
    const timestamps: number[] = user.handleChangeTimestamps ?? [];
    if (!canChangeHandle(vip, timestamps, Date.now())) {
      return { ok: false, reason: 'limit_reached' as const };
    }

    const existing = await ctx.db
      .query('users')
      .withIndex('by_handle', (q: any) => q.eq('handle', normalized))
      .unique();
    if (existing) return { ok: false, reason: 'taken' as const };

    await ctx.db.patch(userId, {
      handle: normalized,
      handleChangeTimestamps: [...timestamps, Date.now()],
      updatedAt: Date.now(),
    });
    return { ok: true as const };
  },
});

/** Live availability check the client calls while the user is typing, before they submit changeHandle. */
export const checkHandleAvailability = query({
  args: { handle: v.string() },
  returns: v.object({ available: v.boolean(), validFormat: v.boolean() }),
  handler: async (ctx: any, args: any) => {
    if (!isValidHandleFormat(args.handle)) return { available: false, validFormat: false };
    const existing = await ctx.db
      .query('users')
      .withIndex('by_handle', (q: any) => q.eq('handle', normalizeHandle(args.handle)))
      .unique();
    return { available: !existing, validFormat: true };
  },
});

/** How many handle changes the current user has left, and whether they're a guest — drives the Settings UI's enabled/disabled state without duplicating handleRules.ts's limit logic client-side. */
export const getMyHandleChangeStatus = query({
  args: {},
  returns: v.union(
    v.null(),
    v.object({ isGuest: v.boolean(), changesUsedInWindow: v.number(), changesAllowed: v.number() }),
  ),
  handler: async (ctx: any) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const user = await ctx.db.get(userId);
    if (!user) return null;
    if (user.isAnonymous) return { isGuest: true, changesUsedInWindow: 0, changesAllowed: 0 };

    const stats = await ctx.db
      .query('userStats')
      .withIndex('by_user', (q: any) => q.eq('userId', userId))
      .unique();
    const vip = isVipActive(stats?.plan, stats?.planExpiresAt, Date.now());
    const timestamps: number[] = user.handleChangeTimestamps ?? [];
    const now = Date.now();
    const windowMs = 365 * 24 * 60 * 60 * 1000;
    const changesUsedInWindow = vip
      ? timestamps.filter((timestamp: number) => now - timestamp < windowMs).length
      : timestamps.length;
    return { isGuest: false, changesUsedInWindow, changesAllowed: vip ? 2 : 1 };
  },
});
