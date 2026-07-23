import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { Alert, SafeAreaView, StyleSheet, Text, View } from 'react-native';

import { ExplorerMap } from '../../components/map/explorer-map';

import { PrimaryButton } from '@/components/ui/primitives';
import { useLocationPermissions } from '@/hooks/use-location-permissions';
import { useExplorer } from '@/state/explorer-context';
import { colors, radii, spacing, typography } from '@/theme/tokens';

function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60).toString().padStart(2, '0');
  const rest = (seconds % 60).toString().padStart(2, '0');
  return `${minutes}:${rest}`;
}

export default function MapScreen() {
  const router = useRouter();
  const { session, revealedCells, startSession, togglePause, finishSession } = useExplorer();
  const { isForegroundDenied, requestForeground } = useLocationPermissions();

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
        <ExplorerMap revealedCells={revealedCells} route={session.route} />

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
