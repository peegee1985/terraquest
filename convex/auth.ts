import Google from '@auth/core/providers/google';
import { convexAuth, getAuthUserId } from '@convex-dev/auth/server';
import { Anonymous } from '@convex-dev/auth/providers/Anonymous';
import { Password } from '@convex-dev/auth/providers/Password';

import { defaultNewUserProfileFields } from './authProfile';

// TQ-18: guest browsing (Anonymous) + email/password, with Google wired up
// pending real OAuth client credentials. Sign-in with "google" will fail
// until AUTH_GOOGLE_ID/AUTH_GOOGLE_SECRET are set on the Convex deployment
// (see .github/workflows/convex-auth-keys.yml and the TQ-18 Notion notes).
export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    Anonymous,
    Password,
    Google({
      clientId: process.env.AUTH_GOOGLE_ID ?? '',
      clientSecret: process.env.AUTH_GOOGLE_SECRET ?? '',
    }),
  ],
  callbacks: {
    // Convex Auth's default `createOrUpdateUser` links a new credential to an
    // existing user only via a *verified* email/phone match. That default
    // would create a brand-new user for every "upgrade guest to real
    // account" sign-up, discarding all of the anonymous user's server-side
    // progress. This callback instead detects "the sign-in flow was started
    // from an active anonymous guest session and is adding a first real
    // credential" and reuses that same user document in place.
    async createOrUpdateUser(ctx, args) {
      const identityFields = authIdentityFields(args.profile);

      // Signing in again via a credential that's already linked to a user
      // (returning user, password sign-in, repeated OAuth sign-in, ...):
      // keep using that same user and just refresh identity fields.
      if (args.existingUserId !== null) {
        await ctx.db.patch(args.existingUserId, identityFields);
        return args.existingUserId;
      }

      // No existing account for this credential yet. If the sign-in flow
      // was started from an active anonymous guest session, this is an
      // "upgrade" (e.g. guest adds an email/password or Google account)
      // rather than a fresh sign-up: attach the new credential's identity
      // fields to the SAME user document so local/server progress tied to
      // that user ID carries over untouched, and flip `isAnonymous` off.
      //
      // `existingSessionId` (patches/@convex-dev+auth+0.0.94.patch forwards
      // it to this callback) is the only reliable way to find that guest
      // session for OAuth providers: the OAuth linking step runs from
      // Google's HTTP redirect callback, which carries no bearer token at
      // all, so `getAuthUserId(ctx)` always returns null there even when a
      // guest session genuinely started the flow — that gap meant Google
      // sign-in could never actually recover a guest's prior progress.
      // `getAuthUserId(ctx)` is kept as a fallback for any provider that
      // (unlike OAuth) does run this callback from the original
      // authenticated client call.
      const currentUserId: any = args.existingSessionId
        ? ((await ctx.db.get(args.existingSessionId)) as any)?.userId ?? null
        : await getAuthUserId(ctx);
      if (currentUserId !== null) {
        const currentUser = await ctx.db.get(currentUserId);
        if (currentUser !== null && currentUser.isAnonymous) {
          await ctx.db.patch(currentUserId, {
            ...identityFields,
            isAnonymous: false,
            updatedAt: Date.now(),
          });
          return currentUserId;
        }
      }

      // Genuinely brand-new user (first-ever anonymous session, or a
      // sign-up with no active anonymous session to upgrade).
      const now = Date.now();
      return await ctx.db.insert('users', {
        ...identityFields,
        isAnonymous: args.profile.isAnonymous === true,
        ...defaultNewUserProfileFields(now, crypto.randomUUID()),
      });
    },
  },
  jwt: {
    // Exposed to the client via useAuthToken() so the app can show
    // guest-vs-registered status without needing a Convex query (this
    // sandbox has no live deployment to run `convex codegen` against yet).
    customClaims: async (ctx, { userId }) => {
      const user = await ctx.db.get(userId);
      return {
        isAnonymous: user?.isAnonymous ?? false,
        email: user?.email,
        name: user?.name,
        handle: user?.handle,
      };
    },
  },
});

function authIdentityFields(profile: Record<string, unknown> & {
  email?: string;
  phone?: string;
  emailVerified?: boolean;
  phoneVerified?: boolean;
}) {
  const { emailVerified, phoneVerified, isAnonymous: _isAnonymous, ...rest } = profile;
  return {
    ...rest,
    ...(emailVerified ? { emailVerificationTime: Date.now() } : {}),
    ...(phoneVerified ? { phoneVerificationTime: Date.now() } : {}),
  };
}
