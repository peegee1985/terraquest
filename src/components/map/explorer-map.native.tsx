import { ComponentType, forwardRef, RefAttributes, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
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
  avatar: { photoUrl?: string; emoji: string; isVip: boolean };
  pickMode: boolean;
};

const DEFAULT_BOUNDS: ViewportBounds = {
  minLatitude: INITIAL_CENTER[0] - 0.01,
  maxLatitude: INITIAL_CENTER[0] + 0.01,
  minLongitude: INITIAL_CENTER[1] - 0.01,
  maxLongitude: INITIAL_CENTER[1] + 0.01,
};

export type ExplorerMapHandle = { recenterOnPlayer: () => void };

export const ExplorerMap = forwardRef<
  ExplorerMapHandle,
  {
    route: TrackPoint[];
    revealedCells: readonly string[];
    pois?: PoiMarker[];
    avatarPhotoUrl?: string;
    avatarEmoji?: string;
    isVip?: boolean;
    onBoundsChange?: (bounds: ViewportBounds) => void;
    onMarkerPress?: (poiId: string) => void;
    // Satellite Scan's "tap the map to pick a spot" mode — while true, a
    // map tap reports its lat/lng instead of doing anything else (panning
    // still works; it's Leaflet's own 'click' event, not a drag).
    pickMode?: boolean;
    onMapTap?: (point: { latitude: number; longitude: number }) => void;
  }
>(function ExplorerMap(
  {
    route,
    revealedCells,
    pois = [],
    avatarPhotoUrl,
    avatarEmoji = '🧭',
    isVip = false,
    onBoundsChange,
    onMarkerPress,
    pickMode = false,
    onMapTap,
  },
  ref,
) {
  const webviewRef = useRef<RNWebView>(null);
  const [ready, setReady] = useState(false);

  useImperativeHandle(ref, () => ({
    recenterOnPlayer: () => {
      webviewRef.current?.injectJavaScript('window.recenterOnPlayer && window.recenterOnPlayer(); true;');
    },
  }));
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
      avatar: { photoUrl: avatarPhotoUrl, emoji: avatarEmoji, isVip },
      pickMode,
    };
  }, [route, revealedCells, bounds, pois, avatarPhotoUrl, avatarEmoji, isVip, pickMode]);

  useEffect(() => {
    if (!ready) return;
    webviewRef.current?.injectJavaScript(`window.updateMap(${JSON.stringify(payload)}); true;`);
  }, [payload, ready]);

  const handleMessage = (event: WebViewMessageEvent) => {
    try {
      const message = JSON.parse(event.nativeEvent.data) as
        | { type: 'ready' }
        | { type: 'bounds'; minLatitude: number; maxLatitude: number; minLongitude: number; maxLongitude: number }
        | { type: 'poi-tap'; poiId: string }
        | { type: 'map-tap'; lat: number; lng: number };
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
      if (message.type === 'map-tap') onMapTap?.({ latitude: message.lat, longitude: message.lng });
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
});

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
    .leaflet-container.picking{cursor:crosshair}
    .player-avatar-icon{display:flex;align-items:center;justify-content:center;width:34px;height:34px;border-radius:50%;background:${colors.surface};border:2px solid ${colors.brand};box-shadow:0 0 0 2px rgba(0,0,0,0.25);overflow:hidden}
    .player-avatar-icon.is-vip{border-color:#F5C542;box-shadow:0 0 0 2px rgba(245,197,66,0.35)}
    .player-avatar-icon img{width:100%;height:100%;object-fit:cover}
    .player-avatar-icon .emoji{font-size:18px;line-height:1}
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
      var lastCurrent = null;
      var pickModeActive = false;

      window.recenterOnPlayer = function () {
        if (!lastCurrent) return;
        map.setView([lastCurrent.lat, lastCurrent.lng], Math.max(map.getZoom(), ${INITIAL_ZOOM}));
      };

      // Satellite Scan's tap-to-pick mode — a plain Leaflet 'click' (not a
      // drag-end), reported back to RN so it can consume the item and
      // trigger the local fog reveal at the chosen point.
      map.on('click', function (e) {
        if (!pickModeActive) return;
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'map-tap', lat: e.latlng.lat, lng: e.latlng.lng }));
      });

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
        pickModeActive = !!data.pickMode;
        map.getContainer().classList.toggle('picking', pickModeActive);

        if (fogLayer) map.removeLayer(fogLayer);
        var rings = [data.fog.outerRing].concat(data.fog.holes);
        fogLayer = L.polygon(rings, { stroke: false, fillColor: '${colors.fog}', fillOpacity: 1, interactive: false }).addTo(map);

        if (routeLayer) { map.removeLayer(routeLayer); routeLayer = null; }
        if (data.route.length > 1) {
          routeLayer = L.polyline(data.route, { color: '${colors.brand}', weight: 5, interactive: false }).addTo(map);
        }

        if (currentMarker) { map.removeLayer(currentMarker); currentMarker = null; }
        if (accuracyCircle) { map.removeLayer(accuracyCircle); accuracyCircle = null; }
        lastCurrent = data.current;
        if (data.current) {
          accuracyCircle = L.circle([data.current.lat, data.current.lng], {
            radius: 35, color: 'rgba(56,230,138,0.5)', fillColor: 'rgba(56,230,138,0.14)', fillOpacity: 1, interactive: false,
          }).addTo(map);
          // Player's own chosen avatar (photo or preset emoji) as the map
          // marker, instead of a generic dot — a gold ring marks VIP the
          // same way the Stats screen's avatar ring does.
          var avatar = data.avatar || { emoji: '🧭', isVip: false };
          var avatarInner = avatar.photoUrl
            ? '<img src="' + avatar.photoUrl + '" />'
            : '<span class="emoji">' + avatar.emoji + '</span>';
          var avatarIcon = L.divIcon({
            className: 'player-avatar-icon' + (avatar.isVip ? ' is-vip' : ''),
            html: avatarInner,
            iconSize: [34, 34],
            iconAnchor: [17, 17],
          });
          currentMarker = L.marker([data.current.lat, data.current.lng], { icon: avatarIcon, interactive: false }).addTo(map);
        }

        // Common POIs deliberately use a different color (blue) than the
        // player's own position marker (brand green) — they used to share
        // the same color, which made them hard to tell apart at a glance.
        var nextPoiIds = {};
        (data.pois || []).forEach(function (poi) {
          nextPoiIds[poi.poiId] = true;
          if (poiMarkers[poi.poiId]) return;
          var rare = poi.rarity === 'rare';
          var marker = L.circleMarker([poi.lat, poi.lng], {
            radius: rare ? 10 : 7,
            color: rare ? '#F5C542' : '#F5F7F4',
            weight: 2,
            fillColor: rare ? '#F5C542' : '${colors.blue}',
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
