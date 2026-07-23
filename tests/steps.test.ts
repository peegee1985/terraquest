import { describe, expect, it } from 'vitest';

import { DAILY_STEP_GOAL, dailyStepGoalRatio, startOfLocalDay } from '../src/domain/steps';

describe('dailyStepGoalRatio', () => {
  it('is 0 with no steps', () => {
    expect(dailyStepGoalRatio(0)).toBe(0);
  });

  it('is 0.5 at half the default goal', () => {
    expect(dailyStepGoalRatio(DAILY_STEP_GOAL / 2)).toBe(0.5);
  });

  it('caps at 1 once the goal is exceeded', () => {
    expect(dailyStepGoalRatio(DAILY_STEP_GOAL * 2)).toBe(1);
  });

  it('never goes negative for a negative step count', () => {
    expect(dailyStepGoalRatio(-100)).toBe(0);
  });

  it('is 0 for a misconfigured zero/negative goal rather than dividing by zero', () => {
    expect(dailyStepGoalRatio(1000, 0)).toBe(0);
    expect(dailyStepGoalRatio(1000, -1)).toBe(0);
  });

  it('respects a custom goal', () => {
    expect(dailyStepGoalRatio(5000, 10000)).toBe(0.5);
  });
});

describe('startOfLocalDay', () => {
  it('zeroes the time-of-day components', () => {
    const start = startOfLocalDay(new Date(2026, 6, 23, 17, 45, 30, 500));
    expect(start.getHours()).toBe(0);
    expect(start.getMinutes()).toBe(0);
    expect(start.getSeconds()).toBe(0);
    expect(start.getMilliseconds()).toBe(0);
  });

  it('keeps the same calendar day', () => {
    const reference = new Date(2026, 6, 23, 17, 45);
    const start = startOfLocalDay(reference);
    expect(start.getFullYear()).toBe(2026);
    expect(start.getMonth()).toBe(6);
    expect(start.getDate()).toBe(23);
  });
});
