import * as Crypto from 'expo-crypto';

import { bytesToBase64, decryptField, encryptField } from './crypto';
import type {
  LocalExploredCellRow,
  LocalMapRegionRow,
  LocalOutboxEventRow,
  LocalSessionRow,
  LocalTrackPoint,
  LocalTrackPointInput,
  LocalXpProjectionRow,
} from './models';
import type { LocalPersistence } from './persistence.native';

/**
 * Web fallback: expo-sqlite's web backend needs a wasm asset Metro's web
 * export can't resolve without extra bundler config, and expo-secure-store
 * has no web implementation at all. TerraQuest is Android-first (see hub
 * "Rozhodnutí v0.1"); the web build is a preview surface, so this trades
 * cross-reload durability for "doesn't crash the web bundle": everything
 * below lives in memory for the page's lifetime only, behind the exact same
 * LocalPersistence shape the native SQLite-backed app code depends on.
 */
function createInMemoryPersistence(): LocalPersistence {
  const ephemeralMasterKey = bytesToBase64(Crypto.getRandomBytes(32));

  let session: LocalSessionRow | null = null;
  const trackPointsBySession = new Map<string, LocalTrackPoint[]>();
  const exploredCells = new Map<string, LocalExploredCellRow>();
  const outbox = new Map<string, LocalOutboxEventRow>();
  let xpProjection: LocalXpProjectionRow = {
    id: 1,
    confirmed_xp: 0,
    pending_xp: 0,
    server_snapshot_at: null,
    updated_at: 0,
  };
  const mapRegions = new Map<string, LocalMapRegionRow>();
  const preferences = new Map<string, string>();

  return {
    session: {
      async upsert(next) {
        session = next;
      },
      async getById(id) {
        return session && session.id === id ? session : null;
      },
      async getActive() {
        return session && (session.status === 'active' || session.status === 'paused') ? session : null;
      },
      async delete(id) {
        if (session?.id === id) session = null;
      },
    },
    trackPoints: {
      async insert(point: LocalTrackPointInput) {
        // Round-trips through the same AES envelope as native, so behaviour
        // (and any bugs) match across platforms even though nothing here
        // touches SQLite.
        const envelope = await encryptField(
          JSON.stringify({ lat: point.latitude, lon: point.longitude }),
          ephemeralMasterKey,
          (length) => Crypto.getRandomBytes(length),
        );
        const decrypted = JSON.parse(await decryptField(envelope, ephemeralMasterKey)) as {
          lat: number;
          lon: number;
        };
        const existing = trackPointsBySession.get(point.sessionId) ?? [];
        if (existing.some((entry) => entry.sequence === point.sequence)) return;
        existing.push({ ...point, latitude: decrypted.lat, longitude: decrypted.lon });
        trackPointsBySession.set(point.sessionId, existing);
      },
      async listBySession(sessionId) {
        return [...(trackPointsBySession.get(sessionId) ?? [])].sort((a, b) => a.sequence - b.sequence);
      },
      async deleteBySession(sessionId) {
        trackPointsBySession.delete(sessionId);
      },
      async pruneToLast(sessionId, limit) {
        const existing = trackPointsBySession.get(sessionId);
        if (!existing) return;
        existing.sort((a, b) => a.sequence - b.sequence);
        trackPointsBySession.set(sessionId, existing.slice(-limit));
      },
      async count(sessionId) {
        return trackPointsBySession.get(sessionId)?.length ?? 0;
      },
    },
    exploredCells: {
      async upsertSeen(input) {
        const existing = exploredCells.get(input.h3Index);
        // TQ-23: normalized_for_xp is sticky (OR across calls) — mirrors the
        // native repository's MAX-on-conflict update.
        const normalizedForXp = existing?.normalized_for_xp === 1 || input.normalizedForXp ? 1 : 0;
        exploredCells.set(input.h3Index, {
          h3_index: input.h3Index,
          first_seen: existing?.first_seen ?? input.seenAt,
          last_seen: input.seenAt,
          mode_mask: (existing?.mode_mask ?? 0) | input.modeBit,
          sync_state: existing?.sync_state ?? 'pending',
          source_session_id: input.sourceSessionId,
          visual_only: normalizedForXp === 1 ? 0 : input.visualOnly === false ? 0 : 1,
          normalized_for_xp: normalizedForXp,
        });
      },
      async listPendingSync() {
        return [...exploredCells.values()].filter((cell) => cell.sync_state === 'pending');
      },
      async listAllCellIds() {
        return [...exploredCells.keys()];
      },
      async countNormalizedForXp() {
        return [...exploredCells.values()].filter((cell) => cell.normalized_for_xp === 1).length;
      },
      async markSynced(h3Indexes) {
        for (const h3Index of h3Indexes) {
          const cell = exploredCells.get(h3Index);
          if (cell) cell.sync_state = 'synced';
        }
      },
      async count() {
        return exploredCells.size;
      },
    },
    outbox: {
      async enqueue(input) {
        if (outbox.has(input.eventId)) return;
        outbox.set(input.eventId, {
          event_id: input.eventId,
          type: input.type,
          serialized_payload: JSON.stringify(input.payload),
          created_at: input.createdAt,
          attempt_count: 0,
          next_attempt_at: null,
          state: 'pending',
          last_error_class: null,
        });
      },
      async listDue(now) {
        return [...outbox.values()].filter(
          (event) => event.state === 'pending' && (event.next_attempt_at === null || event.next_attempt_at <= now),
        );
      },
      async markSent(eventId) {
        const event = outbox.get(eventId);
        if (event) event.state = 'sent';
      },
      async recordFailure(input) {
        const event = outbox.get(input.eventId);
        if (!event) return;
        event.attempt_count += 1;
        event.next_attempt_at = input.nextAttemptAt;
        event.last_error_class = input.errorClass;
        event.state = input.giveUp ? 'failed' : 'pending';
      },
      async count() {
        return outbox.size;
      },
    },
    xpProjection: {
      async get() {
        return xpProjection;
      },
      async addPending(amount, now) {
        xpProjection = { ...xpProjection, pending_xp: xpProjection.pending_xp + amount, updated_at: now };
      },
      async applyServerSnapshot(input) {
        xpProjection = {
          ...xpProjection,
          confirmed_xp: input.confirmedXp,
          pending_xp: 0,
          server_snapshot_at: input.serverSnapshotAt,
          updated_at: input.serverSnapshotAt,
        };
      },
    },
    mapRegions: {
      async upsert(region) {
        mapRegions.set(region.region_id, region);
      },
      async touchUsage(regionId, timestamp) {
        const region = mapRegions.get(regionId);
        if (region) region.last_used_at = timestamp;
      },
      async list() {
        return [...mapRegions.values()].sort((a, b) => b.last_used_at - a.last_used_at);
      },
      async delete(regionId) {
        mapRegions.delete(regionId);
      },
    },
    preferences: {
      async set(key, value) {
        preferences.set(key, value);
      },
      async get(key) {
        return preferences.get(key) ?? null;
      },
      async delete(key) {
        preferences.delete(key);
      },
    },
  };
}

let persistencePromise: Promise<LocalPersistence> | null = null;

export function getLocalPersistence(): Promise<LocalPersistence> {
  if (!persistencePromise) {
    persistencePromise = Promise.resolve(createInMemoryPersistence());
  }
  return persistencePromise;
}
