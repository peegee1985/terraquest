// Pure helpers for building the TerraQuest-specific profile fields that
// @convex-dev/auth doesn't know about (handle, avatarId, locale, ...).
// Kept dependency-free so it can be unit tested without a Convex deployment.

const GUEST_HANDLE_PREFIX = 'guest-';
const DEFAULT_AVATAR_ID = 'default';
const DEFAULT_LOCALE = 'cs';
const DEFAULT_TIMEZONE = 'Europe/Prague';
const DEFAULT_CONSENT_VERSION = '1.0';

export type NewUserProfileFields = {
  handle: string;
  avatarId: string;
  locale: string;
  timezone: string;
  status: 'active';
  consentVersion: string;
  createdAt: number;
  updatedAt: number;
};

/** Generates a short, URL-safe, reasonably unique handle for a fresh guest user. */
export function generateGuestHandle(randomId: string): string {
  const suffix = randomId.replace(/[^a-z0-9]/gi, '').slice(0, 12).toLowerCase() || Date.now().toString(36);
  return `${GUEST_HANDLE_PREFIX}${suffix}`;
}

/** Default TerraQuest profile fields applied to every brand-new user document. */
export function defaultNewUserProfileFields(now: number, randomId: string): NewUserProfileFields {
  return {
    handle: generateGuestHandle(randomId),
    avatarId: DEFAULT_AVATAR_ID,
    locale: DEFAULT_LOCALE,
    timezone: DEFAULT_TIMEZONE,
    status: 'active',
    consentVersion: DEFAULT_CONSENT_VERSION,
    createdAt: now,
    updatedAt: now,
  };
}
