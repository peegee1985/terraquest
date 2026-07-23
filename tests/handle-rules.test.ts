import { describe, expect, it } from 'vitest';

import {
  canChangeHandle,
  HANDLE_CHANGE_WINDOW_MS,
  isValidHandleFormat,
  normalizeHandle,
  REGULAR_LIFETIME_HANDLE_CHANGES,
  VIP_YEARLY_HANDLE_CHANGES,
} from '../convex/handleRules';

describe('canChangeHandle', () => {
  it('allows a regular player exactly one lifetime change', () => {
    expect(canChangeHandle(false, [], 1000)).toBe(true);
    expect(canChangeHandle(false, [500], 1000)).toBe(false);
  });

  it('regular players never regain a change no matter how old the prior one is', () => {
    const longAgo = 0;
    const now = HANDLE_CHANGE_WINDOW_MS * 10;
    expect(canChangeHandle(false, [longAgo], now)).toBe(false);
  });

  it('allows a VIP player up to two changes within the rolling year', () => {
    const now = 10_000_000;
    expect(canChangeHandle(true, [], now)).toBe(true);
    expect(canChangeHandle(true, [now - 1000], now)).toBe(true);
    expect(canChangeHandle(true, [now - 1000, now - 2000], now)).toBe(false);
  });

  it('lets a VIP change again once an old change ages out of the rolling window', () => {
    const now = HANDLE_CHANGE_WINDOW_MS * 2;
    const justOutsideWindow = now - HANDLE_CHANGE_WINDOW_MS - 1;
    const withinWindow = now - 1000;
    expect(canChangeHandle(true, [justOutsideWindow, withinWindow], now)).toBe(true);
  });

  it('constants match the documented limits', () => {
    expect(REGULAR_LIFETIME_HANDLE_CHANGES).toBe(1);
    expect(VIP_YEARLY_HANDLE_CHANGES).toBe(2);
  });
});

describe('isValidHandleFormat', () => {
  it('accepts 3-20 char alphanumeric/underscore handles', () => {
    expect(isValidHandleFormat('abc')).toBe(true);
    expect(isValidHandleFormat('Petr_Gottstein_123')).toBe(true);
    expect(isValidHandleFormat('a'.repeat(20))).toBe(true);
  });

  it('rejects too short, too long, or invalid-character handles', () => {
    expect(isValidHandleFormat('ab')).toBe(false);
    expect(isValidHandleFormat('a'.repeat(21))).toBe(false);
    expect(isValidHandleFormat('has space')).toBe(false);
    expect(isValidHandleFormat('has-dash')).toBe(false);
    expect(isValidHandleFormat('emoji😀')).toBe(false);
  });
});

describe('normalizeHandle', () => {
  it('lowercases and trims', () => {
    expect(normalizeHandle('  Petr_Gottstein  ')).toBe('petr_gottstein');
  });
});
