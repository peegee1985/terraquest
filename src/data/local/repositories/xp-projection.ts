import type { LocalXpProjectionRow } from '../models';
import type { LocalDb } from '../types';

const DEFAULT_ROW: LocalXpProjectionRow = {
  id: 1,
  confirmed_xp: 0,
  pending_xp: 0,
  server_snapshot_at: null,
  updated_at: 0,
};

/**
 * Single-row optimistic XP projection (docs 02: "Optimistická projekce
 * rozdělená na potvrzené a čekající XP. Serverový snapshot vždy vyhrává.").
 * `addPending` is called from the client while a session is in flight;
 * `applyServerSnapshot` replaces confirmed_xp and clears pending_xp once the
 * backend ledger has actually processed those events.
 */
export function createXpProjectionRepository(db: LocalDb) {
  async function ensureRow(): Promise<void> {
    await db.run(
      `INSERT INTO local_xp_projection (id, confirmed_xp, pending_xp, server_snapshot_at, updated_at)
       VALUES (1, ?, ?, ?, ?)
       ON CONFLICT(id) DO NOTHING;`,
      [DEFAULT_ROW.confirmed_xp, DEFAULT_ROW.pending_xp, DEFAULT_ROW.server_snapshot_at, Date.now()],
    );
  }

  return {
    async get(): Promise<LocalXpProjectionRow> {
      await ensureRow();
      const row = await db.get<LocalXpProjectionRow>('SELECT * FROM local_xp_projection WHERE id = 1;');
      return row ?? DEFAULT_ROW;
    },

    async addPending(amount: number, now: number): Promise<void> {
      await ensureRow();
      await db.run(
        'UPDATE local_xp_projection SET pending_xp = pending_xp + ?, updated_at = ? WHERE id = 1;',
        [amount, now],
      );
    },

    async applyServerSnapshot(input: { confirmedXp: number; serverSnapshotAt: number }): Promise<void> {
      await ensureRow();
      await db.run(
        `UPDATE local_xp_projection SET
           confirmed_xp = ?,
           pending_xp = 0,
           server_snapshot_at = ?,
           updated_at = ?
         WHERE id = 1;`,
        [input.confirmedXp, input.serverSnapshotAt, input.serverSnapshotAt],
      );
    },
  };
}

export type XpProjectionRepository = ReturnType<typeof createXpProjectionRepository>;
