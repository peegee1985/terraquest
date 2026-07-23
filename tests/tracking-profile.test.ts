import { describe, expect, it } from 'vitest';

import { trackingProfileForMode } from '../src/domain/tracking-profile';

describe('trackingProfileForMode', () => {
  it('stays precise for walk and run (full XP, needs fog-reveal precision)', () => {
    expect(trackingProfileForMode('walk')).toBe('precise');
    expect(trackingProfileForMode('run')).toBe('precise');
  });

  it('relaxes for bike and auto (0.35x/0x XP — precision costs nothing competitive)', () => {
    expect(trackingProfileForMode('bike')).toBe('relaxed');
    expect(trackingProfileForMode('auto')).toBe('relaxed');
  });
});
