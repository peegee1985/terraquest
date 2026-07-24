import { describe, expect, it } from 'vitest';

import { MEMORY_MARKER_NOTE_MAX_LENGTH, sanitizeMemoryMarkerNote } from '../src/domain/memory-marker';

describe('sanitizeMemoryMarkerNote', () => {
  it('trims surrounding whitespace', () => {
    expect(sanitizeMemoryMarkerNote('  smile more  ')).toBe('smile more');
  });

  it('leaves a short note untouched', () => {
    expect(sanitizeMemoryMarkerNote("don't forget to grab milk")).toBe("don't forget to grab milk");
  });

  it('caps an overlong note at MEMORY_MARKER_NOTE_MAX_LENGTH characters', () => {
    const long = 'a'.repeat(MEMORY_MARKER_NOTE_MAX_LENGTH + 50);
    const result = sanitizeMemoryMarkerNote(long);
    expect(result).toHaveLength(MEMORY_MARKER_NOTE_MAX_LENGTH);
  });

  it('returns an empty string for whitespace-only input', () => {
    expect(sanitizeMemoryMarkerNote('   ')).toBe('');
  });
});
