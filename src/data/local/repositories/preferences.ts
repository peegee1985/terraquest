import type { LocalDb } from '../types';

/**
 * Small non-sensitive preferences only (map style, units, tracking mode...).
 * Anything sensitive — auth tokens, the encryption master key — belongs in
 * expo-secure-store (see secure-key.ts), never in this SQLite-backed table.
 */
export function createPreferencesRepository(db: LocalDb) {
  return {
    async set(key: string, value: string, now: number): Promise<void> {
      await db.run(
        `INSERT INTO local_user_preferences (key, value, updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at;`,
        [key, value, now],
      );
    },

    async get(key: string): Promise<string | null> {
      const row = await db.get<{ value: string }>('SELECT value FROM local_user_preferences WHERE key = ?;', [key]);
      return row?.value ?? null;
    },

    async delete(key: string): Promise<void> {
      await db.run('DELETE FROM local_user_preferences WHERE key = ?;', [key]);
    },
  };
}

export type PreferencesRepository = ReturnType<typeof createPreferencesRepository>;
