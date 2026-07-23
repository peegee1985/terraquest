// TYPE-ONLY import — erased at compile time, so this can't pull
// convex/server's backend-runtime machinery into the client bundle (see
// session-sync.ts's clientFunctionReference comment for why a value import
// of that module crashed the app on startup).
import type { FunctionReference } from 'convex/server';
import { useMutation, useQuery } from 'convex/react';

import type { ViewportBounds } from '@/domain/fog';

export type PoiCategory = 'nature' | 'culture' | 'viewpoint' | 'gastronomy' | 'sport' | 'history';
export type PoiRarity = 'common' | 'rare';

export type PoiMarker = {
  poiId: string;
  name: string;
  category: PoiCategory;
  rarity: PoiRarity;
  latitude: number;
  longitude: number;
  discoveryRadiusMeters: number;
};

export type DiscoverPoiResult = { discovered: boolean; awarded: number; reason?: string };

/**
 * Same trick as session-sync.ts's clientFunctionReference — builds the
 * exact runtime shape Convex's client SDK looks for (`{
 * [Symbol.for('functionName')]: name }`) without importing convex/server as
 * a value. Kept local rather than exported from session-sync.ts since that
 * module's generic is pinned to 'mutation' only.
 */
function clientFunctionReference<F extends FunctionReference<'query' | 'mutation'>>(name: string): F {
  return { [Symbol.for('functionName')]: name } as unknown as F;
}

type ListPoiInBoundsQuery = FunctionReference<
  'query',
  'public',
  { minLatitude: number; maxLatitude: number; minLongitude: number; maxLongitude: number },
  PoiMarker[]
>;

type DiscoverPoiMutation = FunctionReference<
  'mutation',
  'public',
  { poiId: string; latitude: number; longitude: number; occurredAt: number },
  DiscoverPoiResult
>;

const listPoiInBoundsRef = clientFunctionReference<ListPoiInBoundsQuery>('poi:listPoiInBounds');
const discoverPoiRef = clientFunctionReference<DiscoverPoiMutation>('poi:discoverPoi');

/**
 * Only ever mounted inside a component that's already confirmed a Convex
 * client exists (see map.tsx's PoiLayer, only rendered when `convex` is
 * truthy) — useQuery/useMutation require a ConvexProvider ancestor, which
 * BackendProvider (_layout.tsx) only mounts in that same case.
 */
export function usePoiInBounds(bounds: ViewportBounds): PoiMarker[] | undefined {
  return useQuery(listPoiInBoundsRef, bounds);
}

export function useDiscoverPoi() {
  return useMutation(discoverPoiRef);
}
