import { ComponentType, RefAttributes, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import RNWebView, { type WebViewMessageEvent, type WebViewProps } from 'react-native-webview';

import { buildFogGeometry, LatLng, ViewportBounds } from '@/domain/fog';
import { TrackPoint } from '@/domain/types';
import type { PoiMarker } from '@/state/poi-client';
import { colors } from '@/theme/tokens';

// react-native-webview types WebView as `class WebView<P = undefined>`, which
// collapses JSX prop typing to `never` (P defaults to undefined, and
// WebViewProps & undefined isn't usable). Recast to a normal component type.
const WebView = RNWebView as unknown as ComponentType<WebViewProps & RefAttributes<RNWebView>>;

const INITIAL_CENTER: [number, number] = [50.0893, 14.4226];
const INITIAL_ZOOM = 15;

function ringToPairs(ring: LatLng[]): [number, number][] {
  return ring.map((point) => [point.latitude, point.longitude]);
}

type MapPayload = {
  route: [number, number][];
  current: { lat: number; lng: number } | null;
  fog: { outerRing: [number, number][]; holes: [number, number][][] };
  pois: { poiId: string; lat: number; lng: number; rarity: PoiMarker['rarity'] }[];
};

const DEFAULT_BOUNDS: ViewportBounds = {
  minLatitude: INITIAL_CENTER[0] - 0.01,
  maxLatitude: INITIAL_CENTER[0] + 0.01,
  minLongitude: INITIAL_CENTER[1] - 0.01,
  maxLongitude: INITIAL_CENTER[1] + 0.01,
};

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
  const webviewRef = useRef<RNWebView>(null);
  const [ready, setReady] = useState(false);
  // Reported by the Leaflet page on 'moveend', used to cull the persisted
  // cell set down to what's actually on screen (TQ-23: keeps the fog
  // renderer fast regardless of how many cells have been discovered).
  const [bounds, setBounds] = useState<ViewportBounds>(DEFAULT_BOUNDS);

  const payload = useMemo<MapPayload>(() => {
    const routePairs = route.map((point) => [point.latitude, point.longitude] as [number, number]);
    const current = route.at(-1);
    const currentPayload = current ? { lat: current.latitude, lng: current.longitude } : null;
    const geometry = buildFogGeometry(revealedCells, bounds);
    return {
      route: routePairs,
      current: currentPayload,
      fog: { outerRing: ringToPairs(geometry.outerRing), holes: geometry.holes.map(ringToPairs) },
      pois: pois.map((poi) => ({ poiId: poi.poiId, lat: poi.latitude, lng: poi.longitude, rarity: poi.rarity })),
    };
  }, [route, revealedCells, bounds, pois]);

  useEffect(() => {
    if (!ready) return;
    webviewRef.current?.injectJavaScript(`window.updateMap(${JSON.stringify(payload)}); true;`);
  }, [payload, ready]);

  const handleMessage = (event: WebViewMessageEvent) => {
    try {
      const message = JSON.parse(event.nativeEvent.data) as
        | { type: 'ready' }
        | { type: 'bounds'; minLatitude: number; maxLatitude: number; minLongitude: number; maxLongitude: number }
        | { type: 'poi-tap'; poiId: string };
      if (message.type === 'ready') setReady(true);
      if (message.type === 'bounds') {
        const next: ViewportBounds = {
          minLatitude: message.minLatitude,
          maxLatitude: message.maxLatitude,
          minLongitude: message.minLongitude,
          maxLongitude: message.maxLongitude,
        };
        setBounds(next);
        onBoundsChange?.(next);
      }
      if (message.type === 'poi-tap') onMarkerPress?.(message.poiId);
    } catch {
      // Ignore anything that doesn't match the Leaflet bridge contract.
    }
  };

  return (
    <View style={styles.container}>
      <WebView
        ref={webviewRef}
        source={{ html: leafletHtml, baseUrl: 'https://terraquest.app' }}
        style={styles.webview}
        originWhitelist={['*']}
        javaScriptEnabled
        domStorageEnabled
        allowFileAccess={false}
        setSupportMultipleWindows={false}
        onMessage={handleMessage}
        accessibilityLabel="Leaflet mapa průzkumu"
      />
    </View>
  );
}

/**
 * react-native-maps required a Google Maps API key that was never configured,
 * which crashed the app the instant MapView mounted. Leaflet + OpenStreetMap
 * (via CARTO's free dark tiles) needs no API key at all — same approach
 * already proven in production for the Kuryr4You dispatcher app.
 */
const leafletHtml = `<!doctype html>
<html lang="cs">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" crossorigin="" />
  <style>
    html,body,#map{height:100%;width:100%;margin:0;background:${colors.background}}
    .leaflet-container{background:${colors.background}}
    .leaflet-control-attribution{font-size:9px!important;background:rgba(7,17,26,.82)!important;color:#8FA6B5!important}
    .leaflet-control-attribution a{color:${colors.brand}!important}
    .leaflet-control-zoom a{background:${colors.background}!important;color:#EDF0F7!important;border-color:${colors.outline}!important}
  </style>
</head>
<body>
  <div id="map"></div>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" crossorigin="" onerror="window.ReactNativeWebView.postMessage(JSON.stringify({type:'error'}))"></script>
  <script>
    (function () {
      var map = L.map('map', { zoomControl: false, attributionControl: true }).setView([${INITIAL_CENTER[0]}, ${INITIAL_CENTER[1]}], ${INITIAL_ZOOM});
      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        maxZoom: 20,
        subdomains: 'abcd',
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
      }).addTo(map);
      L.control.zoom({ position: 'topright' }).addTo(map);

      var fogLayer = null;
      var routeLayer = null;
      var currentMarker = null;
      var accuracyCircle = null;
      var poiMarkers = {};

      function postBounds() {
        var bounds = map.getBounds();
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'bounds',
          minLatitude: bounds.getSouth(),
          maxLatitude: bounds.getNorth(),
          minLongitude: bounds.getWest(),
          maxLongitude: bounds.getEast(),
        }));
      }
      map.on('moveend', postBounds);

      window.updateMap = function (data) {
        if (fogLayer) map.removeLayer(fogLayer);
        var rings = [data.fog.outerRing].concat(data.fog.holes);
        fogLayer = L.polygon(rings, { stroke: false, fillColor: '${colors.fog}', fillOpacity: 1, interactive: false }).addTo(map);

        if (routeLayer) { map.removeLayer(routeLayer); routeLayer = null; }
        if (data.route.length > 1) {
          routeLayer = L.polyline(data.route, { color: '${colors.brand}', weight: 5, interactive: false }).addTo(map);
        }

        if (currentMarker) { map.removeLayer(currentMarker); currentMarker = null; }
        if (accuracyCircle) { map.removeLayer(accuracyCircle); accuracyCircle = null; }
        if (data.current) {
          accuracyCircle = L.circle([data.current.lat, data.current.lng], {
            radius: 35, color: 'rgba(56,230,138,0.5)', fillColor: 'rgba(56,230,138,0.14)', fillOpacity: 1, interactive: false,
          }).addTo(map);
          currentMarker = L.circleMarker([data.current.lat, data.current.lng], {
            radius: 8, color: '#F5F7F4', weight: 2, fillColor: '${colors.brand}', fillOpacity: 1, interactive: false,
          }).addTo(map);
        }

        var nextPoiIds = {};
        (data.pois || []).forEach(function (poi) {
          nextPoiIds[poi.poiId] = true;
          if (poiMarkers[poi.poiId]) return;
          var rare = poi.rarity === 'rare';
          var marker = L.circleMarker([poi.lat, poi.lng], {
            radius: rare ? 10 : 7,
            color: rare ? '#F5C542' : '#F5F7F4',
            weight: 2,
            fillColor: rare ? '#F5C542' : '${colors.brand}',
            fillOpacity: 0.85,
          }).addTo(map);
          marker.on('click', function () {
            window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'poi-tap', poiId: poi.poiId }));
          });
          poiMarkers[poi.poiId] = marker;
        });
        Object.keys(poiMarkers).forEach(function (poiId) {
          if (nextPoiIds[poiId]) return;
          map.removeLayer(poiMarkers[poiId]);
          delete poiMarkers[poiId];
        });
      };

      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'ready' }));
      postBounds();
    })();
  </script>
</body>
</html>`;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  webview: { flex: 1, backgroundColor: colors.background },
});
