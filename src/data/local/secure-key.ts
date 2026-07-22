import { bytesToBase64 } from './crypto';
import type { SecureKeyStore } from './types';

export const MASTER_KEY_STORAGE_KEY = 'terraquest.local.masterKey.v1';
const MASTER_KEY_BYTES = 32;

export type SecureKeyStoreDeps = {
  getItemAsync: (key: string) => Promise<string | null>;
  setItemAsync: (key: string, value: string) => Promise<void>;
  randomBytes: (length: number) => Promise<Uint8Array>;
};

/**
 * Wraps whatever secure key/value store the runtime provides (expo-secure-store
 * on device, an in-memory fake in tests) behind one interface: fetch the
 * master key if it exists, otherwise generate and persist a fresh one.
 * The master key itself never touches SQLite — only its derived subkeys
 * (see crypto.ts) ever encrypt data, and those subkeys are never stored.
 */
export function createSecureKeyStore(deps: SecureKeyStoreDeps): SecureKeyStore {
  return {
    async getOrCreateMasterKey(): Promise<string> {
      const existing = await deps.getItemAsync(MASTER_KEY_STORAGE_KEY);
      if (existing) return existing;

      const bytes = await deps.randomBytes(MASTER_KEY_BYTES);
      const masterKeyBase64 = bytesToBase64(bytes);
      await deps.setItemAsync(MASTER_KEY_STORAGE_KEY, masterKeyBase64);
      return masterKeyBase64;
    },
  };
}
