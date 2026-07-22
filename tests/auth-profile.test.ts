import { describe, expect, it } from 'vitest';

import { defaultNewUserProfileFields, generateGuestHandle } from '../convex/authProfile';

describe('generateGuestHandle (TQ-18)', () => {
  it('produces a lowercase, URL-safe handle prefixed with guest-', () => {
    const handle = generateGuestHandle('9C1A-B2D3-EF45-6789');
    expect(handle).toMatch(/^guest-[a-z0-9]{1,12}$/);
  });

  it('is deterministic for the same random id', () => {
    expect(generateGuestHandle('abc123')).toBe(generateGuestHandle('abc123'));
  });

  it('produces different handles for different random ids', () => {
    expect(generateGuestHandle('11111111-1111')).not.toBe(generateGuestHandle('22222222-2222'));
  });

  it('falls back to a timestamp-derived suffix if the id has no alphanumeric characters', () => {
    const handle = generateGuestHandle('----');
    expect(handle).toMatch(/^guest-[a-z0-9]+$/);
  });
});

describe('defaultNewUserProfileFields (TQ-18)', () => {
  it('fills every required app profile field', () => {
    const fields = defaultNewUserProfileFields(1_700_000_000_000, 'random-uuid-value');
    expect(fields).toEqual({
      handle: generateGuestHandle('random-uuid-value'),
      avatarId: 'default',
      locale: 'cs',
      timezone: 'Europe/Prague',
      status: 'active',
      consentVersion: '1.0',
      createdAt: 1_700_000_000_000,
      updatedAt: 1_700_000_000_000,
    });
  });
});
