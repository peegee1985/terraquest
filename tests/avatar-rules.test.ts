import { describe, expect, it } from 'vitest';

import {
  AVATAR_CHANGE_WINDOW_MS,
  canChangeAvatar,
  REGULAR_LIFETIME_AVATAR_CHANGES,
  VIP_YEARLY_AVATAR_CHANGES,
} from '../convex/avatarRules';

describe('canChangeAvatar', () => {
  it('allows a regular player exactly one lifetime change', () => {
    expect(canChangeAvatar(false, [], 1000)).toBe(true);
    expect(canChangeAvatar(false, [500], 1000)).toBe(false);
  });

  it('regular players never regain a change no matter how old the prior one is', () => {
    const longAgo = 0;
    const now = AVATAR_CHANGE_WINDOW_MS * 10;
    expect(canChangeAvatar(false, [longAgo], now)).toBe(false);
  });

  it('allows a VIP player up to two changes within the rolling year', () => {
    const now = 10_000_000;
    expect(canChangeAvatar(true, [], now)).toBe(true);
    expect(canChangeAvatar(true, [now - 1000], now)).toBe(true);
    expect(canChangeAvatar(true, [now - 1000, now - 2000], now)).toBe(false);
  });

  it('lets a VIP change again once an old change ages out of the rolling window', () => {
    const now = AVATAR_CHANGE_WINDOW_MS * 2;
    const justOutsideWindow = now - AVATAR_CHANGE_WINDOW_MS - 1;
    const withinWindow = now - 1000;
    expect(canChangeAvatar(true, [justOutsideWindow, withinWindow], now)).toBe(true);
  });

  it('constants match the documented limits', () => {
    expect(REGULAR_LIFETIME_AVATAR_CHANGES).toBe(1);
    expect(VIP_YEARLY_AVATAR_CHANGES).toBe(2);
  });
});
