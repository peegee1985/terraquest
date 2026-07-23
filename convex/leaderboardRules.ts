/**
 * TQ-45: pure leaderboard ranking logic, dependency-free so it's
 * unit-testable without a Convex deployment (same convention as
 * xpLedgerRules.ts/questRules.ts/achievementRules.ts).
 */

export type LeaderboardMetric = 'xp' | 'explorationUnits';

export type LeaderboardEntry<T> = T & { score: number };
export type RankedEntry<T> = T & { score: number; rank: number };

/**
 * Pure: sorts entries by score descending and assigns standard competition
 * ranks — equal scores share a rank, and the next distinct score's rank
 * skips ahead by the number of entries tied ahead of it (1, 2, 2, 4, ...),
 * not a dense 1, 2, 2, 3. Matches how leaderboards conventionally handle
 * ties (a tie doesn't compress the field below it).
 */
export function rankEntries<T>(entries: readonly LeaderboardEntry<T>[]): RankedEntry<T>[] {
  const sorted = [...entries].sort((a, b) => b.score - a.score);
  const ranked: RankedEntry<T>[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const entry = sorted[i];
    const rank = i > 0 && sorted[i - 1].score === entry.score ? ranked[i - 1].rank : i + 1;
    ranked.push({ ...entry, rank });
  }
  return ranked;
}
