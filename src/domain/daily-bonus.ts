// Client-side mirror of convex/dailyBonusRules.ts's pure formula — kept as
// its own tiny copy rather than importing the convex module (which pulls in
// convex/server as a value and crashes the client bundle, same class of bug
// documented on src/state/*-client.ts's clientFunctionReference helper).
// Used by the pricing screen to show the real daily-bonus numbers instead
// of hardcoded copy that could drift from the server's actual formula.

export const BASE_DAILY_BONUS_XP = 20;

export function dailyBonusXp(xpMultiplier: number | undefined): number {
  const multiplier = xpMultiplier && xpMultiplier > 0 ? xpMultiplier : 1;
  return Math.round(BASE_DAILY_BONUS_XP * multiplier);
}
