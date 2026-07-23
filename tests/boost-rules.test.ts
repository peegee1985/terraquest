import { describe, expect, it } from 'vitest';

import { BASE_RING_RADIUS, currentRingRadius, isBoostActive } from '../convex/boostRules';

describe('isBoostActive', () => {
  it('is false when expiresAt is absent', () => {
    expect(isBoostActive(undefined, 1000)).toBe(false);
  });

  it('is true strictly before expiry and false at/after it', () => {
    expect(isBoostActive(2000, 1000)).toBe(true);
    expect(isBoostActive(1000, 1000)).toBe(false);
    expect(isBoostActive(999, 1000)).toBe(false);
  });
});

describe('currentRingRadius', () => {
  it('defaults to the base ring with no permanent bonus or active boost', () => {
    expect(currentRingRadius(undefined, undefined, undefined, 1000)).toBe(BASE_RING_RADIUS);
    expect(currentRingRadius(0, undefined, undefined, 1000)).toBe(BASE_RING_RADIUS);
  });

  it('adds a permanent bonus regardless of any active boost', () => {
    expect(currentRingRadius(2, undefined, undefined, 1000)).toBe(BASE_RING_RADIUS + 2);
  });

  it('adds an active temporary boost on top of the permanent bonus', () => {
    expect(currentRingRadius(2, 2000, 1, 1000)).toBe(BASE_RING_RADIUS + 2 + 1);
  });

  it('drops the temporary boost once it expires', () => {
    expect(currentRingRadius(2, 500, 1, 1000)).toBe(BASE_RING_RADIUS + 2);
  });
});
