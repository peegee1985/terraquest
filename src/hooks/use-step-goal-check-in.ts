import { useEffect, useRef } from 'react';

import { useRecordStepGoalCheckIn } from '@/state/step-goal-client';

/**
 * Fires recordStepGoalCheckIn once per mount whenever steps first reach
 * (or already start at/above) the goal — the server side is idempotent per
 * gameDayKey regardless, but this ref guard avoids firing the mutation
 * again on every subsequent steps update within the same still-above-goal
 * session (Health Connect's poll can report the same day's total many
 * times over).
 */
export function useStepGoalCheckIn(steps: number | null, goal: number | null): void {
  const recordStepGoalCheckIn = useRecordStepGoalCheckIn();
  const firedRef = useRef(false);

  useEffect(() => {
    if (steps === null || goal === null) return;
    if (steps < goal) {
      firedRef.current = false;
      return;
    }
    if (firedRef.current) return;
    firedRef.current = true;
    void recordStepGoalCheckIn({ steps, now: Date.now() }).catch(() => {
      firedRef.current = false;
    });
  }, [steps, goal, recordStepGoalCheckIn]);
}
