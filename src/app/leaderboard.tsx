import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Card, Eyebrow, PrimaryButton, Screen } from '@/components/ui/primitives';
import {
  type FollowedUser,
  type LeaderboardEntry,
  type LeaderboardMetric,
  useCountryLeaderboard,
  useFollowByHandle,
  useFriendsLeaderboard,
  useMyFollowing,
  useUnfollow,
  useWorldLeaderboard,
} from '@/state/leaderboard-client';
import { useMyProfile, useSetCountry } from '@/state/profile-client';
import { convex } from '@/state/convex-client';
import { colors, radii, spacing, typography } from '@/theme/tokens';

type BoardTab = 'world' | 'country' | 'friends';

const TAB_LABELS: Record<BoardTab, string> = { world: 'Svět', country: 'Země', friends: 'Přátelé' };
const METRIC_LABELS: Record<LeaderboardMetric, string> = { xp: 'XP', explorationUnits: 'Odkryté jednotky' };

function LeaderboardRow({ entry, isSelf }: { entry: LeaderboardEntry; isSelf: boolean }) {
  return (
    <View style={[styles.row, isSelf && styles.rowSelf]}>
      <Text style={[styles.rowRank, isSelf && styles.rowSelfText]}>#{entry.rank}</Text>
      <View style={styles.rowIdentity}>
        <Text numberOfLines={1} style={[styles.rowHandle, isSelf && styles.rowSelfText]}>
          {entry.displayName ?? entry.handle}
        </Text>
        <Text style={styles.rowSubHandle}>@{entry.handle}</Text>
      </View>
      <Text style={[styles.rowScore, isSelf && styles.rowSelfText]}>{entry.score.toLocaleString('cs-CZ')}</Text>
    </View>
  );
}

function LeaderboardList({ entries, selfUserId, emptyLabel }: { entries: LeaderboardEntry[] | undefined; selfUserId?: string; emptyLabel: string }) {
  if (entries === undefined) {
    return (
      <Card style={styles.centeredCard}>
        <ActivityIndicator color={colors.brand} />
      </Card>
    );
  }
  if (entries.length === 0) {
    return (
      <Card>
        <Text style={styles.emptyText}>{emptyLabel}</Text>
      </Card>
    );
  }
  return (
    <Card style={styles.listCard}>
      {entries.map((entry) => <LeaderboardRow entry={entry} isSelf={entry.userId === selfUserId} key={entry.userId} />)}
    </Card>
  );
}

function FriendsPanel({ metric, selfUserId }: { metric: LeaderboardMetric; selfUserId?: string }) {
  const entries = useFriendsLeaderboard(metric);
  const following = useMyFollowing();
  const followByHandle = useFollowByHandle();
  const unfollow = useUnfollow();
  const [handleInput, setHandleInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const invite = async () => {
    const handle = handleInput.trim().replace(/^@/, '');
    if (!handle) return;
    setError(null);
    setSubmitting(true);
    try {
      await followByHandle({ handle });
      setHandleInput('');
    } catch {
      setError('Uživatele s tímto handlem se nepodařilo najít.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Card style={styles.inviteCard}>
        <Text style={styles.cardLabel}>Pozvat přítele</Text>
        <View style={styles.inviteRow}>
          <TextInput
            autoCapitalize="none"
            onChangeText={setHandleInput}
            placeholder="handle uživatele"
            placeholderTextColor={colors.textDisabled}
            style={styles.inviteInput}
            value={handleInput}
          />
          <PrimaryButton icon="account-plus-outline" label={submitting ? '...' : 'Pozvat'} onPress={() => void invite()} />
        </View>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {following && following.length > 0 ? (
          <View style={styles.followingList}>
            {following.map((user: FollowedUser) => (
              <View key={user.userId} style={styles.followingRow}>
                <Text style={styles.followingHandle}>{user.displayName ?? `@${user.handle}`}</Text>
                <Pressable accessibilityRole="button" onPress={() => void unfollow({ followingId: user.userId })}>
                  <Text style={styles.unfollowText}>Zrušit</Text>
                </Pressable>
              </View>
            ))}
          </View>
        ) : null}
      </Card>
      <LeaderboardList emptyLabel="Zatím nikoho nesleduješ — pozvi přítele výše." entries={entries} selfUserId={selfUserId} />
    </>
  );
}

function CountryPanel({ metric, country, selfUserId }: { metric: LeaderboardMetric; country: string | null; selfUserId?: string }) {
  const setCountry = useSetCountry();
  const [codeInput, setCodeInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const entries = useCountryLeaderboard(metric, country);

  if (!country) {
    return (
      <Card style={styles.inviteCard}>
        <Text style={styles.cardLabel}>Nastav svou zemi</Text>
        <Text style={styles.cardBody}>Zadej dvoupísmenný kód (např. CZ, SK) pro žebříček své země.</Text>
        <View style={styles.inviteRow}>
          <TextInput
            autoCapitalize="characters"
            maxLength={2}
            onChangeText={setCodeInput}
            placeholder="CZ"
            placeholderTextColor={colors.textDisabled}
            style={styles.inviteInput}
            value={codeInput}
          />
          <PrimaryButton
            icon="earth"
            label={submitting ? '...' : 'Uložit'}
            onPress={async () => {
              const code = codeInput.trim().toUpperCase();
              if (code.length !== 2) {
                Alert.alert('Neplatný kód', 'Zadej dvoupísmenný kód země, např. CZ.');
                return;
              }
              setSubmitting(true);
              await setCountry({ country: code }).catch(() => undefined);
              setSubmitting(false);
            }}
          />
        </View>
      </Card>
    );
  }

  return <LeaderboardList emptyLabel="V tvé zemi zatím nikdo nemá žebříčkové skóre." entries={entries} selfUserId={selfUserId} />;
}

function LeaderboardBoard() {
  const [tab, setTab] = useState<BoardTab>('world');
  const [metric, setMetric] = useState<LeaderboardMetric>('xp');
  const profile = useMyProfile();
  const worldEntries = useWorldLeaderboard(metric);

  return (
    <>
      <View style={styles.tabRow}>
        {(['world', 'country', 'friends'] as const).map((value) => (
          <Pressable
            accessibilityRole="button"
            key={value}
            onPress={() => setTab(value)}
            style={[styles.tab, tab === value && styles.tabActive]}
          >
            <Text style={[styles.tabText, tab === value && styles.tabTextActive]}>{TAB_LABELS[value]}</Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.metricRow}>
        {(['xp', 'explorationUnits'] as const).map((value) => (
          <Pressable
            accessibilityRole="button"
            key={value}
            onPress={() => setMetric(value)}
            style={[styles.metricPill, metric === value && styles.metricPillActive]}
          >
            <Text style={[styles.metricPillText, metric === value && styles.metricPillTextActive]}>{METRIC_LABELS[value]}</Text>
          </Pressable>
        ))}
      </View>

      {tab === 'world' ? (
        <LeaderboardList emptyLabel="Zatím žádné žebříčkové skóre." entries={worldEntries} selfUserId={profile?.userId} />
      ) : tab === 'country' ? (
        <CountryPanel country={profile?.country ?? null} metric={metric} selfUserId={profile?.userId} />
      ) : (
        <FriendsPanel metric={metric} selfUserId={profile?.userId} />
      )}
    </>
  );
}

export default function LeaderboardScreen() {
  const router = useRouter();

  return (
    <Screen>
      <Pressable accessibilityLabel="Zpět" accessibilityRole="button" onPress={() => router.back()} style={styles.back}>
        <MaterialCommunityIcons color={colors.brand} name="chevron-left" size={24} />
        <Text style={styles.backText}>Zpět</Text>
      </Pressable>
      <Eyebrow>Žebříčky</Eyebrow>
      <Text style={styles.title}>Kde stojíš mezi ostatními</Text>

      {convex ? (
        <LeaderboardBoard />
      ) : (
        <Card>
          <Text style={styles.emptyText}>Žebříčky vyžadují připojení k serveru, které v tomto sestavení není nastavené.</Text>
        </Card>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  back: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', marginLeft: -spacing.xs },
  backText: { ...typography.label, color: colors.brand },
  title: { ...typography.display, color: colors.textPrimary },
  tabRow: { flexDirection: 'row', backgroundColor: colors.surfaceElevated, borderRadius: radii.md, padding: 4, gap: 4 },
  tab: { flex: 1, paddingVertical: spacing.xs, borderRadius: radii.sm, alignItems: 'center' },
  tabActive: { backgroundColor: colors.brandSoft },
  tabText: { ...typography.label, color: colors.textSecondary },
  tabTextActive: { color: colors.brand },
  metricRow: { flexDirection: 'row', gap: spacing.xs },
  metricPill: { paddingHorizontal: spacing.sm, paddingVertical: 6, borderRadius: radii.pill, borderWidth: 1, borderColor: colors.outline },
  metricPillActive: { backgroundColor: colors.brandSoft, borderColor: 'rgba(56,230,138,0.35)' },
  metricPillText: { ...typography.caption, color: colors.textSecondary },
  metricPillTextActive: { color: colors.brand, fontWeight: '700' },
  centeredCard: { alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.xl },
  listCard: { gap: 0, padding: 0, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm, paddingHorizontal: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.outline },
  rowSelf: { backgroundColor: colors.brandSoft },
  rowRank: { ...typography.label, color: colors.textSecondary, width: 34 },
  rowIdentity: { flex: 1 },
  rowHandle: { ...typography.h3, color: colors.textPrimary },
  rowSubHandle: { ...typography.caption, color: colors.textSecondary },
  rowScore: { ...typography.h3, color: colors.textPrimary, fontVariant: ['tabular-nums'] },
  rowSelfText: { color: colors.brand },
  emptyText: { ...typography.body, color: colors.textSecondary },
  inviteCard: { gap: spacing.sm },
  cardLabel: { ...typography.label, color: colors.textSecondary },
  cardBody: { ...typography.body, color: colors.textSecondary },
  inviteRow: { flexDirection: 'row', gap: spacing.xs, alignItems: 'center' },
  inviteInput: { flex: 1, borderWidth: 1, borderColor: colors.outline, borderRadius: radii.md, paddingHorizontal: spacing.sm, paddingVertical: spacing.sm, color: colors.textPrimary, ...typography.body },
  error: { ...typography.caption, color: colors.danger },
  followingList: { gap: spacing.xs, marginTop: spacing.xs },
  followingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  followingHandle: { ...typography.body, color: colors.textPrimary },
  unfollowText: { ...typography.label, color: colors.danger },
});
