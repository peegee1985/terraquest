// Client-side mirror of convex/levelRewardRules.ts's pure reward table —
// kept as its own copy rather than importing the convex module (which
// pulls in convex/server as a value and crashes the client bundle, same
// class of bug documented on src/state/*-client.ts's clientFunctionReference
// helper). Used by the Level Roadmap screen to show what each level grants
// without a round trip per row.

export const LEVEL_UP_ITEM_ID = 'scanner_pulse';
export const RADIUS_BOOST_ITEM_ID = 'radius_boost_potion';
export const XP_BOOST_ITEM_ID = 'xp_boost_potion';
export const PERMANENT_RADIUS_RING_BONUS_PER_TIER = 1;
export const MAX_LEVEL = 70;

export type LevelReward =
  | { kind: 'item'; itemId: typeof LEVEL_UP_ITEM_ID | typeof RADIUS_BOOST_ITEM_ID | typeof XP_BOOST_ITEM_ID; quantity: number }
  | { kind: 'permanent_radius'; ringBonus: number };

function isRankTierLevel(level: number): boolean {
  return level % 10 === 0;
}

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
