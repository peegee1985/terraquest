import { TrackPoint } from './types';

/**
 * h3-js is a ~550KB Emscripten-derived module with top-level setup code
 * that runs the moment it's `require`'d — not just when its functions are
 * called. Expo Router lazily requires a tab's module graph on first visit,
 * so a plain top-level `import ... from 'h3-js'` in explorer-map.native.tsx
 * meant that graph load (not any H3 call) ran the instant the map screen
 * was first opened. Loading it lazily here, on first actual use, keeps
 * that load off the map screen's default (non-H3) path entirely.
 */
type H3Module = typeof import('h3-js');
let h3Module: H3Module | null = null;
function getH3(): H3Module {
  if (!h3Module) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- intentional lazy load, see comment above
    h3Module = require('h3-js') as H3Module;
  }
  return h3Module;
}

/**
 * H3 resolution comparison for fog-of-war reveal (docs 02, "Otevřené
 * validační experimenty": "Porovnat H3 resolution 11 a 12"). Decision and
 * measured numbers are recorded in TQ-17 in Notion; RESOLUTION below is the
 * chosen default and is intentionally the only place that needs to change
 * if the decision is revisited.
 */
export type FogResolution = 11 | 12;
export const RESOLUTION: FogResolution = 11;

/** One H3 ring around a visited cell — a rough per-ping "you were here" radius. */
const REVEAL_RING_SIZE = 1;

export function cellsRevealedByPoint(point: TrackPoint, resolution: FogResolution = RESOLUTION): string[] {
  const h3 = getH3();
  const center = h3.latLngToCell(point.latitude, point.longitude, resolution);
  return h3.gridDisk(center, REVEAL_RING_SIZE);
}

export function cellsRevealedByRoute(route: readonly TrackPoint[], resolution: FogResolution = RESOLUTION): Set<string> {
  const cells = new Set<string>();
  for (const point of route) {
    for (const cell of cellsRevealedByPoint(point, resolution)) cells.add(cell);
  }
  return cells;
}

export type LatLng = { latitude: number; longitude: number };

export function cellBoundaryLatLng(h3Index: string): LatLng[] {
  return getH3()
    .cellToBoundary(h3Index, false)
    .map(([latitude, longitude]) => ({ latitude, longitude }));
}

export type ViewportBounds = {
  minLatitude: number;
  maxLatitude: number;
  minLongitude: number;
  maxLongitude: number;
};

/**
 * Cheap viewport culling by cell center rather than exact polygon/bbox
 * intersection — a cell whose center is just outside the padded viewport
 * but whose boundary pokes in is rare at these resolutions and, worst
 * case, costs one extra hex at the frame edge. Good enough for a
 * performance prototype; production (TQ-23) can tighten this if profiling
 * shows it matters.
 */
export function isCellCenterInViewport(h3Index: string, bounds: ViewportBounds, paddingDegrees = 0.01): boolean {
  const [latitude, longitude] = cellToBoundaryCenter(h3Index);
  return (
    latitude >= bounds.minLatitude - paddingDegrees &&
    latitude <= bounds.maxLatitude + paddingDegrees &&
    longitude >= bounds.minLongitude - paddingDegrees &&
    longitude <= bounds.maxLongitude + paddingDegrees
  );
}

function cellToBoundaryCenter(h3Index: string): [number, number] {
  const boundary = getH3().cellToBoundary(h3Index, false);
  const sum = boundary.reduce((acc, [lat, lng]) => [acc[0] + lat, acc[1] + lng], [0, 0]);
  return [sum[0] / boundary.length, sum[1] / boundary.length];
}

export function cullCellsToViewport(cellIds: Iterable<string>, bounds: ViewportBounds): string[] {
  const result: string[] = [];
  for (const id of cellIds) {
    if (isCellCenterInViewport(id, bounds)) result.push(id);
  }
  return result;
}

export type FogGeometry = {
  outerRing: LatLng[];
  holes: LatLng[][];
};

const OUTER_RING_PADDING_DEGREES = 0.05;

/**
 * Builds a single "donut" polygon: a bounding rectangle a bit larger than
 * the viewport, with one hole per revealed, currently-visible H3 cell.
 * Rendered with an evenodd/holes fill, this is the fog mask — everything
 * inside the outer ring is dark except the holes.
 */
export function buildFogGeometry(revealedCells: Iterable<string>, bounds: ViewportBounds): FogGeometry {
  const outerRing: LatLng[] = [
    { latitude: bounds.maxLatitude + OUTER_RING_PADDING_DEGREES, longitude: bounds.minLongitude - OUTER_RING_PADDING_DEGREES },
    { latitude: bounds.maxLatitude + OUTER_RING_PADDING_DEGREES, longitude: bounds.maxLongitude + OUTER_RING_PADDING_DEGREES },
    { latitude: bounds.minLatitude - OUTER_RING_PADDING_DEGREES, longitude: bounds.maxLongitude + OUTER_RING_PADDING_DEGREES },
    { latitude: bounds.minLatitude - OUTER_RING_PADDING_DEGREES, longitude: bounds.minLongitude - OUTER_RING_PADDING_DEGREES },
  ];
  const holes = cullCellsToViewport(revealedCells, bounds).map(cellBoundaryLatLng);
  return { outerRing, holes };
}

export type ResolutionStats = {
  resolution: FogResolution;
  averageCellAreaM2: number;
  averageEdgeLengthM: number;
};

/** Real H3 geometry constants per resolution — used to document the TQ-17 decision. */
export function resolutionStats(resolution: FogResolution): ResolutionStats {
  const h3 = getH3();
  return {
    resolution,
    averageCellAreaM2: h3.getHexagonAreaAvg(resolution, 'm2'),
    averageEdgeLengthM: h3.getHexagonEdgeLengthAvg(resolution, 'm'),
  };
}
