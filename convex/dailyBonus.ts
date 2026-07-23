import { getAuthUserId } from '@convex-dev/auth/server';
import { mutationGeneric as mutation } from 'convex/server';
import { v } from 'convex/values';

import { dailyBonusXp } from './dailyBonusRules';
import { effectiveXpMultiplier } from './planRules';
import { PROGRESSION_VERSION } from './progressionRules';
import { gameDayKey } from './questRules';
import { awardXp } from './xpAward';

/**
 * Fogbreaker-style "open the app, claim a small reward" daily gift. Unlike
 * steps, claiming just requires being authenticated and it being a new
 * gameDayKey — nothing here is client-reported/fakeable data — so, unlike
 * the step-goal streak, this is fine to route through real XP. VIP's
 * xpMultiplier makes the claim worth more, per the "more daily bonuses and
 * XP multiplier" ask for the paid tier.
 *
 * Idempotent per gameDayKey: lastDailyBonusDayKey on userStats is the
 * guard, same row-existence-style pattern as the streak/quest day keys
 * elsewhere in this file set.
 */
export const claimDailyBonus = mutation({
  args: { now: v.number() },
  returns: v.union(
    v.object({ claimed: v.literal(true), awarded: v.number() }),
    v.object({ claimed: v.literal(false), reason: v.literal('already_claimed_today') }),
  ),
  handler: async (ctx: any, args: any) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error('claimDailyBonus: not authenticated');
    const user = await ctx.db.get(userId);
    if (!user) throw new Error('claimDailyBonus: user not found');

    const dayKey = gameDayKey(args.now, user.timezone);
    const stats = await ctx.db
      .query('userStats')
      .withIndex('by_user', (q: any) => q.eq('userId', userId))
      .unique();
    if (stats?.lastDailyBonusDayKey === dayKey) {
      return { claimed: false as const, reason: 'already_claimed_today' as const };
    }

    const multiplier = effectiveXpMultiplier(stats?.xpMultiplier, stats?.plan, stats?.planExpiresAt, args.now);
    const amount = dailyBonusXp(multiplier);

    await awardXp(ctx, {
      userId,
      eventId: `daily-bonus:${userId}:${dayKey}`,
      sourceType: 'adjustment',
      sourceId: `daily-bonus:${dayKey}`,
      amount,
      reasonCode: 'daily_login_bonus',
      rulesVersion: PROGRESSION_VERSION,
      occurredAt: args.now,
    });

    const refreshedStats = await ctx.db
      .query('userStats')
      .withIndex('by_user', (q: any) => q.eq('userId', userId))
      .unique();
    if (refreshedStats) {
      await ctx.db.patch(refreshedStats._id, { lastDailyBonusDayKey: dayKey, updatedAt: args.now });
    }

    return { claimed: true as const, awarded: amount };
  },
});
