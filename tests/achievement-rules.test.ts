import { describe, expect, it } from 'vitest';

import { ACHIEVEMENT_DEFINITIONS, evaluateNewlyUnlocked, type AchievementMetrics } from '../convex/achievementRules';

const zeroMetrics: AchievementMetrics = {
  longestStreakDays: 0,
  poiDiscoveriesCount: 0,
  dailyQuestsClaimedCount: 0,
  weeklyQuestsClaimedCount: 0,
};

describe('evaluateNewlyUnlocked', () => {
  it('unlocks nothing when every metric is below every threshold', () => {
    expect(evaluateNewlyUnlocked(zeroMetrics, new Set())).toEqual([]);
  });

  it('unlocks exactly the tiers a metric has crossed, in one call', () => {
    const metrics: AchievementMetrics = { ...zeroMetrics, poiDiscoveriesCount: 60 };
    const unlocked = evaluateNewlyUnlocked(metrics, new Set());
    expect(unlocked.map((d) => d.id)).toEqual(['poi_10', 'poi_50']);
  });

  it('never re-returns an id already in the already-unlocked set', () => {
    const metrics: AchievementMetrics = { ...zeroMetrics, poiDiscoveriesCount: 60 };
    const unlocked = evaluateNewlyUnlocked(metrics, new Set(['poi_10']));
    expect(unlocked.map((d) => d.id)).toEqual(['poi_50']);
  });

  it('evaluates each metric independently across categories', () => {
    const metrics: AchievementMetrics = {
      longestStreakDays: 30,
      poiDiscoveriesCount: 0,
      dailyQuestsClaimedCount: 10,
      weeklyQuestsClaimedCount: 0,
    };
    const unlocked = evaluateNewlyUnlocked(metrics, new Set()).map((d) => d.id);
    expect(unlocked).toContain('streak_3');
    expect(unlocked).toContain('streak_7');
    expect(unlocked).toContain('streak_14');
    expect(unlocked).toContain('streak_30');
    expect(unlocked).toContain('daily_quests_10');
    expect(unlocked).not.toContain('poi_10');
    expect(unlocked).not.toContain('weekly_quests_10');
  });

  it('every definition id is unique', () => {
    const ids = ACHIEVEMENT_DEFINITIONS.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
