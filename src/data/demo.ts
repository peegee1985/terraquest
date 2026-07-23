import { TrackPoint } from '@/domain/types';

export const demoRoute: TrackPoint[] = [
  { latitude: 50.0874, longitude: 14.4207, timestamp: Date.now() - 300_000 },
  { latitude: 50.0882, longitude: 14.4221, timestamp: Date.now() - 240_000 },
  { latitude: 50.0891, longitude: 14.4233, timestamp: Date.now() - 180_000 },
  { latitude: 50.0902, longitude: 14.4228, timestamp: Date.now() - 120_000 },
  { latitude: 50.0910, longitude: 14.4242, timestamp: Date.now() - 60_000 },
];
