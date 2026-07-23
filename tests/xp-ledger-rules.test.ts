import { describe, expect, it } from 'vitest';

import {
  capBucketKey,
  clampToCapBudget,
  DAILY_BASE_XP_CAP,
  distanceXp,
  explorationXp,
  gameDayKey,
  sessionQualifiesForStreak,
} from '../convex/xpLedgerRules';

describe('gameDayKey', () => {
  it('formats a timestamp as a sortable YYYY-MM-DD day key in the given timezone', () => {
    // 2026-07-23T23:30:00Z is already 2026-07-24 in Prague (UTC+2 in summer).
    const timestamp = Date.UTC(2026, 6, 23, 23, 30, 0);
    expect(gameDayKey(timestamp, 'Europe/Prague')).toBe('2026-07-24');
    expect(gameDayKey(timestamp, 'UTC')).toBe('2026-07-23');
  });

  it('is independent of which timezone the caller happens to be in — same instant, same key for a fixed zone', () => {
    const timestamp = Date.UTC(2026, 0, 1, 12, 0, 0);
    expect(gameDayKey(timestamp, 'Europe/Prague')).toBe(gameDayKey(timestamp, 'Europe/Prague'));
  });
});

describe('capBucketKey', () => {
  it('gates only distance and new_area on the shared daily base cap', () => {
    expect(capBucketKey('distance', '2026-07-23')).toBe('daily_base:2026-07-23');
    expect(capBucketKey('new_area', '2026-07-23')).toBe('daily_base:2026-07-23');
  });

  it('does not cap quest/poi/streak/achievement/adjustment via the base bucket', () => {
    for (const sourceType of ['quest', 'poi', 'streak', 'achievement', 'adjustment'] as const) {
      expect(capBucketKey(sourceType, '2026-07-23')).toBeNull();
    }
  });
});

describe('clampToCapBudget', () => {
  it('passes the full amount through when nothing has been awarded yet', () => {
    expect(clampToCapBudget(500, 0)).toBe(500);
  });

  it('clamps to whatever remains in the budget', () => {
    expect(clampToCapBudget(500, DAILY_BASE_XP_CAP - 100)).toBe(100);
  });

  it('never awards below zero once the cap is already exhausted', () => {
    expect(clampToCapBudget(500, DAILY_BASE_XP_CAP)).toBe(0);
    expect(clampToCapBudget(500, DAILY_BASE_XP_CAP + 200)).toBe(0);
  });

  it('never awards a negative amount even for a negative proposal', () => {
    expect(clampToCapBudget(-50, 0)).toBe(0);
  });
});

describe('distanceXp', () => {
  it('awards 5 XP per 100m at full rate for walk/run', () => {
    expect(distanceXp(1000, 'walk')).toBe(50);
    expect(distanceXp(1000, 'run')).toBe(50);
  });

  it('floors partial 100m segments', () => {
    expect(distanceXp(1049, 'walk')).toBe(50);
  });

  it('applies the 0.35x bike multiplier', () => {
    expect(distanceXp(1000, 'bike')).toBe(Math.floor(50 * 0.35));
  });

  it('awards zero for auto/vehicle', () => {
    expect(distanceXp(10_000, 'auto')).toBe(0);
  });

  it('never goes negative for a negative distance', () => {
    expect(distanceXp(-500, 'walk')).toBe(0);
  });
});

describe('explorationXp', () => {
  it('awards 3 XP per new unit for walk/run, capped at 600', () => {
    expect(explorationXp(10, 'walk')).toBe(30);
    expect(explorationXp(1000, 'run')).toBe(600);
  });

  it('awards zero for bike/auto regardless of unit count', () => {
    expect(explorationXp(50, 'bike')).toBe(0);
    expect(explorationXp(50, 'auto')).toBe(0);
  });
});

describe('sessionQualifiesForStreak', () => {
  it('qualifies a 20+ minute walk/run regardless of distance', () => {
    expect(sessionQualifiesForStreak('walk', 20 * 60, 0)).toBe(true);
    expect(sessionQualifiesForStreak('run', 25 * 60, 0)).toBe(true);
  });

  it('qualifies a 1km+ walk/run regardless of duration', () => {
    expect(sessionQualifiesForStreak('walk', 60, 1000)).toBe(true);
  });

  it('does not qualify a short, short-distance walk/run', () => {
    expect(sessionQualifiesForStreak('walk', 300, 200)).toBe(false);
  });

  it('never qualifies bike/auto regardless of duration or distance', () => {
    expect(sessionQualifiesForStreak('bike', 3600, 50_000)).toBe(false);
    expect(sessionQualifiesForStreak('auto', 3600, 50_000)).toBe(false);
  });
});
