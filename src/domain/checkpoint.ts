/**
 * Ambient tracking's periodic XP checkpoint (explorer-context.tsx) needs to
 * know when a new calendar day has begun, so its day-scoped cumulative
 * totals (used only for xpLedgerRules.ts's streak-qualification check) can
 * reset instead of growing forever. Device-local calendar day, not the
 * server's per-user timezone (xpLedgerRules.ts's gameDayKey) — a few hours
 * of skew at a day boundary is the same order of approximation the rest of
 * this local-first design already accepts elsewhere.
 */
export function isSameLocalDay(a: number, b: number): boolean {
  return new Date(a).toDateString() === new Date(b).toDateString();
}
