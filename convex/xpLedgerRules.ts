/**
 * TQ-26: pure XP-ledger rules, dependency-free so they're unit-testable
 * without a Convex deployment (same convention as authProfile.ts). Kept
 * inside convex/ rather than src/domain/ because convex/tsconfig.json is an
 * isolated program (see convex/env.d.ts's note from TQ-18) — a cross-boundary
 * import would work today but isn't worth the risk for a couple of small
 * pure functions.
 */
export type XpSourceType = 'distance' | 'new_area' | 'quest' | 'poi' | 'streak' | 'achievement' | 'adjustment';

// Mirrors src/domain/progression.ts's DAILY_BASE_XP_CAP — if this value
// changes, update both; they're independent constants on purpose (see
// module comment above) rather than a cross-boundary import.
export const DAILY_BASE_XP_CAP = 1400;

// Only these source types draw from the shared daily base cap (docs 03:
// "Base XP cap: vzdálenost + nové jednotky mají společný limit 1400 XP").
// Quests/achievements/POI have their own independent limits — not yet
// built (TQ-27+) — so they're deliberately excluded here.
const CAP_BUCKET_SOURCE_TYPES: ReadonlySet<XpSourceType> = new Set(['distance', 'new_area']);

/** A day-key string (e.g. "2026-07-23") for the given instant in the given IANA timezone — used, never a client-supplied "today", so a user can't shift their own day boundary by spoofing timezone in a request. */
export function gameDayKey(timestampMs: number, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(
    new Date(timestampMs),
  );
}

/** Returns the cap-bucket key this source type/day combination draws from, or null if it isn't capped by the shared daily base budget. */
export function capBucketKey(sourceType: XpSourceType, dayKey: string): string | null {
  return CAP_BUCKET_SOURCE_TYPES.has(sourceType) ? `daily_base:${dayKey}` : null;
}

/** Clamps a proposed award so the running total already recorded for its cap bucket never exceeds the cap. Never negative, never more than what's actually left in the budget. */
export function clampToCapBudget(proposedAmount: number, alreadyAwardedInBucket: number, cap: number = DAILY_BASE_XP_CAP): number {
  const remaining = Math.max(0, cap - alreadyAwardedInBucket);
  return Math.max(0, Math.min(proposedAmount, remaining));
}
