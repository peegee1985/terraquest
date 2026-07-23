import type { ConvexReactClient } from 'convex/react';
// TYPE-ONLY import — erased entirely at compile time (`import type` never
// emits runtime JS), so this can't pull convex/server's backend-runtime
// machinery into the client bundle the way a value import would. See
// clientFunctionReference below for why a value import of that module
// caused an instant startup crash.
import type { FunctionReference } from 'convex/server';

import { computeRetryDelayMs, DEFAULT_SYNC_RETRY_OPTIONS, hasExceededRetryBudget, type SyncRetryOptions } from '../domain/sync';
import type { OutboxRepository } from '../data/local/repositories/outbox';
import type { SessionRepository } from '../data/local/repositories/session';
import type { TrackPointRepository } from '../data/local/repositories/track-points';
import type { XpProjectionRepository } from '../data/local/repositories/xp-projection';
import type { MovementMode } from '../domain/types';

export const SESSION_SYNC_EVENT_TYPE = 'session_sync';

export type SessionSyncPayload = {
  sessionId: string;
  startedAt: number | null;
  endedAt: number;
  mode: MovementMode;
  elapsedSeconds: number;
  pointCount: number;
  // TQ-31: raw, already-locally-validated evidence (gps-filter.ts's
  // teleport/accuracy rejection, fog.ts's mode-gated centerline cells) —
  // the server recomputes the actual XP amount from these, never trusts a
  // number computed here.
  distanceMeters: number;
  newExplorationUnitsCount: number;
  // TQ-46: steps during this session from Health Connect, 0 if unavailable
  // (see health-connect.ts's getStepsBetween, which never throws).
  stepsCount: number;
};

export type SyncResult = { ok: true; confirmedXp?: number } | { ok: false; errorClass: string };
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

/**
 * TQ-31 (fixed post-build-crash): builds the exact same runtime shape as
 * `convex/server`'s `makeFunctionReference` — `{ [Symbol.for
 * ('functionName')]: name }` — WITHOUT importing `convex/server` as a
 * value. That module is meant for the Convex *backend* runtime (its barrel
 * index pulls in schema/cron/storage/router machinery), not for bundling
 * into a mobile client; importing it here (`import { anyApi } from
 * 'convex/server'`) caused an instant crash on app startup, since this file
 * loads unconditionally from the root layout before anything renders.
 * `Symbol.for` reads from the global symbol registry, so any code anywhere
 * that calls `Symbol.for('functionName')` gets the identical symbol
 * Convex's client SDK looks for — functionally identical to
 * `makeFunctionReference(name)`, minus the dangerous import. The `FunctionReference`
 * type itself is imported with `import type` above, which is erased at
 * compile time and carries no runtime cost.
 */
function clientFunctionReference<F extends FunctionReference<'mutation'>>(name: string): F {
  return { [Symbol.for('functionName')]: name } as unknown as F;
}

type SubmitTrackingSessionMutation = FunctionReference<
  'mutation',
  'public',
  {
    localSessionId: string;
    startedAt: number | null;
    endedAt: number;
    movementMode: MovementMode;
    elapsedSeconds: number;
    distanceMeters: number;
    newExplorationUnitsCount: number;
    stepsCount: number;
  },
  { distanceAwarded: number; explorationAwarded: number; totalConfirmedXp: number; levelUps: { level: number; rankId: string }[] }
>;

/**
 * TQ-31: the real transport, calling convex/sessions.ts's
 * submitTrackingSession. Uses a locally-built function reference (see
 * clientFunctionReference above) rather than a generated `api` object,
 * since this environment still can't run `npx convex dev`'s codegen — the
 * exact same class of workaround as the server-side `makeFunctionReference`
 * calls from TQ-18/26/29b, just on the client side.
 */
export function convexSessionSyncTransport(client: ConvexReactClient): SyncTransport {
  const submitTrackingSessionRef = clientFunctionReference<SubmitTrackingSessionMutation>('sessions:submitTrackingSession');
  return async (payload) => {
    try {
      const result = await client.mutation(submitTrackingSessionRef, {
        localSessionId: payload.sessionId,
        startedAt: payload.startedAt,
        endedAt: payload.endedAt,
        movementMode: payload.mode,
        elapsedSeconds: payload.elapsedSeconds,
        distanceMeters: payload.distanceMeters,
        newExplorationUnitsCount: payload.newExplorationUnitsCount,
        stepsCount: payload.stepsCount ?? 0,
      });
      return { ok: true, confirmedXp: result.totalConfirmedXp };
    } catch (error) {
      return { ok: false, errorClass: error instanceof Error ? error.constructor.name : 'UnknownError' };
    }
  };
}

export type SessionSyncDeps = {
  outbox: OutboxRepository;
  trackPoints: Pick<TrackPointRepository, 'deleteCapturedUpTo'>;
  session: Pick<SessionRepository, 'getById' | 'upsert'>;
  xpProjection: Pick<XpProjectionRepository, 'applyServerSnapshot'>;
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
      if (result.confirmedXp !== undefined) {
        await deps.xpProjection.applyServerSnapshot({ confirmedXp: result.confirmedXp, serverSnapshotAt: now });
      }
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
