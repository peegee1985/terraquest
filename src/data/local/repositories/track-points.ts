import { decryptField, encryptField, type RandomBytesFn } from '../crypto';
import type { LocalTrackPoint, LocalTrackPointInput } from '../models';
import type { LocalDb } from '../types';

type TrackPointRow = {
  session_id: string;
  sequence: number;
  position_ciphertext: string;
  position_iv: string;
  position_tag: string;
  captured_at: number;
  elapsed_realtime: number | null;
  accuracy: number | null;
  altitude: number | null;
  speed: number | null;
  bearing: number | null;
  provider: string | null;
  activity_mode: string | null;
  mock_flag: number;
  upload_chunk_id: string | null;
};

function rowToTrackPoint(row: TrackPointRow, latitude: number, longitude: number): LocalTrackPoint {
  return {
    sessionId: row.session_id,
    sequence: row.sequence,
    latitude,
    longitude,
    capturedAt: row.captured_at,
    elapsedRealtime: row.elapsed_realtime,
    accuracy: row.accuracy,
    altitude: row.altitude,
    speed: row.speed,
    bearing: row.bearing,
    provider: row.provider,
    activityMode: row.activity_mode,
    mockFlag: row.mock_flag === 1,
    uploadChunkId: row.upload_chunk_id,
  };
}

/**
 * Track points carry raw GPS coordinates, the most privacy-sensitive field
 * in the local database (docs 02: "lat/lon šifrovaně"). Latitude/longitude
 * are AES-256-CBC+HMAC encrypted before they ever reach SQLite; every other
 * repository stores plaintext columns.
 */
export function createTrackPointRepository(db: LocalDb, masterKeyBase64: string, randomBytes: RandomBytesFn) {
  return {
    async insert(point: LocalTrackPointInput): Promise<void> {
      const envelope = await encryptField(
        JSON.stringify({ lat: point.latitude, lon: point.longitude }),
        masterKeyBase64,
        randomBytes,
      );
      await db.run(
        `INSERT INTO local_track_point (
          session_id, sequence, position_ciphertext, position_iv, position_tag,
          captured_at, elapsed_realtime, accuracy, altitude, speed, bearing,
          provider, activity_mode, mock_flag, upload_chunk_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(session_id, sequence) DO NOTHING;`,
        [
          point.sessionId,
          point.sequence,
          envelope.ciphertext,
          envelope.iv,
          envelope.tag,
          point.capturedAt,
          point.elapsedRealtime ?? null,
          point.accuracy ?? null,
          point.altitude ?? null,
          point.speed ?? null,
          point.bearing ?? null,
          point.provider ?? null,
          point.activityMode ?? null,
          point.mockFlag ? 1 : 0,
          point.uploadChunkId ?? null,
        ],
      );
    },

    async listBySession(sessionId: string): Promise<LocalTrackPoint[]> {
      const rows = await db.all<TrackPointRow>(
        'SELECT * FROM local_track_point WHERE session_id = ? ORDER BY sequence ASC;',
        [sessionId],
      );
      const points: LocalTrackPoint[] = [];
      for (const row of rows) {
        const decrypted = await decryptField(
          { iv: row.position_iv, ciphertext: row.position_ciphertext, tag: row.position_tag },
          masterKeyBase64,
        );
        const { lat, lon } = JSON.parse(decrypted) as { lat: number; lon: number };
        points.push(rowToTrackPoint(row, lat, lon));
      }
      return points;
    },

    async deleteBySession(sessionId: string): Promise<void> {
      await db.run('DELETE FROM local_track_point WHERE session_id = ?;', [sessionId]);
    },

    /**
     * TQ-24: retention only for points captured at/before a confirmed
     * session's end time — never the blunter deleteBySession. sessionId is
     * a single slot reused across expeditions (see tracking-task.ts), so a
     * still-unconfirmed newer session's points (captured_at strictly after
     * this cutoff) are always safe from a late confirmation of an older one.
     */
    async deleteCapturedUpTo(sessionId: string, cutoffCapturedAt: number): Promise<void> {
      await db.run('DELETE FROM local_track_point WHERE session_id = ? AND captured_at <= ?;', [sessionId, cutoffCapturedAt]);
    },

    /** Keeps only the most recent `limit` points for a session, oldest first dropped. */
    async pruneToLast(sessionId: string, limit: number): Promise<void> {
      await db.run(
        `DELETE FROM local_track_point
         WHERE session_id = ? AND sequence NOT IN (
           SELECT sequence FROM local_track_point WHERE session_id = ? ORDER BY sequence DESC LIMIT ?
         );`,
        [sessionId, sessionId, limit],
      );
    },

    async count(sessionId: string): Promise<number> {
      const row = await db.get<{ total: number }>(
        'SELECT COUNT(*) as total FROM local_track_point WHERE session_id = ?;',
        [sessionId],
      );
      return row?.total ?? 0;
    },
  };
}

export type TrackPointRepository = ReturnType<typeof createTrackPointRepository>;
