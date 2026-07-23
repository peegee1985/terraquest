import type { FunctionReference } from 'convex/server';
import { useMutation, useQuery } from 'convex/react';

export type LeaderboardMetric = 'xp' | 'explorationUnits';

export type LeaderboardEntry = {
  userId: string;
  handle: string;
  displayName?: string;
  avatarId: string;
  isVip: boolean;
  score: number;
  rank: number;
};

export type FollowedUser = { userId: string; handle: string; displayName?: string; avatarId: string };

// Same clientFunctionReference trick as session-sync.ts/poi-client.ts.
function clientFunctionReference<F extends FunctionReference<'query' | 'mutation'>>(name: string): F {
  return { [Symbol.for('functionName')]: name } as unknown as F;
}

type WorldQuery = FunctionReference<'query', 'public', { metric: LeaderboardMetric; limit?: number }, LeaderboardEntry[]>;
type CountryQuery = FunctionReference<'query', 'public', { metric: LeaderboardMetric; country: string; limit?: number }, LeaderboardEntry[]>;
type FriendsQuery = FunctionReference<'query', 'public', { metric: LeaderboardMetric }, LeaderboardEntry[]>;
type FollowingQuery = FunctionReference<'query', 'public', Record<string, never>, FollowedUser[]>;
type FollowMutation = FunctionReference<'mutation', 'public', { handle: string }, { followingId: string; handle: string }>;
type UnfollowMutation = FunctionReference<'mutation', 'public', { followingId: string }, null>;

const worldRef = clientFunctionReference<WorldQuery>('leaderboards:listWorldLeaderboard');
const countryRef = clientFunctionReference<CountryQuery>('leaderboards:listCountryLeaderboard');
const friendsRef = clientFunctionReference<FriendsQuery>('leaderboards:listFriendsLeaderboard');
const followingRef = clientFunctionReference<FollowingQuery>('leaderboards:listMyFollowing');
const followByHandleRef = clientFunctionReference<FollowMutation>('leaderboards:followByHandle');
const unfollowRef = clientFunctionReference<UnfollowMutation>('leaderboards:unfollow');

export function useWorldLeaderboard(metric: LeaderboardMetric): LeaderboardEntry[] | undefined {
  return useQuery(worldRef, { metric });
}

/** `country` is `'skip'`-gated by the caller passing null when the profile has none set yet — see leaderboard.tsx. */
export function useCountryLeaderboard(metric: LeaderboardMetric, country: string | null): LeaderboardEntry[] | undefined {
  return useQuery(countryRef, country ? { metric, country } : 'skip');
}

export function useFriendsLeaderboard(metric: LeaderboardMetric): LeaderboardEntry[] | undefined {
  return useQuery(friendsRef, { metric });
}

export function useMyFollowing(): FollowedUser[] | undefined {
  return useQuery(followingRef, {});
}

export function useFollowByHandle() {
  return useMutation(followByHandleRef);
}

export function useUnfollow() {
  return useMutation(unfollowRef);
}
