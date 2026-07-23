import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { Card, Eyebrow, PrimaryButton, ProgressBar, QuestCard, Screen, SectionTitle } from '@/components/ui/primitives';
import { convex } from '@/state/convex-client';
import { QuestRow, toDisplayQuest, useClaimQuest, useEnsureDailyQuests, useEnsureWeeklyQuest, useMyQuestBoard } from '@/state/quests-client';
import { colors, radii, spacing, typography } from '@/theme/tokens';

function ClaimableQuestCard({ row }: { row: QuestRow }) {
  const claimQuest = useClaimQuest();
  const [claiming, setClaiming] = useState(false);
  const claimable = row.status === 'completed';
  const claimed = row.status === 'claimed';

  return (
    <View style={styles.claimWrap}>
      <QuestCard quest={toDisplayQuest(row)} />
      {claimable ? (
        <PrimaryButton
          icon="gift-outline"
          label={claiming ? 'Vyzvedávám...' : `Vyzvednout +${row.rewardXp} XP`}
          onPress={async () => {
            setClaiming(true);
            await claimQuest({ questId: row._id, now: Date.now() }).catch(() => undefined);
            setClaiming(false);
          }}
        />
      ) : claimed ? (
        <Text style={styles.claimedLabel}>Vyzvednuto</Text>
      ) : null}
    </View>
  );
}

function QuestsBoard() {
  const [now] = useState(() => Date.now());
  const ensureDaily = useEnsureDailyQuests();
  const ensureWeekly = useEnsureWeeklyQuest();
  const board = useMyQuestBoard(now);

  useEffect(() => {
    // Idempotent on the server (existing periodKey rows are just returned
    // as-is) — safe to fire on every mount without risking duplicates.
    void ensureDaily({ now, isExplorationSaturated: false });
    void ensureWeekly({ now });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (board === undefined) {
    return (
      <Card style={styles.centeredCard}>
        <ActivityIndicator color={colors.brand} />
      </Card>
    );
  }

  const complete = board.daily.filter((quest) => quest.status === 'completed' || quest.status === 'claimed').length;

  return (
    <>
      <Card style={styles.dailySummary}>
        <View style={styles.summaryIcon}>
          <MaterialCommunityIcons color={colors.amber} name="weather-sunset" size={28} />
        </View>
        <View style={styles.summaryText}>
          <Text style={styles.summaryTitle}>Denní série</Text>
          <Text style={styles.summaryDescription}>{complete} ze {board.daily.length || 3} výprav dokončeno</Text>
          <ProgressBar color={colors.amber} progress={board.daily.length ? complete / board.daily.length : 0} />
        </View>
      </Card>

      <SectionTitle title="Dnes" />
      {board.daily.map((row) => <ClaimableQuestCard key={row._id} row={row} />)}

      <SectionTitle title="Tento týden" />
      {board.weekly ? <ClaimableQuestCard row={board.weekly} /> : (
        <Card style={styles.centeredCard}>
          <ActivityIndicator color={colors.brand} />
        </Card>
      )}
    </>
  );
}

export default function QuestsScreen() {
  return (
    <Screen>
      <View>
        <Eyebrow>Výpravy</Eyebrow>
        <Text style={styles.title}>Důvod vyrazit dál</Text>
        <Text style={styles.subtitle}>Úkoly se přizpůsobí tvému běžnému pohybu a dostupným místům.</Text>
      </View>

      {convex ? (
        <QuestsBoard />
      ) : (
        <Card>
          <Text style={styles.summaryDescription}>Výpravy vyžadují připojení k serveru, které v tomto sestavení není nastavené.</Text>
        </Card>
      )}

      <View style={styles.safetyNote}>
        <MaterialCommunityIcons color={colors.textSecondary} name="shield-check-outline" size={20} />
        <Text style={styles.safetyText}>TerraQuest nikdy negeneruje výpravy do označených nebezpečných nebo soukromých míst.</Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { ...typography.display, color: colors.textPrimary, marginTop: 3 },
  subtitle: { ...typography.body, color: colors.textSecondary, marginTop: spacing.xs },
  dailySummary: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  summaryIcon: { width: 50, height: 50, borderRadius: 16, backgroundColor: colors.amberSoft, alignItems: 'center', justifyContent: 'center' },
  summaryText: { flex: 1, gap: 5 },
  summaryTitle: { ...typography.h3, color: colors.textPrimary },
  summaryDescription: { ...typography.caption, color: colors.textSecondary },
  centeredCard: { alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.xl },
  claimWrap: { gap: spacing.xs },
  claimedLabel: { ...typography.label, color: colors.textSecondary, textAlign: 'center', marginTop: -spacing.xs, marginBottom: spacing.xs },
  safetyNote: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md, borderRadius: radii.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.outline },
  safetyText: { ...typography.caption, color: colors.textSecondary, flex: 1 },
});
