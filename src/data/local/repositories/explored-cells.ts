import type { LocalExploredCellRow } from '../models';
import type { LocalDb } from '../types';

export function createExploredCellRepository(db: LocalDb) {
  return {
    async upsertSeen(input: {
      h3Index: string;
      seenAt: number;
      modeBit: number;
      sourceSessionId: string | null;
      visualOnly?: boolean;
    }): Promise<void> {
      const visualOnly = input.visualOnly === false ? 0 : 1;
      await db.run(
        `INSERT INTO local_explored_cell (
          h3_index, first_seen, last_seen, mode_mask, sync_state,
          source_session_id, visual_only, normalized_for_xp
        ) VALUES (?, ?, ?, ?, 'pending', ?, ?, 0)
        ON CONFLICT(h3_index) DO UPDATE SET
          last_seen = excluded.last_seen,
          mode_mask = local_explored_cell.mode_mask | excluded.mode_mask,
          source_session_id = excluded.source_session_id;`,
        [input.h3Index, input.seenAt, input.seenAt, input.modeBit, input.sourceSessionId, visualOnly],
      );
    },

    async listPendingSync(): Promise<LocalExploredCellRow[]> {
      return db.all<LocalExploredCellRow>("SELECT * FROM local_explored_cell WHERE sync_state = 'pending';");
    },

    async markSynced(h3Indexes: readonly string[]): Promise<void> {
      for (const h3Index of h3Indexes) {
        await db.run("UPDATE local_explored_cell SET sync_state = 'synced' WHERE h3_index = ?;", [h3Index]);
      }
    },

    async count(): Promise<number> {
      const row = await db.get<{ total: number }>('SELECT COUNT(*) as total FROM local_explored_cell;');
      return row?.total ?? 0;
    },
  };
}

export type ExploredCellRepository = ReturnType<typeof createExploredCellRepository>;
