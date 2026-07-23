import { MovementMode } from './types';

/**
 * TQ-25: two fixed profiles rather than continuous tuning — 'relaxed' trades
 * GPS precision for battery life during bike/auto, which already earn
 * 0.35x/0x XP (progression.ts) and don't need fine fog-reveal precision, so
 * the trade costs nothing competitively. 'precise' is used for walk/run and
 * whenever movement mode hasn't been classified yet. Kept free of any
 * expo-location/expo-task-manager import (unlike tracking-task.ts) so this
 * mapping is plainly unit-testable.
 */
export type TrackingProfile = 'precise' | 'relaxed';

export function trackingProfileForMode(mode: MovementMode): TrackingProfile {
  return mode === 'bike' || mode === 'auto' ? 'relaxed' : 'precise';
}
