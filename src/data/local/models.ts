export type MovementMode = 'walk' | 'run' | 'bike' | 'auto';

export type LocalSessionStatus = 'active' | 'paused' | 'processing' | 'completed' | 'rejected';

export type LocalSessionRow = {
  id: string;
  status: LocalSessionStatus;
  mode: MovementMode;
  started_at: number | null;
  ended_at: number | null;
  elapsed_seconds: number;
  distance_m: number;
  new_cells: number;
  xp_pending: number;
  last_confirmed_sequence: number;
  updated_at: number;
};

export type LocalTrackPointInput = {
  sessionId: string;
  sequence: number;
  latitude: number;
  longitude: number;
  capturedAt: number;
  elapsedRealtime?: number | null;
  accuracy?: number | null;
  altitude?: number | null;
  speed?: number | null;
  bearing?: number | null;
  provider?: string | null;
  activityMode?: string | null;
  mockFlag?: boolean;
  uploadChunkId?: string | null;
};

export type LocalTrackPoint = LocalTrackPointInput;

export type LocalExploredCellSyncState = 'pending' | 'synced' | 'error';

export type LocalExploredCellRow = {
  h3_index: string;
  first_seen: number;
  last_seen: number;
  mode_mask: number;
  sync_state: LocalExploredCellSyncState;
  source_session_id: string | null;
  visual_only: number;
  normalized_for_xp: number;
};

export type LocalOutboxState = 'pending' | 'sent' | 'failed';

export type LocalOutboxEventRow = {
  event_id: string;
  type: string;
  serialized_payload: string;
  created_at: number;
  attempt_count: number;
  next_attempt_at: number | null;
  state: LocalOutboxState;
  last_error_class: string | null;
};

export type LocalXpProjectionRow = {
  id: 1;
  confirmed_xp: number;
  pending_xp: number;
  server_snapshot_at: number | null;
  updated_at: number;
};

export type LocalMapRegionRow = {
  region_id: string;
  version: string;
  size_bytes: number;
  downloaded_at: number;
  last_used_at: number;
};

export type LocalUserPreferenceRow = {
  key: string;
  value: string;
  updated_at: number;
};
