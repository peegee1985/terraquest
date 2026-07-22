import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Card, Eyebrow, MetricCard, PrimaryButton, ProgressBar, QuestCard, Screen, SectionTitle } from '@/components/ui/primitives';
import { levelProgress } from '@/domain/progression';
import { useExplorer } from '@/state/explorer-context';
import { colors, radii, spacing, typography } from '@/theme/tokens';

export default function HomeScreen() {
  const router = useRouter();
  const { snapshot, quests } = useExplorer();
  const progress = levelProgress(snapshot.totalXp);

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
            <Text style={styles.rank}>Poutník</Text>
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
        <MetricCard icon="shoe-print" label="Dnešní kroky" value={snapshot.todaySteps.toLocaleString('cs-CZ')} />
        <MetricCard accent={colors.amber} icon="map-marker-path" label="Nové oblasti" value={String(snapshot.newCells)} />
        <MetricCard accent={colors.blue} icon="fire" label="Série dní" value={`${snapshot.streakDays} dní`} />
      </View>

      <Card style={styles.goalCard}>
        <View style={styles.goalRow}>
          <View>
            <Text style={styles.goalTitle}>Denní cíl</Text>
            <Text style={styles.goalValue}>{snapshot.todaySteps.toLocaleString('cs-CZ')} / {snapshot.stepGoal.toLocaleString('cs-CZ')} kroků</Text>
          </View>
          <Text style={styles.goalPercent}>{Math.round((snapshot.todaySteps / snapshot.stepGoal) * 100)} %</Text>
        </View>
        <ProgressBar progress={snapshot.todaySteps / snapshot.stepGoal} />
      </Card>

      <PrimaryButton label="Vyrazit objevovat" onPress={() => router.push('/map')} />

      <SectionTitle action="Zobrazit vše" title="Dnešní výpravy" />
      {quests.slice(0, 2).map((quest) => <QuestCard compact key={quest.id} quest={quest} />)}
    </Screen>
  );
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
});
