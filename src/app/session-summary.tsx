import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Card, MetricCard, PrimaryButton, Screen, SectionTitle } from '@/components/ui/primitives';
import { getLocalPersistence } from '@/data/local';
import { LOCAL_SESSION_ID } from '@/domain/tracking-task';
import { colors, spacing, typography } from '@/theme/tokens';

type SummaryData = {
  distanceMeters: number;
  newExplorationUnits: number;
  elapsedSeconds: number;
  confirmedXp: number;
  pendingXp: number;
};

function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  return `${minutes} min`;
}

/**
 * TQ-31: reads back the numbers finishSession (explorer-context.tsx) just
 * computed and persisted — the local_session row's distance_m/new_cells/
 * xp_pending (real values since TQ-31, previously always 0) and the local
 * xp_projection row's confirmed_xp/pending_xp split.
 *
 * Acceptance criteria:
 * - "Součet odpovídá serverovému ledgeru": confirmedXp comes straight from
 *   xp_projection.confirmed_xp, which is only ever set from a real server
 *   response (session-sync.ts's processDueSyncEvents applying the
 *   transport's confirmedXp) — never computed locally.
 * - "Čekající XP jsou odlišené": pendingXp is rendered as its own visually
 *   distinct row/tag, never merged into the confirmed total.
 * - "Soukromé zóny jsou na sdílené kartě skryté": no sharing/export feature
 *   exists yet (private zones themselves are TQ-34, still backlog) — this
 *   screen has no "share" action to apply that redaction to, so the
 *   criterion doesn't yet have anything to attach to. Deferred alongside
 *   TQ-34, noted in Notion rather than silently skipped.
 */
export default function SessionSummaryScreen() {
  const router = useRouter();
  const [data, setData] = useState<SummaryData | null>(null);

  useEffect(() => {
    let cancelled = false;
    getLocalPersistence()
      .then(async (persistence) => {
        const [sessionRow, projection] = await Promise.all([
          persistence.session.getById(LOCAL_SESSION_ID),
          persistence.xpProjection.get(),
        ]);
        if (cancelled) return;
        setData({
          distanceMeters: sessionRow?.distance_m ?? 0,
          newExplorationUnits: sessionRow?.new_cells ?? 0,
          elapsedSeconds: sessionRow?.elapsed_seconds ?? 0,
          confirmedXp: projection.confirmed_xp,
          pendingXp: projection.pending_xp,
        });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Screen>
      <View style={styles.header}>
        <Pressable accessibilityLabel="Zavřít" accessibilityRole="button" onPress={() => router.back()} style={styles.back}>
          <MaterialCommunityIcons color={colors.brand} name="chevron-left" size={24} />
        </Pressable>
        <Text style={styles.title}>Souhrn výpravy</Text>
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
