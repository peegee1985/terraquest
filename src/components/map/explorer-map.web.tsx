import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, G, Line, Path, Rect } from 'react-native-svg';

import { buildFogGeometry, LatLng, ViewportBounds } from '@/domain/fog';
import { TrackPoint } from '@/domain/types';
import type { PoiMarker } from '@/state/poi-client';
import { colors } from '@/theme/tokens';

const VIEWBOX_WIDTH = 480;
const VIEWBOX_HEIGHT = 640;
const BOUNDS_PADDING_DEGREES = 0.003;

const DEFAULT_BOUNDS: ViewportBounds = {
  minLatitude: 50.083,
  maxLatitude: 50.093,
  minLongitude: 14.416,
  maxLongitude: 14.428,
};

function boundsFromRoute(route: readonly TrackPoint[]): ViewportBounds {
  if (route.length === 0) return DEFAULT_BOUNDS;
  const latitudes = route.map((point) => point.latitude);
  const longitudes = route.map((point) => point.longitude);
  return {
    minLatitude: Math.min(...latitudes) - BOUNDS_PADDING_DEGREES,
    maxLatitude: Math.max(...latitudes) + BOUNDS_PADDING_DEGREES,
    minLongitude: Math.min(...longitudes) - BOUNDS_PADDING_DEGREES,
    maxLongitude: Math.max(...longitudes) + BOUNDS_PADDING_DEGREES,
  };
}

/** No real map on web (no pan/zoom) — just an equirectangular projection into the fixed viewBox. */
function project(point: LatLng, bounds: ViewportBounds): { x: number; y: number } {
  const lngSpan = bounds.maxLongitude - bounds.minLongitude || 1;
  const latSpan = bounds.maxLatitude - bounds.minLatitude || 1;
  return {
    x: ((point.longitude - bounds.minLongitude) / lngSpan) * VIEWBOX_WIDTH,
    y: (1 - (point.latitude - bounds.minLatitude) / latSpan) * VIEWBOX_HEIGHT,
  };
}

function ringToPath(ring: LatLng[], bounds: ViewportBounds): string {
  return ring
    .map((point, index) => {
      const { x, y } = project(point, bounds);
      return `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .concat('Z')
    .join(' ');
}

function fogGeometryToPath(outerRing: LatLng[], holes: LatLng[][], bounds: ViewportBounds): string {
  return [ringToPath(outerRing, bounds), ...holes.map((hole) => ringToPath(hole, bounds))].join(' ');
}

export function ExplorerMap({
  route,
  revealedCells,
  pois = [],
  onBoundsChange,
  onMarkerPress,
}: {
  route: TrackPoint[];
  revealedCells: readonly string[];
  pois?: PoiMarker[];
  onBoundsChange?: (bounds: ViewportBounds) => void;
  onMarkerPress?: (poiId: string) => void;
}) {
  const path = route.length
    ? route.map((_, index) => `${index === 0 ? 'M' : 'L'} ${120 + index * 58} ${330 - index * 42}`).join(' ')
    : 'M 120 330 L 178 288 L 236 246 L 294 204 L 352 162';

  const bounds = boundsFromRoute(route);
  const geometry = buildFogGeometry(revealedCells, bounds);
  const fogPath = fogGeometryToPath(geometry.outerRing, geometry.holes, bounds);

  // No real pan/zoom on this static SVG projection — bounds are derived
  // straight from the route on every render, so this just reports whatever
  // the route-derived bounds currently are (mirrors the native Leaflet
  // bridge's postBounds(), which fires on actual map movement instead).
  // Depending on the scalar fields (not the `bounds` object itself, which
  // is a fresh object every render even when unchanged) is deliberate: the
  // object identity would refire this every render and loop with the
  // parent's setState.
  useEffect(() => {
    onBoundsChange?.(bounds);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bounds.minLatitude, bounds.maxLatitude, bounds.minLongitude, bounds.maxLongitude, onBoundsChange]);

  return (
    <View style={styles.container}>
      <Svg height="100%" viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`} width="100%">
        <Rect fill="#132431" height={VIEWBOX_HEIGHT} width={VIEWBOX_WIDTH} />
        <G opacity={0.52}>
          {[70, 140, 210, 280, 350, 420].map((x) => <Line key={`v-${x}`} stroke="#294153" strokeWidth="9" x1={x} x2={x + 40} y1="0" y2={VIEWBOX_HEIGHT} />)}
          {[80, 170, 260, 350, 440, 530].map((y) => <Line key={`h-${y}`} stroke="#294153" strokeWidth="7" x1="0" x2={VIEWBOX_WIDTH} y1={y} y2={y + 25} />)}
        </G>
        <Path d={fogPath} fill={colors.fog} fillRule="evenodd" />
        <Path d={path} fill="none" stroke={colors.brand} strokeLinecap="round" strokeLinejoin="round" strokeWidth="7" />
        <Circle cx="352" cy="162" fill={colors.brand} r="10" stroke="#F5F7F4" strokeWidth="4" />
        {pois.map((poi) => {
          const { x, y } = project(poi, bounds);
          const rare = poi.rarity === 'rare';
          return (
            <Circle
              key={poi.poiId}
              cx={x}
              cy={y}
              fill={rare ? '#F5C542' : colors.brand}
              onPress={() => onMarkerPress?.(poi.poiId)}
              r={rare ? 10 : 7}
              stroke="#F5F7F4"
              strokeWidth="2"
            />
          );
        })}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({ container: { flex: 1, backgroundColor: colors.background } });
