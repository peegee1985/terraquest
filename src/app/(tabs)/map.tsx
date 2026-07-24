import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ExplorerMap, type ExplorerMapHandle } from '../../components/map/explorer-map';
import { PoiLayer, type PoiLayerState } from '../../components/map/poi-layer';

import { avatarPresetById } from '@/domain/avatars';
import { batteryIconName, formatBatteryPercent } from '@/domain/battery';
import type { ViewportBounds } from '@/domain/fog';
import { formatTemperatureC, weatherCodeToSummary } from '@/domain/weather';
import { useBattery } from '@/hooks/use-battery';
import { useLocationPermissions } from '@/hooks/use-location-permissions';
import { useTodayStats } from '@/hooks/use-today-stats';
import { useWeather } from '@/hooks/use-weather';
import { convex } from '@/state/convex-client';
import { useExplorer } from '@/state/explorer-context';
import { useUseItem } from '@/state/inventory-client';
import { useDeleteMemoryMarker, useMyMemoryMarkers } from '@/state/memory-marker-client';
import type { PoiMarker } from '@/state/poi-client';
import { useMyProfile } from '@/state/profile-client';
import { colors, radii, spacing, typography } from '@/theme/tokens';

type PickableItem = 'satellite_scan' | 'memory_marker';

const PICK_BANNER_COPY: Record<PickableItem, string> = {
  satellite_scan: 'Klepni na mapu, kam odhalit satelitní sken',
  memory_marker: 'Klepni na mapu, kam připnout poznámku',
};

/**
 * Positioned "right under the zoom in/out buttons" — Leaflet's own zoom
 * control (native only, see explorer-map.native.tsx) renders inside the
 * WebView at its default top:10/right:10 position with two ~30px-tall
 * buttons; this is a plain React Native overlay sitting outside that
 * WebView, so it can't read the control's real rendered position — the
 * offset below is a fixed approximation of "below those two buttons",
 * not a measured one.
 */
function WeatherBadge({ latitude, longitude }: { latitude: number; longitude: number }) {
  const weather = useWeather(latitude, longitude);
  if (weather.status !== 'ready') return null;
  const summary = weatherCodeToSummary(weather.code);
  return (
    <View style={styles.weatherBadge}>
      <MaterialCommunityIcons color={colors.textPrimary} name={summary.icon} size={18} />
      <Text style={styles.weatherText}>{formatTemperatureC(weather.temperatureC)}</Text>
    </View>
  );
}

/** Positioned right under WeatherBadge, same fixed-offset-approximation caveat as that component's own comment. */
function BatteryBadge() {
  const battery = useBattery();
  if (!battery || battery.level < 0) return null;
  return (
    <View style={styles.batteryBadge}>
      <MaterialCommunityIcons color={battery.level <= 0.15 && !battery.charging ? colors.danger : colors.textPrimary} name={batteryIconName(battery.level, battery.charging) as never} size={18} />
      <Text style={styles.weatherText}>{formatBatteryPercent(battery.level)}</Text>
    </View>
  );
}

function formatPoiFeedback(poi: PoiMarker, result: { discovered: boolean; awarded: number; reason?: string }): string | null {
  if (result.discovered && result.awarded > 0) return `${poi.name}: objeveno! +${result.awarded} XP`;
  if (result.reason === 'already_discovered') return null;
  if (result.reason === 'too_far') return `${poi.name}: musíš být blíž (dosah ${poi.discoveryRadiusMeters} m).`;
  if (result.reason === 'daily_cap_reached') return `${poi.name}: objeveno, ale dnešní limit XP za běžné body je vyčerpán.`;
  if (result.reason === 'ineligible' || result.reason === 'not_found') return `${poi.name}: tento bod momentálně nelze objevit.`;
  return null;
}

// A placeholder viewport (central Prague, matching ExplorerMap's own
// INITIAL_CENTER) used only until the map reports its real bounds — the
// PoiLayer branch below is gated on `convex` alone (stable for the app's
// lifetime), not on whether bounds have arrived yet, specifically so this
// default never causes a branch swap (and therefore a full ExplorerMap/
// WebView remount) once the real bounds do land.
const DEFAULT_MAP_BOUNDS: ViewportBounds = {
  minLatitude: 50.0793,
  maxLatitude: 50.0993,
  minLongitude: 14.4126,
  maxLongitude: 14.4326,
};

export default function MapScreen() {
  const router = useRouter();
  const { session, revealedCells, revealAreaAt } = useExplorer();
  const { isForegroundDenied, foreground, requestForeground } = useLocationPermissions();
  const profile = useMyProfile();
  const today = useTodayStats();
  const activateItem = useUseItem();
  const memoryMarkers = useMyMemoryMarkers();
  const deleteMemoryMarker = useDeleteMemoryMarker();

  // Inventory.tsx's "Použít na mapě" button navigates here with this param
  // to enter tap-to-pick mode, its value naming which item is being placed.
  // A ref (not just checking the param) guards against re-entering pick
  // mode on every re-render, since expo-router keeps the param around after
  // the initial navigation.
  const params = useLocalSearchParams<{ activatePick?: PickableItem }>();
  const pickParamHandledRef = useRef(false);
  const [pickingItem, setPickingItem] = useState<PickableItem | null>(null);
  useEffect(() => {
    if (params.activatePick && !pickParamHandledRef.current) {
      pickParamHandledRef.current = true;
      setPickingItem(params.activatePick);
    }
  }, [params.activatePick]);

  const handleSatelliteScanTap = useCallback(
    async (point: { latitude: number; longitude: number }) => {
      const result = await activateItem({ itemId: 'satellite_scan' }).catch(
        () => ({ ok: false as const, reason: 'not_owned' as const }),
      );
      if (!result.ok) {
        Alert.alert('Satelitní sken', 'Nemáš už žádný satelitní sken k použití.');
        return;
      }
      await revealAreaAt(point);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
      Alert.alert('Satelitní sken', 'Oblast byla odhalena.');
    },
    [activateItem, revealAreaAt],
  );

  const handleMapTap = useCallback(
    (point: { latitude: number; longitude: number }) => {
      const item = pickingItem;
      setPickingItem(null);
      if (item === 'satellite_scan') void handleSatelliteScanTap(point);
      // Memory Marker still needs the note text before it's actually
      // consumed/placed — that happens on Save in memory-marker-new.tsx,
      // not here, so an abandoned navigation never wastes the item.
      if (item === 'memory_marker') {
        router.push({
          pathname: '/memory-marker-new',
          params: { latitude: String(point.latitude), longitude: String(point.longitude) },
        });
      }
    },
    [handleSatelliteScanTap, pickingItem, router],
  );

  const handleMemoryMarkerPress = useCallback(
    (markerId: string) => {
      const marker = memoryMarkers?.find((candidate) => candidate.markerId === markerId);
      if (!marker) return;
      Alert.alert('Memory Marker', marker.note, [
        { text: 'Zavřít', style: 'cancel' },
        { text: 'Smazat', style: 'destructive', onPress: () => void deleteMemoryMarker({ markerId }) },
      ]);
    },
    [deleteMemoryMarker, memoryMarkers],
  );

  const avatarProps = {
    avatarPhotoUrl: profile?.avatarPhotoUrl,
    avatarEmoji: avatarPresetById(profile?.avatarId ?? 'compass').emoji,
    isVip: profile?.isVip ?? false,
  };
  const mapTheme = profile?.mapTheme ?? 'dark';
  const mapRef = useRef<ExplorerMapHandle>(null);
  // Reported by ExplorerMap (Leaflet's moveend on native, route-derived on
  // web) — feeds the POI query's bounding box. Starts at a placeholder
  // (see DEFAULT_MAP_BOUNDS) until the map's first real report lands.
  const [mapBounds, setMapBounds] = useState<ViewportBounds>(DEFAULT_MAP_BOUNDS);
  // Rounded to ~1km precision so useWeather's effect (keyed on
  // latitude/longitude) doesn't refetch on every 1.5s GPS poll while
  // tracking is active — weather doesn't vary at that resolution anyway.
  const currentPoint = session.route.at(-1);
  const weatherLatitude = Math.round((currentPoint?.latitude ?? 50.0893) * 100) / 100;
  const weatherLongitude = Math.round((currentPoint?.longitude ?? 14.4226) * 100) / 100;

  const handleMarkerPress = useCallback(
    async (poiId: string, pois: PoiMarker[], discover: PoiLayerState['discover']) => {
      const poi = pois.find((candidate) => candidate.poiId === poiId);
      const current = session.route.at(-1);
      if (!poi) return;
      if (!current) {
        Alert.alert('Objevování bodů', 'Ještě nemáme tvou aktuální polohu — chvíli počkej.');
        return;
      }
      const result = await discover(poi, current).catch(() => ({ discovered: false, awarded: 0, reason: 'error' }));
      if (result.discovered && result.awarded > 0) {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
      }
      const message = formatPoiFeedback(poi, result);
      if (message) Alert.alert('Bod zájmu', message);
    },
    [session.route],
  );

  // TQ-21: location capture itself runs in a background task
  // (src/domain/tracking-task.ts), auto-started/stopped by explorer-context
  // whenever foreground permission is (or isn't) granted — this screen only
  // reflects that status and the live route, no manual control.
  const status = isForegroundDenied
    ? { label: 'Poloha vypnutá — klepni pro povolení', color: colors.danger, icon: 'crosshairs-question' as const }
    : session.active
      ? { label: 'Průzkum aktivní', color: colors.brand, icon: 'access-point' as const }
      : { label: 'Připraveno', color: colors.textSecondary, icon: 'map-marker-outline' as const };

  const handleStatusPress = async () => {
    if (!isForegroundDenied) return;
    if (!foreground.canAskAgain) {
      Linking.openSettings().catch(() => undefined);
      return;
    }
    const result = await requestForeground();
    if (result.status !== 'granted') {
      Alert.alert('Poloha je vypnutá', 'TerraQuest může zatím běžet v ukázkovém režimu. Oprávnění lze později změnit v nastavení.');
    } else {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        {convex ? (
          <PoiLayer bounds={mapBounds}>
            {({ pois, discover }) => (
              <ExplorerMap
                ref={mapRef}
                memoryMarkers={memoryMarkers}
                onBoundsChange={setMapBounds}
                onMapTap={handleMapTap}
                onMarkerPress={(poiId) => void handleMarkerPress(poiId, pois, discover)}
                onMemoryMarkerPress={handleMemoryMarkerPress}
                pickMode={pickingItem !== null}
                pois={pois}
                revealedCells={revealedCells}
                route={session.route}
                theme={mapTheme}
                {...avatarProps}
              />
            )}
          </PoiLayer>
        ) : (
          <ExplorerMap ref={mapRef} onBoundsChange={setMapBounds} revealedCells={revealedCells} route={session.route} theme={mapTheme} {...avatarProps} />
        )}

        {pickingItem ? (
          <View style={styles.pickBanner}>
            <MaterialCommunityIcons color={colors.brand} name={pickingItem === 'satellite_scan' ? 'satellite-variant' : 'note-text-outline'} size={20} />
            <Text style={styles.pickBannerText}>{PICK_BANNER_COPY[pickingItem]}</Text>
            <Pressable accessibilityRole="button" onPress={() => setPickingItem(null)}>
              <Text style={styles.pickBannerCancel}>Zrušit</Text>
            </Pressable>
          </View>
        ) : null}

        <View style={styles.topHud}>
          <View style={styles.brandBlock}>
            <Text style={styles.brand}>TERRAQUEST</Text>
            <Pressable
              accessibilityRole="button"
              disabled={!isForegroundDenied}
              onPress={() => void handleStatusPress()}
              style={styles.statusRow}
            >
              <MaterialCommunityIcons color={status.color} name={status.icon} size={16} />
              <Text style={[styles.statusText, { color: status.color }]}>{status.label}</Text>
            </Pressable>
          </View>
        </View>

        <WeatherBadge latitude={weatherLatitude} longitude={weatherLongitude} />
        <BatteryBadge />

        <Pressable
          accessibilityLabel="Vycentrovat na moji polohu"
          accessibilityRole="button"
          onPress={() => mapRef.current?.recenterOnPlayer()}
          style={styles.recenterButton}
        >
          <MaterialCommunityIcons color={colors.textPrimary} name="crosshairs-gps" size={24} />
        </Pressable>

        <Pressable accessibilityRole="button" onPress={() => router.push('/session-summary')} style={styles.todayPanel}>
          <View style={styles.todayMetrics}>
            <View>
              <Text style={styles.todayMetric}>{Math.max(0, today?.newExplorationUnits ?? 0)}</Text>
              <Text style={styles.todayLabel}>nové body</Text>
            </View>
            <View>
              <Text style={[styles.todayMetric, { color: colors.brand }]}>+{today?.pendingXp ?? 0}</Text>
              <Text style={styles.todayLabel}>čekající XP</Text>
            </View>
            <MaterialCommunityIcons color={colors.textSecondary} name="chevron-right" size={22} style={styles.todayChevron} />
          </View>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  container: { flex: 1 },
  topHud: { position: 'absolute', top: spacing.sm, left: spacing.md, right: spacing.md, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  brandBlock: { backgroundColor: 'rgba(7,17,26,0.92)', borderRadius: radii.md, borderWidth: 1, borderColor: colors.outline, paddingHorizontal: spacing.sm, paddingVertical: 10 },
  brand: { ...typography.label, color: colors.textPrimary, letterSpacing: 1.4 },
  statusRow: { flexDirection: 'row', gap: 6, alignItems: 'center', marginTop: 4 },
  statusText: { ...typography.caption },
  weatherBadge: {
    position: 'absolute',
    top: spacing.sm + 76,
    right: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(7,17,26,0.92)',
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.outline,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
  },
  weatherText: { ...typography.label, color: colors.textPrimary },
  pickBanner: {
    position: 'absolute',
    top: spacing.sm + 60,
    left: spacing.md,
    right: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: 'rgba(7,17,26,0.96)',
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.brand,
    paddingHorizontal: spacing.sm,
    paddingVertical: 10,
  },
  pickBannerText: { ...typography.caption, color: colors.textPrimary, flex: 1 },
  pickBannerCancel: { ...typography.label, color: colors.danger },
  batteryBadge: {
    position: 'absolute',
    top: spacing.sm + 120,
    right: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(7,17,26,0.92)',
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.outline,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
  },
  // Fixed offset rather than a measured one — same approximation caveat as
  // weatherBadge/batteryBadge above. Sits above the "today" card below.
  recenterButton: {
    position: 'absolute',
    right: spacing.md,
    bottom: 116,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(7,17,26,0.92)',
    borderWidth: 1,
    borderColor: colors.outline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  todayPanel: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    bottom: spacing.md,
    backgroundColor: 'rgba(7,17,26,0.96)',
    borderColor: colors.outline,
    borderWidth: 1,
    borderRadius: radii.xl,
    padding: spacing.md,
  },
  todayMetrics: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  todayMetric: { ...typography.h2, color: colors.textPrimary, fontVariant: ['tabular-nums'] },
  todayLabel: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  todayChevron: { marginLeft: 'auto' },
});
