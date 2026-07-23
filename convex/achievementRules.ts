/**
 * TQ-30: pure achievement definitions and threshold-check logic,
 * dependency-free so they're unit-testable without a Convex deployment
 * (same convention as xpLedgerRules.ts/questRules.ts/poiRules.ts).
 *
 * Scope note: docs "Achievementy MVP" also list a Pohyb (distance-based)
 * category and a Route Mastery / "Konzistence trasy" category. Both are
 * deliberately left out of this pass — distance-based thresholds need
 * userStats.verifiedDistanceMeters, which no mutation populates yet (that's
 * TQ-31's session-summary/stats wiring), and Route Mastery needs a
 * repeated-route-signature detector that doesn't exist as code. Building
 * achievements against data nothing ever writes would mean thresholds that
 * can never fire — the three categories below use metrics already
 * maintained by shipped code (TQ-27/28/29).
 */

export type AchievementCategory = 'consistency' | 'exploration' | 'quests';
export type AchievementRarity = 'common' | 'rare' | 'epic' | 'legendary';
export type InventoryItemId = 'map_theme_token' | 'scanner_pulse' | 'memory_marker';

export type AchievementMetric =
  | 'longestStreakDays'
  | 'poiDiscoveriesCount'
  | 'dailyQuestsClaimedCount'
  | 'weeklyQuestsClaimedCount';

export type AchievementMetrics = Record<AchievementMetric, number>;

export type AchievementDefinition = {
  id: string;
  category: AchievementCategory;
  rarity: AchievementRarity;
  metric: AchievementMetric;
  threshold: number;
  rewardXp: number;
  itemReward?: { itemId: InventoryItemId; quantity: number };
};

/** Docs 03 "Achievementy MVP" — Konzistence (streak), Průzkum (POI), and výpravy (quest-claim counts). Each tier's rarity/rewardXp is denormalized onto the unlocked row at grant time, so a later edit here never changes an already-unlocked badge. */
export const ACHIEVEMENT_DEFINITIONS: readonly AchievementDefinition[] = [
  { id: 'streak_3', category: 'consistency', rarity: 'common', metric: 'longestStreakDays', threshold: 3, rewardXp: 50 },
  { id: 'streak_7', category: 'consistency', rarity: 'common', metric: 'longestStreakDays', threshold: 7, rewardXp: 75 },
  { id: 'streak_14', category: 'consistency', rarity: 'rare', metric: 'longestStreakDays', threshold: 14, rewardXp: 125 },
  {
    id: 'streak_30',
    category: 'consistency',
    rarity: 'rare',
    metric: 'longestStreakDays',
    threshold: 30,
    rewardXp: 250,
    itemReward: { itemId: 'map_theme_token', quantity: 1 },
  },
  { id: 'streak_100', category: 'consistency', rarity: 'epic', metric: 'longestStreakDays', threshold: 100, rewardXp: 750 },

  { id: 'poi_10', category: 'exploration', rarity: 'common', metric: 'poiDiscoveriesCount', threshold: 10, rewardXp: 50 },
  {
    id: 'poi_50',
    category: 'exploration',
    rarity: 'rare',
    metric: 'poiDiscoveriesCount',
    threshold: 50,
    rewardXp: 150,
    itemReward: { itemId: 'scanner_pulse', quantity: 3 },
  },
  { id: 'poi_100', category: 'exploration', rarity: 'epic', metric: 'poiDiscoveriesCount', threshold: 100, rewardXp: 400 },

  { id: 'daily_quests_10', category: 'quests', rarity: 'common', metric: 'dailyQuestsClaimedCount', threshold: 10, rewardXp: 100 },
  {
    id: 'weekly_quests_10',
    category: 'quests',
    rarity: 'rare',
    metric: 'weeklyQuestsClaimedCount',
    threshold: 10,
    rewardXp: 200,
    itemReward: { itemId: 'memory_marker', quantity: 1 },
  },
];

/**
 * Pure: given current metrics and the set of already-unlocked ids, returns
 * definitions newly crossing their threshold — never re-returns an
 * already-unlocked id. A big jump in one metric (e.g. a batch sync pushing
 * poiDiscoveriesCount from 0 straight to 60) correctly returns every tier
 * crossed in one call (poi_10 and poi_50 together), not just the highest.
 * The actual once-only guarantee is enforced at the DB layer by
 * userAchievements' row-existence check (achievements.ts) — this function
 * only decides which thresholds are newly met.
 */
export function evaluateNewlyUnlocked(
  metrics: AchievementMetrics,
  alreadyUnlockedIds: ReadonlySet<string>,
): AchievementDefinition[] {
  return ACHIEVEMENT_DEFINITIONS.filter(
    (definition) => !alreadyUnlockedIds.has(definition.id) && metrics[definition.metric] >= definition.threshold,
  );
}
