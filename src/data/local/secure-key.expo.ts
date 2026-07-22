import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

import { createSecureKeyStore } from './secure-key';
import type { SecureKeyStore } from './types';

/**
 * Real runtime wiring: master key lives only in expo-secure-store, which is
 * backed by Android Keystore / iOS Keychain. Random bytes come from
 * expo-crypto's CSPRNG. Import this only from app code, never from tests —
 * both native modules require the Expo runtime.
 */
export function createExpoSecureKeyStore(): SecureKeyStore {
  return createSecureKeyStore({
    getItemAsync: (key) => SecureStore.getItemAsync(key),
    setItemAsync: (key, value) =>
      SecureStore.setItemAsync(key, value, {
        keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
      }),
    randomBytes: (length) => Crypto.getRandomBytesAsync(length),
  });
}
