import { DatabaseSync } from 'node:sqlite';

import type { LocalDb, SqlParams } from '../../src/data/local/types';

/**
 * Test-only LocalDb backed by Node's built-in node:sqlite (real SQL engine,
 * not a hand-rolled fake) so migrations/transactions/repositories are
 * exercised against real transactional semantics without any Expo/native
 * runtime. Never imported from app code — expo-sqlite backs the real app.
 */
export function createNodeSqliteDb(location: string = ':memory:'): LocalDb {
  const db = new DatabaseSync(location);
  db.exec('PRAGMA foreign_keys = ON;');
  let transactionDepth = 0;

  return {
    async exec(sql: string) {
      db.exec(sql);
    },
    async run(sql: string, params: SqlParams = []) {
      const stmt = db.prepare(sql);
      const info = stmt.run(...(params as (string | number | null)[]));
      return { changes: Number(info.changes), lastInsertRowId: Number(info.lastInsertRowid) };
    },
    async all<T>(sql: string, params: SqlParams = []) {
      const stmt = db.prepare(sql);
      return stmt.all(...(params as (string | number | null)[])) as T[];
    },
    async get<T>(sql: string, params: SqlParams = []) {
      const stmt = db.prepare(sql);
      const row = stmt.get(...(params as (string | number | null)[]));
      return (row ?? null) as T | null;
    },
    async withTransaction<T>(fn: () => Promise<T>): Promise<T> {
      const isOutermost = transactionDepth === 0;
      transactionDepth += 1;
      if (isOutermost) db.exec('BEGIN IMMEDIATE');
      try {
        const result = await fn();
        if (isOutermost) db.exec('COMMIT');
        return result;
      } catch (error) {
        if (isOutermost) db.exec('ROLLBACK');
        throw error;
      } finally {
        transactionDepth -= 1;
      }
    },
    async close() {
      db.close();
    },
  };
}
