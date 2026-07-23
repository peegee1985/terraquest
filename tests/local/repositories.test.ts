import { randomBytes as nodeRandomBytes } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { bytesToBase64 } from '../../src/data/local/crypto';
import { runMigrations } from '../../src/data/local/migrations';
import { createExploredCellRepository } from '../../src/data/local/repositories/explored-cells';
import { createOutboxRepository } from '../../src/data/local/repositories/outbox';
import { createSessionRepository } from '../../src/data/local/repositories/session';
import { createTrackPointRepository } from '../../src/data/local/repositories/track-points';
import { createXpProjectionRepository } from '../../src/data/local/repositories/xp-projection';
import type { LocalDb } from '../../src/data/local/types';
import { createNodeSqliteDb } from '../helpers/node-sqlite-db';

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

describe('session repository', () => {
  it('upserts and reads back the active session', async () => {
    const sessions = createSessionRepository(db);
    await sessions.upsert({
      id: 'primary',
      status: 'active',
      mode: 'walk',
      started_at: 1000,
      ended_at: null,
      elapsed_seconds: 12,
      distance_m: 42,
      new_cells: 2,
      xp_pending: 5,
      last_confirmed_sequence: 3,
      updated_at: 1012,
    });

    const active = await sessions.getActive();
    expect(active?.id).toBe('primary');
    expect(active?.status).toBe('active');

    await sessions.upsert({
      id: 'primary',
      status: 'completed',
      mode: 'walk',
      started_at: 1000,
      ended_at: 2000,
      elapsed_seconds: 60,
      distance_m: 100,
      new_cells: 4,
      xp_pending: 0,
      last_confirmed_sequence: 10,
      updated_at: 2000,
    });
    expect(await sessions.getActive()).toBeNull();
  });
});

describe('track point repository', () => {
  it('encrypts coordinates at rest and decrypts them back on read', async () => {
    const trackPoints = createTrackPointRepository(db, masterKey, randomBytes);
    await trackPoints.insert({
      sessionId: 'primary',
      sequence: 0,
      latitude: 50.087,
      longitude: 14.421,
      capturedAt: 1000,
    });

    const rawRow = await db.get<{ position_ciphertext: string }>(
      'SELECT position_ciphertext FROM local_track_point WHERE session_id = ? AND sequence = 0;',
      ['primary'],
    );
    expect(rawRow?.position_ciphertext).toBeTruthy();
    expect(rawRow?.position_ciphertext).not.toContain('50.087');
    expect(rawRow?.position_ciphertext).not.toContain('14.421');

    const points = await trackPoints.listBySession('primary');
    expect(points).toHaveLength(1);
    expect(points[0].latitude).toBeCloseTo(50.087);
    expect(points[0].longitude).toBeCloseTo(14.421);
  });

  it('prunes to the most recent N points per session', async () => {
    const trackPoints = createTrackPointRepository(db, masterKey, randomBytes);
    for (let i = 0; i < 10; i += 1) {
      await trackPoints.insert({
        sessionId: 'primary',
        sequence: i,
        latitude: 50 + i,
        longitude: 14,
        capturedAt: 1000 + i,
      });
    }
    await trackPoints.pruneToLast('primary', 3);

    const remaining = await trackPoints.listBySession('primary');
    expect(remaining.map((point) => point.sequence)).toEqual([7, 8, 9]);
  });
});

describe('outbox repository', () => {
  it('is idempotent on re-enqueue by event_id', async () => {
    const outbox = createOutboxRepository(db);
    await outbox.enqueue({ eventId: 'evt-1', type: 'track', payload: { a: 1 }, createdAt: 1000 });
    await outbox.enqueue({ eventId: 'evt-1', type: 'track', payload: { a: 2 }, createdAt: 2000 });
    expect(await outbox.count()).toBe(1);
  });

  it('lists only due events and respects backoff', async () => {
    const outbox = createOutboxRepository(db);
    await outbox.enqueue({ eventId: 'evt-1', type: 'track', payload: {}, createdAt: 1000 });
    await outbox.recordFailure({ eventId: 'evt-1', nextAttemptAt: 5000, errorClass: 'NetworkError' });

    expect(await outbox.listDue(1000)).toEqual([]);
    const due = await outbox.listDue(6000);
    expect(due).toHaveLength(1);
    expect(due[0].attempt_count).toBe(1);
    expect(due[0].last_error_class).toBe('NetworkError');
  });
});

describe('xp projection repository', () => {
  it('server snapshot always wins over pending optimistic XP', async () => {
    const projection = createXpProjectionRepository(db);
    await projection.addPending(50, 1000);
    expect((await projection.get()).pending_xp).toBe(50);

    await projection.applyServerSnapshot({ confirmedXp: 250, serverSnapshotAt: 2000 });
    const after = await projection.get();
    expect(after.confirmed_xp).toBe(250);
    expect(after.pending_xp).toBe(0);
  });
});

describe('explored cell repository', () => {
  it('merges the mode mask instead of overwriting on repeated visits', async () => {
    const cells = createExploredCellRepository(db);
    await cells.upsertSeen({ h3Index: 'cell-1', seenAt: 1000, modeBit: 0b01, sourceSessionId: 'primary' });
    await cells.upsertSeen({ h3Index: 'cell-1', seenAt: 2000, modeBit: 0b10, sourceSessionId: 'primary' });

    const [cell] = await cells.listPendingSync();
    expect(cell.mode_mask).toBe(0b11);
    expect(cell.last_seen).toBe(2000);
    expect(cell.first_seen).toBe(1000);
  });

  it('defaults a fresh cell to visual-only, not counting for XP', async () => {
    const cells = createExploredCellRepository(db);
    await cells.upsertSeen({ h3Index: 'cell-visual', seenAt: 1000, modeBit: 0b01, sourceSessionId: 'primary' });

    const [cell] = await cells.listPendingSync();
    expect(cell.visual_only).toBe(1);
    expect(cell.normalized_for_xp).toBe(0);
  });

  it('promotes a cell to normalized_for_xp and never reverts it (TQ-23: growing the visual radius must never affect XP units)', async () => {
    const cells = createExploredCellRepository(db);
    await cells.upsertSeen({ h3Index: 'cell-2', seenAt: 1000, modeBit: 0b01, sourceSessionId: 'primary' });
    await cells.upsertSeen({ h3Index: 'cell-2', seenAt: 2000, modeBit: 0b01, sourceSessionId: 'primary', normalizedForXp: true });

    let [cell] = await cells.listPendingSync();
    expect(cell.normalized_for_xp).toBe(1);
    expect(cell.visual_only).toBe(0);

    // A later purely-visual re-visit (e.g. a bike pass through the same
    // cell) must not un-promote it.
    await cells.upsertSeen({ h3Index: 'cell-2', seenAt: 3000, modeBit: 0b100, sourceSessionId: 'primary' });
    [cell] = await cells.listPendingSync();
    expect(cell.normalized_for_xp).toBe(1);
  });

  it('listAllCellIds returns every revealed cell regardless of sync state', async () => {
    const cells = createExploredCellRepository(db);
    await cells.upsertSeen({ h3Index: 'cell-a', seenAt: 1000, modeBit: 0b01, sourceSessionId: 'primary' });
    await cells.upsertSeen({ h3Index: 'cell-b', seenAt: 1000, modeBit: 0b01, sourceSessionId: 'primary' });
    await cells.markSynced(['cell-a']);

    const all = await cells.listAllCellIds();
    expect(all.sort()).toEqual(['cell-a', 'cell-b']);
  });

  it('countNormalizedForXp only counts promoted cells', async () => {
    const cells = createExploredCellRepository(db);
    await cells.upsertSeen({ h3Index: 'cell-x', seenAt: 1000, modeBit: 0b01, sourceSessionId: 'primary', normalizedForXp: true });
    await cells.upsertSeen({ h3Index: 'cell-y', seenAt: 1000, modeBit: 0b01, sourceSessionId: 'primary' });

    expect(await cells.countNormalizedForXp()).toBe(1);
  });

  it('deleteAll wipes every revealed cell ("Smazat historii")', async () => {
    const cells = createExploredCellRepository(db);
    await cells.upsertSeen({ h3Index: 'cell-z', seenAt: 1000, modeBit: 0b01, sourceSessionId: 'primary' });

    await cells.deleteAll();

    expect(await cells.listAllCellIds()).toEqual([]);
    expect(await cells.count()).toBe(0);
  });
});

describe('transactional atomicity', () => {
  it('rolls back every write in the transaction if one statement fails', async () => {
    const sessions = createSessionRepository(db);
    await sessions.upsert({
      id: 'primary',
      status: 'active',
      mode: 'walk',
      started_at: 1000,
      ended_at: null,
      elapsed_seconds: 0,
      distance_m: 0,
      new_cells: 0,
      xp_pending: 0,
      last_confirmed_sequence: 0,
      updated_at: 1000,
    });

    await expect(
      db.withTransaction(async () => {
        await db.run('UPDATE local_session SET elapsed_seconds = 999 WHERE id = ?;', ['primary']);
        // Intentionally invalid: violates the outbox primary key by reusing event_id twice
        // inside the same transaction with a raw INSERT (no ON CONFLICT) to force a failure.
        await db.run(
          "INSERT INTO local_event_outbox (event_id, type, serialized_payload, created_at) VALUES ('dup', 'x', '{}', 1);",
        );
        await db.run(
          "INSERT INTO local_event_outbox (event_id, type, serialized_payload, created_at) VALUES ('dup', 'x', '{}', 1);",
        );
      }),
    ).rejects.toThrow();

    const session = await sessions.getById('primary');
    expect(session?.elapsed_seconds).toBe(0);
    const outboxCount = await db.get<{ total: number }>('SELECT COUNT(*) as total FROM local_event_outbox;');
    expect(outboxCount?.total).toBe(0);
  });
});
