import type { FunctionReference } from 'convex/server';
import { useQuery } from 'convex/react';

export type XpLedgerEntry = { sourceType: string; amount: number; reasonCode: string; occurredAt: number };

// Same clientFunctionReference trick as session-sync.ts/poi-client.ts.
function clientFunctionReference<F extends FunctionReference<'query' | 'mutation'>>(name: string): F {
  return { [Symbol.for('functionName')]: name } as unknown as F;
}

type XpLedgerQuery = FunctionReference<'query', 'public', { limit?: number }, XpLedgerEntry[]>;

const xpLedgerRef = clientFunctionReference<XpLedgerQuery>('dataExport:listMyXpLedger');

export function useMyXpLedger(limit?: number): XpLedgerEntry[] | undefined {
  return useQuery(xpLedgerRef, { limit });
}
