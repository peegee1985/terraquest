import { cellToBoundary, getHexagonAreaAvg, getHexagonEdgeLengthAvg, gridDisk, latLngToCell } from 'h3-js';

import { TrackPoint } from './types';

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
  const center = latLngToCell(point.latitude, point.longitude, resolution);
  return gridDisk(center, REVEAL_RING_SIZE);
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
  return cellToBoundary(h3Index, false).map(([latitude, longitude]) => ({ latitude, longitude }));
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
  const boundary = cellToBoundary(h3Index, false);
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
  return {
    resolution,
    averageCellAreaM2: getHexagonAreaAvg(resolution, 'm2'),
    averageEdgeLengthM: getHexagonEdgeLengthAvg(resolution, 'm'),
  };
}
