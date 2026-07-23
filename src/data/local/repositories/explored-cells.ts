import type { LocalExploredCellRow } from '../models';
import type { LocalDb } from '../types';

export function createExploredCellRepository(db: LocalDb) {
  return {
    // TQ-23: normalizedForXp is sticky (an OR across calls, via MAX in the
    // conflict clause) — once a cell has counted for XP it always does,
    // regardless of how it's revisited later. visual_only just tracks
    // "hasn't been promoted to an XP unit yet", so it clears the moment
    // normalized_for_xp is ever set, and never flips back.
    async upsertSeen(input: {
      h3Index: string;
      seenAt: number;
      modeBit: number;
      sourceSessionId: string | null;
      visualOnly?: boolean;
      normalizedForXp?: boolean;
    }): Promise<void> {
      const normalizedForXp = input.normalizedForXp ? 1 : 0;
      const visualOnly = input.visualOnly === false ? 0 : normalizedForXp ? 0 : 1;
      await db.run(
        `INSERT INTO local_explored_cell (
          h3_index, first_seen, last_seen, mode_mask, sync_state,
          source_session_id, visual_only, normalized_for_xp
        ) VALUES (?, ?, ?, ?, 'pending', ?, ?, ?)
        ON CONFLICT(h3_index) DO UPDATE SET
          last_seen = excluded.last_seen,
          mode_mask = local_explored_cell.mode_mask | excluded.mode_mask,
          source_session_id = excluded.source_session_id,
          normalized_for_xp = MAX(local_explored_cell.normalized_for_xp, excluded.normalized_for_xp),
          visual_only = CASE
            WHEN MAX(local_explored_cell.normalized_for_xp, excluded.normalized_for_xp) = 1 THEN 0
            ELSE local_explored_cell.visual_only
          END;`,
        [input.h3Index, input.seenAt, input.seenAt, input.modeBit, input.sourceSessionId, visualOnly, normalizedForXp],
      );
    },

    async listPendingSync(): Promise<LocalExploredCellRow[]> {
      return db.all<LocalExploredCellRow>("SELECT * FROM local_explored_cell WHERE sync_state = 'pending';");
    },

    /** Every cell ever revealed, regardless of sync state — the persistent fog reads this, not just pending-sync rows. */
    async listAllCellIds(): Promise<string[]> {
      const rows = await db.all<{ h3_index: string }>('SELECT h3_index FROM local_explored_cell;');
      return rows.map((row) => row.h3_index);
    },

    async countNormalizedForXp(): Promise<number> {
      const row = await db.get<{ total: number }>(
        'SELECT COUNT(*) as total FROM local_explored_cell WHERE normalized_for_xp = 1;',
      );
      return row?.total ?? 0;
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

    /** "Smazat historii" (settings.tsx) — wipes the persistent fog reveal entirely, local-only (never touches the server-confirmed XP ledger). */
    async deleteAll(): Promise<void> {
      await db.run('DELETE FROM local_explored_cell;');
    },
  };
}

export type ExploredCellRepository = ReturnType<typeof createExploredCellRepository>;
