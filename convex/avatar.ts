import { getAuthUserId } from '@convex-dev/auth/server';
import { mutationGeneric as mutation } from 'convex/server';
import { v } from 'convex/values';

/** Client calls this first to get a one-time upload URL, POSTs the photo bytes to it directly, then calls setAvatarPhoto with the storageId that upload returns. */
export const generateAvatarUploadUrl = mutation({
  args: {},
  returns: v.string(),
  handler: async (ctx: any) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error('generateAvatarUploadUrl: not authenticated');
    return await ctx.storage.generateUploadUrl();
  },
});

export const setAvatarPhoto = mutation({
  args: { storageId: v.id('_storage') },
  returns: v.null(),
  handler: async (ctx: any, args: any) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error('setAvatarPhoto: not authenticated');
    const user = await ctx.db.get(userId);
    const previousStorageId = user?.avatarStorageId;
    await ctx.db.patch(userId, { avatarStorageId: args.storageId, updatedAt: Date.now() });
    // Best-effort cleanup of the previous photo — never blocks the switch.
    if (previousStorageId && previousStorageId !== args.storageId) {
      await ctx.storage.delete(previousStorageId).catch(() => undefined);
    }
    return null;
  },
});

/** Switches back to a preset avatar (see src/domain/avatars.ts for the id list — not validated server-side, same "cosmetic, client-owned list" precedent as profile.ts's setCountry). Clears any uploaded photo. */
export const setAvatarPreset = mutation({
  args: { avatarId: v.string() },
  returns: v.null(),
  handler: async (ctx: any, args: any) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error('setAvatarPreset: not authenticated');
    const user = await ctx.db.get(userId);
    const previousStorageId = user?.avatarStorageId;
    await ctx.db.patch(userId, { avatarId: args.avatarId, avatarStorageId: undefined, updatedAt: Date.now() });
    if (previousStorageId) {
      await ctx.storage.delete(previousStorageId).catch(() => undefined);
    }
    return null;
  },
});
