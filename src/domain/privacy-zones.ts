/**
 * TQ-34 (scoped MVP): pure redaction logic, dependency-free so it's
 * unit-testable without a Convex deployment (same convention as
 * gps-filter.ts/movement.ts). Deliberately duplicates gps-filter.ts's
 * haversine formula rather than importing TrackPoint's stricter shape
 * (which mandates a `timestamp` a privacy zone has no use for) — same
 * small-duplication call as xpLedgerRules.ts/questRules.ts's gameDayKey.
 */

export type LatLng = { latitude: number; longitude: number };
export type PrivacyZone = LatLng & { radiusMeters: number };

const EARTH_RADIUS_METERS = 6_371_000;

function distanceMeters(a: LatLng, b: LatLng): number {
  const lat1 = (a.latitude * Math.PI) / 180;
  const lat2 = (b.latitude * Math.PI) / 180;
  const dLat = ((b.latitude - a.latitude) * Math.PI) / 180;
  const dLng = ((b.longitude - a.longitude) * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(h));
}

export function isWithinAnyZone(point: LatLng, zones: readonly PrivacyZone[]): boolean {
  return zones.some((zone) => distanceMeters(point, zone) <= zone.radiusMeters);
}

/** Drops every point that falls inside any zone; returns a new array (input untouched), same shape as filterRoute. */
export function redactPointsInZones<T extends LatLng>(points: readonly T[], zones: readonly PrivacyZone[]): T[] {
  if (zones.length === 0) return [...points];
  return points.filter((point) => !isWithinAnyZone(point, zones));
}
