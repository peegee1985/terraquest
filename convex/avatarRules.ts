/**
 * Pure, dependency-free rule for avatar/photo changes. VIP gets unlimited
 * changes — unlike the handle/username change (handleRules.ts), which stays
 * rate-limited for everyone including VIP, cosmetic avatar swaps aren't
 * worth gating once a player is paying for the account, so there's no
 * rolling window to track here at all. Regular (non-VIP) players still get
 * exactly one change ever, same lifetime cap as before.
 *
 * Guests are rejected entirely by the caller (avatar.ts checks
 * user.isAnonymous before this ever runs) — same precedent as handle
 * changes, since a guest's cosmetic choices aren't worth rate-limiting.
 */

export const REGULAR_LIFETIME_AVATAR_CHANGES = 1;

export function canChangeAvatar(isVip: boolean, changeCount: number): boolean {
  if (isVip) return true;
  return changeCount < REGULAR_LIFETIME_AVATAR_CHANGES;
}
