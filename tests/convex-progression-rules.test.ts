import { describe, expect, it } from 'vitest';

import {
  cumulativeXpForLevel,
  levelForXp,
  levelProgress,
  levelsToClaim,
  MAX_LEVEL,
  rankForLevel,
  RANK_TIERS,
  revealRadiusForLevel,
} from '../convex/progressionRules';

describe('convex progressionRules mirrors the client curve (v0.2, 70 levels)', () => {
  it('matches the same reference points as src/domain/progression.ts', () => {
    expect(cumulativeXpForLevel(1)).toBe(0);
    expect(cumulativeXpForLevel(2)).toBe(300);
    expect(cumulativeXpForLevel(10)).toBe(10544);
    expect(cumulativeXpForLevel(70)).toBe(285796);
  });

  it('never resolves beyond MAX_LEVEL', () => {
    expect(levelForXp(10_000_000)).toBe(MAX_LEVEL);
    expect(levelProgress(10_000_000).ratio).toBe(1);
  });

  it('caps the reveal radius growth at level 60', () => {
    expect(revealRadiusForLevel(1)).toBe(18);
    expect(revealRadiusForLevel(70)).toBe(revealRadiusForLevel(60));
  });
});

describe('rankForLevel', () => {
  it('is sorted ascending (rankForLevel depends on this)', () => {
    for (let i = 1; i < RANK_TIERS.length; i += 1) {
      expect(RANK_TIERS[i].level).toBeGreaterThan(RANK_TIERS[i - 1].level);
    }
  });

  it('resolves the highest tier a level qualifies for', () => {
    expect(rankForLevel(1).rankId).toBe('tulak');
    expect(rankForLevel(9).rankId).toBe('tulak');
    expect(rankForLevel(10).rankId).toBe('poutnik');
    expect(rankForLevel(70).rankId).toBe('legenda_mapy');
  });
});

describe('levelsToClaim', () => {
  it('returns nothing when the level has not changed', () => {
    expect(levelsToClaim(5, 5)).toEqual([]);
  });

  it('returns just the single new level for a normal level-up', () => {
    expect(levelsToClaim(5, 6)).toEqual([6]);
  });

  it('catches up every level crossed by one big XP event', () => {
    expect(levelsToClaim(5, 9)).toEqual([6, 7, 8, 9]);
  });
});
