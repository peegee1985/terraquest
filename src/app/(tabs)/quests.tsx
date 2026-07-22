import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { StyleSheet, Text, View } from 'react-native';

import { Card, Eyebrow, ProgressBar, QuestCard, Screen, SectionTitle } from '@/components/ui/primitives';
import { useExplorer } from '@/state/explorer-context';
import { colors, radii, spacing, typography } from '@/theme/tokens';

export default function QuestsScreen() {
  const { quests } = useExplorer();
  const complete = quests.filter((quest) => quest.completed).length;

  return (
    <Screen>
      <View>
        <Eyebrow>Výpravy</Eyebrow>
        <Text style={styles.title}>Důvod vyrazit dál</Text>
        <Text style={styles.subtitle}>Úkoly se přizpůsobí tvému běžnému pohybu a dostupným místům.</Text>
      </View>

      <Card style={styles.dailySummary}>
        <View style={styles.summaryIcon}>
          <MaterialCommunityIcons color={colors.amber} name="weather-sunset" size={28} />
        </View>
        <View style={styles.summaryText}>
          <Text style={styles.summaryTitle}>Denní série</Text>
          <Text style={styles.summaryDescription}>{complete} ze 3 výprav dokončeno</Text>
          <ProgressBar color={colors.amber} progress={complete / 3} />
        </View>
      </Card>

      <SectionTitle action="Obnova za 03:42" title="Dnes" />
      {quests.map((quest) => <QuestCard key={quest.id} quest={quest} />)}

      <SectionTitle title="Tento týden" />
      <Card>
        <View style={styles.weekHeader}>
          <View style={[styles.summaryIcon, { backgroundColor: colors.blueSoft }]}>
            <MaterialCommunityIcons color={colors.blue} name="map-marker-distance" size={26} />
          </View>
          <View style={styles.summaryText}>
            <Text style={styles.summaryTitle}>Pět cest, jeden týden</Text>
            <Text style={styles.summaryDescription}>Ujdi 20 km alespoň ve čtyřech dnech.</Text>
          </View>
          <Text style={styles.weekXp}>+500 XP</Text>
        </View>
        <View style={styles.weekProgressRow}>
          <Text style={styles.summaryDescription}>11,4 / 20 km</Text>
          <Text style={styles.weekPercent}>57 %</Text>
        </View>
        <ProgressBar color={colors.blue} progress={0.57} />
      </Card>

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
  weekHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  weekXp: { ...typography.label, color: colors.blue },
  weekProgressRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.md, marginBottom: spacing.xs },
  weekPercent: { ...typography.caption, color: colors.blue, fontWeight: '700' },
  safetyNote: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md, borderRadius: radii.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.outline },
  safetyText: { ...typography.caption, color: colors.textSecondary, flex: 1 },
});
