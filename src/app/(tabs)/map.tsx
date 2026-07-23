import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, SafeAreaView, StyleSheet, Text, View } from 'react-native';

import { ExplorerMap } from '../../components/map/explorer-map';
import { PoiLayer, type PoiLayerState } from '../../components/map/poi-layer';

import { PrimaryButton } from '@/components/ui/primitives';
import type { ViewportBounds } from '@/domain/fog';
import { useLocationPermissions } from '@/hooks/use-location-permissions';
import { convex } from '@/state/convex-client';
import { useExplorer } from '@/state/explorer-context';
import type { PoiMarker } from '@/state/poi-client';
import { colors, radii, spacing, typography } from '@/theme/tokens';

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

function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60).toString().padStart(2, '0');
  const rest = (seconds % 60).toString().padStart(2, '0');
  return `${minutes}:${rest}`;
}

export default function MapScreen() {
  const router = useRouter();
  const { session, revealedCells, startSession, togglePause, finishSession } = useExplorer();
  const { isForegroundDenied, requestForeground } = useLocationPermissions();
  // Reported by ExplorerMap (Leaflet's moveend on native, route-derived on
  // web) — feeds the POI query's bounding box. Starts at a placeholder
  // (see DEFAULT_MAP_BOUNDS) until the map's first real report lands.
  const [mapBounds, setMapBounds] = useState<ViewportBounds>(DEFAULT_MAP_BOUNDS);

  const handleMarkerPress = useCallback(
    async (poiId: string, pois: PoiMarker[], discover: PoiLayerState['discover']) => {
      const poi = pois.find((candidate) => candidate.poiId === poiId);
      const current = session.route.at(-1);
      if (!poi) return;
      if (!session.active || !current) {
        Alert.alert('Objevování bodů', 'Nejprve zahaj průzkum, ať máme tvou aktuální polohu.');
        return;
      }
      const result = await discover(poi, current).catch(() => ({ discovered: false, awarded: 0, reason: 'error' }));
      if (result.discovered && result.awarded > 0) {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
      }
      const message = formatPoiFeedback(poi, result);
      if (message) Alert.alert('Bod zájmu', message);
    },
    [session.active, session.route],
  );

  // TQ-21: location capture itself runs in a background task
  // (src/domain/tracking-task.ts), started/stopped by explorer-context —
  // this screen only requests permission and reflects status/route.

  // TQ-20: denial doesn't block the session — it just runs without live
  // track points (demo/limited mode), which is what this status label shows.
  const status = session.paused
    ? { label: 'Pozastaveno', color: colors.warning, icon: 'pause' as const }
    : isForegroundDenied
      ? { label: 'Omezená poloha', color: colors.danger, icon: 'crosshairs-question' as const }
      : session.active
        ? { label: 'Průzkum aktivní', color: colors.brand, icon: 'access-point' as const }
        : { label: 'Připraveno', color: colors.textSecondary, icon: 'map-marker-outline' as const };

  const handleStart = async () => {
    const result = await requestForeground();
    if (result.status !== 'granted') {
      Alert.alert('Poloha je vypnutá', 'TerraQuest může zatím běžet v ukázkovém režimu. Oprávnění lze později změnit v nastavení.');
    }
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
    startSession('walk');
  };

  const handleFinish = () => {
    finishSession();
    router.push('/session-summary');
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        {convex ? (
          <PoiLayer bounds={mapBounds}>
            {({ pois, discover }) => (
              <ExplorerMap
                onBoundsChange={setMapBounds}
                onMarkerPress={(poiId) => void handleMarkerPress(poiId, pois, discover)}
                pois={pois}
                revealedCells={revealedCells}
                route={session.route}
              />
            )}
          </PoiLayer>
        ) : (
          <ExplorerMap onBoundsChange={setMapBounds} revealedCells={revealedCells} route={session.route} />
        )}

        <View style={styles.topHud}>
          <View style={styles.brandBlock}>
            <Text style={styles.brand}>TERRAQUEST</Text>
            <View style={styles.statusRow}>
              <MaterialCommunityIcons color={status.color} name={status.icon} size={16} />
              <Text style={[styles.statusText, { color: status.color }]}>{status.label}</Text>
            </View>
          </View>
        </View>

        {session.active ? (
          <View style={styles.sessionPanel}>
            <View style={styles.sessionMetrics}>
              <View>
                <Text style={styles.sessionMetric}>{formatDuration(session.elapsedSeconds)}</Text>
                <Text style={styles.sessionLabel}>čas</Text>
              </View>
              <View>
                <Text style={styles.sessionMetric}>{Math.max(0, session.route.length - 5)}</Text>
                <Text style={styles.sessionLabel}>nové body</Text>
              </View>
              <View>
                <Text style={[styles.sessionMetric, { color: colors.brand }]}>+{Math.max(0, session.route.length - 5) * 3}</Text>
                <Text style={styles.sessionLabel}>čekající XP</Text>
              </View>
            </View>
            <View style={styles.actionsRow}>
              <View style={styles.actionHalf}>
                <PrimaryButton icon={session.paused ? 'play' : 'pause'} label={session.paused ? 'Pokračovat' : 'Pauza'} onPress={togglePause} tone="surface" />
              </View>
              <View style={styles.actionHalf}>
                <PrimaryButton icon="flag-checkered" label="Dokončit" onPress={handleFinish} tone="danger" />
              </View>
            </View>
          </View>
        ) : (
          <View style={styles.startPanel}>
            <View style={styles.startCopy}>
              <Text style={styles.startTitle}>Co dnes odhalíš?</Text>
              <Text style={styles.startDescription}>Trasa se ukládá lokálně a soutěžní XP potvrdí backend.</Text>
            </View>
            <PrimaryButton label="Zahájit průzkum" onPress={handleStart} />
          </View>
        )}
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
  startPanel: { position: 'absolute', left: spacing.md, right: spacing.md, bottom: spacing.md, backgroundColor: 'rgba(7,17,26,0.96)', borderColor: colors.outline, borderWidth: 1, borderRadius: radii.xl, padding: spacing.md, gap: spacing.md },
  startCopy: { gap: 4 },
  startTitle: { ...typography.h2, color: colors.textPrimary },
  startDescription: { ...typography.body, color: colors.textSecondary },
  sessionPanel: { position: 'absolute', left: spacing.md, right: spacing.md, bottom: spacing.md, backgroundColor: 'rgba(7,17,26,0.97)', borderColor: colors.outline, borderWidth: 1, borderRadius: radii.xl, padding: spacing.md, gap: spacing.md },
  sessionMetrics: { flexDirection: 'row', justifyContent: 'space-between' },
  sessionMetric: { ...typography.h2, color: colors.textPrimary, fontVariant: ['tabular-nums'] },
  sessionLabel: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  actionsRow: { flexDirection: 'row', gap: spacing.xs },
  actionHalf: { flex: 1 },
});
