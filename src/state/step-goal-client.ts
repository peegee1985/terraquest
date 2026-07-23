import type { FunctionReference } from 'convex/server';
import { useMutation } from 'convex/react';

// Same clientFunctionReference trick as profile-client.ts/quests-client.ts.
function clientFunctionReference<F extends FunctionReference<'query' | 'mutation'>>(name: string): F {
  return { [Symbol.for('functionName')]: name } as unknown as F;
}

type SetDailyStepGoalMutation = FunctionReference<
  'mutation',
  'public',
  { goal: number },
  { ok: true } | { ok: false; reason: 'invalid_goal' }
>;
type RecordStepGoalCheckInMutation = FunctionReference<
  'mutation',
  'public',
  { steps: number; now: number },
  { streakChanged: boolean; currentStreakDays: number }
>;

const setDailyStepGoalRef = clientFunctionReference<SetDailyStepGoalMutation>('stepGoal:setDailyStepGoal');
const recordStepGoalCheckInRef = clientFunctionReference<RecordStepGoalCheckInMutation>('stepGoal:recordStepGoalCheckIn');

export function useSetDailyStepGoal() {
  return useMutation(setDailyStepGoalRef);
}

export function useRecordStepGoalCheckIn() {
  return useMutation(recordStepGoalCheckInRef);
}
