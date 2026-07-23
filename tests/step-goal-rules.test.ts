import { describe, expect, it } from 'vitest';

import { DEFAULT_DAILY_STEP_GOAL, isValidStepGoalPreset, STEP_GOAL_PRESETS } from '../convex/stepGoalRules';

describe('isValidStepGoalPreset', () => {
  it('accepts every documented preset', () => {
    for (const preset of STEP_GOAL_PRESETS) {
      expect(isValidStepGoalPreset(preset)).toBe(true);
    }
  });

  it('rejects arbitrary values', () => {
    expect(isValidStepGoalPreset(1)).toBe(false);
    expect(isValidStepGoalPreset(9000)).toBe(false);
    expect(isValidStepGoalPreset(0)).toBe(false);
    expect(isValidStepGoalPreset(-5000)).toBe(false);
  });

  it('the default is one of the presets', () => {
    expect((STEP_GOAL_PRESETS as readonly number[])).toContain(DEFAULT_DAILY_STEP_GOAL);
  });
});
