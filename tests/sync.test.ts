import { describe, expect, it } from 'vitest';

import { computeRetryDelayMs, DEFAULT_SYNC_RETRY_OPTIONS, hasExceededRetryBudget } from '../src/domain/sync';

describe('computeRetryDelayMs', () => {
  it('doubles the delay on each successive attempt', () => {
    expect(computeRetryDelayMs(0)).toBe(DEFAULT_SYNC_RETRY_OPTIONS.baseDelayMs);
    expect(computeRetryDelayMs(1)).toBe(DEFAULT_SYNC_RETRY_OPTIONS.baseDelayMs * 2);
    expect(computeRetryDelayMs(2)).toBe(DEFAULT_SYNC_RETRY_OPTIONS.baseDelayMs * 4);
  });

  it('caps the delay at maxDelayMs', () => {
    expect(computeRetryDelayMs(30)).toBe(DEFAULT_SYNC_RETRY_OPTIONS.maxDelayMs);
  });

  it('respects overridden options', () => {
    const options = { baseDelayMs: 1000, maxDelayMs: 4000, maxAttempts: 3 };
    expect(computeRetryDelayMs(0, options)).toBe(1000);
    expect(computeRetryDelayMs(1, options)).toBe(2000);
    expect(computeRetryDelayMs(5, options)).toBe(4000);
  });
});

describe('hasExceededRetryBudget', () => {
  it('flips true once attemptCount reaches maxAttempts', () => {
    const options = { baseDelayMs: 1000, maxDelayMs: 4000, maxAttempts: 3 };
    expect(hasExceededRetryBudget(2, options)).toBe(false);
    expect(hasExceededRetryBudget(3, options)).toBe(true);
    expect(hasExceededRetryBudget(4, options)).toBe(true);
  });
});
