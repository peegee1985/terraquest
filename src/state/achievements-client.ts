import type { FunctionReference } from 'convex/server';
import { useQuery } from 'convex/react';

function clientFunctionReference<F extends FunctionReference<'query' | 'mutation'>>(name: string): F {
  return { [Symbol.for('functionName')]: name } as unknown as F;
}

export type AchievementRow = {
  achievementId: string;
  category: 'consistency' | 'exploration' | 'quests' | 'steps';
  rarity: 'common' | 'rare' | 'epic' | 'legendary';
  unlockedAt: number;
};

type ListAchievementsForUserQuery = FunctionReference<'query', 'public', { userId: string }, AchievementRow[]>;

const listAchievementsForUserRef = clientFunctionReference<ListAchievementsForUserQuery>('achievements:listAchievementsForUser');

export function useMyAchievements(userId: string | undefined) {
  return useQuery(listAchievementsForUserRef, userId ? { userId } : 'skip');
}
