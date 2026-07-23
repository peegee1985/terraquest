import { distanceMeters } from './gps-filter';
import { MovementMode, TrackPoint } from './types';

/**
 * TQ-22: classifies the current movement mode from recent speed so scoring
 * (progression.ts already zeroes distance/exploration XP for 'bike'/'auto')
 * reflects what the user is actually doing, not just whatever mode they
 * picked when starting the session.
 */
export type MovementThresholds = {
  /** Speed (m/s) at/above which 'walk' escalates to 'run'. */
  runMps: number;
  /** Speed (m/s) at/above which 'run' escalates to 'bike'. */
  bikeMps: number;
  /** Speed (m/s) at/above which 'bike' escalates to 'auto'. */
  autoMps: number;
  /** How far below a boundary speed must drop before de-escalating back through it, so noise near a boundary can't flip the mode every sample. */
  hysteresisMps: number;
};

// See gps-filter.ts's DEFAULT_GPS_FILTER_OPTIONS comment: thresholds are a
// plain overridable object to satisfy "prahy jsou remote-configurable".
export const DEFAULT_MOVEMENT_THRESHOLDS: MovementThresholds = {
  runMps: 2.2, // ~8 km/h
  bikeMps: 4.5, // ~16 km/h
  autoMps: 9.0, // ~32 km/h
  hysteresisMps: 0.6,
};

const MODES: MovementMode[] = ['walk', 'run', 'bike', 'auto'];

/**
 * Escalates immediately once speed clears the boundary above the current
 * mode, but only de-escalates once speed drops hysteresisMps below the
 * boundary that was crossed to enter it — asymmetric on purpose, since
 * speeding up is unambiguous while coasting to a stop hovers near a boundary.
 */
export function classifyMovement(
  speedMps: number,
  previousMode: MovementMode,
  thresholds: MovementThresholds = DEFAULT_MOVEMENT_THRESHOLDS,
): MovementMode {
  const boundaries = [thresholds.runMps, thresholds.bikeMps, thresholds.autoMps];
  let index = MODES.indexOf(previousMode);

  while (index < MODES.length - 1 && speedMps >= boundaries[index]) {
    index += 1;
  }
  while (index > 0 && speedMps < boundaries[index - 1] - thresholds.hysteresisMps) {
    index -= 1;
  }
  return MODES[index];
}

const MODE_BITS: Record<MovementMode, number> = { walk: 1, run: 2, bike: 4, auto: 8 };

/** Bitmask value for local_explored_cell.mode_mask (docs 02) — ORed across every mode a cell has ever been seen in. */
export function movementModeBit(mode: MovementMode): number {
  return MODE_BITS[mode];
}

/** Average speed (m/s) over the last windowSize+1 points, derived from distance/time rather than trusting any single instantaneous GPS speed reading. */
export function computeRollingSpeedMps(points: TrackPoint[], windowSize = 5): number {
  const relevant = points.slice(-(windowSize + 1));
  if (relevant.length < 2) return 0;

  let totalDistance = 0;
  let totalTimeMs = 0;
  for (let i = 1; i < relevant.length; i += 1) {
    totalDistance += distanceMeters(relevant[i - 1], relevant[i]);
    totalTimeMs += relevant[i].timestamp - relevant[i - 1].timestamp;
  }
  if (totalTimeMs <= 0) return 0;
  return totalDistance / (totalTimeMs / 1000);
}
