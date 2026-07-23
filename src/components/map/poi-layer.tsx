import { ReactNode, useCallback } from 'react';

import type { ViewportBounds } from '@/domain/fog';
import { type DiscoverPoiResult, type PoiMarker, useDiscoverPoi, usePoiInBounds } from '@/state/poi-client';

export type PoiLayerState = {
  pois: PoiMarker[];
  discover: (poi: PoiMarker, location: { latitude: number; longitude: number }) => Promise<DiscoverPoiResult>;
};

/**
 * Only ever mounted when a Convex client exists (see map.tsx — rendered
 * behind `convex &&`), since usePoiInBounds/useDiscoverPoi need a
 * ConvexProvider ancestor (BackendProvider in _layout.tsx only mounts one
 * in that same case). Kept as its own component (rather than calling these
 * hooks straight in MapScreen) so the hooks are only ever invoked when
 * that precondition holds — MapScreen itself renders unconditionally.
 */
export function PoiLayer({ bounds, children }: { bounds: ViewportBounds; children: (state: PoiLayerState) => ReactNode }) {
  const pois = usePoiInBounds(bounds);
  const discoverMutation = useDiscoverPoi();

  const discover = useCallback(
    (poi: PoiMarker, location: { latitude: number; longitude: number }) =>
      discoverMutation({ poiId: poi.poiId, latitude: location.latitude, longitude: location.longitude, occurredAt: Date.now() }),
    [discoverMutation],
  );

  return <>{children({ pois: pois ?? [], discover })}</>;
}
