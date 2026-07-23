import { describe, expect, it } from 'vitest';

import { isWithinAnyZone, redactPointsInZones } from '../src/domain/privacy-zones';

describe('isWithinAnyZone', () => {
  it('is false with no zones', () => {
    expect(isWithinAnyZone({ latitude: 50.0, longitude: 14.4 }, [])).toBe(false);
  });

  it('is true for a point at the zone center', () => {
    const zone = { latitude: 50.0, longitude: 14.4, radiusMeters: 100 };
    expect(isWithinAnyZone({ latitude: 50.0, longitude: 14.4 }, [zone])).toBe(true);
  });

  it('is false for a point well outside every zone radius', () => {
    const zone = { latitude: 50.0, longitude: 14.4, radiusMeters: 50 };
    // ~0.01 degrees latitude is roughly 1.1km — far outside a 50m radius.
    expect(isWithinAnyZone({ latitude: 50.01, longitude: 14.4 }, [zone])).toBe(false);
  });

  it('is true if any one of several zones contains the point', () => {
    const zones = [
      { latitude: 10, longitude: 10, radiusMeters: 50 },
      { latitude: 50.0, longitude: 14.4, radiusMeters: 50 },
    ];
    expect(isWithinAnyZone({ latitude: 50.0, longitude: 14.4 }, zones)).toBe(true);
  });
});

describe('redactPointsInZones', () => {
  it('returns all points unchanged when there are no zones', () => {
    const points = [{ latitude: 50.0, longitude: 14.4 }];
    expect(redactPointsInZones(points, [])).toEqual(points);
  });

  it('drops points inside a zone and keeps points outside it', () => {
    const zone = { latitude: 50.0, longitude: 14.4, radiusMeters: 50 };
    const inside = { latitude: 50.0, longitude: 14.4 };
    const outside = { latitude: 50.02, longitude: 14.4 };
    expect(redactPointsInZones([inside, outside], [zone])).toEqual([outside]);
  });

  it('does not mutate the input array', () => {
    const points = [{ latitude: 1, longitude: 1 }];
    redactPointsInZones(points, []);
    expect(points).toHaveLength(1);
  });
});
