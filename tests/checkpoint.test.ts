import { describe, expect, it } from 'vitest';

import { isSameLocalDay } from '../src/domain/checkpoint';

describe('isSameLocalDay', () => {
  it('is true for two timestamps on the same day', () => {
    const morning = new Date(2026, 0, 15, 8, 0, 0).getTime();
    const evening = new Date(2026, 0, 15, 22, 0, 0).getTime();
    expect(isSameLocalDay(morning, evening)).toBe(true);
  });

  it('is false across midnight, even if only a moment apart', () => {
    const beforeMidnight = new Date(2026, 0, 15, 23, 59, 59).getTime();
    const afterMidnight = new Date(2026, 0, 16, 0, 0, 1).getTime();
    expect(isSameLocalDay(beforeMidnight, afterMidnight)).toBe(false);
  });

  it('is false for timestamps many days apart', () => {
    const day1 = new Date(2026, 0, 15).getTime();
    const day10 = new Date(2026, 0, 25).getTime();
    expect(isSameLocalDay(day1, day10)).toBe(false);
  });
});
