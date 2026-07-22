import MapView, { Circle, Marker, Polygon, Polyline } from 'react-native-maps';
import { StyleSheet, View } from 'react-native';

import { TrackPoint } from '@/domain/types';
import { colors } from '@/theme/tokens';

const initialRegion = {
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

const darkMapStyle = [
  { elementType: 'geometry', stylers: [{ color: '#132431' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#8FA6B5' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#09131B' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#294153' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#182B39' }] },
  { featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'off' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#081722' }] },
];

export function ExplorerMap({ route }: { route: TrackPoint[] }) {
  const current = route.at(-1);
  const coordinates = route.map(({ latitude, longitude }) => ({ latitude, longitude }));
  const holes = route.map((point) => circleHole(point));

  return (
    <View style={styles.container}>
      <MapView customMapStyle={darkMapStyle} initialRegion={initialRegion} rotateEnabled={false} style={StyleSheet.absoluteFill}>
        <Polygon coordinates={fogBoundary} fillColor={colors.fog} holes={holes} strokeColor="transparent" />
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
