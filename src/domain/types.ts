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

export type ExplorerSnapshot = {
  level: number;
  totalXp: number;
  todaySteps: number;
  stepGoal: number;
  activeDistanceMeters: number;
  newCells: number;
  streakDays: number;
  exploredAreaKm2: number;
  discoveredPlaces: number;
};
