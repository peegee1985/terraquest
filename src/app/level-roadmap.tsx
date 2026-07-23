import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useRouter } from 'expo-router';
import { Fragment } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Card, Eyebrow, Screen } from '@/components/ui/primitives';
import { levelRewards, type LevelReward } from '@/domain/level-rewards';
import { levelProgress, MAX_LEVEL, RANK_TIERS } from '@/domain/progression';
import { convex } from '@/state/convex-client';
import { useMyProfile } from '@/state/profile-client';
import { colors, radii, spacing, typography } from '@/theme/tokens';

const ITEM_LABELS: Record<string, string> = {
  scanner_pulse: 'Scanner Pulse',
  radius_boost_potion: 'Radius Boost Potion',
  xp_boost_potion: 'XP Boost Potion',
};

function describeReward(reward: LevelReward): string {
  if (reward.kind === 'permanent_radius') return `+${reward.ringBonus} trvalý dosah`;
  const label = ITEM_LABELS[reward.itemId] ?? reward.itemId;
  return reward.quantity > 1 ? `${label} ×${reward.quantity}` : label;
}

type RowStatus = 'completed' | 'current' | 'locked';

function LevelRow({ level, currentLevel }: { level: number; currentLevel: number }) {
  const status: RowStatus = level < currentLevel ? 'completed' : level === currentLevel ? 'current' : 'locked';
  const rewards = levelRewards(level);

  return (
    <View style={[styles.row, status === 'current' && styles.rowCurrent]}>
      <View style={[styles.levelBadge, status === 'locked' && styles.levelBadgeLocked, status === 'current' && styles.levelBadgeCurrent]}>
        {status === 'completed' ? (
          <MaterialCommunityIcons color={colors.brand} name="check" size={16} />
        ) : status === 'locked' ? (
          <MaterialCommunityIcons color={colors.textDisabled} name="lock-outline" size={14} />
        ) : (
          <Text style={styles.levelBadgeText}>{level}</Text>
        )}
      </View>
      <View style={styles.rowBody}>
        <Text style={[styles.rowLevelLabel, status === 'locked' && styles.rowLevelLabelLocked]}>
          {level === 1 ? 'Start' : `Level ${level}`}
        </Text>
        {rewards.length > 0 ? (
          <Text style={[styles.rowRewardText, status === 'locked' && styles.rowLevelLabelLocked]}>
            {rewards.map(describeReward).join(' · ')}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

function LevelRoadmapContent() {
  const router = useRouter();
  const profile = useMyProfile();
  const currentLevel = levelProgress(profile?.totalXp ?? 0).level;

  return (
    <Screen>
      <Pressable accessibilityLabel="Zpět" accessibilityRole="button" onPress={() => router.back()} style={styles.back}>
        <MaterialCommunityIcons color={colors.brand} name="chevron-left" size={24} />
        <Text style={styles.backText}>Zpět</Text>
      </Pressable>
      <Eyebrow>Postup</Eyebrow>
      <Text style={styles.title}>Cesta úrovní</Text>

      {RANK_TIERS.map((tier, tierIndex) => {
        const nextTierLevel = RANK_TIERS[tierIndex + 1]?.level ?? MAX_LEVEL + 1;
        const levels = Array.from({ length: nextTierLevel - tier.level }, (_, i) => tier.level + i);
        return (
          <Fragment key={tier.rankId}>
            <View style={styles.tierHeader}>
              <MaterialCommunityIcons color={colors.amber} name="trophy-outline" size={18} />
              <Text style={styles.tierHeaderText}>{tier.label}</Text>
            </View>
            <Card style={styles.tierCard}>
              {levels.map((level) => (
                <LevelRow currentLevel={currentLevel} key={level} level={level} />
              ))}
            </Card>
          </Fragment>
        );
      })}
    </Screen>
  );
}

export default function LevelRoadmapScreen() {
  if (!convex) {
    return (
      <Screen>
        <Card>
          <Text style={styles.rowRewardText}>Cesta úrovní vyžaduje připojení k serveru, které v tomto sestavení není nastavené.</Text>
        </Card>
      </Screen>
    );
  }
  return <LevelRoadmapContent />;
}

const styles = StyleSheet.create({
  back: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', marginLeft: -spacing.xs },
  backText: { ...typography.label, color: colors.brand },
  title: { ...typography.display, color: colors.textPrimary },
  tierHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: spacing.sm },
  tierHeaderText: { ...typography.label, color: colors.textSecondary, letterSpacing: 1, textTransform: 'uppercase' },
  tierCard: { gap: spacing.xs, padding: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 6 },
  rowCurrent: { backgroundColor: colors.brandSoft, borderRadius: radii.md, marginHorizontal: -spacing.xs, paddingHorizontal: spacing.xs },
  levelBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.outline,
  },
  levelBadgeLocked: { opacity: 0.5 },
  levelBadgeCurrent: { borderColor: colors.brand },
  levelBadgeText: { ...typography.caption, color: colors.textPrimary, fontWeight: '700' },
  rowBody: { flex: 1 },
  rowLevelLabel: { ...typography.body, color: colors.textPrimary },
  rowLevelLabelLocked: { color: colors.textDisabled },
  rowRewardText: { ...typography.caption, color: colors.textSecondary },
});
