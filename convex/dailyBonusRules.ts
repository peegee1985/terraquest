/**
 * Pure rules for the daily login bonus (dailyBonus.ts) — a Fogbreaker-style
 * "open the app, claim a small reward" mechanic. Unlike step counts, this
 * isn't based on any client-reported, fakeable data — it only requires
 * being authenticated and it being a new gameDayKey — so it's fine for it
 * to actually award XP, multiplied by the user's xpMultiplier (VIP perk).
 */

export const BASE_DAILY_BONUS_XP = 20;

export function dailyBonusXp(xpMultiplier: number | undefined): number {
  const multiplier = xpMultiplier && xpMultiplier > 0 ? xpMultiplier : 1;
  return Math.round(BASE_DAILY_BONUS_XP * multiplier);
}
