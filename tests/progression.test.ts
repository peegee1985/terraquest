import { describe, expect, it } from 'vitest';

import {
  cappedDailyBaseXp,
  cumulativeXpForLevel,
  distanceXp,
  explorationXp,
  levelForXp,
  levelProgress,
  MAX_LEVEL,
  rankForLevel,
  RANK_TIERS,
  revealRadiusForLevel,
} from '../src/domain/progression';

describe('TerraQuest progression', () => {
  it('uses the documented v0.2 level curve (70 levels)', () => {
    expect(cumulativeXpForLevel(1)).toBe(0);
    expect(cumulativeXpForLevel(2)).toBe(300);
    expect(cumulativeXpForLevel(10)).toBe(10544);
    expect(cumulativeXpForLevel(70)).toBe(285796);
  });

  it('resolves level and progress without exceeding the range', () => {
    expect(levelForXp(0)).toBe(1);
    expect(levelForXp(300)).toBe(2);
    const progress = levelProgress(5860);
    expect(progress.level).toBe(7);
    expect(progress.ratio).toBeGreaterThanOrEqual(0);
    expect(progress.ratio).toBeLessThanOrEqual(1);
  });

  it('never resolves a level beyond MAX_LEVEL, even for huge XP totals', () => {
    expect(levelForXp(10_000_000)).toBe(MAX_LEVEL);
    expect(levelProgress(10_000_000).ratio).toBe(1);
  });

  it('does not award vehicle XP and reduces bike distance XP', () => {
    expect(distanceXp(1000, 'walk')).toBe(50);
    expect(distanceXp(1000, 'bike')).toBe(17);
    expect(distanceXp(1000, 'auto')).toBe(0);
    expect(explorationXp(50, 'bike')).toBe(0);
  });

  it('caps base XP and visual radius', () => {
    expect(cappedDailyBaseXp(1000, 600)).toBe(1400);
    expect(revealRadiusForLevel(1)).toBe(18);
    expect(revealRadiusForLevel(60)).toBeCloseTo(29.8);
    // Radius growth stops at level 60 — level 70 must not exceed it.
    expect(revealRadiusForLevel(70)).toBe(revealRadiusForLevel(60));
  });
});

describe('rank tiers (v0.2 — 8 tiers every 10 levels)', () => {
  it('is sorted ascending by level (rankForLevel depends on this)', () => {
    for (let i = 1; i < RANK_TIERS.length; i += 1) {
      expect(RANK_TIERS[i].level).toBeGreaterThan(RANK_TIERS[i - 1].level);
    }
  });

  it('resolves the highest tier a level qualifies for', () => {
    expect(rankForLevel(1).rankId).toBe('tulak');
    expect(rankForLevel(9).rankId).toBe('tulak');
    expect(rankForLevel(10).rankId).toBe('poutnik');
    expect(rankForLevel(65).rankId).toBe('expedicionar');
    expect(rankForLevel(70).rankId).toBe('legenda_mapy');
  });
});
