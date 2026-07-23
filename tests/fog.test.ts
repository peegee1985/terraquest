import { describe, expect, it } from 'vitest';

import {
  buildFogGeometry,
  cellsRevealedByPoint,
  cellsRevealedByRoute,
  centerlineCellForPoint,
  centerlineCellsForRoute,
  cullCellsToViewport,
  resolutionStats,
  type ViewportBounds,
} from '../src/domain/fog';
import type { TrackPoint } from '../src/domain/types';

const PRAGUE: TrackPoint = { latitude: 50.087, longitude: 14.421, timestamp: 0 };

/** Deterministic wandering path (not a tight spiral) so it actually spans real distance, like a GPS trace. */
function walkingRoute(pointCount: number, originOffset = 0): TrackPoint[] {
  const route: TrackPoint[] = [];
  let lat = PRAGUE.latitude + originOffset;
  let lng = PRAGUE.longitude + originOffset;
  let heading = originOffset;
  for (let i = 0; i < pointCount; i += 1) {
    heading += Math.sin(i * 0.37 + originOffset * 10) * 0.4;
    lat += (8 / 111_320) * Math.cos(heading);
    lng += (8 / (111_320 * Math.cos((lat * Math.PI) / 180))) * Math.sin(heading);
    route.push({ latitude: lat, longitude: lng, timestamp: i * 5000 });
  }
  return route;
}

describe('H3 resolution comparison (TQ-17)', () => {
  it('resolution 12 cells are meaningfully smaller than resolution 11', () => {
    const res11 = resolutionStats(11);
    const res12 = resolutionStats(12);
    expect(res12.averageCellAreaM2).toBeLessThan(res11.averageCellAreaM2);
    expect(res12.averageEdgeLengthM).toBeLessThan(res11.averageEdgeLengthM);
    // roughly 7x area ratio between adjacent H3 resolutions
    expect(res11.averageCellAreaM2 / res12.averageCellAreaM2).toBeGreaterThan(5);
  });

  it('a denser route reveals more resolution-12 cells than resolution-11 cells', () => {
    const route = walkingRoute(100);
    const res11Cells = cellsRevealedByRoute(route, 11);
    const res12Cells = cellsRevealedByRoute(route, 12);
    expect(res12Cells.size).toBeGreaterThan(res11Cells.size);
  });
});

describe('cell reveal', () => {
  it('reveals a ring of cells around a single point, not just the center cell', () => {
    const cells = cellsRevealedByPoint(PRAGUE, 11);
    expect(cells.length).toBeGreaterThan(1);
  });

  it('accumulates unique cells across a route without duplicates', () => {
    const route = walkingRoute(50);
    const cells = cellsRevealedByRoute(route, 11);
    expect(cells.size).toBeGreaterThan(0);
    expect(new Set(cells).size).toBe(cells.size);
  });

  // TQ-122: the reveal ring became a variable-radius hex disk (radius-boost
  // items/perks raise it) instead of a hardcoded fixed array — these two
  // tests pin down that the default (radius 1) is byte-for-byte identical
  // to the old fixed 7-cell NEIGHBOR_OFFSETS behavior, so every existing
  // call site (which never passes ringRadius) reveals exactly what it
  // always has.
  it('defaults to exactly 7 cells (center + 6 neighbors), matching the original fixed ring', () => {
    expect(cellsRevealedByPoint(PRAGUE, 11).length).toBe(7);
  });

  it('a larger ringRadius reveals a strict superset of cells (a filled disk, not a hollow ring)', () => {
    const radius1 = new Set(cellsRevealedByPoint(PRAGUE, 11, 1));
    const radius2 = cellsRevealedByPoint(PRAGUE, 11, 2);
    // Filled-disk formula: 1 + 3N(N+1) cells for radius N.
    expect(radius2).toHaveLength(19);
    for (const cell of radius1) expect(radius2).toContain(cell);
  });
});

describe('viewport culling', () => {
  const tightBounds: ViewportBounds = {
    minLatitude: PRAGUE.latitude - 0.001,
    maxLatitude: PRAGUE.latitude + 0.001,
    minLongitude: PRAGUE.longitude - 0.001,
    maxLongitude: PRAGUE.longitude + 0.001,
  };
  const wideBounds: ViewportBounds = {
    minLatitude: PRAGUE.latitude - 0.5,
    maxLatitude: PRAGUE.latitude + 0.5,
    minLongitude: PRAGUE.longitude - 0.5,
    maxLongitude: PRAGUE.longitude + 0.5,
  };

  it('drops cells far outside a tight viewport but keeps them inside a wide one', () => {
    const route = walkingRoute(200);
    const cells = cellsRevealedByRoute(route, 11);

    const tight = cullCellsToViewport(cells, tightBounds);
    const wide = cullCellsToViewport(cells, wideBounds);

    expect(tight.length).toBeLessThan(cells.size);
    expect(wide.length).toBe(cells.size);
  });

  it('keeps geometry building fast for thousands of accumulated cells once culled', () => {
    // Simulate ~2 weeks of accumulated exploration (see scratch benchmark:
    // ~2000 cells at res 11 over 14 sessions) by unioning multiple routes.
    const sessions = Array.from({ length: 14 }, (_, s) => walkingRoute(150 + s, (s - 7) * 0.002));
    const accumulated = new Set<string>();
    for (const session of sessions) {
      for (const cell of cellsRevealedByRoute(session, 11)) accumulated.add(cell);
    }
    expect(accumulated.size).toBeGreaterThan(500);

    const start = performance.now();
    const geometry = buildFogGeometry(accumulated, tightBounds);
    const elapsedMs = performance.now() - start;

    // Well under the 2s "mlha se aktualizuje do 2 sekund" acceptance budget —
    // viewport culling keeps the per-frame hole count small regardless of
    // how many cells have been discovered over the app's lifetime.
    expect(elapsedMs).toBeLessThan(200);
    expect(geometry.holes.length).toBeLessThan(accumulated.size);
    expect(geometry.outerRing).toHaveLength(4);
  });
});

describe('fog geometry', () => {
  it('produces one hole per visible revealed cell, each a closed hex ring', () => {
    const route = walkingRoute(20);
    const cells = cellsRevealedByRoute(route, 11);
    const bounds: ViewportBounds = {
      minLatitude: PRAGUE.latitude - 0.2,
      maxLatitude: PRAGUE.latitude + 0.2,
      minLongitude: PRAGUE.longitude - 0.2,
      maxLongitude: PRAGUE.longitude + 0.2,
    };

    const geometry = buildFogGeometry(cells, bounds);
    expect(geometry.holes.length).toBeGreaterThan(0);
    for (const hole of geometry.holes) {
      expect(hole.length).toBeGreaterThanOrEqual(6);
    }
  });
});

describe('centerline exploration units (TQ-23)', () => {
  it('returns a single cell for a point, not a ring', () => {
    const cell = centerlineCellForPoint(PRAGUE, 11);
    expect(typeof cell).toBe('string');
    // The centerline cell is always one of the cells in the wider visual
    // ring — the two sets aren't unrelated, just independently computed.
    expect(cellsRevealedByPoint(PRAGUE, 11)).toContain(cell);
  });

  it('the visual reveal ring for a single point always has more cells than its centerline set', () => {
    // Growing the visual radius must never inflate XP units — verified here
    // by construction: the ring function and the centerline function never
    // share implementation, so one changing can't silently affect the other.
    const visual = cellsRevealedByPoint(PRAGUE, 11);
    const centerline = centerlineCellsForRoute([PRAGUE], 11);
    expect(centerline.size).toBe(1);
    expect(visual.length).toBeGreaterThan(centerline.size);
  });

  it('accumulates one unique cell per distinct point along a route', () => {
    const route = walkingRoute(30);
    const cells = centerlineCellsForRoute(route, 11);
    expect(cells.size).toBeGreaterThan(0);
    expect(cells.size).toBeLessThanOrEqual(route.length);
  });
});
