import { afterEach, describe, expect, it } from 'vitest';

import { ALL_LOCAL_TABLE_NAMES } from '../../src/data/local/schema';
import { getAppliedMigrationIds, MIGRATIONS, runMigrations } from '../../src/data/local/migrations';
import type { LocalDb } from '../../src/data/local/types';
import { createNodeSqliteDb } from '../helpers/node-sqlite-db';

let db: LocalDb | null = null;

afterEach(async () => {
  await db?.close();
  db = null;
});

describe('local database migrations', () => {
  it('creates every local_* table on a fresh database', async () => {
    db = createNodeSqliteDb();
    await runMigrations(db);

    for (const tableName of ALL_LOCAL_TABLE_NAMES) {
      const row = await db.get<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?;",
        [tableName],
      );
      expect(row?.name).toBe(tableName);
    }
  });

  it('is idempotent — running twice applies nothing the second time', async () => {
    db = createNodeSqliteDb();
    const first = await runMigrations(db);
    const second = await runMigrations(db);

    expect(first.appliedIds).toEqual(MIGRATIONS.map((migration) => migration.id));
    expect(second.appliedIds).toEqual([]);
    expect(await getAppliedMigrationIds(db)).toEqual(MIGRATIONS.map((migration) => migration.id));
  });

  it('rolls back a failing migration entirely and leaves it eligible to retry', async () => {
    db = createNodeSqliteDb();
    const brokenMigrations = [
      {
        id: '0001_initial_local_tables',
        statements: [
          'CREATE TABLE IF NOT EXISTS local_session (id TEXT PRIMARY KEY);',
          'CREATE TABLE this is not valid sql (;',
        ],
      },
    ];

    await expect(runMigrations(db, brokenMigrations)).rejects.toThrow();

    // Neither the good statement's table nor the migration bookkeeping row survived the rollback.
    const sessionTable = await db.get<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'local_session';",
    );
    expect(sessionTable).toBeNull();
    expect(await getAppliedMigrationIds(db)).toEqual([]);

    // Retrying with the fixed migration set succeeds from scratch.
    const retry = await runMigrations(db);
    expect(retry.appliedIds).toEqual(MIGRATIONS.map((migration) => migration.id));
  });
});
