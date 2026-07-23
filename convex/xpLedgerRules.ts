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

// Mirrors src/domain/types.ts's MovementMode — duplicated rather than
// cross-imported (see module comment: convex/tsconfig.json is an isolated
// program).
export type MovementMode = 'walk' | 'run' | 'bike' | 'auto';

/**
 * TQ-31: mirrors src/domain/progression.ts's distanceXp — the server never
 * trusts a client-computed XP amount, so this is recomputed here from the
 * raw distanceMeters/mode a session submits (submitTrackingSession in
 * sessions.ts), then clamped by the shared daily_base cap same as any other
 * 'distance'-sourced award. Docs 03 "Režimy pohybu": bike counts at 0.35x,
 * auto/vehicle at 0x — a rider/driver still gets their personal route, just
 * no competitive distance XP for it.
 */
export function distanceXp(distanceMeters: number, mode: MovementMode): number {
  const fullXp = Math.floor(Math.max(0, distanceMeters) / 100) * 5;
  if (mode === 'bike') return Math.floor(fullXp * 0.35);
  if (mode === 'auto') return 0;
  return fullXp;
}

/**
 * Mirrors src/domain/progression.ts's explorationXp. newNormalizedCells is
 * expected to already be mode-gated by the caller (fog.ts's
 * centerlineCellsForRoute is only ever accumulated while classified
 * walk/run — see explorer-context.tsx), but this still zeroes bike/auto
 * defensively rather than trusting that upstream gate alone.
 */
export function explorationXp(newNormalizedCells: number, mode: MovementMode): number {
  if (mode === 'bike' || mode === 'auto') return 0;
  return Math.min(600, Math.max(0, Math.floor(newNormalizedCells)) * 3);
}

/**
 * Docs 03 "Denní kvalifikace a streak" — a day counts toward the streak if
 * the user meets at least one condition. Only two of the three documented
 * conditions are checked here ("20 minut aktivní chůze/běhu" and "denní
 * průzkumná výprava s minimálně 1 km"); the third ("3 000 ověřených kroků")
 * is deliberately omitted because no step-count data source exists yet
 * (steps feature is still backlog, Pořadí 47) — adding it once that ships
 * is a one-line change here, not a redesign.
 */
export function sessionQualifiesForStreak(mode: MovementMode, elapsedSeconds: number, distanceMeters: number): boolean {
  if (mode !== 'walk' && mode !== 'run') return false;
  return elapsedSeconds >= 20 * 60 || distanceMeters >= 1000;
}

/** Clamps a proposed award so the running total already recorded for its cap bucket never exceeds the cap. Never negative, never more than what's actually left in the budget. */
export function clampToCapBudget(proposedAmount: number, alreadyAwardedInBucket: number, cap: number = DAILY_BASE_XP_CAP): number {
  const remaining = Math.max(0, cap - alreadyAwardedInBucket);
  return Math.max(0, Math.min(proposedAmount, remaining));
}
