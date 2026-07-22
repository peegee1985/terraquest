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
 * Bootstraps a guest session on first launch so the app is always
 * authenticated (required for the SQLite <-> Convex sync path landing in
 * TQ-19+). Once a device has signed in — guest or upgraded — the token
 * persists in secure storage, so this never fires again on that device.
 */
function AutoGuestSignIn() {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const { signIn } = useAuthActions();
  const attempted = useRef(false);

  useEffect(() => {
    if (isLoading || isAuthenticated || attempted.current) return;
    attempted.current = true;
    signIn('anonymous').catch((error: unknown) => {
      attempted.current = false;
      console.warn('TerraQuest: automatic guest sign-in failed', error);
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
