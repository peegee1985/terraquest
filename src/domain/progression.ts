import { MovementMode } from './types';

export const MAX_LEVEL = 50;
export const DAILY_BASE_XP_CAP = 1400;

export function cumulativeXpForLevel(level: number): number {
  if (level <= 1) return 0;
  return Math.round(250 * Math.pow(level - 1, 1.7));
}

export function levelForXp(totalXp: number): number {
  let level = 1;
  while (level < MAX_LEVEL && totalXp >= cumulativeXpForLevel(level + 1)) {
    level += 1;
  }
  return level;
}

export function levelProgress(totalXp: number) {
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

export function distanceXp(distanceMeters: number, mode: MovementMode): number {
  const fullXp = Math.floor(Math.max(0, distanceMeters) / 100) * 5;
  if (mode === 'bike') return Math.floor(fullXp * 0.35);
  if (mode === 'auto') return 0;
  return fullXp;
}

export function explorationXp(newNormalizedCells: number, mode: MovementMode): number {
  if (mode === 'bike' || mode === 'auto') return 0;
  return Math.min(600, Math.max(0, Math.floor(newNormalizedCells)) * 3);
}

export function cappedDailyBaseXp(distanceAward: number, explorationAward: number): number {
  return Math.min(DAILY_BASE_XP_CAP, Math.max(0, distanceAward) + Math.max(0, explorationAward));
}

export function revealRadiusForLevel(level: number): number {
  const boundedLevel = Math.min(40, Math.max(1, Math.floor(level)));
  return 18 + Math.max(0, boundedLevel - 1) * 0.25;
}
