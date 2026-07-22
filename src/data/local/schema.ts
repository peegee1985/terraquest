/**
 * Local SQLite schema for the "Lokální Room databáze" section of
 * docs 02 — Databázový model, adapted from Room (native Android) to
 * expo-sqlite. Table names and columns intentionally mirror the Notion
 * spec (local_session, local_track_point, ...) for traceability.
 */
export const CREATE_TABLE_STATEMENTS: readonly string[] = [
  `CREATE TABLE IF NOT EXISTS local_session (
    id TEXT PRIMARY KEY NOT NULL,
    status TEXT NOT NULL,
    mode TEXT NOT NULL,
    started_at INTEGER,
    ended_at INTEGER,
    elapsed_seconds INTEGER NOT NULL DEFAULT 0,
    distance_m REAL NOT NULL DEFAULT 0,
    new_cells INTEGER NOT NULL DEFAULT 0,
    xp_pending INTEGER NOT NULL DEFAULT 0,
    last_confirmed_sequence INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS local_track_point (
    session_id TEXT NOT NULL,
    sequence INTEGER NOT NULL,
    position_ciphertext TEXT NOT NULL,
    position_iv TEXT NOT NULL,
    position_tag TEXT NOT NULL,
    captured_at INTEGER NOT NULL,
    elapsed_realtime INTEGER,
    accuracy REAL,
    altitude REAL,
    speed REAL,
    bearing REAL,
    provider TEXT,
    activity_mode TEXT,
    mock_flag INTEGER NOT NULL DEFAULT 0,
    upload_chunk_id TEXT,
    PRIMARY KEY (session_id, sequence)
  );`,
  `CREATE TABLE IF NOT EXISTS local_explored_cell (
    h3_index TEXT PRIMARY KEY NOT NULL,
    first_seen INTEGER NOT NULL,
    last_seen INTEGER NOT NULL,
    mode_mask INTEGER NOT NULL DEFAULT 0,
    sync_state TEXT NOT NULL DEFAULT 'pending',
    source_session_id TEXT,
    visual_only INTEGER NOT NULL DEFAULT 1,
    normalized_for_xp INTEGER NOT NULL DEFAULT 0
  );`,
  `CREATE TABLE IF NOT EXISTS local_event_outbox (
    event_id TEXT PRIMARY KEY NOT NULL,
    type TEXT NOT NULL,
    serialized_payload TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    attempt_count INTEGER NOT NULL DEFAULT 0,
    next_attempt_at INTEGER,
    state TEXT NOT NULL DEFAULT 'pending',
    last_error_class TEXT
  );`,
  `CREATE TABLE IF NOT EXISTS local_xp_projection (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    confirmed_xp INTEGER NOT NULL DEFAULT 0,
    pending_xp INTEGER NOT NULL DEFAULT 0,
    server_snapshot_at INTEGER,
    updated_at INTEGER NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS local_map_region (
    region_id TEXT PRIMARY KEY NOT NULL,
    version TEXT NOT NULL,
    size_bytes INTEGER NOT NULL DEFAULT 0,
    downloaded_at INTEGER NOT NULL,
    last_used_at INTEGER NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS local_user_preferences (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  );`,
];

export const ALL_LOCAL_TABLE_NAMES: readonly string[] = [
  'local_session',
  'local_track_point',
  'local_explored_cell',
  'local_event_outbox',
  'local_xp_projection',
  'local_map_region',
  'local_user_preferences',
];
