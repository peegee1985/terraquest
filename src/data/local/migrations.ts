import { CREATE_TABLE_STATEMENTS } from './schema';
import type { LocalDb } from './types';

export type Migration = {
  id: string;
  statements: readonly string[];
};

/**
 * Ordered, append-only migration list. Never edit a migration once it has
 * shipped — append a new one instead, so devices that already applied it
 * are not re-run against a changed definition.
 */
export const MIGRATIONS: readonly Migration[] = [
  {
    id: '0001_initial_local_tables',
    statements: CREATE_TABLE_STATEMENTS,
  },
  {
    // Ambient tracking's periodic XP checkpoint cursor — see
    // LocalSessionRow's comment in models.ts for what this tracks.
    id: '0002_session_checkpoint_cursor',
    statements: [
      'ALTER TABLE local_session ADD COLUMN normalized_count_at_checkpoint INTEGER NOT NULL DEFAULT 0;',
    ],
  },
];

const MIGRATIONS_TABLE = `CREATE TABLE IF NOT EXISTS schema_migrations (
  id TEXT PRIMARY KEY NOT NULL,
  applied_at INTEGER NOT NULL
);`;

type MigrationRow = { id: string };

/**
 * Applies pending migrations in order, one DB transaction per migration.
 * A migration is marked applied only if every one of its statements
 * succeeded, so a crash or error mid-migration leaves it eligible to
 * retry from scratch on next launch instead of half-applied.
 */
export async function runMigrations(
  db: LocalDb,
  migrations: readonly Migration[] = MIGRATIONS,
): Promise<{ appliedIds: string[] }> {
  await db.exec(MIGRATIONS_TABLE);
  const appliedRows = await db.all<MigrationRow>('SELECT id FROM schema_migrations;');
  const alreadyApplied = new Set(appliedRows.map((row) => row.id));

  const appliedIds: string[] = [];
  for (const migration of migrations) {
    if (alreadyApplied.has(migration.id)) continue;
    await db.withTransaction(async () => {
      for (const statement of migration.statements) {
        await db.exec(statement);
      }
      await db.run('INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?);', [
        migration.id,
        Date.now(),
      ]);
    });
    appliedIds.push(migration.id);
  }
  return { appliedIds };
}

export async function getAppliedMigrationIds(db: LocalDb): Promise<string[]> {
  await db.exec(MIGRATIONS_TABLE);
  const rows = await db.all<MigrationRow>('SELECT id FROM schema_migrations ORDER BY applied_at ASC;');
  return rows.map((row) => row.id);
}
