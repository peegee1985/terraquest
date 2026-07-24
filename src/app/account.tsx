import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Card, Eyebrow, PrimaryButton, Screen } from '@/components/ui/primitives';
import { useAuthActions, useAuthIdentity, useConvexAuth } from '@/state/auth-context';
import { useChangeHandle, useCheckHandleAvailability, useMyHandleChangeStatus } from '@/state/handle-client';
import { colors, radii, spacing, typography } from '@/theme/tokens';

type Mode = 'signUp' | 'signIn';

const HANDLE_CHANGE_ERROR_COPY: Record<string, string> = {
  guests_cannot_change_handle: 'Hosté nemohou měnit uživatelské jméno.',
  invalid_format: 'Jméno smí mít 3-20 znaků: písmena, čísla, podtržítko.',
  same_handle: 'To je tvé současné jméno.',
  taken: 'Toto jméno už je obsazené.',
  limit_reached: 'Vyčerpal/a jsi počet dostupných změn jména.',
};

function UsernameCard() {
  const status = useMyHandleChangeStatus();
  const changeHandle = useChangeHandle();
  const [draft, setDraft] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const availability = useCheckHandleAvailability(draft.trim());

  if (!status || status.isGuest) return null;
  const changesLeft = Math.max(0, status.changesAllowed - status.changesUsedInWindow);
  if (changesLeft === 0) {
    return (
      <Card style={styles.formCard}>
        <Text style={styles.cardLabel}>Uživatelské jméno</Text>
        <Text style={styles.cardBody}>Vyčerpal/a jsi počet dostupných změn jména.</Text>
      </Card>
    );
  }

  return (
    <Card style={styles.formCard}>
      <Text style={styles.cardLabel}>Uživatelské jméno</Text>
      <Text style={styles.cardBody}>Zbývá {changesLeft} {changesLeft === 1 ? 'změna' : 'změny'}.</Text>
      <TextInput
        autoCapitalize="none"
        onChangeText={(value) => {
          setDraft(value);
          setError(null);
          setSuccess(false);
        }}
        placeholder="Nové jméno"
        placeholderTextColor={colors.textDisabled}
        style={styles.input}
        value={draft}
      />
      {draft.trim().length > 0 && availability && !availability.available ? (
        <Text style={styles.error}>{availability.validFormat ? 'Toto jméno už je obsazené.' : 'Jméno smí mít 3-20 znaků: písmena, čísla, podtržítko.'}</Text>
      ) : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {success ? <Text style={styles.success}>Jméno bylo změněno.</Text> : null}
      <PrimaryButton
        label={submitting ? 'Ukládám...' : 'Uložit jméno'}
        onPress={async () => {
          setSubmitting(true);
          setError(null);
          const result = await changeHandle({ newHandle: draft.trim() }).catch(() => null);
          setSubmitting(false);
          if (!result) {
            setError('Něco se pokazilo. Zkus to prosím znovu.');
            return;
          }
          if (result.ok) {
            setSuccess(true);
            setDraft('');
          } else {
            setError(HANDLE_CHANGE_ERROR_COPY[result.reason] ?? 'Něco se pokazilo.');
          }
        }}
        tone="surface"
      />
    </Card>
  );
}

export default function AccountScreen() {
  const router = useRouter();
  const { isLoading, isAuthenticated } = useConvexAuth();
  const identity = useAuthIdentity();
  const { signIn, signOut } = useAuthActions();

  const [mode, setMode] = useState<Mode>('signUp');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isGuest = isAuthenticated && (identity?.isAnonymous ?? true) && !identity?.email;

  const submitEmailPassword = async () => {
    setError(null);
    if (!email.trim() || password.length < 8) {
      setError('Zadej e-mail a heslo (alespoň 8 znaků).');
      return;
    }
    setSubmitting(true);
    try {
      await signIn('password', { email: email.trim(), password, flow: mode });
    } catch (submitError) {
      setError(
        mode === 'signUp'
          ? 'Vytvoření účtu se nepovedlo. E-mail může být už použitý.'
          : 'Přihlášení se nepovedlo. Zkontroluj e-mail a heslo.',
      );
      console.warn('TerraQuest: password sign-in failed', submitError);
    } finally {
      setSubmitting(false);
    }
  };

  const continueWithGoogle = async () => {
    setError(null);
    try {
      const redirectTo = Linking.createURL('/');
      const { redirect } = await signIn('google', { redirectTo });
      if (!redirect) return;
      const result = await WebBrowser.openAuthSessionAsync(redirect.toString(), redirectTo);
      if (result.type === 'success' && result.url) {
        const { queryParams } = Linking.parse(result.url);
        const code = queryParams?.code;
        if (typeof code === 'string') {
          await signIn('google', { code });
        } else {
          // Google's redirect came back without a usable code (e.g. it
          // carried an error param instead) — this used to fail silently,
          // leaving the guest screen up with zero feedback.
          setError('Přihlášení přes Google se nedokončilo. Zkus to prosím znovu.');
        }
      } else if (result.type !== 'cancel' && result.type !== 'dismiss') {
        // A genuine failure of the browser session itself (not the user
        // backing out) — same silent-failure gap as above.
        setError('Přihlášení přes Google se nedokončilo. Zkus to prosím znovu.');
      }
    } catch (googleError) {
      setError('Přihlášení přes Google zatím není nastavené (chybí OAuth klient).');
      console.warn('TerraQuest: Google sign-in failed', googleError);
    }
  };

  return (
    <Screen>
      <Pressable accessibilityLabel="Zpět" accessibilityRole="button" onPress={() => router.back()} style={styles.back}>
        <MaterialCommunityIcons color={colors.brand} name="chevron-left" size={24} />
        <Text style={styles.backText}>Zpět</Text>
      </Pressable>
      <Eyebrow>Účet</Eyebrow>
      <Text style={styles.title}>{isGuest ? 'Hraješ jako host' : 'Tvůj účet'}</Text>
      <Text style={styles.body}>
        {isGuest
          ? 'Progres se ukládá na tomto zařízení i na serveru. Založ si účet, ať o něj nepřijdeš při přeinstalaci nebo výměně telefonu.'
          : 'Účet je propojený s e-mailem níže. Progres z doby, kdy jsi hrál/a jako host, zůstal zachovaný.'}
      </Text>

      {isLoading ? (
        <Card style={styles.centeredCard}>
          <ActivityIndicator color={colors.brand} />
        </Card>
      ) : isGuest ? (
        <Card style={styles.formCard}>
          <View style={styles.modeSwitch}>
            <Pressable
              accessibilityRole="button"
              onPress={() => setMode('signUp')}
              style={[styles.modeTab, mode === 'signUp' && styles.modeTabActive]}
            >
              <Text style={[styles.modeTabText, mode === 'signUp' && styles.modeTabTextActive]}>Založit účet</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => setMode('signIn')}
              style={[styles.modeTab, mode === 'signIn' && styles.modeTabActive]}
            >
              <Text style={[styles.modeTabText, mode === 'signIn' && styles.modeTabTextActive]}>Mám už účet</Text>
            </Pressable>
          </View>

          <TextInput
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            onChangeText={setEmail}
            placeholder="E-mail"
            placeholderTextColor={colors.textDisabled}
            style={styles.input}
            value={email}
          />
          <TextInput
            autoCapitalize="none"
            autoComplete="password"
            onChangeText={setPassword}
            placeholder="Heslo (alespoň 8 znaků)"
            placeholderTextColor={colors.textDisabled}
            secureTextEntry
            style={styles.input}
            value={password}
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}

          <PrimaryButton
            icon={mode === 'signUp' ? 'account-plus-outline' : 'login'}
            label={submitting ? 'Chvilku...' : mode === 'signUp' ? 'Založit účet' : 'Přihlásit se'}
            onPress={submitEmailPassword}
          />
          <PrimaryButton icon="google" label="Pokračovat přes Google" onPress={continueWithGoogle} tone="surface" />
        </Card>
      ) : (
        <>
          <Card style={styles.formCard}>
            <Text style={styles.cardLabel}>Přihlášen/a jako</Text>
            <Text style={styles.cardValue}>{identity?.email ?? identity?.name ?? identity?.handle ?? '—'}</Text>
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <PrimaryButton icon="logout" label="Odhlásit se" onPress={() => void signOut()} tone="danger" />
          </Card>
          <UsernameCard />
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  back: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', marginLeft: -spacing.xs },
  backText: { ...typography.label, color: colors.brand },
  title: { ...typography.display, color: colors.textPrimary },
  body: { ...typography.body, color: colors.textSecondary },
  centeredCard: { alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.xl },
  formCard: { gap: spacing.sm },
  modeSwitch: { flexDirection: 'row', backgroundColor: colors.surfaceElevated, borderRadius: radii.md, padding: 4, gap: 4 },
  modeTab: { flex: 1, paddingVertical: spacing.xs, borderRadius: radii.sm, alignItems: 'center' },
  modeTabActive: { backgroundColor: colors.brandSoft },
  modeTabText: { ...typography.label, color: colors.textSecondary },
  modeTabTextActive: { color: colors.brand },
  input: {
    borderWidth: 1,
    borderColor: colors.outline,
    borderRadius: radii.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    color: colors.textPrimary,
    ...typography.body,
  },
  error: { ...typography.caption, color: colors.danger },
  success: { ...typography.caption, color: colors.brand },
  cardLabel: { ...typography.label, color: colors.textSecondary },
  cardValue: { ...typography.h3, color: colors.textPrimary },
  cardBody: { ...typography.caption, color: colors.textSecondary },
});
