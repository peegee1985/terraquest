import { describe, expect, it } from 'vitest';

import {
  applyQualifyingDay,
  difficultyJitter,
  gameDayKey,
  gameWeekKey,
  generateDailyQuests,
  generateWeeklyQuest,
  streakMilestoneReward,
  type StreakState,
} from '../convex/questRules';

describe('difficultyJitter', () => {
  it('is deterministic for the same seed', () => {
    expect(difficultyJitter('user-1:2026-07-23:movement')).toBe(difficultyJitter('user-1:2026-07-23:movement'));
  });

  it('stays within the documented 70-130% band', () => {
    const seeds = ['a', 'b', 'c', 'user-1:day-1', 'user-2:day-1', ''];
    for (const seed of seeds) {
      const jitter = difficultyJitter(seed);
      expect(jitter).toBeGreaterThanOrEqual(0.7);
      expect(jitter).toBeLessThan(1.3);
    }
  });

  it('differs across different seeds (not a constant)', () => {
    const values = new Set(['a', 'b', 'c', 'd', 'e'].map((seed) => difficultyJitter(seed)));
    expect(values.size).toBeGreaterThan(1);
  });
});

describe('generateDailyQuests', () => {
  it('always returns exactly 3 quests', () => {
    expect(generateDailyQuests('user-1', '2026-07-23', false)).toHaveLength(3);
    expect(generateDailyQuests('user-1', '2026-07-23', true)).toHaveLength(3);
  });

  it('includes a movement and a discovery quest regardless of saturation', () => {
    const quests = generateDailyQuests('user-1', '2026-07-23', false);
    expect(quests.some((q) => q.category === 'movement')).toBe(true);
    expect(quests.some((q) => q.category === 'discovery')).toBe(true);
  });

  it('swaps the exploration slot for a movement quest when saturated, never a new_units target', () => {
    const saturated = generateDailyQuests('user-1', '2026-07-23', true);
    expect(saturated.some((q) => q.metric === 'new_units')).toBe(false);

    const normal = generateDailyQuests('user-1', '2026-07-23', false);
    expect(normal.some((q) => q.metric === 'new_units')).toBe(true);
  });

  it('is deterministic — regenerating "today" never changes targets (idempotent assignment)', () => {
    const first = generateDailyQuests('user-1', '2026-07-23', false);
    const second = generateDailyQuests('user-1', '2026-07-23', false);
    expect(first).toEqual(second);
  });

  it('gives different users different targets for the same day', () => {
    const userA = generateDailyQuests('user-a', '2026-07-23', false);
    const userB = generateDailyQuests('user-b', '2026-07-23', false);
    expect(userA).not.toEqual(userB);
  });
});

describe('generateWeeklyQuest', () => {
  it('is deterministic per user/week', () => {
    expect(generateWeeklyQuest('user-1', 'W2999')).toEqual(generateWeeklyQuest('user-1', 'W2999'));
  });
});

describe('gameDayKey / gameWeekKey', () => {
  it('formats a timestamp as YYYY-MM-DD in the given timezone', () => {
    const timestamp = Date.UTC(2026, 6, 23, 23, 30, 0);
    expect(gameDayKey(timestamp, 'Europe/Prague')).toBe('2026-07-24');
    expect(gameDayKey(timestamp, 'UTC')).toBe('2026-07-23');
  });

  it('advances the week key roughly every 7 days', () => {
    const day0 = Date.UTC(2026, 0, 1);
    const day6 = day0 + 6 * 86_400_000;
    const day8 = day0 + 8 * 86_400_000;
    expect(gameWeekKey(day0, 'UTC')).toBe(gameWeekKey(day6, 'UTC'));
    expect(gameWeekKey(day0, 'UTC')).not.toBe(gameWeekKey(day8, 'UTC'));
  });
});

const baseState: StreakState = { currentStreakDays: 0, longestStreakDays: 0, lastQualifiedDayKey: null, restTokens: 0 };

describe('applyQualifyingDay', () => {
  it('starts a fresh streak at 1 for the first-ever qualifying day', () => {
    const result = applyQualifyingDay(baseState, '2026-07-01');
    expect(result.streakChanged).toBe(true);
    expect(result.next.currentStreakDays).toBe(1);
    expect(result.next.longestStreakDays).toBe(1);
  });

  it('is idempotent for the same day', () => {
    const day1 = applyQualifyingDay(baseState, '2026-07-01').next;
    const again = applyQualifyingDay(day1, '2026-07-01');
    expect(again.streakChanged).toBe(false);
    expect(again.next).toEqual(day1);
  });

  it('extends the streak on a consecutive day', () => {
    const day1 = applyQualifyingDay(baseState, '2026-07-01').next;
    const day2 = applyQualifyingDay(day1, '2026-07-02');
    expect(day2.next.currentStreakDays).toBe(2);
    expect(day2.next.longestStreakDays).toBe(2);
    expect(day2.restTokenConsumed).toBe(false);
  });

  it('resets the streak after a gap with no rest token available', () => {
    const day1 = applyQualifyingDay(baseState, '2026-07-01').next;
    const afterGap = applyQualifyingDay(day1, '2026-07-05');
    expect(afterGap.next.currentStreakDays).toBe(1);
    expect(afterGap.next.longestStreakDays).toBe(1);
  });

  it('bridges exactly one missed day with a rest token, preserving and extending the streak', () => {
    const day1 = applyQualifyingDay(baseState, '2026-07-01').next;
    const withToken: StreakState = { ...day1, restTokens: 1 };
    const bridged = applyQualifyingDay(withToken, '2026-07-03'); // 07-02 skipped

    expect(bridged.streakChanged).toBe(true);
    expect(bridged.restTokenConsumed).toBe(true);
    expect(bridged.next.currentStreakDays).toBe(2);
    expect(bridged.next.restTokens).toBe(0);
  });

  it('does not bridge a 2+ day gap even with a rest token available', () => {
    const day1 = applyQualifyingDay(baseState, '2026-07-01').next;
    const withToken: StreakState = { ...day1, restTokens: 5 };
    const afterBigGap = applyQualifyingDay(withToken, '2026-07-10');

    expect(afterBigGap.next.currentStreakDays).toBe(1);
    expect(afterBigGap.restTokenConsumed).toBe(false);
    expect(afterBigGap.next.restTokens).toBe(5); // untouched
  });

  it('never rewinds the streak for an out-of-order/backfilled day', () => {
    const day1 = applyQualifyingDay(baseState, '2026-07-05').next;
    const backfilled = applyQualifyingDay(day1, '2026-07-01');
    expect(backfilled.streakChanged).toBe(false);
    expect(backfilled.next).toEqual(day1);
  });

  it('preserves longestStreakDays after the current streak resets', () => {
    let state = baseState;
    state = applyQualifyingDay(state, '2026-07-01').next;
    state = applyQualifyingDay(state, '2026-07-02').next;
    state = applyQualifyingDay(state, '2026-07-03').next; // streak of 3
    expect(state.longestStreakDays).toBe(3);

    state = applyQualifyingDay(state, '2026-07-20').next; // big gap, resets
    expect(state.currentStreakDays).toBe(1);
    expect(state.longestStreakDays).toBe(3); // still remembered
  });
});

describe('streakMilestoneReward', () => {
  it('matches the documented 3/7/14/30-day XP table', () => {
    expect(streakMilestoneReward(3)).toEqual({ xp: 25 });
    expect(streakMilestoneReward(7)).toEqual({ xp: 75 });
    expect(streakMilestoneReward(14)).toEqual({ xp: 125 });
    expect(streakMilestoneReward(30)).toEqual({ xp: 250, badge: 'streak_30' });
  });

  it('awards every further 30-day block', () => {
    expect(streakMilestoneReward(60)).toEqual({ xp: 250 });
    expect(streakMilestoneReward(90)).toEqual({ xp: 250 });
  });

  it('returns null on a non-milestone day', () => {
    expect(streakMilestoneReward(1)).toBeNull();
    expect(streakMilestoneReward(15)).toBeNull();
    expect(streakMilestoneReward(31)).toBeNull();
  });
});
