/**
 * TQ-24: pure retry/backoff math for the local outbox. Kept separate from
 * the actual DB-touching orchestration (src/state/session-sync.ts) so it's
 * trivially unit-testable and, per the project's "prahy jsou
 * remote-configurable" convention (see gps-filter.ts, movement.ts),
 * overridable at the call site rather than hardcoded inline.
 */
export type SyncRetryOptions = {
  baseDelayMs: number;
  maxDelayMs: number;
  maxAttempts: number;
};

export const DEFAULT_SYNC_RETRY_OPTIONS: SyncRetryOptions = {
  baseDelayMs: 5_000,
  maxDelayMs: 10 * 60_000,
  maxAttempts: 8,
};

/** Exponential backoff with a hard cap. attemptCount is the number of prior failed attempts (0 before the first retry). */
export function computeRetryDelayMs(attemptCount: number, options: SyncRetryOptions = DEFAULT_SYNC_RETRY_OPTIONS): number {
  const delay = options.baseDelayMs * 2 ** Math.max(0, attemptCount);
  return Math.min(options.maxDelayMs, delay);
}

export function hasExceededRetryBudget(attemptCount: number, options: SyncRetryOptions = DEFAULT_SYNC_RETRY_OPTIONS): boolean {
  return attemptCount >= options.maxAttempts;
}
