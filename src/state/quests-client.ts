import type { FunctionReference } from 'convex/server';
import { useMutation, useQuery } from 'convex/react';

import { Quest, QuestTone } from '@/domain/types';

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

// Shared between quests.tsx (full board) and index.tsx (home-screen
// preview) so both render the same quest copy from a single source.
const CATEGORY_TONE: Record<QuestCategory, QuestTone> = { movement: 'brand', exploration: 'blue', discovery: 'amber' };
const METRIC_COPY: Record<QuestMetric, { title: string; description: string; unit: string; divisor: number }> = {
  steps: { title: 'Ujdi kroky', description: 'Sečti kroky během dne. (Počítání kroků zatím není zapojené — tenhle úkol se nedá splnit.)', unit: 'kroků', divisor: 1 },
  new_units: { title: 'Odkryj nové území', description: 'Projdi místa, která ještě nejsou na tvé mapě.', unit: 'jednotek', divisor: 1 },
  active_minutes: { title: 'Buď v pohybu', description: 'Stráv čas aktivním průzkumem.', unit: 'min', divisor: 1 },
  distance_m: { title: 'Ujdi vzdálenost', description: 'Naskládej kilometry během celého týdne.', unit: 'km', divisor: 1000 },
};

export function toDisplayQuest(row: QuestRow): Quest {
  const copy = METRIC_COPY[row.metric];
  return {
    id: row._id,
    title: copy.title,
    description: copy.description,
    progress: row.progress / copy.divisor,
    target: row.target / copy.divisor,
    unit: copy.unit,
    rewardXp: row.rewardXp,
    tone: CATEGORY_TONE[row.category],
    completed: row.status === 'completed' || row.status === 'claimed',
  };
}

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
