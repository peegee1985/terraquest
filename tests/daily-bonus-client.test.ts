import { describe, expect, it } from 'vitest';

import { BASE_DAILY_BONUS_XP, dailyBonusXp } from '../src/domain/daily-bonus';

describe('dailyBonusXp (client mirror)', () => {
  it('matches convex/dailyBonusRules.ts behavior: base amount with no multiplier', () => {
    expect(dailyBonusXp(undefined)).toBe(BASE_DAILY_BONUS_XP);
    expect(dailyBonusXp(1)).toBe(BASE_DAILY_BONUS_XP);
  });

  it('scales and rounds with a VIP multiplier', () => {
    expect(dailyBonusXp(1.5)).toBe(30);
  });

  it('treats a zero/negative multiplier as 1', () => {
    expect(dailyBonusXp(0)).toBe(BASE_DAILY_BONUS_XP);
    expect(dailyBonusXp(-2)).toBe(BASE_DAILY_BONUS_XP);
  });
});
