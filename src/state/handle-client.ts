import type { FunctionReference } from 'convex/server';
import { useMutation, useQuery } from 'convex/react';

function clientFunctionReference<F extends FunctionReference<'query' | 'mutation'>>(name: string): F {
  return { [Symbol.for('functionName')]: name } as unknown as F;
}

export type ChangeHandleResult =
  | { ok: true }
  | { ok: false; reason: 'guests_cannot_change_handle' | 'invalid_format' | 'same_handle' | 'taken' | 'limit_reached' };

type ChangeHandleMutation = FunctionReference<'mutation', 'public', { newHandle: string }, ChangeHandleResult>;
type CheckHandleAvailabilityQuery = FunctionReference<
  'query',
  'public',
  { handle: string },
  { available: boolean; validFormat: boolean }
>;
type GetMyHandleChangeStatusQuery = FunctionReference<
  'query',
  'public',
  Record<string, never>,
  { isGuest: boolean; changesUsedInWindow: number; changesAllowed: number } | null
>;

const changeHandleRef = clientFunctionReference<ChangeHandleMutation>('handle:changeHandle');
const checkHandleAvailabilityRef = clientFunctionReference<CheckHandleAvailabilityQuery>('handle:checkHandleAvailability');
const getMyHandleChangeStatusRef = clientFunctionReference<GetMyHandleChangeStatusQuery>('handle:getMyHandleChangeStatus');

export function useChangeHandle() {
  return useMutation(changeHandleRef);
}

/** Pass '' to skip the availability check (e.g. before the user has typed anything) — an empty handle is never a valid format anyway. */
export function useCheckHandleAvailability(handle: string) {
  return useQuery(checkHandleAvailabilityRef, handle ? { handle } : 'skip');
}

export function useMyHandleChangeStatus() {
  return useQuery(getMyHandleChangeStatusRef, {});
}
