import type { LocalSessionRow } from '../models';
import type { LocalDb } from '../types';

export function createSessionRepository(db: LocalDb) {
  return {
    async upsert(session: LocalSessionRow): Promise<void> {
      await db.run(
        `INSERT INTO local_session (
          id, status, mode, started_at, ended_at, elapsed_seconds,
          distance_m, new_cells, xp_pending, last_confirmed_sequence,
          normalized_count_at_checkpoint, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          status = excluded.status,
          mode = excluded.mode,
          started_at = excluded.started_at,
          ended_at = excluded.ended_at,
          elapsed_seconds = excluded.elapsed_seconds,
          distance_m = excluded.distance_m,
          new_cells = excluded.new_cells,
          xp_pending = excluded.xp_pending,
          last_confirmed_sequence = excluded.last_confirmed_sequence,
          normalized_count_at_checkpoint = excluded.normalized_count_at_checkpoint,
          updated_at = excluded.updated_at;`,
        [
          session.id,
          session.status,
          session.mode,
          session.started_at,
          session.ended_at,
          session.elapsed_seconds,
          session.distance_m,
          session.new_cells,
          session.xp_pending,
          session.last_confirmed_sequence,
          session.normalized_count_at_checkpoint,
          session.updated_at,
        ],
      );
    },

    async getById(id: string): Promise<LocalSessionRow | null> {
      return db.get<LocalSessionRow>('SELECT * FROM local_session WHERE id = ?;', [id]);
    },

    async getActive(): Promise<LocalSessionRow | null> {
      return db.get<LocalSessionRow>(
        `SELECT * FROM local_session WHERE status IN ('active', 'paused')
         ORDER BY updated_at DESC LIMIT 1;`,
      );
    },

    async delete(id: string): Promise<void> {
      await db.run('DELETE FROM local_session WHERE id = ?;', [id]);
    },
  };
}

export type SessionRepository = ReturnType<typeof createSessionRepository>;
