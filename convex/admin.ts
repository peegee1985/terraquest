import { getAuthUserId } from '@convex-dev/auth/server';
import { mutationGeneric as mutation } from 'convex/server';
import { v } from 'convex/values';

/**
 * Placeholder admin gate until the real admin web app (its own phase, with
 * its own auth) exists — a hardcoded allowlist of admin emails, checked
 * against the calling user's own authenticated identity. Deliberately not a
 * schema field / role system yet: this only exists so VIP-plan assignment
 * is testable now, ahead of the full admin back office (user search/
 * ban/delete, discount codes, flagged-account review) that will replace
 * it.
 */
const ADMIN_EMAILS: readonly string[] = ['petr.gottstein@gmail.com'];

async function requireAdmin(ctx: any): Promise<void> {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error('requireAdmin: not authenticated');
  const user = await ctx.db.get(userId);
  if (!user?.email || !ADMIN_EMAILS.includes(user.email)) {
    throw new Error('requireAdmin: not an admin');
  }
}

/** Grants or revokes VIP for a target user by handle. planExpiresAt omitted means a permanent grant (isVipActive treats an absent expiry as never-expiring). */
export const setUserPlan = mutation({
  args: {
    handle: v.string(),
    plan: v.union(v.literal('free'), v.literal('vip')),
    xpMultiplier: v.optional(v.number()),
    planExpiresAt: v.optional(v.number()),
  },
  returns: v.union(v.object({ ok: v.literal(true) }), v.object({ ok: v.literal(false), reason: v.literal('user_not_found') })),
  handler: async (ctx: any, args: any) => {
    await requireAdmin(ctx);

    const targetUser = await ctx.db
      .query('users')
      .withIndex('by_handle', (q: any) => q.eq('handle', args.handle))
      .unique();
    if (!targetUser) return { ok: false as const, reason: 'user_not_found' as const };

    const now = Date.now();
    const stats = await ctx.db
      .query('userStats')
      .withIndex('by_user', (q: any) => q.eq('userId', targetUser._id))
      .unique();

    const patch = {
      plan: args.plan,
      xpMultiplier: args.plan === 'vip' ? (args.xpMultiplier ?? 1.5) : 1,
      planExpiresAt: args.plan === 'vip' ? args.planExpiresAt : undefined,
      planSource: args.plan === 'vip' ? ('admin_grant' as const) : undefined,
      updatedAt: now,
    };

    if (stats) {
      await ctx.db.patch(stats._id, patch);
    } else {
      await ctx.db.insert('userStats', {
        userId: targetUser._id,
        totalXp: 0,
        level: 1,
        rankId: 'tulak',
        verifiedSteps: 0,
        verifiedDistanceMeters: 0,
        explorationUnits: 0,
        visualAreaSquareMeters: 0,
        currentStreakDays: 0,
        longestStreakDays: 0,
        ...patch,
      });
    }
    return { ok: true as const };
  },
});
