import { ExplorerSnapshot, Quest, TrackPoint } from '@/domain/types';

export const demoSnapshot: ExplorerSnapshot = {
  level: 7,
  totalXp: 5860,
  todaySteps: 4832,
  stepGoal: 6000,
  activeDistanceMeters: 3740,
  newCells: 42,
  streakDays: 6,
  exploredAreaKm2: 12.8,
  discoveredPlaces: 31,
};

export const demoQuests: Quest[] = [
  {
    id: 'daily-steps',
    title: 'Ještě jeden úsek',
    description: 'Udělej dnes 6 000 ověřených kroků.',
    progress: 4832,
    target: 6000,
    unit: 'kroků',
    rewardXp: 100,
    tone: 'brand',
    completed: false,
  },
  {
    id: 'new-cells',
    title: 'Za hranicí známého',
    description: 'Odhal 50 nových průzkumných jednotek.',
    progress: 42,
    target: 50,
    unit: 'oblastí',
    rewardXp: 150,
    tone: 'amber',
    completed: false,
  },
  {
    id: 'active-time',
    title: 'Plynulý pohyb',
    description: 'Buď aktivní alespoň 25 minut.',
    progress: 25,
    target: 25,
    unit: 'min',
    rewardXp: 75,
    tone: 'blue',
    completed: true,
  },
];

export const demoRoute: TrackPoint[] = [
  { latitude: 50.0874, longitude: 14.4207, timestamp: Date.now() - 300_000 },
  { latitude: 50.0882, longitude: 14.4221, timestamp: Date.now() - 240_000 },
  { latitude: 50.0891, longitude: 14.4233, timestamp: Date.now() - 180_000 },
  { latitude: 50.0902, longitude: 14.4228, timestamp: Date.now() - 120_000 },
  { latitude: 50.0910, longitude: 14.4242, timestamp: Date.now() - 60_000 },
];
