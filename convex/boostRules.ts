/**
 * Pure, dependency-free helpers for the temporary radius/XP boost effects
 * (TQ-122) — shared by xpAward.ts (XP boost) and profile.ts (radius boost +
 * the ring radius exposed to the client's live fog reveal), so "is this
 * boost still active" and "what's the current effective ring" each have
 * exactly one implementation.
 */

export const BASE_RING_RADIUS = 1;

export function isBoostActive(expiresAt: number | undefined, now: number): boolean {
  return expiresAt !== undefined && expiresAt > now;
}

/** 1 (the original fixed ring) + any permanent per-level bump + an active temporary radius boost, if not expired. */
export function currentRingRadius(
  permanentRingBonus: number | undefined,
  activeBoostExpiresAt: number | undefined,
  activeBoostRingBonus: number | undefined,
  now: number,
): number {
  const permanent = permanentRingBonus ?? 0;
  const active = isBoostActive(activeBoostExpiresAt, now) ? (activeBoostRingBonus ?? 0) : 0;
  return BASE_RING_RADIUS + permanent + active;
}
