import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { Card, Eyebrow, MetricCard, PrimaryButton, ProgressBar, QuestCard, Screen, SectionTitle } from '@/components/ui/primitives';
import { levelProgress, rankForLevel } from '@/domain/progression';
import { DAILY_STEP_GOAL, dailyStepGoalRatio } from '@/domain/steps';
import { useDailySteps } from '@/hooks/use-daily-steps';
import { convex } from '@/state/convex-client';
import { useExplorer } from '@/state/explorer-context';
import { type MyProfile, useMyProfile } from '@/state/profile-client';
import { QuestBoard, toDisplayQuest, useEnsureDailyQuests, useEnsureWeeklyQuest, useMyQuestBoard } from '@/state/quests-client';
import { colors, radii, spacing, typography } from '@/theme/tokens';

function HomeContent({ profile, board }: { profile: MyProfile | null | undefined; board: QuestBoard | undefined }) {
  const router = useRouter();
  const { snapshot } = useExplorer();
  const steps = useDailySteps();
  const totalXp = profile?.totalXp ?? snapshot.totalXp;
  const progress = levelProgress(totalXp);
  const currentRank = rankForLevel(progress.level);
  const newAreasLabel = profile ? String(profile.explorationUnits) : '—';
  const streakLabel = profile ? `${profile.currentStreakDays} dní` : '—';
  const dailyStepGoal = profile?.dailyStepGoal ?? DAILY_STEP_GOAL;
  const todayStepsLabel = steps.status === 'ready' ? steps.steps.toLocaleString('cs-CZ') : '—';
  const stepGoalRatio = steps.status === 'ready' ? dailyStepGoalRatio(steps.steps, dailyStepGoal) : 0;
  const dailyQuests = board?.daily.slice(0, 2) ?? [];

  return (
    <Screen>
      <View style={styles.header}>
        <View>
          <Eyebrow>TerraQuest</Eyebrow>
          <Text style={styles.greeting}>Dobrý večer, průzkumníku</Text>
        </View>
        <Pressable accessibilityLabel="Otevřít nastavení" accessibilityRole="button" onPress={() => router.push('/settings')} style={styles.avatar}>
          <MaterialCommunityIcons color={colors.brand} name="cog-outline" size={27} />
        </Pressable>
      </View>

      <LinearGradient colors={['#173729', '#102432', '#0E1C28']} end={{ x: 1, y: 1 }} start={{ x: 0, y: 0 }} style={styles.levelCard}>
        <View style={styles.levelTop}>
          <View>
            <Text style={styles.rank}>{currentRank.label}</Text>
            <Text style={styles.level}>Úroveň {progress.level}</Text>
          </View>
          <View style={styles.levelBadge}>
            <Text style={styles.levelBadgeText}>{progress.level}</Text>
          </View>
        </View>
        <View style={styles.levelProgressTextRow}>
          <Text style={styles.levelProgressText}>{progress.current.toLocaleString('cs-CZ')} XP</Text>
          <Text style={styles.levelProgressText}>{progress.required.toLocaleString('cs-CZ')} XP</Text>
        </View>
        <ProgressBar progress={progress.ratio} />
        <Text style={styles.levelHint}>Ještě {Math.max(0, progress.required - progress.current).toLocaleString('cs-CZ')} XP do další úrovně.</Text>
      </LinearGradient>

      <View style={styles.metricsRow}>
        <MetricCard icon="shoe-print" label="Dnešní kroky" value={todayStepsLabel} />
        <MetricCard accent={colors.amber} icon="map-marker-path" label="Nové oblasti" value={newAreasLabel} />
        <MetricCard accent={colors.blue} icon="fire" label="Série dní" value={streakLabel} />
      </View>

      <Card style={styles.goalCard}>
        <View style={styles.goalRow}>
          <View>
            <Text style={styles.goalTitle}>Denní cíl</Text>
            <Text style={styles.goalValue}>{todayStepsLabel} / {dailyStepGoal.toLocaleString('cs-CZ')} kroků</Text>
          </View>
          <Text style={styles.goalPercent}>{steps.status === 'ready' ? `${Math.round(stepGoalRatio * 100)} %` : '—'}</Text>
        </View>
        <ProgressBar progress={stepGoalRatio} />
        {steps.status === 'unavailable' ? <Text style={styles.goalNote}>Počítání kroků vyžaduje Health Connect, který na tomto zařízení není dostupný.</Text> : null}
        {steps.status === 'needs-permission' ? <PrimaryButton label="Povolit přístup ke krokům" onPress={() => void steps.requestAccess()} tone="surface" /> : null}
      </Card>

      <PrimaryButton label="Vyrazit objevovat" onPress={() => router.push('/map')} />

      <SectionTitle action="Zobrazit vše" title="Dnešní výpravy" />
      {board === undefined && convex ? <ActivityIndicator color={colors.brand} /> : null}
      {dailyQuests.map((row) => <QuestCard compact key={row._id} quest={toDisplayQuest(row)} />)}
    </Screen>
  );
}

/** Only mounted when `convex` is truthy — useMyProfile/useMyQuestBoard's useQuery needs a ConvexProvider ancestor, same precondition as progress.tsx/quests.tsx. */
function ConnectedHomeScreen() {
  const [now] = useState(() => Date.now());
  const profile = useMyProfile();
  const board = useMyQuestBoard(now);
  const ensureDaily = useEnsureDailyQuests();
  const ensureWeekly = useEnsureWeeklyQuest();

  useEffect(() => {
    // Idempotent on the server — safe alongside quests.tsx calling the same
    // mutations, in case the user opens Home before ever visiting Výpravy.
    void ensureDaily({ now, isExplorationSaturated: false });
    void ensureWeekly({ now });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <HomeContent board={board} profile={profile} />;
}

export default function HomeScreen() {
  return convex ? <ConnectedHomeScreen /> : <HomeContent board={undefined} profile={null} />;
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  greeting: { ...typography.h1, color: colors.textPrimary, marginTop: 3 },
  avatar: { width: 52, height: 52, borderRadius: 18, backgroundColor: colors.brandSoft, borderWidth: 1, borderColor: 'rgba(56,230,138,0.35)', alignItems: 'center', justifyContent: 'center' },
  levelCard: { borderRadius: radii.xl, padding: spacing.lg, borderWidth: 1, borderColor: 'rgba(56,230,138,0.28)', gap: spacing.sm },
  levelTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rank: { ...typography.label, color: colors.brand, textTransform: 'uppercase', letterSpacing: 1.1 },
  level: { ...typography.h1, color: colors.textPrimary, marginTop: 2 },
  levelBadge: { width: 52, height: 52, borderRadius: 26, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
  levelBadgeText: { ...typography.h1, color: colors.onBrand },
  levelProgressTextRow: { flexDirection: 'row', justifyContent: 'space-between' },
  levelProgressText: { ...typography.caption, color: colors.textSecondary },
  levelHint: { ...typography.caption, color: colors.textSecondary },
  metricsRow: { flexDirection: 'row', gap: spacing.xs },
  goalCard: { gap: spacing.sm },
  goalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  goalTitle: { ...typography.h3, color: colors.textPrimary },
  goalValue: { ...typography.caption, color: colors.textSecondary, marginTop: 3 },
  goalPercent: { ...typography.h2, color: colors.brand },
  goalNote: { ...typography.caption, color: colors.textSecondary },
});
