import { describe, expect, it } from 'vitest';

import { BASE_DAILY_BONUS_XP, dailyBonusXp } from '../convex/dailyBonusRules';

describe('dailyBonusXp', () => {
  it('returns the base amount for a free player (no multiplier)', () => {
    expect(dailyBonusXp(undefined)).toBe(BASE_DAILY_BONUS_XP);
    expect(dailyBonusXp(1)).toBe(BASE_DAILY_BONUS_XP);
  });

  it('applies the VIP multiplier', () => {
    expect(dailyBonusXp(1.5)).toBe(Math.round(BASE_DAILY_BONUS_XP * 1.5));
  });

  it('treats a zero or negative multiplier as no multiplier (never grants zero/negative XP)', () => {
    expect(dailyBonusXp(0)).toBe(BASE_DAILY_BONUS_XP);
    expect(dailyBonusXp(-2)).toBe(BASE_DAILY_BONUS_XP);
  });
});
