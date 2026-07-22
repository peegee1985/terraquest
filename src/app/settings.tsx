import AsyncStorage from '@react-native-async-storage/async-storage';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import { Alert, Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { Card, Eyebrow, PrimaryButton, Screen } from '@/components/ui/primitives';
import { colors, radii, spacing, typography } from '@/theme/tokens';

const privacyActions = [
  ['shield-home-outline', 'Soukromé zóny', 'Skryj okolí domova a citlivých míst.'],
  ['tray-arrow-down', 'Export mých dat', 'Připrav kopii tras, statistik a XP ledgeru.'],
  ['delete-outline', 'Smazat historii', 'Odstraň jednotlivé trasy nebo celý účet.'],
] as const;

export default function SettingsScreen() {
  const router = useRouter();

  const requestBackground = async () => {
    const foreground = await Location.getForegroundPermissionsAsync();
    if (!foreground.granted) {
      Alert.alert('Nejdřív poloha při používání', 'Background polohu nabídneme až po povolení polohy při otevřené aplikaci.');
      return;
    }
    const background = await Location.requestBackgroundPermissionsAsync();
    if (!background.granted && !background.canAskAgain) {
      Alert.alert('Oprávnění je vypnuté', 'Povol „Vždy“ v systémovém nastavení.', [
        { text: 'Zrušit', style: 'cancel' },
        { text: 'Otevřít nastavení', onPress: () => Linking.openSettings() },
      ]);
    }
  };

  const replayOnboarding = async () => {
    await AsyncStorage.removeItem('terraquest:onboarding-complete');
    router.replace('/onboarding');
  };

  return (
    <Screen>
      <Pressable accessibilityLabel="Zpět" accessibilityRole="button" onPress={() => router.back()} style={styles.back}>
        <MaterialCommunityIcons color={colors.brand} name="chevron-left" size={24} />
        <Text style={styles.backText}>Zpět</Text>
      </Pressable>
      <Eyebrow>Nastavení</Eyebrow>
      <Text style={styles.title}>Soukromí pod kontrolou</Text>
      <Text style={styles.body}>Poloha je citlivý údaj. TerraQuest vysvětluje každý požadavek a umožní data exportovat i smazat.</Text>

      <Card style={styles.permissionCard}>
        <View style={styles.permissionIcon}>
          <MaterialCommunityIcons color={colors.brand} name="map-clock-outline" size={28} />
        </View>
        <View style={styles.permissionCopy}>
          <Text style={styles.cardTitle}>Průzkum na pozadí</Text>
          <Text style={styles.cardBody}>Povol až po první výpravě, aby záznam pokračoval při zamčeném telefonu. Mimo aktivní průzkum polohu nesbíráme.</Text>
        </View>
      </Card>
      <PrimaryButton label="Povolit průzkum na pozadí" icon="map-marker-path" onPress={requestBackground} tone="surface" />

      {privacyActions.map(([icon, title, description]) => (
        <Pressable accessibilityRole="button" key={title} style={styles.action}>
          <MaterialCommunityIcons color={colors.brand} name={icon} size={24} />
          <View style={styles.actionCopy}>
            <Text style={styles.cardTitle}>{title}</Text>
            <Text style={styles.cardBody}>{description}</Text>
          </View>
          <MaterialCommunityIcons color={colors.textDisabled} name="chevron-right" size={22} />
        </Pressable>
      ))}

      <PrimaryButton label="Znovu projít onboarding" icon="restart" onPress={replayOnboarding} tone="surface" />
    </Screen>
  );
}

const styles = StyleSheet.create({
  back: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', marginLeft: -spacing.xs },
  backText: { ...typography.label, color: colors.brand },
  title: { ...typography.display, color: colors.textPrimary },
  body: { ...typography.body, color: colors.textSecondary },
  permissionCard: { flexDirection: 'row', gap: spacing.sm },
  permissionIcon: { width: 48, height: 48, borderRadius: radii.md, backgroundColor: colors.brandSoft, alignItems: 'center', justifyContent: 'center' },
  permissionCopy: { flex: 1, gap: spacing.xs },
  cardTitle: { ...typography.h3, color: colors.textPrimary },
  cardBody: { ...typography.caption, color: colors.textSecondary },
  action: { minHeight: 76, padding: spacing.md, borderWidth: 1, borderColor: colors.outline, borderRadius: radii.lg, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  actionCopy: { flex: 1, gap: 2 },
});
