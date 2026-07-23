import type { FunctionReference } from 'convex/server';
import { useMutation, useQuery } from 'convex/react';

export type MyProfile = {
  userId: string;
  handle: string;
  displayName?: string;
  avatarId: string;
  avatarPhotoUrl?: string;
  country?: string;
  totalXp: number;
  verifiedDistanceMeters: number;
  explorationUnits: number;
  poiDiscoveriesCount: number;
  currentStreakDays: number;
  longestStreakDays: number;
  dailyStepGoal: number;
  stepGoalCurrentStreakDays: number;
  stepGoalLongestStreakDays: number;
  isVip: boolean;
  xpMultiplier: number;
  planExpiresAt?: number;
};

// Same clientFunctionReference trick as session-sync.ts/poi-client.ts —
// builds the runtime shape Convex's client SDK looks for without importing
// convex/server as a value (that import crashed the app on startup; see
// session-sync.ts's comment for the full story).
function clientFunctionReference<F extends FunctionReference<'query' | 'mutation'>>(name: string): F {
  return { [Symbol.for('functionName')]: name } as unknown as F;
}

type GetMyProfileQuery = FunctionReference<'query', 'public', Record<string, never>, MyProfile | null>;
type SetCountryMutation = FunctionReference<'mutation', 'public', { country: string }, null>;

const getMyProfileRef = clientFunctionReference<GetMyProfileQuery>('profile:getMyProfile');
const setCountryRef = clientFunctionReference<SetCountryMutation>('profile:setCountry');

/** Only ever mounted when a Convex client exists — see poi-layer.tsx's PoiLayer for the same precondition on useQuery/useMutation needing a ConvexProvider ancestor. */
export function useMyProfile(): MyProfile | null | undefined {
  return useQuery(getMyProfileRef, {});
}

export function useSetCountry() {
  return useMutation(setCountryRef);
}
