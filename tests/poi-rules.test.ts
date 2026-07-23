import { describe, expect, it } from 'vitest';

import {
  COMMON_POI_DAILY_CAP,
  COMMON_POI_REWARD_XP,
  distanceMeters,
  hasReachedCommonDailyCap,
  isPubliclyDiscoverable,
  isWithinDiscoveryRadius,
  poiRewardXp,
  RARE_POI_REWARD_XP,
} from '../convex/poiRules';

const PRAGUE = { latitude: 50.087, longitude: 14.421 };

describe('distanceMeters', () => {
  it('returns ~0 for the same point', () => {
    expect(distanceMeters(PRAGUE, PRAGUE)).toBeCloseTo(0, 3);
  });

  it('grows with a small offset, staying in a sane range', () => {
    const nearby = { latitude: PRAGUE.latitude, longitude: PRAGUE.longitude + 0.001 };
    const distance = distanceMeters(PRAGUE, nearby);
    expect(distance).toBeGreaterThan(50);
    expect(distance).toBeLessThan(100);
  });
});

describe('isPubliclyDiscoverable', () => {
  it('accepts only safe + public POI', () => {
    expect(isPubliclyDiscoverable({ safetyStatus: 'safe', visibility: 'public' })).toBe(true);
  });

  it('rejects an excluded (sensitive) category regardless of visibility', () => {
    expect(isPubliclyDiscoverable({ safetyStatus: 'excluded', visibility: 'public' })).toBe(false);
  });

  it('rejects a hidden POI even if marked safe', () => {
    expect(isPubliclyDiscoverable({ safetyStatus: 'safe', visibility: 'hidden' })).toBe(false);
  });
});

describe('isWithinDiscoveryRadius', () => {
  const poi = { latitude: PRAGUE.latitude, longitude: PRAGUE.longitude, discoveryRadiusMeters: 50 };

  it('accepts a user location inside the radius', () => {
    expect(isWithinDiscoveryRadius(PRAGUE, poi)).toBe(true);
  });

  it('rejects a user location well outside the radius', () => {
    const farAway = { latitude: PRAGUE.latitude + 0.01, longitude: PRAGUE.longitude };
    expect(isWithinDiscoveryRadius(farAway, poi)).toBe(false);
  });
});

describe('poiRewardXp', () => {
  it('matches the docs 03 XP table', () => {
    expect(poiRewardXp('common')).toBe(COMMON_POI_REWARD_XP);
    expect(poiRewardXp('rare')).toBe(RARE_POI_REWARD_XP);
  });
});

describe('hasReachedCommonDailyCap', () => {
  it('only applies the count cap to common-rarity POI', () => {
    expect(hasReachedCommonDailyCap('rare', 999)).toBe(false);
  });

  it('flips true once the common cap is reached', () => {
    expect(hasReachedCommonDailyCap('common', COMMON_POI_DAILY_CAP - 1)).toBe(false);
    expect(hasReachedCommonDailyCap('common', COMMON_POI_DAILY_CAP)).toBe(true);
    expect(hasReachedCommonDailyCap('common', COMMON_POI_DAILY_CAP + 5)).toBe(true);
  });
});
