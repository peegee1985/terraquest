import { MAX_LEVEL } from './progressionRules';

/**
 * Per-level reward table (TQ-122) — same convention
 * as xpLedgerRules.ts/questRules.ts/achievementRules.ts. Designed for
 * TerraQuest's own 70-level / 8-rank-tier curve (progressionRules.ts), not
 * a literal copy of Fogbreaker's numbers: this is a deterministic function
 * of level rather than a hand-authored 70-row table, so the cadence stays
 * obviously consistent and cheap to rebalance.
 *
 * Cadence (every level is 2..MAX_LEVEL — level 1 is the starting level and
 * is never "claimed", see progressionRules.ts's levelsToClaim):
 * - Every level: 1x Scanner Pulse (the existing always-useful consumable).
 * - Every 5th level that ISN'T also a rank-tier level (5, 15, 25, ...): 1x
 *   XP Boost Potion.
 * - Every rank-tier level (10, 20, ..., 70): 1x Radius Boost Potion, a
 *   PERMANENT +1 reveal-ring bump, and a bonus Scanner Pulse (2 total that
 *   level) — the "you just reached a new rank" levels are deliberately the
 *   biggest ones.
 */

export const LEVEL_UP_ITEM_ID = 'scanner_pulse';
export const RADIUS_BOOST_ITEM_ID = 'radius_boost_potion';
export const XP_BOOST_ITEM_ID = 'xp_boost_potion';

// What using a Radius/XP Boost Potion actually does — a fixed magnitude
// per item id regardless of which level granted it (same potion, any
// source), applied by items.ts's useItem mutation.
export const RADIUS_BOOST_RING_BONUS = 1;
export const RADIUS_BOOST_DURATION_MS = 60 * 60 * 1000; // 1 hour
export const XP_BOOST_MULTIPLIER = 1.5;
export const XP_BOOST_DURATION_MS = 30 * 60 * 1000; // 30 minutes

// A permanent reveal-ring bump granted directly (not a consumable item) at
// every rank-tier level.
export const PERMANENT_RADIUS_RING_BONUS_PER_TIER = 1;

export type LevelReward =
  | { kind: 'item'; itemId: typeof LEVEL_UP_ITEM_ID | typeof RADIUS_BOOST_ITEM_ID | typeof XP_BOOST_ITEM_ID; quantity: number }
  | { kind: 'permanent_radius'; ringBonus: number };

function isRankTierLevel(level: number): boolean {
  return level % 10 === 0;
}

/** Rewards granted for reaching `level` (2..MAX_LEVEL). Levels outside that range (including 1, the starting level) get nothing — callers only ever invoke this for freshly-claimed levels (progressionRules.ts's levelsToClaim already excludes level 1). */
export function levelRewards(level: number): LevelReward[] {
  if (level < 2) return [];

  const tierLevel = isRankTierLevel(level);
  const rewards: LevelReward[] = [{ kind: 'item', itemId: LEVEL_UP_ITEM_ID, quantity: tierLevel ? 2 : 1 }];

  if (tierLevel) {
    rewards.push({ kind: 'item', itemId: RADIUS_BOOST_ITEM_ID, quantity: 1 });
    rewards.push({ kind: 'permanent_radius', ringBonus: PERMANENT_RADIUS_RING_BONUS_PER_TIER });
  } else if (level % 5 === 0) {
    rewards.push({ kind: 'item', itemId: XP_BOOST_ITEM_ID, quantity: 1 });
  }

  return rewards;
}

/** Total permanent reveal-ring bonus a player would have accumulated by `level` — every rank-tier level up to and including it grants +PERMANENT_RADIUS_RING_BONUS_PER_TIER. Used by the Level Roadmap screen to show "already earned" without needing a live query for levels the player has already passed. */
export function cumulativePermanentRadiusRingBonus(level: number): number {
  const tiersReached = Math.floor(Math.min(level, MAX_LEVEL) / 10);
  return tiersReached * PERMANENT_RADIUS_RING_BONUS_PER_TIER;
}
