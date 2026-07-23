import type { FunctionReference } from 'convex/server';
import { useMutation } from 'convex/react';

function clientFunctionReference<F extends FunctionReference<'query' | 'mutation'>>(name: string): F {
  return { [Symbol.for('functionName')]: name } as unknown as F;
}

export type RedeemCodeReason =
  | 'invalid_format'
  | 'not_found'
  | 'inactive'
  | 'expired'
  | 'redemption_limit_reached'
  | 'already_redeemed';

export type RedeemCodeResult = { ok: true } | { ok: false; reason: RedeemCodeReason };

type RedeemDiscountCodeMutation = FunctionReference<'mutation', 'public', { code: string; now: number }, RedeemCodeResult>;

const redeemDiscountCodeRef =
  clientFunctionReference<RedeemDiscountCodeMutation>('promoCodes:redeemDiscountCode');

export function useRedeemDiscountCode() {
  return useMutation(redeemDiscountCodeRef);
}
