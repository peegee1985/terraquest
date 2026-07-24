// Memory Marker: a personal location note ("smile more", "don't forget
// milk") placed via the map's tap-to-pick flow (map.tsx) and written in
// memory-marker-new.tsx. Short by design — these are quick reminders, not
// journal entries — and this same cap is enforced again server-side in
// convex/memoryMarkers.ts's placeMemoryMarker (kept in sync manually, same
// pattern as levelRewardRules.ts's client mirror in level-rewards.ts).
export const MEMORY_MARKER_NOTE_MAX_LENGTH = 80;

export function sanitizeMemoryMarkerNote(note: string): string {
  return note.trim().slice(0, MEMORY_MARKER_NOTE_MAX_LENGTH);
}
