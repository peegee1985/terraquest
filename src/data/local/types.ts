export type SqlParams = readonly (string | number | null)[];

export type RunResult = {
  changes: number;
  lastInsertRowId: number;
};

/**
 * Minimal async SQLite contract shared by the real Expo runtime and the
 * node:sqlite adapter used in tests, so schema/migrations/repositories are
 * written once and exercised against real SQL semantics in both.
 */
export interface LocalDb {
  exec(sql: string): Promise<void>;
  run(sql: string, params?: SqlParams): Promise<RunResult>;
  all<T = unknown>(sql: string, params?: SqlParams): Promise<T[]>;
  get<T = unknown>(sql: string, params?: SqlParams): Promise<T | null>;
  withTransaction<T>(fn: () => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

export interface RandomBytesProvider {
  randomBytes(length: number): Promise<Uint8Array>;
}

export interface SecureKeyStore {
  getOrCreateMasterKey(): Promise<string>;
}
