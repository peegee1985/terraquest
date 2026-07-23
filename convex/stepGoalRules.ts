/** Pure rules for the user-configurable daily step goal. */

export const STEP_GOAL_PRESETS = [5000, 8000, 10000, 15000] as const;
export type StepGoalPreset = (typeof STEP_GOAL_PRESETS)[number];

export const DEFAULT_DAILY_STEP_GOAL: StepGoalPreset = 8000;

export function isValidStepGoalPreset(value: number): value is StepGoalPreset {
  return (STEP_GOAL_PRESETS as readonly number[]).includes(value);
}
