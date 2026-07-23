import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Card, Eyebrow, PrimaryButton, Screen } from '@/components/ui/primitives';
import { BASE_DAILY_BONUS_XP, dailyBonusXp } from '@/domain/daily-bonus';
import { convex } from '@/state/convex-client';
import { useMyProfile } from '@/state/profile-client';
import { useRedeemDiscountCode, type RedeemCodeReason } from '@/state/promo-code-client';
import { colors, radii, spacing, typography } from '@/theme/tokens';

const MONTHLY_PRICE_CZK = 89;
const YEARLY_PRICE_CZK = 890;
const VIP_XP_MULTIPLIER = 1.5;

const REDEEM_ERROR_COPY: Record<RedeemCodeReason, string> = {
  invalid_format: 'Kód smí mít 4-16 znaků: písmena a čísla.',
  not_found: 'Tento kód neexistuje.',
  inactive: 'Tento kód už není aktivní.',
  expired: 'Platnost tohoto kódu vypršela.',
  redemption_limit_reached: 'Tento kód už byl vyčerpán.',
  already_redeemed: 'Tento kód jsi už uplatnil/a.',
};

const BENEFITS = [
  { icon: 'star-four-points' as const, label: `Denní bonus ${dailyBonusXp(VIP_XP_MULTIPLIER)} XP místo ${BASE_DAILY_BONUS_XP} XP` },
  { icon: 'lightning-bolt' as const, label: `XP multiplikátor ×${VIP_XP_MULTIPLIER} na všechny zisky` },
  { icon: 'circle-multiple' as const, label: 'Zlatý VIP odznak na mapě i ve statistikách' },
  { icon: 'account-edit-outline' as const, label: '2× ročně změna uživatelského jména i avatara (místo jednou na celý život)' },
];

function RedeemCodeCard() {
  const redeemCode = useRedeemDiscountCode();
  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  return (
    <Card style={styles.redeemCard}>
      <Text style={styles.cardTitle}>Máš kód?</Text>
      <Text style={styles.cardBody}>Platby zatím nejsou v aplikaci napojené — VIP se aktivuje kódem, který dostaneš po domluvě.</Text>
      <TextInput
        autoCapitalize="characters"
        onChangeText={(value) => {
          setCode(value);
          setError(null);
          setSuccess(false);
        }}
        placeholder="Zadej kód"
        placeholderTextColor={colors.textDisabled}
        style={styles.input}
        value={code}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {success ? <Text style={styles.success}>VIP aktivováno!</Text> : null}
      <PrimaryButton
        disabled={submitting || !code.trim()}
        label={submitting ? 'Uplatňuji...' : 'Uplatnit kód'}
        onPress={async () => {
          setSubmitting(true);
          setError(null);
          const result = await redeemCode({ code: code.trim(), now: Date.now() }).catch(() => null);
          setSubmitting(false);
          if (!result) {
            setError('Něco se pokazilo. Zkus to prosím znovu.');
            return;
          }
          if (result.ok) {
            setSuccess(true);
            setCode('');
          } else {
            setError(REDEEM_ERROR_COPY[result.reason]);
          }
        }}
        tone="surface"
      />
    </Card>
  );
}

function PricingContent() {
  const router = useRouter();
  const profile = useMyProfile();

  return (
    <Screen>
      <Pressable accessibilityLabel="Zpět" accessibilityRole="button" onPress={() => router.back()} style={styles.back}>
        <MaterialCommunityIcons color={colors.brand} name="chevron-left" size={24} />
        <Text style={styles.backText}>Zpět</Text>
      </Pressable>
      <Eyebrow>VIP</Eyebrow>
      <Text style={styles.title}>Staň se VIP</Text>

      {profile?.isVip ? (
        <Card style={styles.vipStatusCard}>
          <MaterialCommunityIcons color="#F5C542" name="crown" size={22} />
          <Text style={styles.vipStatusText}>
            Už jsi VIP{profile.planExpiresAt ? ` do ${new Date(profile.planExpiresAt).toLocaleDateString('cs-CZ')}` : ''}.
          </Text>
        </Card>
      ) : null}

      <View style={styles.planRow}>
        <Card style={styles.planCard}>
          <Text style={styles.planLabel}>Měsíčně</Text>
          <Text style={styles.planPrice}>{MONTHLY_PRICE_CZK} Kč</Text>
          <Text style={styles.planUnit}>/ měsíc</Text>
        </Card>
        <Card style={[styles.planCard, styles.planCardHighlight]}>
          <View style={styles.savingsTag}>
            <Text style={styles.savingsTagText}>2 měsíce zdarma</Text>
          </View>
          <Text style={styles.planLabel}>Ročně</Text>
          <Text style={styles.planPrice}>{YEARLY_PRICE_CZK} Kč</Text>
          <Text style={styles.planUnit}>/ rok</Text>
        </Card>
      </View>

      <Card style={styles.benefitsCard}>
        {BENEFITS.map((benefit) => (
          <View key={benefit.label} style={styles.benefitRow}>
            <MaterialCommunityIcons color="#F5C542" name={benefit.icon} size={20} />
            <Text style={styles.benefitText}>{benefit.label}</Text>
          </View>
        ))}
      </Card>

      <RedeemCodeCard />
    </Screen>
  );
}

export default function PricingScreen() {
  if (!convex) {
    return (
      <Screen>
        <Card>
          <Text style={styles.cardBody}>VIP vyžaduje připojení k serveru, které v tomto sestavení není nastavené.</Text>
        </Card>
      </Screen>
    );
  }
  return <PricingContent />;
}

const styles = StyleSheet.create({
  back: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', marginLeft: -spacing.xs },
  backText: { ...typography.label, color: colors.brand },
  title: { ...typography.display, color: colors.textPrimary },
  vipStatusCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, backgroundColor: 'rgba(245,197,66,0.1)', borderColor: '#F5C542' },
  vipStatusText: { ...typography.body, color: colors.textPrimary },
  planRow: { flexDirection: 'row', gap: spacing.sm },
  planCard: { flex: 1, alignItems: 'center', gap: 2, paddingVertical: spacing.md },
  planCardHighlight: { borderColor: '#F5C542' },
  savingsTag: { position: 'absolute', top: -10, backgroundColor: '#F5C542', borderRadius: radii.sm, paddingHorizontal: 8, paddingVertical: 2 },
  savingsTagText: { ...typography.caption, color: '#402f00', fontWeight: '700' },
  planLabel: { ...typography.label, color: colors.textSecondary },
  planPrice: { ...typography.display, fontSize: 28, color: colors.textPrimary },
  planUnit: { ...typography.caption, color: colors.textSecondary },
  benefitsCard: { gap: spacing.sm },
  benefitRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  benefitText: { ...typography.body, color: colors.textPrimary, flex: 1 },
  redeemCard: { gap: spacing.sm },
  cardTitle: { ...typography.h3, color: colors.textPrimary },
  cardBody: { ...typography.caption, color: colors.textSecondary },
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
});
