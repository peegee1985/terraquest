/**
 * Pure, dependency-free rules for username (handle) changes — same
 * convention as xpLedgerRules.ts/questRules.ts/achievementRules.ts.
 *
 * Regular players get one handle change ever (lifetime cap). VIP players
 * get up to two per rolling 365-day window (not a lifetime cap — the
 * window resets naturally as old timestamps age out, no cron/reset job
 * needed). Guests are rejected entirely by the caller (handle.ts checks
 * user.isAnonymous before this ever runs) since a guest handle is a
 * throwaway per-install identifier, not something worth rate-limiting.
 */

export const REGULAR_LIFETIME_HANDLE_CHANGES = 1;
export const VIP_YEARLY_HANDLE_CHANGES = 2;
export const HANDLE_CHANGE_WINDOW_MS = 365 * 24 * 60 * 60 * 1000;

export function canChangeHandle(isVip: boolean, changeTimestamps: readonly number[], now: number): boolean {
  if (isVip) {
    const recentCount = changeTimestamps.filter((timestamp) => now - timestamp < HANDLE_CHANGE_WINDOW_MS).length;
    return recentCount < VIP_YEARLY_HANDLE_CHANGES;
  }
  return changeTimestamps.length < REGULAR_LIFETIME_HANDLE_CHANGES;
}

// 3-20 chars, letters/digits/underscore — a plain, permissive username
// format rather than anything TerraQuest-specific.
const HANDLE_PATTERN = /^[a-zA-Z0-9_]{3,20}$/;

export function isValidHandleFormat(handle: string): boolean {
  return HANDLE_PATTERN.test(handle);
}

export function normalizeHandle(handle: string): string {
  return handle.trim().toLowerCase();
}
