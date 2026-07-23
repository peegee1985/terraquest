import { getAuthUserId } from '@convex-dev/auth/server';
import { mutationGeneric as mutation } from 'convex/server';
import { v } from 'convex/values';

import { grantItem } from './inventory';
import { isValidPromoCodeFormat, normalizePromoCode, promoCodeRejectionReason } from './promoCodeRules';

const redeemResultValidator = v.union(
  v.object({ ok: v.literal(true) }),
  v.object({
    ok: v.literal(false),
    reason: v.union(
      v.literal('invalid_format'),
      v.literal('not_found'),
      v.literal('inactive'),
      v.literal('expired'),
      v.literal('redemption_limit_reached'),
      v.literal('already_redeemed'),
    ),
  }),
);

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

/**
 * Redeeming a discount code — with no real billing wired up yet (see the
 * "hold off on real billing" decision) — grants VIP directly with the
 * code's bonusXpMultiplier, standing in for "code discounts the paid plan"
 * until a real checkout exists to apply percentOff against.
 */
export const redeemDiscountCode = mutation({
  args: { code: v.string(), now: v.number() },
  returns: redeemResultValidator,
  handler: async (ctx: any, args: any) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error('redeemDiscountCode: not authenticated');

    const code = normalizePromoCode(args.code);
    if (!isValidPromoCodeFormat(code)) return { ok: false as const, reason: 'invalid_format' as const };

    const row = await ctx.db
      .query('discountCodes')
      .withIndex('by_code', (q: any) => q.eq('code', code))
      .unique();
    if (!row) return { ok: false as const, reason: 'not_found' as const };

    const rejection = promoCodeRejectionReason(row, args.now);
    if (rejection) return { ok: false as const, reason: rejection };

    const alreadyRedeemed = await ctx.db
      .query('discountCodeRedemptions')
      .withIndex('by_user_code', (q: any) => q.eq('userId', userId).eq('code', code))
      .unique();
    if (alreadyRedeemed) return { ok: false as const, reason: 'already_redeemed' as const };

    const stats = await ctx.db
      .query('userStats')
      .withIndex('by_user', (q: any) => q.eq('userId', userId))
      .unique();
    const patch = {
      plan: 'vip' as const,
      xpMultiplier: row.bonusXpMultiplier ?? 1.5,
      planSource: 'promo_code' as const,
      updatedAt: args.now,
    };
    if (stats) {
      await ctx.db.patch(stats._id, patch);
    } else {
      await ctx.db.insert('userStats', defaultUserStatsRow(userId, args.now, patch));
    }

    await ctx.db.insert('discountCodeRedemptions', { userId, code, redeemedAt: args.now });
    await ctx.db.patch(row._id, { redemptionsCount: row.redemptionsCount + 1 });
    return { ok: true as const };
  },
});

/** A small welcome gift for redeeming an invite code — invites don't gate sign-up itself (anyone can already register), so this is the entire effect for now. */
const INVITE_REWARD_ITEM_ID = 'memory_marker';
const INVITE_REWARD_QUANTITY = 1;

export const redeemInviteCode = mutation({
  args: { code: v.string(), now: v.number() },
  returns: redeemResultValidator,
  handler: async (ctx: any, args: any) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error('redeemInviteCode: not authenticated');

    const code = normalizePromoCode(args.code);
    if (!isValidPromoCodeFormat(code)) return { ok: false as const, reason: 'invalid_format' as const };

    const row = await ctx.db
      .query('inviteCodes')
      .withIndex('by_code', (q: any) => q.eq('code', code))
      .unique();
    if (!row) return { ok: false as const, reason: 'not_found' as const };

    const rejection = promoCodeRejectionReason(row, args.now);
    if (rejection) return { ok: false as const, reason: rejection };

    const alreadyRedeemed = await ctx.db
      .query('inviteCodeRedemptions')
      .withIndex('by_user_code', (q: any) => q.eq('userId', userId).eq('code', code))
      .unique();
    if (alreadyRedeemed) return { ok: false as const, reason: 'already_redeemed' as const };

    await grantItem(ctx, { userId, itemId: INVITE_REWARD_ITEM_ID, quantity: INVITE_REWARD_QUANTITY, now: args.now });
    await ctx.db.insert('inviteCodeRedemptions', { userId, code, redeemedAt: args.now });
    await ctx.db.patch(row._id, { redemptionsCount: row.redemptionsCount + 1 });
    return { ok: true as const };
  },
});
