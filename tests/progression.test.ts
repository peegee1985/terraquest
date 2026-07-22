import { describe, expect, it } from 'vitest';

import {
  cappedDailyBaseXp,
  cumulativeXpForLevel,
  distanceXp,
  explorationXp,
  levelForXp,
  levelProgress,
  revealRadiusForLevel,
} from '../src/domain/progression';

describe('TerraQuest progression', () => {
  it('uses the documented level curve', () => {
    expect(cumulativeXpForLevel(1)).toBe(0);
    expect(cumulativeXpForLevel(2)).toBe(250);
    expect(cumulativeXpForLevel(10)).toBe(10475);
  });

  it('resolves level and progress without exceeding the range', () => {
    expect(levelForXp(0)).toBe(1);
    expect(levelForXp(250)).toBe(2);
    const progress = levelProgress(5860);
    expect(progress.level).toBe(7);
    expect(progress.ratio).toBeGreaterThanOrEqual(0);
    expect(progress.ratio).toBeLessThanOrEqual(1);
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
    expect(revealRadiusForLevel(50)).toBe(27.75);
  });
});
