import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useEffect, useState } from 'react';
import { Animated, Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { PrimaryButton } from '@/components/ui/primitives';
import { colors, radii, spacing, typography } from '@/theme/tokens';
import type { LevelUpEvent } from '@/hooks/use-level-up-celebration';

// Matches xpAward.ts's LEVEL_UP_REWARD_ITEM_ID/LEVEL_UP_REWARD_QUANTITY —
// every level currently grants the same fixed reward, so this is a plain
// display constant rather than something read back from a mutation
// response (see use-level-up-celebration.ts's own comment on why this
// fires off the profile's totalXp instead of any one mutation's result).
const LEVEL_UP_REWARD_LABEL = 'Scanner Pulse ×1';

export function LevelUpOverlay({ event, onDismiss }: { event: LevelUpEvent | null; onDismiss: () => void }) {
  // useState's lazy initializer (not useRef) so the eslint react-hooks/refs
  // rule doesn't flag reading these Animated.Value instances during render
  // — they're still the same mutable instance for the component's
  // lifetime, only ever mutated via .setValue()/Animated.timing, never
  // replaced, so a state setter is never actually called on them.
  const [fade] = useState(() => new Animated.Value(0));
  const [scale] = useState(() => new Animated.Value(0.85));

  useEffect(() => {
    if (!event) return;
    fade.setValue(0);
    scale.setValue(0.85);
    Animated.parallel([
      Animated.timing(fade, { toValue: 1, duration: 350, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, friction: 6, tension: 60, useNativeDriver: true }),
    ]).start();
  }, [event, fade, scale]);

  if (!event) return null;

  return (
    <Modal animationType="none" transparent visible={Boolean(event)}>
      <View style={styles.backdrop}>
        <Animated.View style={[styles.card, { opacity: fade, transform: [{ scale }] }]}>
          <Text style={styles.levelUpLabel}>LEVEL UP</Text>
          <Text style={styles.levelNumber}>{event.level}</Text>
          <View style={styles.rankRow}>
            <MaterialCommunityIcons color={colors.amber} name="trophy" size={22} />
            <Text style={styles.rankLabel}>{event.rankLabel}</Text>
          </View>
          <View style={styles.rewardsCard}>
            <Text style={styles.rewardsTitle}>ODMĚNY ODEMČENY</Text>
            <View style={styles.rewardRow}>
              <MaterialCommunityIcons color={colors.brand} name="gift-outline" size={20} />
              <Text style={styles.rewardLabel}>{LEVEL_UP_REWARD_LABEL}</Text>
            </View>
          </View>
          <PrimaryButton label="Pokračovat" onPress={onDismiss} />
        </Animated.View>
        <Pressable accessibilityLabel="Zavřít" accessibilityRole="button" onPress={onDismiss} style={StyleSheet.absoluteFill} />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(4,10,16,0.88)', alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  card: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: 'rgba(255,184,77,0.4)',
    padding: spacing.lg,
    alignItems: 'center',
    gap: spacing.sm,
  },
  levelUpLabel: { ...typography.label, color: colors.textSecondary, letterSpacing: 4 },
  levelNumber: { ...typography.display, fontSize: 64, color: colors.amber, fontWeight: '800' },
  rankRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  rankLabel: { ...typography.h2, color: colors.textPrimary },
  rewardsCard: { alignSelf: 'stretch', backgroundColor: colors.surfaceMuted, borderRadius: radii.lg, padding: spacing.sm, gap: spacing.xs, marginTop: spacing.xs },
  rewardsTitle: { ...typography.label, color: colors.textSecondary, letterSpacing: 1 },
  rewardRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  rewardLabel: { ...typography.body, color: colors.textPrimary },
});
