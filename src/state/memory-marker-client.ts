import type { FunctionReference } from 'convex/server';
import { useMutation, useQuery } from 'convex/react';

function clientFunctionReference<F extends FunctionReference<'query' | 'mutation'>>(name: string): F {
  return { [Symbol.for('functionName')]: name } as unknown as F;
}

export type MemoryMarker = { markerId: string; latitude: number; longitude: number; note: string; createdAt: number };

export type PlaceMemoryMarkerResult = { ok: true } | { ok: false; reason: 'not_owned' };

type ListMyMemoryMarkersQuery = FunctionReference<'query', 'public', Record<string, never>, MemoryMarker[]>;
type PlaceMemoryMarkerMutation = FunctionReference<
  'mutation',
  'public',
  { latitude: number; longitude: number; note: string },
  PlaceMemoryMarkerResult
>;
type DeleteMemoryMarkerMutation = FunctionReference<'mutation', 'public', { markerId: string }, null>;

const listMyMemoryMarkersRef =
  clientFunctionReference<ListMyMemoryMarkersQuery>('memoryMarkers:listMyMemoryMarkers');
const placeMemoryMarkerRef =
  clientFunctionReference<PlaceMemoryMarkerMutation>('memoryMarkers:placeMemoryMarker');
const deleteMemoryMarkerRef =
  clientFunctionReference<DeleteMemoryMarkerMutation>('memoryMarkers:deleteMemoryMarker');

export function useMyMemoryMarkers(): MemoryMarker[] | undefined {
  return useQuery(listMyMemoryMarkersRef, {});
}

export function usePlaceMemoryMarker() {
  return useMutation(placeMemoryMarkerRef);
}

export function useDeleteMemoryMarker() {
  return useMutation(deleteMemoryMarkerRef);
}
