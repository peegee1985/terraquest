import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import type { ComponentProps } from 'react';
import { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { Card, Eyebrow, MetricCard, PrimaryButton, ProgressBar, Screen, SectionTitle } from '@/components/ui/primitives';
import { achievementDisplay } from '@/domain/achievement-display';
import { avatarPresetById } from '@/domain/avatars';
import { RESOLUTION, resolutionStats } from '@/domain/fog';
import { cumulativeXpForLevel, levelProgress, rankForLevel, RANK_TIERS, revealRadiusForLevel } from '@/domain/progression';
import { DAILY_STEP_GOAL, dailyStepGoalRatio } from '@/domain/steps';
import { useDailySteps } from '@/hooks/use-daily-steps';
import { useStepGoalCheckIn } from '@/hooks/use-step-goal-check-in';
import { useMyAchievements } from '@/state/achievements-client';
import { convex } from '@/state/convex-client';
import { useClaimDailyBonus } from '@/state/daily-bonus-client';
import { useExplorer } from '@/state/explorer-context';
import { type MyProfile, useMyProfile } from '@/state/profile-client';
import { colors, radii, spacing, typography } from '@/theme/tokens';

/** TQ-46: Health Connect only exists on Android — there's no iOS bridge wired here (see health-connect.ts), so this card is Android-only in practice. It degrades to a quiet "not available" line rather than hiding entirely, so the gap is visible instead of silently missing. */
function StepGoalCard({ goal, stepGoalStreakDays }: { goal: number; stepGoalStreakDays: number | null }) {
  const steps = useDailySteps();
  useStepGoalCheckIn(steps.status === 'ready' ? steps.steps : null, goal);

  if (steps.status === 'loading') return null;
  if (steps.status === 'unavailable') {
    return (
      <Card style={styles.stepsCard}>
        <View style={styles.stepsIcon}>
          <MaterialCommunityIcons color={colors.textDisabled} name="shoe-print" size={24} />
        </View>
        <Text style={styles.cardBody}>Počítání kroků vyžaduje Health Connect, který na tomto zařízení není dostupný.</Text>
      </Card>
    );
  }
  if (steps.status === 'needs-permission') {
    return (
      <Card style={styles.stepsCard}>
        <View style={styles.stepsIcon}>
          <MaterialCommunityIcons color={colors.brand} name="shoe-print" size={24} />
        </View>
        <View style={styles.stepsCopy}>
          <Text style={styles.cardTitle}>Kroky dnes</Text>
          <Text style={styles.cardBody}>Povol přístup k Health Connect, ať vidíš dnešní kroky a denní cíl.</Text>
        </View>
        <PrimaryButton label="Povolit" onPress={() => void steps.requestAccess()} tone="surface" />
      </Card>
    );
  }
  return (
    <Card style={styles.stepsCardColumn}>
      <View style={styles.stepsHeaderRow}>
        <View style={styles.stepsIcon}>
          <MaterialCommunityIcons color={colors.brand} name="shoe-print" size={24} />
        </View>
        <View style={styles.stepsCopy}>
          <Text style={styles.cardTitle}>Kroky dnes</Text>
          <Text style={styles.cardBody}>
            {steps.steps.toLocaleString('cs-CZ')} / {goal.toLocaleString('cs-CZ')}
          </Text>
        </View>
        {stepGoalStreakDays !== null && stepGoalStreakDays > 0 ? (
          <View style={styles.stepStreakBadge}>
            <MaterialCommunityIcons color={colors.amber} name="fire" size={16} />
            <Text style={styles.stepStreakText}>{stepGoalStreakDays}</Text>
          </View>
        ) : null}
      </View>
      <ProgressBar progress={dailyStepGoalRatio(steps.steps, goal)} />
    </Card>
  );
}

function DailyBonusCard() {
  const claimDailyBonus = useClaimDailyBonus();
  const [state, setState] = useState<{ status: 'idle' | 'claiming' | 'claimed' | 'already'; awarded?: number }>({ status: 'idle' });

  if (state.status === 'claimed') {
    return (
      <Card style={styles.dailyBonusCard}>
        <View style={styles.dailyBonusIcon}>
          <MaterialCommunityIcons color={colors.brand} name="check-circle-outline" size={24} />
        </View>
        <Text style={styles.cardBody}>Dnešní odměna vyzvednuta — +{state.awarded} XP.</Text>
      </Card>
    );
  }
  if (state.status === 'already') {
    return null;
  }

  return (
    <Pressable
      accessibilityRole="button"
      disabled={state.status === 'claiming'}
      onPress={async () => {
        setState({ status: 'claiming' });
        const result = await claimDailyBonus({ now: Date.now() }).catch(() => null);
        if (!result) {
          setState({ status: 'idle' });
          return;
        }
        if (result.claimed) setState({ status: 'claimed', awarded: result.awarded });
        else setState({ status: 'already' });
      }}
    >
      <Card style={styles.dailyBonusCard}>
        <View style={styles.dailyBonusIcon}>
          <MaterialCommunityIcons color={colors.amber} name="gift-outline" size={24} />
        </View>
        <View style={styles.stepsCopy}>
          <Text style={styles.cardTitle}>Denní odměna</Text>
          <Text style={styles.cardBody}>{state.status === 'claiming' ? 'Vyzvedávám...' : 'Otevři a vyzvedni si dnešní bonus XP.'}</Text>
        </View>
        <MaterialCommunityIcons color={colors.textDisabled} name="chevron-right" size={22} />
      </Card>
    </Pressable>
  );
}

type RankIconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

// v0.2: 8 tiers now (was 5) — icons are a display-only concern, kept out of
// the pure domain module (RANK_TIERS) alongside the rest of progression.ts.
const RANK_ICONS: Record<string, RankIconName> = {
  tulak: 'circle-small',
  poutnik: 'walk',
  pruzkumnik: 'compass-outline',
  stopar: 'shoe-print',
  kartograf: 'map-outline',
  cestovatel: 'map-marker-path',
  expedicionar: 'flag-variant-outline',
  legenda_mapy: 'trophy-outline',
};

// Cell-count → area is purely a client-side computation (the server's
// userStats.visualAreaSquareMeters is never actually written anywhere —
// exploration area is tracked locally via the H3 cell set instead), so
// this doesn't need a backend round trip at all.
const AVERAGE_CELL_AREA_KM2 = resolutionStats(RESOLUTION).averageCellAreaM2 / 1_000_000;

function AvatarCircle({ profile }: { profile: MyProfile | null | undefined }) {
  const router = useRouter();
  const preset = avatarPresetById(profile?.avatarId ?? 'compass');
  return (
    <Pressable accessibilityLabel="Změnit avatar" accessibilityRole="button" onPress={() => router.push('/avatar-picker')}>
      <View style={[styles.avatar, profile?.isVip && styles.avatarVipRing]}>
        {profile?.avatarPhotoUrl ? (
          <Image source={{ uri: profile.avatarPhotoUrl }} style={styles.avatarPhoto} />
        ) : (
          <MaterialCommunityIcons color={colors.brand} name={preset.icon} size={42} />
        )}
      </View>
      {profile?.isVip ? (
        <View style={styles.vipTag}>
          <Text style={styles.vipTagText}>VIP</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

function BadgesSection({ userId }: { userId: string | undefined }) {
  const achievements = useMyAchievements(userId);
  if (!achievements || achievements.length === 0) return null;
  return (
    <>
      <SectionTitle title="Odznaky" />
      <View style={styles.badgesGrid}>
        {achievements.map((row) => {
          const display = achievementDisplay(row.achievementId);
          return (
            <View key={row.achievementId} style={styles.badgeChip}>
              <MaterialCommunityIcons color={colors.amber} name={display.icon} size={20} />
              <Text numberOfLines={2} style={styles.badgeLabel}>{display.label}</Text>
            </View>
          );
        })}
      </View>
    </>
  );
}

function ProgressContent({ profile }: { profile: MyProfile | null | undefined }) {
  const router = useRouter();
  const { snapshot, revealedCells } = useExplorer();
  const totalXp = profile?.totalXp ?? snapshot.totalXp;
  const progress = levelProgress(totalXp);
  const currentRank = rankForLevel(progress.level);
  const displayName = profile?.displayName ?? profile?.handle ?? 'Průzkumník';
  const exploredAreaKm2 = revealedCells.length * AVERAGE_CELL_AREA_KM2;
  const distanceLabel = profile ? `${(profile.verifiedDistanceMeters / 1000).toFixed(1)} km` : '—';
  const discoveredPlacesLabel = profile ? String(profile.poiDiscoveriesCount) : '—';
  const streakLabel = profile ? String(profile.currentStreakDays) : '—';
  const dailyStepGoal = profile?.dailyStepGoal ?? DAILY_STEP_GOAL;

  return (
    <Screen>
      <View style={styles.profileRow}>
        <AvatarCircle profile={profile} />
        <View style={styles.profileCopy}>
          <Eyebrow>{currentRank.label} • level {progress.level}</Eyebrow>
          <Text style={styles.title}>{displayName}</Text>
          <Text style={styles.subtitle}>Tvá mapa je soukromá. Sdílí se jen statistiky, které povolíš.</Text>
        </View>
      </View>

      <LinearGradient colors={['#163B2B', '#102532']} style={styles.heroCard}>
        <Text style={styles.heroLabel}>CELKOVÉ XP</Text>
        <Text style={styles.heroValue}>{totalXp.toLocaleString('cs-CZ')}</Text>
        <ProgressBar progress={progress.ratio} />
        <View style={styles.heroMeta}>
          <Text style={styles.heroMetaText}>Radius {revealRadiusForLevel(progress.level).toFixed(1)} m</Text>
          <Text style={styles.heroMetaText}>Další level {cumulativeXpForLevel(progress.level + 1).toLocaleString('cs-CZ')} XP</Text>
        </View>
        {profile?.isVip && profile.xpMultiplier > 1 ? (
          <Text style={styles.heroMetaText}>VIP XP multiplikátor ×{profile.xpMultiplier.toFixed(1)}</Text>
        ) : null}
      </LinearGradient>

      <Pressable accessibilityRole="button" onPress={() => router.push('/leaderboard')}>
        <Card style={styles.leaderboardCard}>
          <MaterialCommunityIcons color={colors.brand} name="podium-gold" size={24} />
          <Text style={styles.leaderboardText}>Žebříčky — svět, země, přátelé</Text>
          <MaterialCommunityIcons color={colors.textDisabled} name="chevron-right" size={22} />
        </Card>
      </Pressable>

      {convex ? <DailyBonusCard /> : null}
      <StepGoalCard goal={dailyStepGoal} stepGoalStreakDays={profile?.stepGoalCurrentStreakDays ?? null} />

      <SectionTitle title="Celoživotní mapa" />
      <View style={styles.metricsRow}>
        <MetricCard icon="map-marker-radius" label="Odkrytá plocha" value={`${exploredAreaKm2.toFixed(2)} km²`} />
        <MetricCard accent={colors.amber} icon="map-marker-star-outline" label="Objevená místa" value={discoveredPlacesLabel} />
      </View>
      <View style={styles.metricsRow}>
        <MetricCard accent={colors.blue} icon="walk" label="Ověřená vzdálenost" value={distanceLabel} />
        <MetricCard accent={colors.purple} icon="calendar-check-outline" label="Aktuální série (dny)" value={streakLabel} />
      </View>

      <BadgesSection userId={profile?.userId} />

      <SectionTitle title="Cesta průzkumníka" />
      <Card style={styles.ranksCard}>
        {RANK_TIERS.map((rank, index) => {
          const unlocked = progress.level >= rank.level;
          return (
            <View key={rank.rankId} style={styles.rankRow}>
              <View style={[styles.rankNode, unlocked ? styles.rankNodeUnlocked : undefined]}>
                <MaterialCommunityIcons color={unlocked ? colors.onBrand : colors.textDisabled} name={RANK_ICONS[rank.rankId]} size={20} />
              </View>
              <View style={styles.rankCopy}>
                <Text style={[styles.rankTitle, !unlocked && styles.lockedText]}>{rank.label}</Text>
                <Text style={styles.rankLevel}>Úroveň {rank.level}</Text>
              </View>
              {unlocked ? <MaterialCommunityIcons color={colors.brand} name="check-circle" size={22} /> : <MaterialCommunityIcons color={colors.textDisabled} name="lock-outline" size={20} />}
              {index < RANK_TIERS.length - 1 ? <View style={[styles.rankLine, unlocked && progress.level >= RANK_TIERS[index + 1].level ? styles.rankLineUnlocked : undefined]} /> : null}
            </View>
          );
        })}
      </Card>
    </Screen>
  );
}

/** Only mounted when `convex` is truthy (see the default export below) — useMyProfile's useQuery needs a ConvexProvider ancestor, which _layout.tsx's BackendProvider only mounts in that same case. */
function ConnectedProgressScreen() {
  const profile = useMyProfile();
  return <ProgressContent profile={profile} />;
}

export default function ProgressScreen() {
  return convex ? <ConnectedProgressScreen /> : <ProgressContent profile={null} />;
}

const styles = StyleSheet.create({
  profileRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  avatar: { width: 74, height: 74, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.brandSoft, borderWidth: 1, borderColor: 'rgba(56,230,138,0.35)', overflow: 'hidden' },
  avatarVipRing: { borderWidth: 3, borderColor: '#F5C542' },
  avatarPhoto: { width: '100%', height: '100%' },
  vipTag: { position: 'absolute', bottom: -6, alignSelf: 'center', backgroundColor: '#F5C542', borderRadius: radii.pill, paddingHorizontal: 8, paddingVertical: 2 },
  vipTagText: { ...typography.label, fontSize: 10, color: '#1A1400', fontWeight: '800', letterSpacing: 0.6 },
  profileCopy: { flex: 1 },
  title: { ...typography.h1, color: colors.textPrimary },
  subtitle: { ...typography.caption, color: colors.textSecondary, marginTop: 3 },
  heroCard: { borderRadius: radii.xl, padding: spacing.lg, gap: spacing.sm, borderWidth: 1, borderColor: 'rgba(56,230,138,0.25)' },
  heroLabel: { ...typography.label, color: colors.brand, letterSpacing: 1.2 },
  heroValue: { ...typography.metric, color: colors.textPrimary },
  heroMeta: { flexDirection: 'row', justifyContent: 'space-between' },
  heroMetaText: { ...typography.caption, color: colors.textSecondary },
  leaderboardCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  leaderboardText: { ...typography.h3, color: colors.textPrimary, flex: 1 },
  stepsCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  stepsCardColumn: { gap: spacing.sm },
  stepsHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  stepsIcon: { width: 40, height: 40, borderRadius: radii.md, backgroundColor: colors.brandSoft, alignItems: 'center', justifyContent: 'center' },
  stepsCopy: { flex: 1, gap: 2 },
  stepStreakBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: colors.amberSoft, borderRadius: radii.pill, paddingHorizontal: 8, paddingVertical: 4 },
  stepStreakText: { ...typography.label, color: colors.amber },
  dailyBonusCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  dailyBonusIcon: { width: 40, height: 40, borderRadius: radii.md, backgroundColor: colors.amberSoft, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { ...typography.h3, color: colors.textPrimary },
  cardBody: { ...typography.caption, color: colors.textSecondary },
  metricsRow: { flexDirection: 'row', gap: spacing.xs },
  badgesGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  badgeChip: { width: '31%', gap: 4, alignItems: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.outline, borderRadius: radii.md, padding: spacing.xs },
  badgeLabel: { ...typography.caption, color: colors.textSecondary, textAlign: 'center' },
  ranksCard: { paddingVertical: spacing.sm },
  rankRow: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, position: 'relative' },
  rankNode: { zIndex: 2, width: 38, height: 38, borderRadius: 19, backgroundColor: colors.surfaceMuted, alignItems: 'center', justifyContent: 'center' },
  rankNodeUnlocked: { backgroundColor: colors.brand },
  rankCopy: { flex: 1 },
  rankTitle: { ...typography.h3, color: colors.textPrimary },
  rankLevel: { ...typography.caption, color: colors.textSecondary },
  lockedText: { color: colors.textDisabled },
  rankLine: { position: 'absolute', zIndex: 1, left: 18, top: 50, width: 2, height: 28, backgroundColor: colors.surfaceMuted },
  rankLineUnlocked: { backgroundColor: colors.brand },
});
