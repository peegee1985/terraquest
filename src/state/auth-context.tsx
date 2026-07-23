import { ConvexAuthProvider, useAuthActions, useAuthToken, useConvexAuth } from '@convex-dev/auth/react';
import { ConvexReactClient } from 'convex/react';
import * as SecureStore from 'expo-secure-store';
import { jwtDecode } from 'jwt-decode';
import { ReactNode, useEffect, useRef } from 'react';

// expo-secure-store implements the (getItem/setItem/removeItem) shape Convex
// Auth expects for React Native token storage.
const secureStorage = {
  getItem: SecureStore.getItemAsync,
  setItem: SecureStore.setItemAsync,
  removeItem: SecureStore.deleteItemAsync,
};

export function AuthProvider({ client, children }: { client: ConvexReactClient; children: ReactNode }) {
  return (
    <ConvexAuthProvider client={client} storage={secureStorage}>
      <AutoGuestSignIn />
      {children}
    </ConvexAuthProvider>
  );
}

/**
 * Bootstraps a guest session whenever the app is unauthenticated — on first
 * launch (required for the SQLite <-> Convex sync path landing in TQ-19+),
 * but also after an explicit sign-out. `inFlight` only guards against firing
 * twice concurrently for the same unauthenticated state; it is NOT a
 * one-shot latch, since that previously left a signed-out device stuck with
 * `isAuthenticated: false` forever (no automatic re-arm, and no sign-in form
 * reachable from account.tsx's `isGuest` check, which itself requires
 * `isAuthenticated`) until the process was killed and relaunched.
 */
function AutoGuestSignIn() {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const { signIn } = useAuthActions();
  const inFlight = useRef(false);

  useEffect(() => {
    if (isLoading || isAuthenticated || inFlight.current) return;
    inFlight.current = true;
    signIn('anonymous')
      .catch((error: unknown) => {
        console.warn('TerraQuest: automatic guest sign-in failed', error);
      })
      .finally(() => {
        inFlight.current = false;
      });
  }, [isLoading, isAuthenticated, signIn]);

  return null;
}

export type AuthIdentityClaims = {
  isAnonymous?: boolean;
  email?: string;
  name?: string;
  handle?: string;
};

/** Decodes the custom claims (see convex/auth.ts `jwt.customClaims`) from the current session token. */
export function useAuthIdentity(): AuthIdentityClaims | null {
  const token = useAuthToken();
  if (!token) return null;
  try {
    return jwtDecode<AuthIdentityClaims>(token);
  } catch (error) {
    console.warn('TerraQuest: failed to decode auth token', error);
    return null;
  }
}

export { useAuthActions, useConvexAuth };
