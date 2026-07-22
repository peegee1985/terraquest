import { describe, expect, it } from 'vitest';

import { DEFAULT_GPS_FILTER_OPTIONS, distanceMeters, filterRoute, isAcceptablePoint } from '../src/domain/gps-filter';
import { TrackPoint } from '../src/domain/types';

const BASE_LAT = 50.0875;
const BASE_LNG = 14.4213;

function point(offsetLng: number, timestamp: number, accuracy: number | null = 10): TrackPoint {
  return { latitude: BASE_LAT, longitude: BASE_LNG + offsetLng, accuracy, timestamp };
}

describe('distanceMeters', () => {
  it('returns ~0 for the same point', () => {
    const p = point(0, 0);
    expect(distanceMeters(p, p)).toBeCloseTo(0, 3);
  });

  it('grows with longitude offset at a fixed latitude', () => {
    const a = point(0, 0);
    const b = point(0.001, 0);
    expect(distanceMeters(a, b)).toBeGreaterThan(50);
    expect(distanceMeters(a, b)).toBeLessThan(100);
  });
});

describe('isAcceptablePoint', () => {
  it('always accepts the first point of a route (no previous to compare)', () => {
    expect(isAcceptablePoint(point(0, 0), null)).toBe(true);
  });

  it('rejects a point with worse accuracy than the threshold', () => {
    const bad = point(0, 0, DEFAULT_GPS_FILTER_OPTIONS.maxAccuracyMeters + 5);
    expect(isAcceptablePoint(bad, null)).toBe(false);
  });

  it('accepts a plausible walking-speed step forward', () => {
    const previous = point(0, 0);
    // ~8m over 5s ≈ 1.6 m/s, a normal walking pace.
    const next = point(0.00007, 5000);
    expect(isAcceptablePoint(next, previous)).toBe(true);
  });

  it('rejects a teleport implying an impossible speed', () => {
    const previous = point(0, 0);
    // ~5.5km in 5s is a clear GPS jump, far above the plausible-speed ceiling.
    const next = point(0.05, 5000);
    expect(isAcceptablePoint(next, previous)).toBe(false);
  });

  it('rejects a near-simultaneous fix that would inflate implied speed', () => {
    const previous = point(0, 0);
    const next = point(0.0005, 50);
    expect(isAcceptablePoint(next, previous)).toBe(false);
  });
});

describe('filterRoute', () => {
  it('drops a single bad point without discarding the rest of the route', () => {
    const good1 = point(0, 0);
    const good2 = point(0.00007, 5000);
    const jump = point(0.05, 10_000);
    const good3 = point(0.00014, 15_000);

    const result = filterRoute([good1, good2, jump, good3]);

    expect(result).toEqual([good1, good2, good3]);
  });

  it('keeps comparing against the last ACCEPTED point, not the last raw sample', () => {
    const good1 = point(0, 0);
    const jump = point(0.05, 5000);
    // Plausible relative to good1 (the last accepted point), not to the rejected jump.
    const good2 = point(0.00007, 10_000);

    const result = filterRoute([good1, jump, good2]);

    expect(result).toEqual([good1, good2]);
  });
});
