import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Card, Eyebrow, MetricCard, ProgressBar, Screen, SectionTitle } from '@/components/ui/primitives';
import { RESOLUTION, resolutionStats } from '@/domain/fog';
import { cumulativeXpForLevel, levelProgress, rankForLevel, RANK_TIERS, revealRadiusForLevel } from '@/domain/progression';
import { convex } from '@/state/convex-client';
import { useExplorer } from '@/state/explorer-context';
import { type MyProfile, useMyProfile } from '@/state/profile-client';
import { colors, radii, spacing, typography } from '@/theme/tokens';

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

  return (
    <Screen>
      <View style={styles.profileRow}>
        <View style={styles.avatar}>
          <MaterialCommunityIcons color={colors.brand} name="compass-rose" size={42} />
        </View>
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
      </LinearGradient>

      <Pressable accessibilityRole="button" onPress={() => router.push('/leaderboard')}>
        <Card style={styles.leaderboardCard}>
          <MaterialCommunityIcons color={colors.brand} name="podium-gold" size={24} />
          <Text style={styles.leaderboardText}>Žebříčky — svět, země, přátelé</Text>
          <MaterialCommunityIcons color={colors.textDisabled} name="chevron-right" size={22} />
        </Card>
      </Pressable>

      <SectionTitle title="Celoživotní mapa" />
      <View style={styles.metricsRow}>
        <MetricCard icon="map-marker-radius" label="Odkrytá plocha" value={`${exploredAreaKm2.toFixed(2)} km²`} />
        <MetricCard accent={colors.amber} icon="map-marker-star-outline" label="Objevená místa" value={discoveredPlacesLabel} />
      </View>
      <View style={styles.metricsRow}>
        <MetricCard accent={colors.blue} icon="walk" label="Ověřená vzdálenost" value={distanceLabel} />
        <MetricCard accent={colors.purple} icon="calendar-check-outline" label="Aktuální série (dny)" value={streakLabel} />
      </View>

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
  avatar: { width: 74, height: 74, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.brandSoft, borderWidth: 1, borderColor: 'rgba(56,230,138,0.35)' },
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
  metricsRow: { flexDirection: 'row', gap: spacing.xs },
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
