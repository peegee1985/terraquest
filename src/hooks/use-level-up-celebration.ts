import { useEffect, useRef, useState } from 'react';

import { levelProgress, rankForLevel } from '@/domain/progression';
import { useMyProfile } from '@/state/profile-client';

export type LevelUpEvent = { level: number; rankLabel: string };

/**
 * Watches the live profile's totalXp for a level increase and surfaces it
 * as a one-shot celebration event — a single global watcher here means
 * every XP-awarding path (session finish, quest claim, daily bonus,
 * achievement unlock) triggers the same celebration without each of those
 * call sites needing to individually inspect the levelUps array their own
 * mutation happened to return.
 *
 * previousLevelRef starts at null (not the current level) so mounting
 * this hook fresh — e.g. app relaunch — never fires a celebration for a
 * level the player already reached before this session; only a level
 * crossed *while this hook has been alive* counts.
 */
export function useLevelUpCelebration(): { event: LevelUpEvent | null; dismiss: () => void } {
  const profile = useMyProfile();
  const previousLevelRef = useRef<number | null>(null);
  const [event, setEvent] = useState<LevelUpEvent | null>(null);

  useEffect(() => {
    if (!profile) return;
    const currentLevel = levelProgress(profile.totalXp).level;
    if (previousLevelRef.current !== null && currentLevel > previousLevelRef.current) {
      setEvent({ level: currentLevel, rankLabel: rankForLevel(currentLevel).label });
    }
    previousLevelRef.current = currentLevel;
  }, [profile]);

  return { event, dismiss: () => setEvent(null) };
}
