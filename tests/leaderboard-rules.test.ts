import { describe, expect, it } from 'vitest';

import { rankEntries } from '../convex/leaderboardRules';

describe('rankEntries', () => {
  it('returns an empty array for no entries', () => {
    expect(rankEntries([])).toEqual([]);
  });

  it('ranks a single entry as #1', () => {
    expect(rankEntries([{ score: 10, name: 'a' }])).toEqual([{ score: 10, name: 'a', rank: 1 }]);
  });

  it('assigns sequential ranks for distinct scores, descending', () => {
    const entries = [
      { score: 5, name: 'low' },
      { score: 20, name: 'high' },
      { score: 10, name: 'mid' },
    ];
    expect(rankEntries(entries).map((e) => [e.name, e.rank])).toEqual([
      ['high', 1],
      ['mid', 2],
      ['low', 3],
    ]);
  });

  it('gives tied scores the same rank and skips ahead by the tie count for the next distinct score', () => {
    const entries = [
      { score: 10, name: 'a' },
      { score: 10, name: 'b' },
      { score: 5, name: 'c' },
    ];
    expect(rankEntries(entries).map((e) => [e.name, e.rank])).toEqual([
      ['a', 1],
      ['b', 1],
      ['c', 3],
    ]);
  });

  it('handles three-way ties correctly (1, 1, 1, 4)', () => {
    const entries = [
      { score: 10, name: 'a' },
      { score: 10, name: 'b' },
      { score: 10, name: 'c' },
      { score: 1, name: 'd' },
    ];
    expect(rankEntries(entries).map((e) => e.rank)).toEqual([1, 1, 1, 4]);
  });

  it('does not mutate the input array order', () => {
    const entries = [
      { score: 1, name: 'a' },
      { score: 99, name: 'b' },
    ];
    rankEntries(entries);
    expect(entries[0].name).toBe('a');
  });
});
