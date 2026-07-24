import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput } from 'react-native';

import { Card, Eyebrow, PrimaryButton, Screen } from '@/components/ui/primitives';
import { MEMORY_MARKER_NOTE_MAX_LENGTH, sanitizeMemoryMarkerNote } from '@/domain/memory-marker';
import { usePlaceMemoryMarker } from '@/state/memory-marker-client';
import { colors, radii, spacing, typography } from '@/theme/tokens';

/** Reached from map.tsx after tapping a spot in Memory Marker pick mode — lat/lng travel as params rather than context state so this screen works as a plain push/back regardless of what else remounts in between. */
export default function MemoryMarkerNewScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ latitude?: string; longitude?: string }>();
  const placeMemoryMarker = usePlaceMemoryMarker();
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const latitude = Number(params.latitude);
  const longitude = Number(params.longitude);
  const validPoint = Number.isFinite(latitude) && Number.isFinite(longitude);
  const trimmed = sanitizeMemoryMarkerNote(note);

  const save = async () => {
    if (!validPoint || !trimmed) return;
    setSubmitting(true);
    setError(null);
    const result = await placeMemoryMarker({ latitude, longitude, note: trimmed }).catch(
      () => ({ ok: false as const, reason: 'not_owned' as const }),
    );
    setSubmitting(false);
    if (!result.ok) {
      Alert.alert('Memory Marker', 'Nemáš už žádný Memory Marker k použití.');
      return;
    }
    router.back();
  };

  return (
    <Screen>
      <Pressable accessibilityLabel="Zpět" accessibilityRole="button" onPress={() => router.back()} style={styles.back}>
        <MaterialCommunityIcons color={colors.brand} name="chevron-left" size={24} />
        <Text style={styles.backText}>Zpět</Text>
      </Pressable>
      <Eyebrow>Memory Marker</Eyebrow>
      <Text style={styles.title}>Napiš si poznámku</Text>
      <Text style={styles.subtitle}>Připnutá na tomhle místě na mapě — připomene se ti, až se tam příště vrátíš.</Text>

      <Card style={styles.formCard}>
        <TextInput
          maxLength={MEMORY_MARKER_NOTE_MAX_LENGTH}
          onChangeText={(value) => {
            setNote(value);
            setError(null);
          }}
          placeholder="např. nezapomeň mléko"
          placeholderTextColor={colors.textDisabled}
          style={styles.input}
          value={note}
        />
        <Text style={styles.counter}>
          {trimmed.length}/{MEMORY_MARKER_NOTE_MAX_LENGTH}
        </Text>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <PrimaryButton
          disabled={submitting || !trimmed || !validPoint}
          icon="note-text-outline"
          label={submitting ? 'Ukládám...' : 'Připnout na mapu'}
          onPress={() => void save()}
        />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  back: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', marginLeft: -spacing.xs },
  backText: { ...typography.label, color: colors.brand },
  title: { ...typography.display, color: colors.textPrimary },
  subtitle: { ...typography.caption, color: colors.textSecondary },
  formCard: { gap: spacing.sm },
  input: {
    borderWidth: 1,
    borderColor: colors.outline,
    borderRadius: radii.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    color: colors.textPrimary,
    ...typography.body,
  },
  counter: { ...typography.caption, color: colors.textSecondary, textAlign: 'right' },
  error: { ...typography.caption, color: colors.danger },
});
