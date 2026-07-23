import { describe, expect, it } from 'vitest';

import {
  generatePromoCode,
  isValidPromoCodeFormat,
  normalizePromoCode,
  promoCodeRejectionReason,
} from '../convex/promoCodeRules';

describe('normalizePromoCode', () => {
  it('trims and uppercases', () => {
    expect(normalizePromoCode('  abc123  ')).toBe('ABC123');
  });
});

describe('isValidPromoCodeFormat', () => {
  it('accepts 4-16 uppercase alphanumeric characters', () => {
    expect(isValidPromoCodeFormat('ABCD')).toBe(true);
    expect(isValidPromoCodeFormat('ABCDEFGHJKMNPQRS')).toBe(true);
  });

  it('rejects too short, too long, or lowercase/symbol input', () => {
    expect(isValidPromoCodeFormat('ABC')).toBe(false);
    expect(isValidPromoCodeFormat('ABCDEFGHJKMNPQRST')).toBe(false);
    expect(isValidPromoCodeFormat('abcd1234')).toBe(false);
    expect(isValidPromoCodeFormat('ABCD-123')).toBe(false);
  });
});

describe('generatePromoCode', () => {
  it('produces an 8-character code using only the unambiguous alphabet', () => {
    const code = generatePromoCode(new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7]));
    expect(code).toHaveLength(8);
    expect(isValidPromoCodeFormat(code)).toBe(true);
    expect(code).not.toMatch(/[01ILO]/);
  });

  it('is deterministic given the same random bytes', () => {
    const bytes = new Uint8Array([10, 20, 30, 40, 50, 60, 70, 80]);
    expect(generatePromoCode(bytes)).toBe(generatePromoCode(bytes));
  });
});

describe('promoCodeRejectionReason', () => {
  const baseCode = { active: true, redemptionsCount: 0 };

  it('returns null for a fully redeemable code', () => {
    expect(promoCodeRejectionReason(baseCode, 1000)).toBeNull();
  });

  it('flags an inactive code first, even if also expired/exhausted', () => {
    expect(
      promoCodeRejectionReason({ ...baseCode, active: false, expiresAt: 500, maxRedemptions: 0 }, 1000),
    ).toBe('inactive');
  });

  it('flags an expired code', () => {
    expect(promoCodeRejectionReason({ ...baseCode, expiresAt: 500 }, 1000)).toBe('expired');
    expect(promoCodeRejectionReason({ ...baseCode, expiresAt: 1000 }, 1000)).toBe('expired');
    expect(promoCodeRejectionReason({ ...baseCode, expiresAt: 1001 }, 1000)).toBeNull();
  });

  it('flags a code that hit its redemption limit', () => {
    expect(promoCodeRejectionReason({ ...baseCode, maxRedemptions: 5, redemptionsCount: 5 }, 1000)).toBe(
      'redemption_limit_reached',
    );
    expect(promoCodeRejectionReason({ ...baseCode, maxRedemptions: 5, redemptionsCount: 4 }, 1000)).toBeNull();
  });
});
