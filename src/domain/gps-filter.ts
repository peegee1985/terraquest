import { TrackPoint } from './types';

/**
 * TQ-22: raw background-location samples occasionally teleport (multipath
 * reflections, cold GPS fixes, indoor/tunnel gaps) — these functions reject
 * those outliers so a single bad point can't distort the recorded route or
 * inflate distance-based XP.
 */
export type GpsFilterOptions = {
  /** Points reporting a worse (larger) accuracy radius than this are dropped. */
  maxAccuracyMeters: number;
  /** Implied speed above this vs. the last accepted point marks a jump/teleport. */
  maxPlausibleSpeedMps: number;
  /** Guards against inflated implied-speed readings from near-simultaneous fixes. */
  minIntervalMs: number;
};

// Thresholds are a plain data object, not hardcoded inline — see acceptance
// criterion "prahy jsou remote-configurable". Wiring a live remote-config
// sync hits the same _generated/api codegen blocker documented for TQ-18, so
// for now these are overridable at the call site; only the defaults live here.
export const DEFAULT_GPS_FILTER_OPTIONS: GpsFilterOptions = {
  maxAccuracyMeters: 30,
  maxPlausibleSpeedMps: 55, // ~200 km/h — generous enough for a fast car/train, tight enough to catch teleports
  minIntervalMs: 250,
};

const EARTH_RADIUS_METERS = 6_371_000;

export function distanceMeters(a: TrackPoint, b: TrackPoint): number {
  const lat1 = (a.latitude * Math.PI) / 180;
  const lat2 = (b.latitude * Math.PI) / 180;
  const dLat = ((b.latitude - a.latitude) * Math.PI) / 180;
  const dLng = ((b.longitude - a.longitude) * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function isAcceptablePoint(
  candidate: TrackPoint,
  previousAccepted: TrackPoint | null,
  options: GpsFilterOptions = DEFAULT_GPS_FILTER_OPTIONS,
): boolean {
  if (candidate.accuracy != null && candidate.accuracy > options.maxAccuracyMeters) return false;
  if (!previousAccepted) return true;

  const dtMs = candidate.timestamp - previousAccepted.timestamp;
  if (dtMs < options.minIntervalMs) return false;

  const impliedSpeedMps = distanceMeters(previousAccepted, candidate) / (dtMs / 1000);
  return impliedSpeedMps <= options.maxPlausibleSpeedMps;
}

/** Applies isAcceptablePoint sequentially, each candidate compared against the last ACCEPTED point (not the previous raw sample). */
export function filterRoute(points: TrackPoint[], options: GpsFilterOptions = DEFAULT_GPS_FILTER_OPTIONS): TrackPoint[] {
  const accepted: TrackPoint[] = [];
  let previous: TrackPoint | null = null;
  for (const point of points) {
    if (isAcceptablePoint(point, previous, options)) {
      accepted.push(point);
      previous = point;
    }
  }
  return accepted;
}

/** TQ-31: total distance of an already-filtered route — sum of consecutive-point haversine distances. Callers are expected to pass a filterRoute()-ed route so a single teleport/jump point can't inflate the total. */
export function routeDistanceMeters(route: readonly TrackPoint[]): number {
  let total = 0;
  for (let i = 1; i < route.length; i += 1) {
    total += distanceMeters(route[i - 1], route[i]);
  }
  return total;
}
