import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Card, Eyebrow, PrimaryButton, Screen } from '@/components/ui/primitives';
import { convex } from '@/state/convex-client';
import { useMyInventory, useUseItem, type ActivatableItemId, type InventoryEntry, type InventoryItemId } from '@/state/inventory-client';
import { useMyProfile } from '@/state/profile-client';
import { colors, spacing, typography } from '@/theme/tokens';

const ITEM_LABELS: Record<InventoryItemId, string> = {
  map_theme_token: 'Mapový motiv',
  scanner_pulse: 'Scanner Pulse',
  memory_marker: 'Memory Marker',
  radius_boost_potion: 'Radius Boost Potion',
  xp_boost_potion: 'XP Boost Potion',
  satellite_scan: 'Satelitní sken',
};

const ITEM_ICONS: Record<InventoryItemId, React.ComponentProps<typeof MaterialCommunityIcons>['name']> = {
  map_theme_token: 'palette-outline',
  scanner_pulse: 'radar',
  memory_marker: 'map-marker-star-outline',
  radius_boost_potion: 'radius-outline',
  xp_boost_potion: 'flash-outline',
  satellite_scan: 'satellite-variant',
};

// Instant-activate items — one tap here does the whole thing. satellite_scan
// and memory_marker are deliberately NOT in this set: both need a map
// location (Memory Marker also needs note text, gathered on the next
// screen), so their "Použít na mapě" button (InventoryRow's mapPickItemId
// check below) just navigates to the map's pick-a-spot mode instead of
// activating anything from this screen. Typed as Set<InventoryItemId> (a
// superset of ActivatableItemId, same string literals) purely so
// .has(entry.itemId) below doesn't need a cast.
const ACTIVATABLE_ITEMS = new Set<InventoryItemId>(['radius_boost_potion', 'xp_boost_potion', 'scanner_pulse']);

function formatRemaining(expiresAt: number, now: number): string {
  const remainingMs = Math.max(0, expiresAt - now);
  const minutes = Math.floor(remainingMs / 60_000);
  const seconds = Math.floor((remainingMs % 60_000) / 1000);
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function ActiveBoostBanner({ label, expiresAt }: { label: string; expiresAt: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);
  if (expiresAt <= now) return null;
  return (
    <View style={styles.activeBoostBanner}>
      <MaterialCommunityIcons color={colors.brand} name="timer-sand" size={16} />
      <Text style={styles.activeBoostText}>
        {label} aktivní ještě {formatRemaining(expiresAt, now)}
      </Text>
    </View>
  );
}

function InventoryRow({ entry }: { entry: InventoryEntry }) {
  const router = useRouter();
  // Named to avoid the "use*" prefix — it's a plain async function (the
  // mutation caller useMutation returns), not a hook, but ESLint's
  // react-hooks/rules-of-hooks flags any "use*"-named call inside a
  // callback purely by naming convention.
  const activateItem = useUseItem();
  const [busy, setBusy] = useState(false);
  const activatable = ACTIVATABLE_ITEMS.has(entry.itemId);
  // A narrowing check (not just MAP_PICK_ITEMS.has, which Sets don't narrow
  // from) so the itemId handed to router.push below is the exact literal
  // union expo-router's typed route params expects, not the wider
  // InventoryItemId.
  const mapPickItemId = entry.itemId === 'satellite_scan' || entry.itemId === 'memory_marker' ? entry.itemId : null;

  return (
    <View style={styles.row}>
      <MaterialCommunityIcons color={colors.brand} name={ITEM_ICONS[entry.itemId]} size={24} />
      <View style={styles.rowBody}>
        <Text style={styles.rowLabel}>{ITEM_LABELS[entry.itemId]}</Text>
        <Text style={styles.rowQuantity}>×{entry.quantity}</Text>
      </View>
      {mapPickItemId ? (
        <PrimaryButton
          disabled={entry.quantity === 0}
          icon={ITEM_ICONS[entry.itemId]}
          label="Použít na mapě"
          onPress={() => router.push({ pathname: '/(tabs)/map', params: { activatePick: mapPickItemId } })}
          tone="surface"
        />
      ) : activatable ? (
        <PrimaryButton
          disabled={busy || entry.quantity === 0}
          icon="flash-outline"
          label={busy ? 'Aktivuji...' : 'Použít'}
          onPress={async () => {
            setBusy(true);
            await activateItem({ itemId: entry.itemId as ActivatableItemId }).catch(() => undefined);
            setBusy(false);
          }}
          tone="surface"
        />
      ) : null}
    </View>
  );
}

function InventoryContent() {
  const router = useRouter();
  const profile = useMyProfile();
  const inventory = useMyInventory(profile?.userId);

  return (
    <Screen>
      <Pressable accessibilityLabel="Zpět" accessibilityRole="button" onPress={() => router.back()} style={styles.back}>
        <MaterialCommunityIcons color={colors.brand} name="chevron-left" size={24} />
        <Text style={styles.backText}>Zpět</Text>
      </Pressable>
      <Eyebrow>Inventář</Eyebrow>
      <Text style={styles.title}>Předměty</Text>

      {profile?.activeRadiusBoostExpiresAt ? (
        <ActiveBoostBanner expiresAt={profile.activeRadiusBoostExpiresAt} label="Radius Boost" />
      ) : null}
      {profile?.activeXpBoostExpiresAt ? (
        <ActiveBoostBanner expiresAt={profile.activeXpBoostExpiresAt} label="XP Boost" />
      ) : null}

      {inventory === undefined ? (
        <Text style={styles.rowQuantity}>Načítám...</Text>
      ) : inventory.filter((entry) => entry.quantity > 0).length === 0 ? (
        <Card>
          <Text style={styles.rowQuantity}>Inventář je zatím prázdný. Předměty získáš za postup na další úroveň.</Text>
        </Card>
      ) : (
        <Card style={styles.listCard}>
          {inventory
            .filter((entry) => entry.quantity > 0)
            .map((entry) => (
              <InventoryRow entry={entry} key={entry.itemId} />
            ))}
        </Card>
      )}
    </Screen>
  );
}

export default function InventoryScreen() {
  if (!convex) {
    return (
      <Screen>
        <Card>
          <Text style={styles.rowQuantity}>Inventář vyžaduje připojení k serveru, které v tomto sestavení není nastavené.</Text>
        </Card>
      </Screen>
    );
  }
  return <InventoryContent />;
}

const styles = StyleSheet.create({
  back: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', marginLeft: -spacing.xs },
  backText: { ...typography.label, color: colors.brand },
  title: { ...typography.display, color: colors.textPrimary },
  activeBoostBanner: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  activeBoostText: { ...typography.caption, color: colors.brand },
  listCard: { gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  rowBody: { flex: 1 },
  rowLabel: { ...typography.body, color: colors.textPrimary },
  rowQuantity: { ...typography.caption, color: colors.textSecondary },
});
