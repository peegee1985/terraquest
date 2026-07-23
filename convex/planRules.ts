/**
 * Pure rules for the entitlement/plan model (admin-settable only for now —
 * see admin.ts — no real checkout wired up per the decision to hold off on
 * billing until Apple/Google IAP or a web-only Stripe flow is chosen).
 */

export type Plan = 'free' | 'vip';

/** VIP is active only while planExpiresAt is unset (permanent grant) or still in the future — an expired grant silently falls back to free rather than needing a cron job to "downgrade" anyone. */
export function isVipActive(plan: Plan | undefined, planExpiresAt: number | undefined, now: number): boolean {
  if (plan !== 'vip') return false;
  if (planExpiresAt === undefined) return true;
  return planExpiresAt > now;
}

export function effectiveXpMultiplier(xpMultiplier: number | undefined, plan: Plan | undefined, planExpiresAt: number | undefined, now: number): number {
  if (!isVipActive(plan, planExpiresAt, now)) return 1;
  return xpMultiplier && xpMultiplier > 0 ? xpMultiplier : 1;
}
