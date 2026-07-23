// Pure rules shared by discount codes and invite codes (admin.ts) — kept
// framework-free so it's testable without a Convex test harness, same
// convention as questRules.ts/achievementRules.ts/handleRules.ts.

// Excludes visually-ambiguous characters (0/O, 1/I/L) so a code read aloud
// or hand-typed from a screenshot doesn't misfire.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 8;

export function normalizePromoCode(input: string): string {
  return input.trim().toUpperCase();
}

export function isValidPromoCodeFormat(code: string): boolean {
  return /^[A-Z0-9]{4,16}$/.test(code);
}

/** Pass in a random-byte source so callers can use crypto.getRandomValues (Convex actions/mutations) without this module importing a runtime-specific API. */
export function generatePromoCode(randomBytes: Uint8Array): string {
  let result = '';
  for (let i = 0; i < CODE_LENGTH; i += 1) {
    result += CODE_ALPHABET[randomBytes[i] % CODE_ALPHABET.length];
  }
  return result;
}

export type PromoCodeRow = {
  active: boolean;
  maxRedemptions?: number;
  redemptionsCount: number;
  expiresAt?: number;
};

export type PromoCodeRejectionReason = 'inactive' | 'expired' | 'redemption_limit_reached';

/** Returns null when redeemable, otherwise the reason it's rejected — checked in this priority order since an expired+exhausted code should still report the more actionable "expired" first. */
export function promoCodeRejectionReason(code: PromoCodeRow, now: number): PromoCodeRejectionReason | null {
  if (!code.active) return 'inactive';
  if (code.expiresAt !== undefined && now >= code.expiresAt) return 'expired';
  if (code.maxRedemptions !== undefined && code.redemptionsCount >= code.maxRedemptions) return 'redemption_limit_reached';
  return null;
}
