import * as SQLite from 'expo-sqlite';

import type { LocalDb, SqlParams } from './types';

/**
 * Real runtime adapter wiring the shared LocalDb contract to expo-sqlite.
 * Import this only from app code, never from tests — expo-sqlite requires
 * the Expo runtime. Tests use tests/helpers/node-sqlite-db.ts instead,
 * which implements the same LocalDb interface against node:sqlite.
 */
export async function openExpoLocalDb(databaseName: string): Promise<LocalDb> {
  const db = await SQLite.openDatabaseAsync(databaseName);

  return {
    async exec(sql: string) {
      await db.execAsync(sql);
    },
    async run(sql: string, params: SqlParams = []) {
      const result = await db.runAsync(sql, params as SQLite.SQLiteBindParams);
      return { changes: result.changes, lastInsertRowId: result.lastInsertRowId };
    },
    async all<T>(sql: string, params: SqlParams = []) {
      return db.getAllAsync<T>(sql, params as SQLite.SQLiteBindParams);
    },
    async get<T>(sql: string, params: SqlParams = []) {
      const row = await db.getFirstAsync<T>(sql, params as SQLite.SQLiteBindParams);
      return row ?? null;
    },
    async withTransaction<T>(fn: () => Promise<T>): Promise<T> {
      let result: T | undefined;
      let capturedError: unknown;
      await db.withTransactionAsync(async () => {
        try {
          result = await fn();
        } catch (error) {
          capturedError = error;
          throw error;
        }
      });
      if (capturedError) throw capturedError;
      return result as T;
    },
    async close() {
      await db.closeAsync();
    },
  };
}
