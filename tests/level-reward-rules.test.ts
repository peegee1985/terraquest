import { describe, expect, it } from 'vitest';

import {
  cumulativePermanentRadiusRingBonus,
  LEVEL_UP_ITEM_ID,
  levelRewards,
  PERMANENT_RADIUS_RING_BONUS_PER_TIER,
  RADIUS_BOOST_ITEM_ID,
  XP_BOOST_ITEM_ID,
} from '../convex/levelRewardRules';

describe('levelRewards', () => {
  it('grants nothing for the starting level or below', () => {
    expect(levelRewards(1)).toEqual([]);
    expect(levelRewards(0)).toEqual([]);
  });

  it('grants a single Scanner Pulse for an ordinary level', () => {
    expect(levelRewards(2)).toEqual([{ kind: 'item', itemId: LEVEL_UP_ITEM_ID, quantity: 1 }]);
    expect(levelRewards(3)).toEqual([{ kind: 'item', itemId: LEVEL_UP_ITEM_ID, quantity: 1 }]);
  });

  it('grants an XP Boost Potion on every 5th level that is not also a rank-tier level', () => {
    for (const level of [5, 15, 25, 35, 45, 55, 65]) {
      expect(levelRewards(level)).toEqual([
        { kind: 'item', itemId: LEVEL_UP_ITEM_ID, quantity: 1 },
        { kind: 'item', itemId: XP_BOOST_ITEM_ID, quantity: 1 },
      ]);
    }
  });

  it('grants a Radius Boost Potion, a permanent ring bump, and a double Scanner Pulse on every rank-tier level', () => {
    for (const level of [10, 20, 30, 40, 50, 60, 70]) {
      expect(levelRewards(level)).toEqual([
        { kind: 'item', itemId: LEVEL_UP_ITEM_ID, quantity: 2 },
        { kind: 'item', itemId: RADIUS_BOOST_ITEM_ID, quantity: 1 },
        { kind: 'permanent_radius', ringBonus: PERMANENT_RADIUS_RING_BONUS_PER_TIER },
      ]);
    }
  });

  it('never grants both the XP boost and the rank-tier rewards on the same level', () => {
    // 10, 20, ... are multiples of both 5 and 10 — the rank-tier branch must win.
    const level = 10;
    const rewards = levelRewards(level);
    expect(rewards.some((r) => r.kind === 'item' && r.itemId === XP_BOOST_ITEM_ID)).toBe(false);
  });
});

describe('cumulativePermanentRadiusRingBonus', () => {
  it('is zero before the first rank tier', () => {
    expect(cumulativePermanentRadiusRingBonus(1)).toBe(0);
    expect(cumulativePermanentRadiusRingBonus(9)).toBe(0);
  });

  it('accumulates one bonus per rank tier reached', () => {
    expect(cumulativePermanentRadiusRingBonus(10)).toBe(1);
    expect(cumulativePermanentRadiusRingBonus(19)).toBe(1);
    expect(cumulativePermanentRadiusRingBonus(20)).toBe(2);
    expect(cumulativePermanentRadiusRingBonus(70)).toBe(7);
  });

  it('caps at MAX_LEVEL (70) even if passed a higher number', () => {
    expect(cumulativePermanentRadiusRingBonus(999)).toBe(7);
  });
});
