import type { FunctionReference } from 'convex/server';
import { useMutation } from 'convex/react';

function clientFunctionReference<F extends FunctionReference<'query' | 'mutation'>>(name: string): F {
  return { [Symbol.for('functionName')]: name } as unknown as F;
}

type ClaimDailyBonusMutation = FunctionReference<
  'mutation',
  'public',
  { now: number },
  { claimed: true; awarded: number } | { claimed: false; reason: 'already_claimed_today' }
>;

const claimDailyBonusRef = clientFunctionReference<ClaimDailyBonusMutation>('dailyBonus:claimDailyBonus');

export function useClaimDailyBonus() {
  return useMutation(claimDailyBonusRef);
}
