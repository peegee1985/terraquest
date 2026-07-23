import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { Card, Eyebrow, PrimaryButton, Screen } from '@/components/ui/primitives';
import { AVATAR_PRESETS } from '@/domain/avatars';
import {
  useGenerateAvatarUploadUrl,
  useMyAvatarChangeStatus,
  useSetAvatarPhoto,
  useSetAvatarPreset,
  uploadAvatarPhoto,
  type AvatarChangeResult,
} from '@/state/avatar-client';
import { convex } from '@/state/convex-client';
import { useMyProfile } from '@/state/profile-client';
import { colors, radii, spacing, typography } from '@/theme/tokens';

const AVATAR_CHANGE_ERROR_COPY: Record<string, string> = {
  guests_cannot_change_avatar: 'Hosté nemohou měnit avatara. Založ si účet přes e-mail nebo Google.',
  limit_reached: 'Vyčerpal/a jsi počet dostupných změn avatara.',
};

function AvatarPickerContent() {
  const router = useRouter();
  const profile = useMyProfile();
  const status = useMyAvatarChangeStatus();
  const setAvatarPreset = useSetAvatarPreset();
  const setAvatarPhoto = useSetAvatarPhoto();
  const generateAvatarUploadUrl = useGenerateAvatarUploadUrl();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleResult = (result: AvatarChangeResult) => {
    if (!result.ok) setError(AVATAR_CHANGE_ERROR_COPY[result.reason] ?? 'Něco se pokazilo.');
    else setError(null);
  };

  const changesLeft = status ? Math.max(0, status.changesAllowed - status.changesUsedInWindow) : null;
  const locked = status?.isGuest === true || changesLeft === 0;

  const pickPhoto = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Přístup k fotkám', 'Bez povolení nelze vybrat fotku z galerie.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.8 });
    if (result.canceled || !result.assets[0]) return;

    setUploading(true);
    try {
      const uploadResult = await uploadAvatarPhoto(result.assets[0].uri, () => generateAvatarUploadUrl({}), setAvatarPhoto);
      handleResult(uploadResult);
    } catch {
      Alert.alert('Nahrání se nepovedlo', 'Zkus to prosím znovu.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <Screen>
      <Pressable accessibilityLabel="Zpět" accessibilityRole="button" onPress={() => router.back()} style={styles.back}>
        <MaterialCommunityIcons color={colors.brand} name="chevron-left" size={24} />
        <Text style={styles.backText}>Zpět</Text>
      </Pressable>
      <Eyebrow>Avatar</Eyebrow>
      <Text style={styles.title}>Vyber si avatara</Text>
      {status && !status.isGuest ? (
        <Text style={styles.limitCopy}>
          Zbývá {changesLeft} {changesLeft === 1 ? 'změna' : 'změny'} avatara.
        </Text>
      ) : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Card style={styles.photoCard}>
        <View style={styles.photoPreview}>
          {profile?.avatarPhotoUrl ? (
            <Image source={{ uri: profile.avatarPhotoUrl }} style={styles.photoPreviewImage} />
          ) : (
            <MaterialCommunityIcons color={colors.brand} name="image-outline" size={32} />
          )}
        </View>
        <View style={styles.stepsCopy}>
          <Text style={styles.cardTitle}>Vlastní fotka</Text>
          <Text style={styles.cardBody}>Nahraj si vlastní fotku místo předvoleného avatara.</Text>
        </View>
        {uploading ? (
          <ActivityIndicator color={colors.brand} />
        ) : (
          <PrimaryButton disabled={locked} icon="upload" label="Nahrát" onPress={() => void pickPhoto()} tone="surface" />
        )}
      </Card>

      <View style={styles.grid}>
        {AVATAR_PRESETS.map((preset) => {
          const active = !profile?.avatarPhotoUrl && profile?.avatarId === preset.id;
          return (
            <Pressable
              accessibilityLabel={preset.label}
              accessibilityRole="button"
              disabled={locked}
              key={preset.id}
              onPress={() => void setAvatarPreset({ avatarId: preset.id }).then(handleResult)}
              style={[styles.presetTile, active && styles.presetTileActive, locked && styles.presetTileDisabled]}
            >
              <MaterialCommunityIcons color={active ? colors.brand : colors.textSecondary} name={preset.icon} size={32} />
              <Text style={[styles.presetLabel, active && styles.presetLabelActive]}>{preset.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </Screen>
  );
}

export default function AvatarPickerScreen() {
  if (!convex) {
    return (
      <Screen>
        <Card>
          <Text style={styles.cardBody}>Výběr avatara vyžaduje připojení k serveru, které v tomto sestavení není nastavené.</Text>
        </Card>
      </Screen>
    );
  }
  return <AvatarPickerContent />;
}

const styles = StyleSheet.create({
  back: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', marginLeft: -spacing.xs },
  backText: { ...typography.label, color: colors.brand },
  title: { ...typography.display, color: colors.textPrimary },
  limitCopy: { ...typography.caption, color: colors.textSecondary },
  error: { ...typography.caption, color: colors.danger },
  photoCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  photoPreview: { width: 56, height: 56, borderRadius: 20, backgroundColor: colors.brandSoft, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  photoPreviewImage: { width: '100%', height: '100%' },
  stepsCopy: { flex: 1, gap: 2 },
  cardTitle: { ...typography.h3, color: colors.textPrimary },
  cardBody: { ...typography.caption, color: colors.textSecondary },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  presetTile: {
    width: '30%',
    aspectRatio: 1,
    gap: 6,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.outline,
    borderRadius: radii.lg,
  },
  presetTileActive: { borderColor: colors.brand, backgroundColor: colors.brandSoft },
  presetTileDisabled: { opacity: 0.5 },
  presetLabel: { ...typography.caption, color: colors.textSecondary, textAlign: 'center' },
  presetLabelActive: { color: colors.brand },
});
