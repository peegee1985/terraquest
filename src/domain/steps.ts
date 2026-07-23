/**
 * TQ-46: pure step-goal logic, dependency-free so it's unit-testable
 * without a real Health Connect device (same convention as
 * gps-filter.ts/movement.ts). All the actual sensor/permission plumbing
 * lives in health-connect.ts, which is not pure and can't be unit-tested
 * the same way.
 */

export const DAILY_STEP_GOAL = 8000;

/** Clamped to [0, 1] — a goal of 0 (misconfigured) reports 0 rather than dividing by zero. */
export function dailyStepGoalRatio(steps: number, goal: number = DAILY_STEP_GOAL): number {
  if (goal <= 0) return 0;
  return Math.min(1, Math.max(0, steps / goal));
}

/** Midnight in the device's local timezone — the boundary Health Connect's "today" query uses. */
export function startOfLocalDay(reference: Date = new Date()): Date {
  const start = new Date(reference);
  start.setHours(0, 0, 0, 0);
  return start;
}
