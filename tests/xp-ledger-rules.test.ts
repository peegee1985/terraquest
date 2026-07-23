import { describe, expect, it } from 'vitest';

import { capBucketKey, clampToCapBudget, DAILY_BASE_XP_CAP, gameDayKey } from '../convex/xpLedgerRules';

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
