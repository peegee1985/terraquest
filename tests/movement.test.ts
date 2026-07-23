import { describe, expect, it } from 'vitest';

import { classifyMovement, computeRollingSpeedMps, DEFAULT_MOVEMENT_THRESHOLDS, movementModeBit } from '../src/domain/movement';
import { TrackPoint } from '../src/domain/types';

const BASE_LAT = 50.0875;
const BASE_LNG = 14.4213;

function point(offsetLng: number, timestamp: number): TrackPoint {
  return { latitude: BASE_LAT, longitude: BASE_LNG + offsetLng, accuracy: 10, timestamp };
}

describe('classifyMovement', () => {
  it('stays in the current mode when speed is within its band', () => {
    expect(classifyMovement(1.0, 'walk')).toBe('walk');
  });

  it('escalates immediately once a boundary is cleared', () => {
    expect(classifyMovement(DEFAULT_MOVEMENT_THRESHOLDS.runMps + 0.1, 'walk')).toBe('run');
    expect(classifyMovement(DEFAULT_MOVEMENT_THRESHOLDS.autoMps + 5, 'walk')).toBe('auto');
  });

  it('does not de-escalate on a small dip that stays above the hysteresis margin', () => {
    const justBelowBoundary = DEFAULT_MOVEMENT_THRESHOLDS.runMps - 0.1;
    expect(classifyMovement(justBelowBoundary, 'run')).toBe('run');
  });

  it('de-escalates once speed drops past the hysteresis margin below the boundary', () => {
    const wellBelowBoundary = DEFAULT_MOVEMENT_THRESHOLDS.runMps - DEFAULT_MOVEMENT_THRESHOLDS.hysteresisMps - 0.1;
    expect(classifyMovement(wellBelowBoundary, 'run')).toBe('walk');
  });

  it('never classifies below walk or above auto', () => {
    expect(classifyMovement(0, 'walk')).toBe('walk');
    expect(classifyMovement(100, 'auto')).toBe('auto');
  });
});

describe('movementModeBit', () => {
  it('gives each mode a distinct, OR-able bit', () => {
    const bits = ['walk', 'run', 'bike', 'auto'] as const;
    const values = bits.map((mode) => movementModeBit(mode));
    expect(new Set(values).size).toBe(values.length);
    for (const value of values) {
      // Exactly one bit set.
      expect(value & (value - 1)).toBe(0);
    }
  });
});

describe('computeRollingSpeedMps', () => {
  it('returns 0 for fewer than two points', () => {
    expect(computeRollingSpeedMps([])).toBe(0);
    expect(computeRollingSpeedMps([point(0, 0)])).toBe(0);
  });

  it('averages speed across the trailing window', () => {
    // ~5m every 5s ≈ 1 m/s, a walking pace.
    const points = [point(0, 0), point(0.00007, 5000), point(0.00014, 10_000), point(0.00021, 15_000)];
    const speed = computeRollingSpeedMps(points, 5);
    expect(speed).toBeGreaterThan(0.8);
    expect(speed).toBeLessThan(1.2);
  });

  it('only considers the trailing windowSize+1 points', () => {
    const slowLeadIn = [point(0, 0), point(0.00007, 5000)];
    // A fast final leg, isolated to the last two points.
    const fastTail = [point(0.001, 10_000), point(0.002, 12_000)];
    const speed = computeRollingSpeedMps([...slowLeadIn, ...fastTail], 1);
    expect(speed).toBeGreaterThan(20);
  });
});
