import { getAuthUserId } from '@convex-dev/auth/server';
import { mutationGeneric as mutation, queryGeneric as query } from 'convex/server';
import { v } from 'convex/values';

import { canChangeAvatar, REGULAR_LIFETIME_AVATAR_CHANGES } from './avatarRules';
import { isVipActive } from './planRules';

/** Client calls this first to get a one-time upload URL, POSTs the photo bytes to it directly, then calls setAvatarPhoto with the storageId that upload returns. Ungated (just needs auth) since generating a URL commits nothing — the actual rate-limited change happens in setAvatarPhoto. */
export const generateAvatarUploadUrl = mutation({
  args: {},
  returns: v.string(),
  handler: async (ctx: any) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error('generateAvatarUploadUrl: not authenticated');
    return await ctx.storage.generateUploadUrl();
  },
});

const avatarChangeResult = v.union(
  v.object({ ok: v.literal(true) }),
  v.object({
    ok: v.literal(false),
    reason: v.union(v.literal('guests_cannot_change_avatar'), v.literal('limit_reached')),
  }),
);

async function checkAvatarChangeAllowed(ctx: any, userId: any) {
  const user = await ctx.db.get(userId);
  if (!user) throw new Error('checkAvatarChangeAllowed: user not found');
  if (user.isAnonymous) return { allowed: false as const, reason: 'guests_cannot_change_avatar' as const, user };

  const stats = await ctx.db
    .query('userStats')
    .withIndex('by_user', (q: any) => q.eq('userId', userId))
    .unique();
  const vip = isVipActive(stats?.plan, stats?.planExpiresAt, Date.now());
  const timestamps: number[] = user.avatarChangeTimestamps ?? [];
  if (!canChangeAvatar(vip, timestamps.length)) {
    return { allowed: false as const, reason: 'limit_reached' as const, user };
  }
  return { allowed: true as const, user, timestamps };
}

export const setAvatarPhoto = mutation({
  args: { storageId: v.id('_storage') },
  returns: avatarChangeResult,
  handler: async (ctx: any, args: any) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error('setAvatarPhoto: not authenticated');
    const check = await checkAvatarChangeAllowed(ctx, userId);
    if (!check.allowed) return { ok: false as const, reason: check.reason };

    const previousStorageId = check.user.avatarStorageId;
    await ctx.db.patch(userId, {
      avatarStorageId: args.storageId,
      avatarChangeTimestamps: [...check.timestamps, Date.now()],
      updatedAt: Date.now(),
    });
    // Best-effort cleanup of the previous photo — never blocks the switch.
    if (previousStorageId && previousStorageId !== args.storageId) {
      await ctx.storage.delete(previousStorageId).catch(() => undefined);
    }
    return { ok: true as const };
  },
});

/** Switches back to a preset avatar (see src/domain/avatars.ts for the id list — not validated server-side, same "cosmetic, client-owned list" precedent as profile.ts's setCountry). Clears any uploaded photo. Counts against the same change limit as setAvatarPhoto. */
export const setAvatarPreset = mutation({
  args: { avatarId: v.string() },
  returns: avatarChangeResult,
  handler: async (ctx: any, args: any) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error('setAvatarPreset: not authenticated');
    const check = await checkAvatarChangeAllowed(ctx, userId);
    if (!check.allowed) return { ok: false as const, reason: check.reason };

    const previousStorageId = check.user.avatarStorageId;
    await ctx.db.patch(userId, {
      avatarId: args.avatarId,
      avatarStorageId: undefined,
      avatarChangeTimestamps: [...check.timestamps, Date.now()],
      updatedAt: Date.now(),
    });
    if (previousStorageId) {
      await ctx.storage.delete(previousStorageId).catch(() => undefined);
    }
    return { ok: true as const };
  },
});

/** Mirrors handle.ts's getMyHandleChangeStatus — drives the avatar picker's remaining-changes/disabled state without duplicating avatarRules.ts's limit logic client-side. VIP has no cap at all, unlike the username change. */
export const getMyAvatarChangeStatus = query({
  args: {},
  returns: v.union(
    v.null(),
    v.object({ isGuest: v.boolean(), isVip: v.boolean(), changesUsed: v.number(), changesAllowed: v.number() }),
  ),
  handler: async (ctx: any) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const user = await ctx.db.get(userId);
    if (!user) return null;
    if (user.isAnonymous) return { isGuest: true, isVip: false, changesUsed: 0, changesAllowed: 0 };

    const stats = await ctx.db
      .query('userStats')
      .withIndex('by_user', (q: any) => q.eq('userId', userId))
      .unique();
    const vip = isVipActive(stats?.plan, stats?.planExpiresAt, Date.now());
    const changesUsed = (user.avatarChangeTimestamps ?? []).length;
    return { isGuest: false, isVip: vip, changesUsed, changesAllowed: REGULAR_LIFETIME_AVATAR_CHANGES };
  },
});
