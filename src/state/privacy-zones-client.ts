import type { FunctionReference } from 'convex/server';
import { useMutation, useQuery } from 'convex/react';

export type PrivateZone = { _id: string; label: string; latitude: number; longitude: number; radiusMeters: number };

// Same clientFunctionReference trick as session-sync.ts/poi-client.ts.
function clientFunctionReference<F extends FunctionReference<'query' | 'mutation'>>(name: string): F {
  return { [Symbol.for('functionName')]: name } as unknown as F;
}

type ListZonesQuery = FunctionReference<'query', 'public', Record<string, never>, PrivateZone[]>;
type AddZoneMutation = FunctionReference<'mutation', 'public', { label: string; latitude: number; longitude: number; radiusMeters: number }, string>;
type RemoveZoneMutation = FunctionReference<'mutation', 'public', { zoneId: string }, null>;

const listZonesRef = clientFunctionReference<ListZonesQuery>('privateZones:listMyPrivateZones');
const addZoneRef = clientFunctionReference<AddZoneMutation>('privateZones:addPrivateZone');
const removeZoneRef = clientFunctionReference<RemoveZoneMutation>('privateZones:removePrivateZone');

export function useMyPrivateZones(): PrivateZone[] | undefined {
  return useQuery(listZonesRef, {});
}

export function useAddPrivateZone() {
  return useMutation(addZoneRef);
}

export function useRemovePrivateZone() {
  return useMutation(removeZoneRef);
}
