import AsyncStorage from '@react-native-async-storage/async-storage';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Linking, Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';

import { PrimaryButton, ProgressBar } from '@/components/ui/primitives';
import { useLocationPermissions } from '@/hooks/use-location-permissions';
import { colors, radii, spacing, typography } from '@/theme/tokens';

const pages = [
  { icon: 'weather-fog', title: 'Svět čeká pod mlhou', body: 'Choď, běhej a bezpečně odkrývej vlastní mapu. Každá cesta zůstane součástí tvého příběhu.' },
  { icon: 'shield-lock-outline', title: 'Tvoje poloha, tvoje pravidla', body: 'Trasu můžeš exportovat, smazat a skrýt v soukromých zónách. Soutěžní progres ověřuje backend.' },
  { icon: 'map-marker-radius-outline', title: 'Povol polohu při průzkumu', body: 'Přesnou polohu použijeme při otevřené aplikaci. Přístup na pozadí nabídneme až ve chvíli, kdy jej bude aktivní průzkum opravdu potřebovat.' },
  { icon: 'compass-rose', title: 'Vše připraveno', body: 'První výprava může začít. Bezpečí a soukromí najdeš kdykoliv v nastavení.' },
] as const;

export default function OnboardingScreen() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const { foreground, isForegroundDenied, requestForeground } = useLocationPermissions();
  const page = pages[step];
  // Only show the "denied" card once the user has actually gone through the
  // permission step at least once — not before, and not just because the OS
  // reports UNDETERMINED before we've asked.
  const [askedOnce, setAskedOnce] = useState(false);
  const denied = askedOnce && isForegroundDenied;

  const requestLocation = async () => {
    setAskedOnce(true);
    await requestForeground();
    // Whether granted or denied, the user can always continue — TerraQuest
    // works in a demo/limited mode without location, per TQ-20.
    setStep(3);
  };

  const openSystemSettings = () => {
    Linking.openSettings().catch(() => undefined);
  };

  const skip = () => {
    setAskedOnce(true);
    setStep(3);
  };

  const finish = async () => {
    await AsyncStorage.setItem('terraquest:onboarding-complete', 'true');
    router.replace('/(tabs)');
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <View>
          <Text style={styles.eyebrow}>Krok {step + 1} / {pages.length}</Text>
          <ProgressBar progress={(step + 1) / pages.length} />
          <View style={styles.iconWrap}>
            <MaterialCommunityIcons color={colors.brand} name={page.icon} size={68} />
          </View>
          <Text style={styles.title}>{page.title}</Text>
          <Text style={styles.body}>{page.body}</Text>
          {denied ? (
            <View style={styles.deniedCard}>
              <Text style={styles.deniedTitle}>Poloha je zamítnutá</Text>
              <Text style={styles.deniedBody}>Aplikaci můžeš dál procházet bez záznamu trasy. Oprávnění lze kdykoliv zapnout v nastavení.</Text>
              <Pressable accessibilityRole="button" onPress={foreground.canAskAgain ? requestLocation : openSystemSettings}>
                <Text style={styles.repair}>{foreground.canAskAgain ? 'Zkusit znovu' : 'Otevřít nastavení systému'}</Text>
              </Pressable>
            </View>
          ) : null}
        </View>

        <View style={styles.actions}>
          {step === 2 ? (
            <>
              <PrimaryButton label="Povolit při používání" icon="map-marker-check-outline" onPress={requestLocation} />
              <PrimaryButton label="Teď ne" icon="arrow-right" onPress={skip} tone="surface" />
            </>
          ) : (
            <PrimaryButton label={step === 3 ? 'Vstoupit do TerraQuest' : 'Pokračovat'} onPress={step === 3 ? finish : () => setStep((value) => value + 1)} />
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  container: { flex: 1, justifyContent: 'space-between', padding: spacing.lg, gap: spacing.lg },
  eyebrow: { ...typography.label, color: colors.brand, textTransform: 'uppercase', letterSpacing: 1.3, marginBottom: spacing.sm },
  iconWrap: { width: 136, height: 136, borderRadius: 68, alignItems: 'center', justifyContent: 'center', marginTop: spacing.xxl, backgroundColor: colors.brandSoft, borderColor: 'rgba(56,230,138,0.3)', borderWidth: 1 },
  title: { ...typography.display, color: colors.textPrimary, marginTop: spacing.xl },
  body: { ...typography.body, color: colors.textSecondary, marginTop: spacing.md },
  deniedCard: { marginTop: spacing.lg, padding: spacing.md, borderRadius: radii.lg, borderWidth: 1, borderColor: 'rgba(255,93,102,0.5)', backgroundColor: 'rgba(255,93,102,0.12)', gap: spacing.xs },
  deniedTitle: { ...typography.h3, color: colors.danger },
  deniedBody: { ...typography.caption, color: colors.textSecondary },
  repair: { ...typography.label, color: colors.brand, marginTop: spacing.xs },
  actions: { gap: spacing.xs },
});
