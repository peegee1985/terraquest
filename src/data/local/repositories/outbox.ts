import type { LocalOutboxEventRow } from '../models';
import type { LocalDb } from '../types';

export function createOutboxRepository(db: LocalDb) {
  return {
    /** Idempotent: re-enqueuing the same event_id is a no-op. */
    async enqueue(input: { eventId: string; type: string; payload: unknown; createdAt: number }): Promise<void> {
      await db.run(
        `INSERT INTO local_event_outbox (event_id, type, serialized_payload, created_at, state)
         VALUES (?, ?, ?, ?, 'pending')
         ON CONFLICT(event_id) DO NOTHING;`,
        [input.eventId, input.type, JSON.stringify(input.payload), input.createdAt],
      );
    },

    async listDue(now: number): Promise<LocalOutboxEventRow[]> {
      return db.all<LocalOutboxEventRow>(
        `SELECT * FROM local_event_outbox
         WHERE state = 'pending' AND (next_attempt_at IS NULL OR next_attempt_at <= ?)
         ORDER BY created_at ASC;`,
        [now],
      );
    },

    async markSent(eventId: string): Promise<void> {
      await db.run("UPDATE local_event_outbox SET state = 'sent' WHERE event_id = ?;", [eventId]);
    },

    async recordFailure(input: {
      eventId: string;
      nextAttemptAt: number;
      errorClass: string;
      giveUp?: boolean;
    }): Promise<void> {
      await db.run(
        `UPDATE local_event_outbox SET
           attempt_count = attempt_count + 1,
           next_attempt_at = ?,
           last_error_class = ?,
           state = ?
         WHERE event_id = ?;`,
        [input.nextAttemptAt, input.errorClass, input.giveUp ? 'failed' : 'pending', input.eventId],
      );
    },

    async count(): Promise<number> {
      const row = await db.get<{ total: number }>('SELECT COUNT(*) as total FROM local_event_outbox;');
      return row?.total ?? 0;
    },
  };
}

export type OutboxRepository = ReturnType<typeof createOutboxRepository>;
