import { useMemo, useState } from 'react';
import MapView, { Circle, Marker, Polygon, Polyline, Region } from 'react-native-maps';
import { StyleSheet, View } from 'react-native';

import { buildFogGeometry, cellsRevealedByRoute, ViewportBounds } from '@/domain/fog';
import { TrackPoint } from '@/domain/types';
import { colors } from '@/theme/tokens';

const initialRegion: Region = {
  latitude: 50.0893,
  longitude: 14.4226,
  latitudeDelta: 0.018,
  longitudeDelta: 0.018,
};

const fogBoundary = [
  { latitude: 51.5, longitude: 12.0 },
  { latitude: 51.5, longitude: 17.0 },
  { latitude: 48.5, longitude: 17.0 },
  { latitude: 48.5, longitude: 12.0 },
];

function circleHole(center: TrackPoint, radiusMeters = 25, points = 18) {
  const latitudeRadius = radiusMeters / 111_320;
  const longitudeRadius = radiusMeters / (111_320 * Math.cos((center.latitude * Math.PI) / 180));
  return Array.from({ length: points }, (_, index) => {
    const angle = (index / points) * Math.PI * 2;
    return {
      latitude: center.latitude + Math.sin(angle) * latitudeRadius,
      longitude: center.longitude + Math.cos(angle) * longitudeRadius,
    };
  });
}

function boundsFromRegion(region: Region): ViewportBounds {
  return {
    minLatitude: region.latitude - region.latitudeDelta / 2,
    maxLatitude: region.latitude + region.latitudeDelta / 2,
    minLongitude: region.longitude - region.longitudeDelta / 2,
    maxLongitude: region.longitude + region.longitudeDelta / 2,
  };
}

const darkMapStyle = [
  { elementType: 'geometry', stylers: [{ color: '#132431' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#8FA6B5' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#09131B' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#294153' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#182B39' }] },
  { featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'off' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#081722' }] },
];

export type FogMode = 'demo' | 'h3';

export function ExplorerMap({ route, fogMode = 'demo' }: { route: TrackPoint[]; fogMode?: FogMode }) {
  const current = route.at(-1);
  const coordinates = route.map(({ latitude, longitude }) => ({ latitude, longitude }));
  const holes = route.map((point) => circleHole(point));
  const [region, setRegion] = useState<Region>(initialRegion);

  // TQ-17 H3 fog prototype: only touches h3-js when the layer toggle is on
  // (never on the default 'demo' path), and never lets a prototype-only
  // failure crash the whole map screen — falls back to the demo fog instead.
  const h3Fog = useMemo(() => {
    if (fogMode !== 'h3') return null;
    try {
      const revealedCells = cellsRevealedByRoute(route);
      return buildFogGeometry(revealedCells, boundsFromRegion(region));
    } catch (error) {
      console.warn('[TQ-17] H3 fog prototype failed, falling back to demo fog', error);
      return null;
    }
  }, [fogMode, route, region]);

  return (
    <View style={styles.container}>
      <MapView
        customMapStyle={darkMapStyle}
        initialRegion={initialRegion}
        onRegionChangeComplete={setRegion}
        rotateEnabled={false}
        style={StyleSheet.absoluteFill}
      >
        {h3Fog ? (
          <Polygon coordinates={h3Fog.outerRing} fillColor={colors.fog} holes={h3Fog.holes} strokeColor="transparent" />
        ) : (
          <Polygon coordinates={fogBoundary} fillColor={colors.fog} holes={holes} strokeColor="transparent" />
        )}
        {coordinates.length > 1 ? <Polyline coordinates={coordinates} strokeColor={colors.brand} strokeWidth={5} /> : null}
        {current ? (
          <>
            <Circle center={current} fillColor="rgba(56,230,138,0.14)" radius={35} strokeColor="rgba(56,230,138,0.5)" />
            <Marker coordinate={current} pinColor={colors.brand} />
          </>
        ) : null}
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({ container: { flex: 1, backgroundColor: colors.background } });
