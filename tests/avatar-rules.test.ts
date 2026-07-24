import { describe, expect, it } from 'vitest';

import { canChangeAvatar, REGULAR_LIFETIME_AVATAR_CHANGES } from '../convex/avatarRules';

describe('canChangeAvatar', () => {
  it('allows a regular player exactly one lifetime change', () => {
    expect(canChangeAvatar(false, 0)).toBe(true);
    expect(canChangeAvatar(false, 1)).toBe(false);
  });

  it('regular players never regain a change no matter how many they have used', () => {
    expect(canChangeAvatar(false, 5)).toBe(false);
  });

  it('VIP players have no limit at all', () => {
    expect(canChangeAvatar(true, 0)).toBe(true);
    expect(canChangeAvatar(true, 1)).toBe(true);
    expect(canChangeAvatar(true, 1000)).toBe(true);
  });

  it('constant matches the documented limit', () => {
    expect(REGULAR_LIFETIME_AVATAR_CHANGES).toBe(1);
  });
});
