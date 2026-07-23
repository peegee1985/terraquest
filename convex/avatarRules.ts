/**
 * Pure, dependency-free rules for avatar/photo changes — same shape as
 * handleRules.ts's change-limit logic (regular players get one change
 * ever, VIP get up to two per rolling year), kept as its own small module
 * rather than importing handleRules.ts's function under a confusing name:
 * "three similar lines" is cheaper here than a shared abstraction two
 * unrelated features would have to agree on forever.
 *
 * Guests are rejected entirely by the caller (avatar.ts checks
 * user.isAnonymous before this ever runs) — same precedent as handle
 * changes, since a guest's cosmetic choices aren't worth rate-limiting.
 */

export const REGULAR_LIFETIME_AVATAR_CHANGES = 1;
export const VIP_YEARLY_AVATAR_CHANGES = 2;
export const AVATAR_CHANGE_WINDOW_MS = 365 * 24 * 60 * 60 * 1000;

export function canChangeAvatar(isVip: boolean, changeTimestamps: readonly number[], now: number): boolean {
  if (isVip) {
    const recentCount = changeTimestamps.filter((timestamp) => now - timestamp < AVATAR_CHANGE_WINDOW_MS).length;
    return recentCount < VIP_YEARLY_AVATAR_CHANGES;
  }
  return changeTimestamps.length < REGULAR_LIFETIME_AVATAR_CHANGES;
}
