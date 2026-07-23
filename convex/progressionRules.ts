/**
 * TQ-27: pure level/rank/reveal-radius rules, dependency-free so they're
 * unit-testable without a Convex deployment (same convention as
 * authProfile.ts and xpLedgerRules.ts). Mirrors src/domain/progression.ts's
 * client-side copy — kept as an independent module rather than a
 * cross-boundary import because convex/tsconfig.json is an isolated
 * program (see convex/env.d.ts's note from TQ-18). If the curve changes,
 * update both.
 */
export const MAX_LEVEL = 70;
export const PROGRESSION_VERSION = 'v0.2';

export function cumulativeXpForLevel(level: number): number {
  if (level <= 1) return 0;
  return Math.round(300 * Math.pow(level - 1, 1.62));
}

export function levelForXp(totalXp: number): number {
  let level = 1;
  while (level < MAX_LEVEL && totalXp >= cumulativeXpForLevel(level + 1)) {
    level += 1;
  }
  return level;
}

export function levelProgress(totalXp: number): { level: number; current: number; required: number; ratio: number } {
  const level = levelForXp(totalXp);
  const floor = cumulativeXpForLevel(level);
  const ceiling = level === MAX_LEVEL ? floor : cumulativeXpForLevel(level + 1);
  const range = Math.max(1, ceiling - floor);
  return {
    level,
    current: Math.max(0, totalXp - floor),
    required: range,
    ratio: level === MAX_LEVEL ? 1 : Math.min(1, Math.max(0, (totalXp - floor) / range)),
  };
}

export type RankTier = { level: number; rankId: string; label: string };

// Order matters: rankForLevel walks this looking for the highest tier the
// level qualifies for, so it must stay sorted ascending by level.
export const RANK_TIERS: readonly RankTier[] = [
  { level: 1, rankId: 'tulak', label: 'Tulák' },
  { level: 10, rankId: 'poutnik', label: 'Poutník' },
  { level: 20, rankId: 'pruzkumnik', label: 'Průzkumník' },
  { level: 30, rankId: 'stopar', label: 'Stopař' },
  { level: 40, rankId: 'kartograf', label: 'Kartograf' },
  { level: 50, rankId: 'cestovatel', label: 'Cestovatel' },
  { level: 60, rankId: 'expedicionar', label: 'Expedicionář' },
  { level: 70, rankId: 'legenda_mapy', label: 'Legenda mapy' },
];

export function rankForLevel(level: number): RankTier {
  let current = RANK_TIERS[0];
  for (const tier of RANK_TIERS) {
    if (level >= tier.level) current = tier;
  }
  return current;
}

export function revealRadiusForLevel(level: number): number {
  const boundedLevel = Math.min(60, Math.max(1, Math.floor(level)));
  return 18 + Math.max(0, boundedLevel - 1) * 0.2;
}

/** Every level strictly between fromLevel and toLevel (inclusive of toLevel) whose reward hasn't been claimed yet — used to idempotently catch up if a single XP event crosses more than one level at once. */
export function levelsToClaim(fromLevel: number, toLevel: number): number[] {
  const levels: number[] = [];
  for (let level = fromLevel + 1; level <= toLevel; level += 1) {
    levels.push(level);
  }
  return levels;
}
