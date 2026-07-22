import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, G, Line, Mask, Path, Rect } from 'react-native-svg';

import { buildFogGeometry, cellsRevealedByRoute, LatLng, ViewportBounds } from '@/domain/fog';
import { TrackPoint } from '@/domain/types';
import { colors } from '@/theme/tokens';

export type FogMode = 'demo' | 'h3';

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

export function ExplorerMap({ route, fogMode = 'demo' }: { route: TrackPoint[]; fogMode?: FogMode }) {
  const path = route.length
    ? route.map((_, index) => `${index === 0 ? 'M' : 'L'} ${120 + index * 58} ${330 - index * 42}`).join(' ')
    : 'M 120 330 L 178 288 L 236 246 L 294 204 L 352 162';

  const h3FogPath = (() => {
    if (fogMode !== 'h3') return null;
    try {
      const bounds = boundsFromRoute(route);
      const revealedCells = cellsRevealedByRoute(route);
      const geometry = buildFogGeometry(revealedCells, bounds);
      return fogGeometryToPath(geometry.outerRing, geometry.holes, bounds);
    } catch (error) {
      console.warn('[TQ-17] H3 fog prototype failed, falling back to demo fog', error);
      return null;
    }
  })();

  return (
    <View style={styles.container}>
      <Svg height="100%" viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`} width="100%">
        <Rect fill="#132431" height={VIEWBOX_HEIGHT} width={VIEWBOX_WIDTH} />
        <G opacity={0.52}>
          {[70, 140, 210, 280, 350, 420].map((x) => <Line key={`v-${x}`} stroke="#294153" strokeWidth="9" x1={x} x2={x + 40} y1="0" y2={VIEWBOX_HEIGHT} />)}
          {[80, 170, 260, 350, 440, 530].map((y) => <Line key={`h-${y}`} stroke="#294153" strokeWidth="7" x1="0" x2={VIEWBOX_WIDTH} y1={y} y2={y + 25} />)}
        </G>
        {h3FogPath ? (
          <Path d={h3FogPath} fill={colors.fog} fillRule="evenodd" />
        ) : (
          <>
            <Defs>
              <Mask id="fog-mask">
                <Rect fill="white" height={VIEWBOX_HEIGHT} width={VIEWBOX_WIDTH} />
                <Path d={path} fill="none" stroke="black" strokeLinecap="round" strokeLinejoin="round" strokeWidth="58" />
              </Mask>
            </Defs>
            <Rect fill="#050B10" fillOpacity={0.84} height={VIEWBOX_HEIGHT} mask="url(#fog-mask)" width={VIEWBOX_WIDTH} />
          </>
        )}
        <Path d={path} fill="none" stroke={colors.brand} strokeLinecap="round" strokeLinejoin="round" strokeWidth="7" />
        <Circle cx="352" cy="162" fill={colors.brand} r="10" stroke="#F5F7F4" strokeWidth="4" />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({ container: { flex: 1, backgroundColor: colors.background } });
