import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Card, Eyebrow, PrimaryButton, Screen } from '@/components/ui/primitives';
import { convex } from '@/state/convex-client';
import { useExplorer } from '@/state/explorer-context';
import { type PrivateZone, useAddPrivateZone, useMyPrivateZones, useRemovePrivateZone } from '@/state/privacy-zones-client';
import { colors, radii, spacing, typography } from '@/theme/tokens';

const RADIUS_PRESETS = [100, 250, 500] as const;

function ZonesBoard() {
  const { session } = useExplorer();
  const zones = useMyPrivateZones();
  const addZone = useAddPrivateZone();
  const removeZone = useRemovePrivateZone();
  const [label, setLabel] = useState('');
  const [radiusMeters, setRadiusMeters] = useState<number>(250);
  const [submitting, setSubmitting] = useState(false);

  const addFromCurrentLocation = async () => {
    const current = session.route.at(-1);
    if (!current) {
      Alert.alert('Poloha není dostupná', 'Zahaj průzkum, ať máme tvou aktuální polohu k dispozici.');
      return;
    }
    const zoneLabel = label.trim() || 'Moje zóna';
    setSubmitting(true);
    await addZone({ label: zoneLabel, latitude: current.latitude, longitude: current.longitude, radiusMeters }).catch(() => undefined);
    setSubmitting(false);
    setLabel('');
  };

  return (
    <>
      <Card style={styles.formCard}>
        <Text style={styles.cardLabel}>Přidat zónu z aktuální polohy</Text>
        <TextInput
          onChangeText={setLabel}
          placeholder="Název (např. Domov)"
          placeholderTextColor={colors.textDisabled}
          style={styles.input}
          value={label}
        />
        <View style={styles.radiusRow}>
          {RADIUS_PRESETS.map((preset) => (
            <Pressable
              accessibilityRole="button"
              key={preset}
              onPress={() => setRadiusMeters(preset)}
              style={[styles.radiusPill, radiusMeters === preset && styles.radiusPillActive]}
            >
              <Text style={[styles.radiusPillText, radiusMeters === preset && styles.radiusPillTextActive]}>{preset} m</Text>
            </Pressable>
          ))}
        </View>
        <PrimaryButton
          icon="shield-home-outline"
          label={submitting ? 'Přidávám...' : 'Přidat zónu tady, kde jsem'}
          onPress={() => void addFromCurrentLocation()}
        />
      </Card>

      {zones === undefined ? (
        <Card style={styles.centeredCard}>
          <ActivityIndicator color={colors.brand} />
        </Card>
      ) : zones.length === 0 ? (
        <Card>
          <Text style={styles.emptyText}>Zatím nemáš žádnou soukromou zónu.</Text>
        </Card>
      ) : (
        zones.map((zone: PrivateZone) => (
          <Card key={zone._id} style={styles.zoneRow}>
            <MaterialCommunityIcons color={colors.brand} name="shield-home-outline" size={22} />
            <View style={styles.zoneCopy}>
              <Text style={styles.zoneLabel}>{zone.label}</Text>
              <Text style={styles.zoneMeta}>dosah {zone.radiusMeters} m</Text>
            </View>
            <Pressable accessibilityRole="button" onPress={() => void removeZone({ zoneId: zone._id })}>
              <Text style={styles.removeText}>Smazat</Text>
            </Pressable>
          </Card>
        ))
      )}
    </>
  );
}

export default function PrivateZonesScreen() {
  const router = useRouter();

  return (
    <Screen>
      <Pressable accessibilityLabel="Zpět" accessibilityRole="button" onPress={() => router.back()} style={styles.back}>
        <MaterialCommunityIcons color={colors.brand} name="chevron-left" size={24} />
        <Text style={styles.backText}>Zpět</Text>
      </Pressable>
      <Eyebrow>Soukromé zóny</Eyebrow>
      <Text style={styles.title}>Skryj citlivá místa</Text>
      <Text style={styles.subtitle}>
        Body v okruhu zóny se vynechají z „Export mých dat“. Skrytí přímo na mapě je plánované rozšíření, dnes ještě není hotové.
      </Text>

      {convex ? (
        <ZonesBoard />
      ) : (
        <Card>
          <Text style={styles.emptyText}>Soukromé zóny vyžadují připojení k serveru, které v tomto sestavení není nastavené.</Text>
        </Card>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  back: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', marginLeft: -spacing.xs },
  backText: { ...typography.label, color: colors.brand },
  title: { ...typography.display, color: colors.textPrimary },
  subtitle: { ...typography.body, color: colors.textSecondary },
  formCard: { gap: spacing.sm },
  cardLabel: { ...typography.label, color: colors.textSecondary },
  input: { borderWidth: 1, borderColor: colors.outline, borderRadius: radii.md, paddingHorizontal: spacing.sm, paddingVertical: spacing.sm, color: colors.textPrimary, ...typography.body },
  radiusRow: { flexDirection: 'row', gap: spacing.xs },
  radiusPill: { paddingHorizontal: spacing.sm, paddingVertical: 6, borderRadius: radii.pill, borderWidth: 1, borderColor: colors.outline },
  radiusPillActive: { backgroundColor: colors.brandSoft, borderColor: 'rgba(56,230,138,0.35)' },
  radiusPillText: { ...typography.caption, color: colors.textSecondary },
  radiusPillTextActive: { color: colors.brand, fontWeight: '700' },
  centeredCard: { alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.xl },
  emptyText: { ...typography.body, color: colors.textSecondary },
  zoneRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  zoneCopy: { flex: 1 },
  zoneLabel: { ...typography.h3, color: colors.textPrimary },
  zoneMeta: { ...typography.caption, color: colors.textSecondary },
  removeText: { ...typography.label, color: colors.danger },
});
