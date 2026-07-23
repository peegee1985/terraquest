import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { ReactNode } from 'react';
import {
  Pressable,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Quest, QuestTone } from '@/domain/types';
import { cardShadow, colors, radii, spacing, typography } from '@/theme/tokens';

export function Screen({ children, scroll = true }: { children: ReactNode; scroll?: boolean }) {
  // flex:1 on this content view is only correct for the non-scrolling case
  // (filling SafeAreaView directly). Applying it while nested inside a
  // ScrollView caps the content at the viewport's height instead of its own
  // natural (often taller) size — anything past one screen's worth of
  // stacked cards silently got clipped and was unreachable by scrolling.
  const content = <View style={[styles.screenContent, !scroll && styles.screenContentFill]}>{children}</View>;
  return (
    <SafeAreaView style={styles.safeArea}>
      {scroll ? (
        <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
          {content}
        </ScrollView>
      ) : (
        content
      )}
    </SafeAreaView>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Eyebrow({ children, color = colors.brand }: { children: ReactNode; color?: string }) {
  return <Text style={[styles.eyebrow, { color }]}>{children}</Text>;
}

export function SectionTitle({ title, action }: { title: string; action?: string }) {
  return (
    <View style={styles.sectionTitleRow}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {action ? <Text style={styles.sectionAction}>{action}</Text> : null}
    </View>
  );
}

export function ProgressBar({ progress, color = colors.brand }: { progress: number; color?: string }) {
  return (
    <View style={styles.progressTrack}>
      <View style={[styles.progressFill, { width: `${Math.min(100, Math.max(0, progress * 100))}%`, backgroundColor: color }]} />
    </View>
  );
}

export function MetricCard({ icon, label, value, accent = colors.brand }: { icon: React.ComponentProps<typeof MaterialCommunityIcons>['name']; label: string; value: string; accent?: string }) {
  return (
    <Card style={styles.metricCard}>
      <View style={[styles.metricIcon, { backgroundColor: `${accent}20` }]}>
        <MaterialCommunityIcons color={accent} name={icon} size={20} />
      </View>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </Card>
  );
}

const toneColors: Record<QuestTone, string> = {
  brand: colors.brand,
  amber: colors.amber,
  blue: colors.blue,
};

export function QuestCard({ quest, compact = false }: { quest: Quest; compact?: boolean }) {
  const accent = toneColors[quest.tone];
  const ratio = quest.target === 0 ? 0 : quest.progress / quest.target;
  return (
    <Card style={compact ? styles.compactQuest : undefined}>
      <View style={styles.questHeader}>
        <View style={[styles.questIcon, { backgroundColor: `${accent}1F` }]}>
          <MaterialCommunityIcons color={accent} name={quest.completed ? 'check' : 'flag-variant-outline'} size={22} />
        </View>
        <View style={styles.questTitleWrap}>
          <Text style={styles.questTitle}>{quest.title}</Text>
          <Text numberOfLines={compact ? 1 : 2} style={styles.questDescription}>{quest.description}</Text>
        </View>
        <View style={[styles.xpPill, { borderColor: `${accent}66` }]}>
          <Text style={[styles.xpPillText, { color: accent }]}>+{quest.rewardXp} XP</Text>
        </View>
      </View>
      <View style={styles.questProgressRow}>
        <Text style={styles.questProgressText}>{Math.min(quest.progress, quest.target).toLocaleString('cs-CZ')} / {quest.target.toLocaleString('cs-CZ')} {quest.unit}</Text>
        <Text style={[styles.questPercent, { color: accent }]}>{Math.round(Math.min(1, ratio) * 100)} %</Text>
      </View>
      <ProgressBar color={accent} progress={ratio} />
    </Card>
  );
}

export function PrimaryButton({ label, icon = 'compass-outline', onPress, tone = 'brand' }: { label: string; icon?: React.ComponentProps<typeof MaterialCommunityIcons>['name']; onPress: () => void; tone?: 'brand' | 'danger' | 'surface' }) {
  const palette = tone === 'brand'
    ? { background: colors.brand, foreground: colors.onBrand }
    : tone === 'danger'
      ? { background: colors.danger, foreground: colors.textPrimary }
      : { background: colors.surfaceElevated, foreground: colors.textPrimary };
  return (
    <Pressable accessibilityLabel={label} accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.primaryButton, { backgroundColor: palette.background, opacity: pressed ? 0.8 : 1 }]}>
      <MaterialCommunityIcons color={palette.foreground} name={icon} size={22} />
      <Text style={[styles.primaryButtonText, { color: palette.foreground }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  scrollView: { flex: 1 },
  scrollContent: { flexGrow: 1 },
  screenContent: { paddingHorizontal: spacing.md, paddingTop: spacing.sm, paddingBottom: spacing.xl, gap: spacing.md },
  screenContentFill: { flex: 1 },
  card: { backgroundColor: colors.surface, borderColor: colors.outline, borderWidth: 1, borderRadius: radii.lg, padding: spacing.md, ...cardShadow },
  eyebrow: { ...typography.label, letterSpacing: 1.2, textTransform: 'uppercase' },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.xs },
  sectionTitle: { ...typography.h2, color: colors.textPrimary },
  sectionAction: { ...typography.label, color: colors.brand },
  progressTrack: { height: 7, borderRadius: radii.pill, overflow: 'hidden', backgroundColor: colors.surfaceMuted },
  progressFill: { height: '100%', borderRadius: radii.pill },
  metricCard: { flex: 1, minWidth: 104, gap: spacing.xs },
  metricIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  metricValue: { ...typography.h2, color: colors.textPrimary, fontVariant: ['tabular-nums'] },
  metricLabel: { ...typography.caption, color: colors.textSecondary },
  compactQuest: { paddingVertical: spacing.sm },
  questHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  questIcon: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  questTitleWrap: { flex: 1, gap: 2 },
  questTitle: { ...typography.h3, color: colors.textPrimary },
  questDescription: { ...typography.caption, color: colors.textSecondary },
  xpPill: { borderWidth: 1, borderRadius: radii.pill, paddingHorizontal: 9, paddingVertical: 5 },
  xpPillText: { ...typography.caption, fontWeight: '700' },
  questProgressRow: { marginTop: spacing.sm, marginBottom: spacing.xs, flexDirection: 'row', justifyContent: 'space-between' },
  questProgressText: { ...typography.caption, color: colors.textSecondary },
  questPercent: { ...typography.caption, fontWeight: '700' },
  primaryButton: { minHeight: 54, borderRadius: radii.md, paddingHorizontal: spacing.lg, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: spacing.xs },
  primaryButtonText: { ...typography.h3 },
});
