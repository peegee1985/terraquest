import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { LinearGradient } from 'expo-linear-gradient';
import type { ComponentProps } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Card, Eyebrow, MetricCard, ProgressBar, Screen, SectionTitle } from '@/components/ui/primitives';
import { cumulativeXpForLevel, levelProgress, rankForLevel, RANK_TIERS, revealRadiusForLevel } from '@/domain/progression';
import { useExplorer } from '@/state/explorer-context';
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

export default function ProgressScreen() {
  const { snapshot } = useExplorer();
  const progress = levelProgress(snapshot.totalXp);
  const currentRank = rankForLevel(progress.level);

  return (
    <Screen>
      <View style={styles.profileRow}>
        <View style={styles.avatar}>
          <MaterialCommunityIcons color={colors.brand} name="compass-rose" size={42} />
        </View>
        <View style={styles.profileCopy}>
          <Eyebrow>{currentRank.label} • level {progress.level}</Eyebrow>
          <Text style={styles.title}>Petr</Text>
          <Text style={styles.subtitle}>Tvá mapa je soukromá. Sdílí se jen statistiky, které povolíš.</Text>
        </View>
      </View>

      <LinearGradient colors={['#163B2B', '#102532']} style={styles.heroCard}>
        <Text style={styles.heroLabel}>CELKOVÉ XP</Text>
        <Text style={styles.heroValue}>{snapshot.totalXp.toLocaleString('cs-CZ')}</Text>
        <ProgressBar progress={progress.ratio} />
        <View style={styles.heroMeta}>
          <Text style={styles.heroMetaText}>Radius {revealRadiusForLevel(progress.level).toFixed(1)} m</Text>
          <Text style={styles.heroMetaText}>Další level {cumulativeXpForLevel(progress.level + 1).toLocaleString('cs-CZ')} XP</Text>
        </View>
      </LinearGradient>

      <SectionTitle title="Celoživotní mapa" />
      <View style={styles.metricsRow}>
        <MetricCard icon="map-marker-radius" label="Odkrytá plocha" value={`${snapshot.exploredAreaKm2} km²`} />
        <MetricCard accent={colors.amber} icon="map-marker-star-outline" label="Objevená místa" value={String(snapshot.discoveredPlaces)} />
      </View>
      <View style={styles.metricsRow}>
        <MetricCard accent={colors.blue} icon="walk" label="Aktivní vzdálenost" value="184 km" />
        <MetricCard accent={colors.purple} icon="calendar-check-outline" label="Aktivní dny" value="47" />
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
