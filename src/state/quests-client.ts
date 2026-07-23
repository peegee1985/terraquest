import type { FunctionReference } from 'convex/server';
import { useMutation, useQuery } from 'convex/react';

export type QuestCategory = 'movement' | 'exploration' | 'discovery';
export type QuestMetric = 'steps' | 'distance_m' | 'new_units' | 'active_minutes';
export type QuestStatus = 'active' | 'completed' | 'claimed' | 'expired';

export type QuestRow = {
  _id: string;
  definitionId: string;
  periodKey: string;
  category: QuestCategory;
  metric: QuestMetric;
  target: number;
  progress: number;
  rewardXp: number;
  status: QuestStatus;
};

export type QuestBoard = { daily: QuestRow[]; weekly?: QuestRow };

// Same clientFunctionReference trick as session-sync.ts/poi-client.ts.
function clientFunctionReference<F extends FunctionReference<'query' | 'mutation'>>(name: string): F {
  return { [Symbol.for('functionName')]: name } as unknown as F;
}

type QuestBoardQuery = FunctionReference<'query', 'public', { now: number }, QuestBoard>;
type EnsureDailyMutation = FunctionReference<'mutation', 'public', { now: number; isExplorationSaturated: boolean }, QuestRow[]>;
type EnsureWeeklyMutation = FunctionReference<'mutation', 'public', { now: number }, QuestRow>;
type ClaimQuestMutation = FunctionReference<'mutation', 'public', { questId: string; now: number }, { claimed: boolean; awarded: number }>;

const questBoardRef = clientFunctionReference<QuestBoardQuery>('quests:getMyQuestBoard');
const ensureDailyRef = clientFunctionReference<EnsureDailyMutation>('quests:ensureDailyQuests');
const ensureWeeklyRef = clientFunctionReference<EnsureWeeklyMutation>('quests:ensureWeeklyQuest');
const claimQuestRef = clientFunctionReference<ClaimQuestMutation>('quests:claimQuest');

export function useMyQuestBoard(now: number): QuestBoard | undefined {
  return useQuery(questBoardRef, { now });
}

export function useEnsureDailyQuests() {
  return useMutation(ensureDailyRef);
}

export function useEnsureWeeklyQuest() {
  return useMutation(ensureWeeklyRef);
}

export function useClaimQuest() {
  return useMutation(claimQuestRef);
}
