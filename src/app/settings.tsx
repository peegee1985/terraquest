import AsyncStorage from '@react-native-async-storage/async-storage';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Linking, Pressable, Share, StyleSheet, Text, View } from 'react-native';

import { Card, Eyebrow, PrimaryButton, Screen } from '@/components/ui/primitives';
import { getLocalPersistence } from '@/data/local';
import { redactPointsInZones } from '@/domain/privacy-zones';
import { DAILY_STEP_GOAL, STEP_GOAL_PRESETS } from '@/domain/steps';
import { LOCAL_SESSION_ID } from '@/domain/tracking-task';
import { useLocationPermissions } from '@/hooks/use-location-permissions';
import { useAuthIdentity } from '@/state/auth-context';
import { convex } from '@/state/convex-client';
import { useMyXpLedger } from '@/state/data-export-client';
import { useExplorer } from '@/state/explorer-context';
import { useMyProfile, useSetMapTheme } from '@/state/profile-client';
import { useMyPrivateZones } from '@/state/privacy-zones-client';
import { useSetDailyStepGoal } from '@/state/step-goal-client';
import { colors, radii, spacing, typography } from '@/theme/tokens';

type ExportInputs = {
  profile: ReturnType<typeof useMyProfile>;
  xpLedger: ReturnType<typeof useMyXpLedger>;
  zones: ReturnType<typeof useMyPrivateZones>;
};

async function shareDataExport({ profile, xpLedger, zones }: ExportInputs) {
  const persistence = await getLocalPersistence();
  const rawPoints = await persistence.trackPoints.listBySession(LOCAL_SESSION_ID);
  const redacted = redactPointsInZones(
    rawPoints.map((point) => ({ latitude: point.latitude, longitude: point.longitude, capturedAt: point.capturedAt })),
    (zones ?? []).map((zone) => ({ latitude: zone.latitude, longitude: zone.longitude, radiusMeters: zone.radiusMeters })),
  );

  const payload = {
    exportedAt: new Date().toISOString(),
    profile: profile ?? null,
    xpLedger: xpLedger ?? [],
    route: redacted,
    note:
      zones && zones.length > 0
        ? `${rawPoints.length - redacted.length} bod(ů) v tvých soukromých zónách bylo z exportu vynecháno.`
        : undefined,
  };

  await Share.share({ title: 'TerraQuest — export dat', message: JSON.stringify(payload, null, 2) });
}

/** Only mounted when `convex` is truthy — these hooks need a ConvexProvider ancestor (see poi-layer.tsx's PoiLayer for the same precondition). */
function ConnectedExportRow() {
  const profile = useMyProfile();
  const xpLedger = useMyXpLedger(200);
  const zones = useMyPrivateZones();
  const [exporting, setExporting] = useState(false);

  return (
    <Pressable
      accessibilityRole="button"
      onPress={async () => {
        setExporting(true);
        await shareDataExport({ profile, xpLedger, zones }).catch(() => Alert.alert('Export selhal', 'Zkus to prosím znovu.'));
        setExporting(false);
      }}
      style={styles.action}
    >
      <MaterialCommunityIcons color={colors.brand} name="tray-arrow-down" size={24} />
      <View style={styles.actionCopy}>
        <Text style={styles.cardTitle}>{exporting ? 'Připravuji export...' : 'Export mých dat'}</Text>
        <Text style={styles.cardBody}>Trasa, XP ledger a profil jako soubor — body ze soukromých zón se vynechají.</Text>
      </View>
      <MaterialCommunityIcons color={colors.textDisabled} name="chevron-right" size={22} />
    </Pressable>
  );
}

function ExportRow() {
  const [exporting, setExporting] = useState(false);
  return (
    <Pressable
      accessibilityRole="button"
      onPress={async () => {
        setExporting(true);
        await shareDataExport({ profile: undefined, xpLedger: undefined, zones: undefined }).catch(() =>
          Alert.alert('Export selhal', 'Zkus to prosím znovu.'),
        );
        setExporting(false);
      }}
      style={styles.action}
    >
      <MaterialCommunityIcons color={colors.brand} name="tray-arrow-down" size={24} />
      <View style={styles.actionCopy}>
        <Text style={styles.cardTitle}>{exporting ? 'Připravuji export...' : 'Export mých dat'}</Text>
        <Text style={styles.cardBody}>Lokální trasa jako soubor (server není v tomto sestavení připojený).</Text>
      </View>
      <MaterialCommunityIcons color={colors.textDisabled} name="chevron-right" size={22} />
    </Pressable>
  );
}

/** Only mounted when `convex` is truthy — same precondition as ConnectedExportRow. */
function StepGoalRow() {
  const profile = useMyProfile();
  const setDailyStepGoal = useSetDailyStepGoal();
  const currentGoal = profile?.dailyStepGoal ?? DAILY_STEP_GOAL;

  return (
    <Card style={styles.stepGoalCard}>
      <View style={styles.actionCopy}>
        <Text style={styles.cardTitle}>Denní cíl kroků</Text>
        <Text style={styles.cardBody}>{currentGoal.toLocaleString('cs-CZ')} kroků</Text>
      </View>
      <View style={styles.stepGoalPresetsRow}>
        {STEP_GOAL_PRESETS.map((preset) => {
          const active = preset === currentGoal;
          return (
            <Pressable
              accessibilityRole="button"
              key={preset}
              onPress={() => void setDailyStepGoal({ goal: preset })}
              style={[styles.stepGoalPreset, active && styles.stepGoalPresetActive]}
            >
              <Text style={[styles.stepGoalPresetText, active && styles.stepGoalPresetTextActive]}>{(preset / 1000).toFixed(0)}k</Text>
            </Pressable>
          );
        })}
      </View>
    </Card>
  );
}

/** Only rendered once map_theme_token has been spent (inventory.tsx's unlockMapTheme) — same "unlocked, then free forever" split as the item's own comment in profile.ts. */
function MapThemeRow() {
  const profile = useMyProfile();
  const setMapTheme = useSetMapTheme();
  if (!profile?.mapThemeUnlocked) return null;
  const currentTheme = profile.mapTheme;

  return (
    <Card style={styles.stepGoalCard}>
      <View style={styles.actionCopy}>
        <Text style={styles.cardTitle}>Vzhled mapy</Text>
        <Text style={styles.cardBody}>Odemčeno pomocí Mapového motivu z inventáře.</Text>
      </View>
      <View style={styles.stepGoalPresetsRow}>
        {(['dark', 'light'] as const).map((theme) => {
          const active = theme === currentTheme;
          return (
            <Pressable
              accessibilityRole="button"
              key={theme}
              onPress={() => void setMapTheme({ theme })}
              style={[styles.stepGoalPreset, active && styles.stepGoalPresetActive]}
            >
              <Text style={[styles.stepGoalPresetText, active && styles.stepGoalPresetTextActive]}>
                {theme === 'dark' ? 'Tmavá' : 'Světlá'}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </Card>
  );
}

function DeleteHistoryRow() {
  const { resetLocalHistory } = useExplorer();

  const confirmDelete = () => {
    Alert.alert(
      'Smazat historii?',
      'Smaže se tvá lokální trasa a odkrytá mlha na tomto zařízení. Potvrzené XP a účet zůstanou beze změny.',
      [
        { text: 'Zrušit', style: 'cancel' },
        {
          text: 'Smazat',
          style: 'destructive',
          onPress: async () => {
            const result = await resetLocalHistory();
            if (!result.ok) Alert.alert('Nepovedlo se', 'Zkus to prosím znovu.');
          },
        },
      ],
    );
  };

  return (
    <Pressable accessibilityRole="button" onPress={confirmDelete} style={styles.action}>
      <MaterialCommunityIcons color={colors.brand} name="delete-outline" size={24} />
      <View style={styles.actionCopy}>
        <Text style={styles.cardTitle}>Smazat historii</Text>
        <Text style={styles.cardBody}>Odstraní lokální trasu a mlhu odkrytí na tomto zařízení.</Text>
      </View>
      <MaterialCommunityIcons color={colors.textDisabled} name="chevron-right" size={22} />
    </Pressable>
  );
}

export default function SettingsScreen() {
  const router = useRouter();
  const identity = useAuthIdentity();
  const isGuest = identity?.isAnonymous ?? true;
  const { isForegroundGranted, isBackgroundGranted, requestBackground: requestBackgroundPermission } = useLocationPermissions();

  const requestBackground = async () => {
    if (!isForegroundGranted) {
      Alert.alert('Nejdřív poloha při používání', 'Background polohu nabídneme až po povolení polohy při otevřené aplikaci.');
      return;
    }
    const background = await requestBackgroundPermission();
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

      <Pressable accessibilityRole="button" onPress={() => router.push('/account')}>
        <Card style={styles.permissionCard}>
          <View style={styles.permissionIcon}>
            <MaterialCommunityIcons color={colors.brand} name={isGuest ? 'account-outline' : 'account-check-outline'} size={28} />
          </View>
          <View style={styles.permissionCopy}>
            <Text style={styles.cardTitle}>{isGuest ? 'Hraješ jako host' : 'Účet propojený'}</Text>
            <Text style={styles.cardBody}>
              {isGuest
                ? 'Založ si účet, ať progres nezmizí při přeinstalaci nebo výměně telefonu.'
                : (identity?.email ?? identity?.handle ?? 'Spravovat účet')}
            </Text>
          </View>
          <MaterialCommunityIcons color={colors.textDisabled} name="chevron-right" size={22} />
        </Card>
      </Pressable>

      <Card style={styles.permissionCard}>
        <View style={styles.permissionIcon}>
          <MaterialCommunityIcons color={isForegroundGranted ? colors.brand : colors.textDisabled} name="map-clock-outline" size={28} />
        </View>
        <View style={styles.permissionCopy}>
          <Text style={styles.cardTitle}>Průzkum na pozadí</Text>
          <Text style={styles.cardBody}>
            {!isForegroundGranted
              ? 'Nejdřív povol polohu při používání aplikace.'
              : isBackgroundGranted
                ? 'Zapnuto — záznam pokračuje i při zamčeném telefonu, dokud aplikaci ručně nezavřeš.'
                : 'Povol, aby záznam pokračoval při zamčeném telefonu. Zavřením aplikace se záznam vždy zastaví.'}
          </Text>
        </View>
      </Card>
      {isForegroundGranted && !isBackgroundGranted ? (
        <PrimaryButton label="Povolit průzkum na pozadí" icon="map-marker-path" onPress={requestBackground} tone="surface" />
      ) : null}

      <Pressable accessibilityRole="button" onPress={() => router.push('/private-zones')} style={styles.action}>
        <MaterialCommunityIcons color={colors.brand} name="shield-home-outline" size={24} />
        <View style={styles.actionCopy}>
          <Text style={styles.cardTitle}>Soukromé zóny</Text>
          <Text style={styles.cardBody}>Skryj okolí domova a citlivých míst z exportu dat.</Text>
        </View>
        <MaterialCommunityIcons color={colors.textDisabled} name="chevron-right" size={22} />
      </Pressable>

      {convex ? <StepGoalRow /> : null}
      {convex ? <MapThemeRow /> : null}

      {convex ? <ConnectedExportRow /> : <ExportRow />}
      <DeleteHistoryRow />

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
  stepGoalCard: { gap: spacing.sm },
  stepGoalPresetsRow: { flexDirection: 'row', gap: spacing.xs },
  stepGoalPreset: { flex: 1, paddingVertical: spacing.xs, alignItems: 'center', borderRadius: radii.md, backgroundColor: colors.surfaceElevated, borderWidth: 1, borderColor: colors.outline },
  stepGoalPresetActive: { backgroundColor: colors.brandSoft, borderColor: colors.brand },
  stepGoalPresetText: { ...typography.label, color: colors.textSecondary },
  stepGoalPresetTextActive: { color: colors.brand },
});
