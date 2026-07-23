import { describe, expect, it } from 'vitest';

import { levelRewards as convexLevelRewards } from '../convex/levelRewardRules';
import { MAX_LEVEL as CONVEX_MAX_LEVEL } from '../convex/progressionRules';
import { levelRewards as clientLevelRewards, MAX_LEVEL } from '../src/domain/level-rewards';

describe('client-side level-rewards mirror', () => {
  it('matches convex/levelRewardRules.ts exactly for every level 0..MAX_LEVEL', () => {
    expect(MAX_LEVEL).toBe(CONVEX_MAX_LEVEL);
    for (let level = 0; level <= MAX_LEVEL; level += 1) {
      expect(clientLevelRewards(level)).toEqual(convexLevelRewards(level));
    }
  });
});
