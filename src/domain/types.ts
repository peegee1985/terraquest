export type MovementMode = 'walk' | 'run' | 'bike' | 'auto';

export type QuestTone = 'brand' | 'amber' | 'blue';

export type Quest = {
  id: string;
  title: string;
  description: string;
  progress: number;
  target: number;
  unit: string;
  rewardXp: number;
  tone: QuestTone;
  completed: boolean;
};

export type TrackPoint = {
  latitude: number;
  longitude: number;
  accuracy?: number | null;
  timestamp: number;
};

// Local-only fallback for when there's no backend connection to read the
// real total from (see explorer-context.tsx's xpProjection). Every other
// figure the app shows (steps, new areas, streak) now comes straight from
// real sources — Health Connect or the server's userStats — instead of a
// locally-held snapshot, after a bug report showed the home screen was
// still displaying demo placeholder numbers as if they were real.
export type ExplorerSnapshot = {
  totalXp: number;
};
