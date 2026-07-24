import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Card, MetricCard, PrimaryButton, Screen, SectionTitle } from '@/components/ui/primitives';
import { useTodayStats } from '@/hooks/use-today-stats';
import { colors, spacing, typography } from '@/theme/tokens';

function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  return `${minutes} min`;
}

/**
 * Ambient tracking has no "finish" moment anymore (explorer-context.tsx),
 * so this is no longer a one-time post-expedition summary — it's an
 * on-demand "today so far" recap, opened from the map's stats card.
 * useTodayStats polls the same local_session/xp_projection rows the old
 * finishSession used to write once; ambient tracking's periodic checkpoint
 * now keeps them continuously up to date instead.
 */
export default function SessionSummaryScreen() {
  const router = useRouter();
  const data = useTodayStats();

  return (
    <Screen>
      <View style={styles.header}>
        <Pressable accessibilityLabel="Zavřít" accessibilityRole="button" onPress={() => router.back()} style={styles.back}>
          <MaterialCommunityIcons color={colors.brand} name="chevron-left" size={24} />
        </Pressable>
        <Text style={styles.title}>Dnešní shrnutí</Text>
      </View>

      <SectionTitle title="Pohyb a objevy" />
      <View style={styles.metricsRow}>
        <MetricCard icon="walk" label="Vzdálenost" value={`${(data ? data.distanceMeters / 1000 : 0).toFixed(2)} km`} />
        <MetricCard accent={colors.blue} icon="map-marker-plus-outline" label="Nové jednotky" value={String(data?.newExplorationUnits ?? 0)} />
      </View>
      <View style={styles.metricsRow}>
        <MetricCard accent={colors.purple} icon="timer-outline" label="Trvání" value={formatDuration(data?.elapsedSeconds ?? 0)} />
      </View>

      <SectionTitle title="XP" />
      <Card style={styles.xpCard}>
        <View style={styles.xpRow}>
          <View style={styles.xpLabelRow}>
            <MaterialCommunityIcons color={colors.brand} name="check-circle-outline" size={20} />
            <Text style={styles.xpLabel}>Potvrzeno serverem</Text>
          </View>
          <Text style={styles.xpValueConfirmed}>+{(data?.confirmedXp ?? 0).toLocaleString('cs-CZ')}</Text>
        </View>
        <View style={styles.xpDivider} />
        <View style={styles.xpRow}>
          <View style={styles.xpLabelRow}>
            <MaterialCommunityIcons color={colors.amber} name="clock-outline" size={20} />
            <Text style={styles.xpLabel}>Čeká na potvrzení</Text>
          </View>
          <Text style={styles.xpValuePending}>+{(data?.pendingXp ?? 0).toLocaleString('cs-CZ')}</Text>
        </View>
      </Card>

      <PrimaryButton label="Zpět na mapu" onPress={() => router.back()} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  back: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  title: { ...typography.h1, color: colors.textPrimary },
  metricsRow: { flexDirection: 'row', gap: spacing.xs },
  xpCard: { gap: spacing.sm },
  xpRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  xpLabelRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  xpLabel: { ...typography.body, color: colors.textPrimary },
  xpValueConfirmed: { ...typography.h2, color: colors.brand, fontVariant: ['tabular-nums'] },
  xpValuePending: { ...typography.h2, color: colors.amber, fontVariant: ['tabular-nums'] },
  xpDivider: { height: 1, backgroundColor: colors.outline },
});
