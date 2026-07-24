import { randomBytes as nodeRandomBytes } from 'node:crypto';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { bytesToBase64 } from '../../src/data/local/crypto';
import { runMigrations } from '../../src/data/local/migrations';
import { createOutboxRepository } from '../../src/data/local/repositories/outbox';
import { createSessionRepository } from '../../src/data/local/repositories/session';
import { createTrackPointRepository } from '../../src/data/local/repositories/track-points';
import { createXpProjectionRepository } from '../../src/data/local/repositories/xp-projection';
import type { LocalDb } from '../../src/data/local/types';
import {
  processDueSyncEvents,
  SESSION_SYNC_EVENT_TYPE,
  sessionSyncEventId,
  type SessionSyncPayload,
  type SyncResult,
} from '../../src/state/session-sync';
import { createNodeSqliteDb } from '../helpers/node-sqlite-db';

const SESSION_ID = 'primary';
const randomBytes = (length: number) => new Uint8Array(nodeRandomBytes(length));
const masterKey = bytesToBase64(nodeRandomBytes(32));

let db: LocalDb;

beforeEach(async () => {
  db = createNodeSqliteDb();
  await runMigrations(db);
});

afterEach(async () => {
  await db.close();
});

function enqueueFinishedSession(outbox: ReturnType<typeof createOutboxRepository>, startedAt: number, endedAt: number, pointCount = 10) {
  const payload: SessionSyncPayload = {
    sessionId: SESSION_ID,
    startedAt,
    endedAt,
    mode: 'walk',
    elapsedSeconds: 600,
    pointCount,
    distanceMeters: 800,
    newExplorationUnitsCount: 5,
    stepsCount: 0,
    cumulativeElapsedSecondsToday: 600,
    cumulativeDistanceMetersToday: 800,
  };
  return outbox.enqueue({
    eventId: sessionSyncEventId(SESSION_ID, startedAt, endedAt),
    type: SESSION_SYNC_EVENT_TYPE,
    payload,
    createdAt: endedAt,
  });
}

describe('processDueSyncEvents', () => {
  it('on confirmation: marks the event sent, completes the session, and prunes only points up to endedAt', async () => {
    const outbox = createOutboxRepository(db);
    const session = createSessionRepository(db);
    const trackPoints = createTrackPointRepository(db, masterKey, randomBytes);
    const xpProjection = createXpProjectionRepository(db);

    const startedAt = 1000;
    const endedAt = 5000;
    await session.upsert({
      id: SESSION_ID,
      status: 'processing',
      mode: 'walk',
      started_at: startedAt,
      ended_at: endedAt,
      elapsed_seconds: 600,
      distance_m: 0,
      new_cells: 0,
      xp_pending: 0,
      last_confirmed_sequence: 2,
      normalized_count_at_checkpoint: 0,
      updated_at: endedAt,
    });
    await trackPoints.insert({ sessionId: SESSION_ID, sequence: 0, latitude: 50, longitude: 14, capturedAt: 2000 });
    await trackPoints.insert({ sessionId: SESSION_ID, sequence: 1, latitude: 50, longitude: 14, capturedAt: endedAt });
    await enqueueFinishedSession(outbox, startedAt, endedAt);

    const transport = async (): Promise<SyncResult> => ({ ok: true });
    const result = await processDueSyncEvents({ outbox, trackPoints, session, xpProjection, transport }, endedAt + 1);

    expect(result).toEqual({ confirmed: 1, failed: 0 });
    expect(await outbox.count()).toBe(1);
    expect(await outbox.listDue(endedAt + 1)).toEqual([]); // no longer pending
    expect((await session.getById(SESSION_ID))?.status).toBe('completed');
    expect(await trackPoints.listBySession(SESSION_ID)).toEqual([]);
  });

  it('applies the transport-returned confirmedXp to the local xp projection, clearing pending', async () => {
    const outbox = createOutboxRepository(db);
    const session = createSessionRepository(db);
    const trackPoints = createTrackPointRepository(db, masterKey, randomBytes);
    const xpProjection = createXpProjectionRepository(db);

    const startedAt = 1000;
    const endedAt = 5000;
    await xpProjection.addPending(120, startedAt);
    await enqueueFinishedSession(outbox, startedAt, endedAt);

    const transport = async (): Promise<SyncResult> => ({ ok: true, confirmedXp: 730 });
    await processDueSyncEvents({ outbox, trackPoints, session, xpProjection, transport }, endedAt + 1);

    const projection = await xpProjection.get();
    expect(projection.confirmed_xp).toBe(730);
    expect(projection.pending_xp).toBe(0);
  });

  it('leaves the xp projection untouched when the transport reports no confirmedXp', async () => {
    const outbox = createOutboxRepository(db);
    const session = createSessionRepository(db);
    const trackPoints = createTrackPointRepository(db, masterKey, randomBytes);
    const xpProjection = createXpProjectionRepository(db);

    const startedAt = 1000;
    const endedAt = 5000;
    await xpProjection.addPending(120, startedAt);
    await enqueueFinishedSession(outbox, startedAt, endedAt);

    const transport = async (): Promise<SyncResult> => ({ ok: true });
    await processDueSyncEvents({ outbox, trackPoints, session, xpProjection, transport }, endedAt + 1);

    const projection = await xpProjection.get();
    expect(projection.pending_xp).toBe(120); // untouched, not cleared
  });

  it('never deletes points from a newer session that has since reused the slot, and never stomps its active status', async () => {
    const outbox = createOutboxRepository(db);
    const session = createSessionRepository(db);
    const trackPoints = createTrackPointRepository(db, masterKey, randomBytes);
    const xpProjection = createXpProjectionRepository(db);

    // The old (now-finishing) session.
    const oldStartedAt = 1000;
    const oldEndedAt = 5000;
    await enqueueFinishedSession(outbox, oldStartedAt, oldEndedAt);

    // A brand new session has already started reusing the same slot before
    // the old one's sync confirmation arrives — this is the race TQ-24 must
    // guard against given LOCAL_SESSION_ID is a single reused id.
    await session.upsert({
      id: SESSION_ID,
      status: 'active',
      mode: 'walk',
      started_at: 9000,
      ended_at: null,
      elapsed_seconds: 30,
      distance_m: 0,
      new_cells: 0,
      xp_pending: 0,
      last_confirmed_sequence: 0,
      normalized_count_at_checkpoint: 0,
      updated_at: 9000,
    });
    // A point belonging to the NEW session (captured well after the old
    // session's endedAt) must survive the old session's confirmation.
    await trackPoints.insert({ sessionId: SESSION_ID, sequence: 0, latitude: 50, longitude: 14, capturedAt: 9500 });

    const transport = async (): Promise<SyncResult> => ({ ok: true });
    await processDueSyncEvents({ outbox, trackPoints, session, xpProjection, transport }, oldEndedAt + 1);

    const current = await session.getById(SESSION_ID);
    expect(current?.status).toBe('active'); // untouched, not stomped back to 'completed'
    expect(current?.started_at).toBe(9000);
    const remaining = await trackPoints.listBySession(SESSION_ID);
    expect(remaining).toHaveLength(1);
    expect(remaining[0].capturedAt).toBe(9500);
  });

  it('on failure: schedules a backoff retry without touching points or session status', async () => {
    const outbox = createOutboxRepository(db);
    const session = createSessionRepository(db);
    const trackPoints = createTrackPointRepository(db, masterKey, randomBytes);
    const xpProjection = createXpProjectionRepository(db);

    const startedAt = 1000;
    const endedAt = 5000;
    await session.upsert({
      id: SESSION_ID,
      status: 'processing',
      mode: 'walk',
      started_at: startedAt,
      ended_at: endedAt,
      elapsed_seconds: 600,
      distance_m: 0,
      new_cells: 0,
      xp_pending: 0,
      last_confirmed_sequence: 1,
      normalized_count_at_checkpoint: 0,
      updated_at: endedAt,
    });
    await trackPoints.insert({ sessionId: SESSION_ID, sequence: 0, latitude: 50, longitude: 14, capturedAt: 2000 });
    await enqueueFinishedSession(outbox, startedAt, endedAt);

    const transport = async (): Promise<SyncResult> => ({ ok: false, errorClass: 'NetworkError' });
    const now = endedAt + 1;
    const result = await processDueSyncEvents({ outbox, trackPoints, session, xpProjection, transport }, now, {
      baseDelayMs: 1000,
      maxDelayMs: 60_000,
      maxAttempts: 5,
    });

    expect(result).toEqual({ confirmed: 0, failed: 1 });
    expect((await session.getById(SESSION_ID))?.status).toBe('processing');
    expect(await trackPoints.listBySession(SESSION_ID)).toHaveLength(1);

    const [due] = await outbox.listDue(now);
    expect(due).toBeUndefined(); // not due yet — nextAttemptAt is in the future
    const [event] = await outbox.listDue(now + 1000);
    expect(event.attempt_count).toBe(1);
    expect(event.last_error_class).toBe('NetworkError');
  });

  it('gives up after exceeding the retry budget, leaving the event out of listDue for good', async () => {
    const outbox = createOutboxRepository(db);
    const session = createSessionRepository(db);
    const trackPoints = createTrackPointRepository(db, masterKey, randomBytes);
    const xpProjection = createXpProjectionRepository(db);
    const startedAt = 1000;
    const endedAt = 5000;
    await enqueueFinishedSession(outbox, startedAt, endedAt);

    const transport = async (): Promise<SyncResult> => ({ ok: false, errorClass: 'NetworkError' });
    // maxAttempts: 1 — the first failure (attempt_count 0 -> 1) is a normal
    // retry; the second failure sees attempt_count already at 1 (>= budget)
    // and gives up.
    const retryOptions = { baseDelayMs: 100, maxDelayMs: 1000, maxAttempts: 1 };
    let now = endedAt + 1;

    await processDueSyncEvents({ outbox, trackPoints, session, xpProjection, transport }, now, retryOptions); // attempt 1: normal retry
    now += 10_000;
    await processDueSyncEvents({ outbox, trackPoints, session, xpProjection, transport }, now, retryOptions); // attempt 2: gives up

    now += 10_000;
    expect(await outbox.listDue(now)).toEqual([]);
  });
});
