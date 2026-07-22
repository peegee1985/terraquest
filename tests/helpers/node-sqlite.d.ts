/**
 * Minimal hand-written ambient types for the subset of node:sqlite used by
 * tests/helpers/node-sqlite-db.ts. Deliberately not sourced from @types/node
 * so the rest of this Expo/React Native project's typecheck never gains
 * Node globals (process, Buffer, require...) — this declaration is scoped
 * to exactly the two APIs the test adapter calls.
 */
declare module 'node:sqlite' {
  export type SqliteInputValue = string | number | bigint | Uint8Array | null;

  export interface StatementResultingChanges {
    changes: number | bigint;
    lastInsertRowid: number | bigint;
  }

  export interface StatementSync {
    run(...params: SqliteInputValue[]): StatementResultingChanges;
    all(...params: SqliteInputValue[]): Record<string, unknown>[];
    get(...params: SqliteInputValue[]): Record<string, unknown> | undefined;
  }

  export class DatabaseSync {
    constructor(location: string);
    exec(sql: string): void;
    prepare(sql: string): StatementSync;
    close(): void;
  }
}

/**
 * Minimal ambient types for the single node:crypto export used by tests
 * (randomBytes, for a real CSPRNG in place of expo-crypto). Same rationale
 * as node:sqlite above — not sourced from @types/node.
 */
declare module 'node:crypto' {
  export function randomBytes(size: number): Uint8Array;
}
