import { computeRetryDelayMs, DEFAULT_SYNC_RETRY_OPTIONS, hasExceededRetryBudget, type SyncRetryOptions } from '../domain/sync';
import type { OutboxRepository } from '../data/local/repositories/outbox';
import type { SessionRepository } from '../data/local/repositories/session';
import type { TrackPointRepository } from '../data/local/repositories/track-points';
import type { MovementMode } from '../domain/types';

export const SESSION_SYNC_EVENT_TYPE = 'session_sync';

export type SessionSyncPayload = {
  sessionId: string;
  startedAt: number | null;
  endedAt: number;
  mode: MovementMode;
  elapsedSeconds: number;
  pointCount: number;
};

export type SyncResult = { ok: true } | { ok: false; errorClass: string };
export type SyncTransport = (payload: SessionSyncPayload) => Promise<SyncResult>;

/** A session can reuse the same slot across expeditions (see tracking-task.ts), so the event id must key off the specific start time, not just the slot. */
export function sessionSyncEventId(sessionId: string, startedAt: number | null): string {
  return `session-sync:${sessionId}:${startedAt ?? 'unknown'}`;
}

/**
 * No real backend to confirm against yet — a live Convex mutation client
 * needs `npx convex dev`'s interactive login, unavailable in this
 * environment (the same documented blocker as TQ-18/19's client codegen
 * issues). This reports failure so events stay queued and retried with
 * backoff instead of being silently dropped or faked as successful; swap
 * this out for a real transport once that's unblocked.
 */
export const NOT_YET_CONFIGURED_TRANSPORT: SyncTransport = async () => ({
  ok: false,
  errorClass: 'TransportNotConfigured',
});

export type SessionSyncDeps = {
  outbox: OutboxRepository;
  trackPoints: Pick<TrackPointRepository, 'deleteCapturedUpTo'>;
  session: Pick<SessionRepository, 'getById' | 'upsert'>;
  transport: SyncTransport;
};

/**
 * Processes every due outbox event once. On confirmation: prunes only the
 * points captured at/before that session's own end time (safe even if the
 * slot has since been reused by a newer, still-unconfirmed session — its
 * points all have later captured_at timestamps), and flips the session row
 * to 'completed' only if it's still the SAME session instance (started_at
 * guard) — a later session reusing the slot must never be stomped back to
 * 'completed' by a stale confirmation.
 */
export async function processDueSyncEvents(
  deps: SessionSyncDeps,
  now: number,
  retryOptions: SyncRetryOptions = DEFAULT_SYNC_RETRY_OPTIONS,
): Promise<{ confirmed: number; failed: number }> {
  const due = await deps.outbox.listDue(now);
  let confirmed = 0;
  let failed = 0;

  for (const event of due) {
    if (event.type !== SESSION_SYNC_EVENT_TYPE) continue;
    const payload = JSON.parse(event.serialized_payload) as SessionSyncPayload;
    const result = await deps.transport(payload);

    if (result.ok) {
      await deps.outbox.markSent(event.event_id);

      const session = await deps.session.getById(payload.sessionId);
      if (session && session.status === 'processing' && session.started_at === payload.startedAt) {
        await deps.session.upsert({ ...session, status: 'completed' });
      }
      await deps.trackPoints.deleteCapturedUpTo(payload.sessionId, payload.endedAt);
      confirmed += 1;
      continue;
    }

    failed += 1;
    if (hasExceededRetryBudget(event.attempt_count, retryOptions)) {
      await deps.outbox.recordFailure({
        eventId: event.event_id,
        nextAttemptAt: now,
        errorClass: result.errorClass,
        giveUp: true,
      });
    } else {
      await deps.outbox.recordFailure({
        eventId: event.event_id,
        nextAttemptAt: now + computeRetryDelayMs(event.attempt_count, retryOptions),
        errorClass: result.errorClass,
      });
    }
  }

  return { confirmed, failed };
}
