import { TrackPoint } from './types';

/**
 * h3-js crashed the app the instant it was `require`'d on this project's
 * Android/Hermes build — a hard, non-catchable engine-level crash (no JS
 * error, no React Error Boundary trigger), not something a try/catch or
 * lazy import could work around. Rather than depend on a compiled/
 * Emscripten-derived library at all, this is a small hand-rolled pointy-
 * top axial hex grid (formulas: https://www.redblobgames.com/grids/hexagons/)
 * over a local equirectangular meters projection — plain trigonometry,
 * nothing that can trip up a JS engine.
 *
 * It is not real H3: cell IDs, boundaries and neighbor rings are specific
 * to this file, not compatible with Uber's H3 spec or explored_cell_shards'
 * eventual real H3 indexes (docs 02). That reconciliation is out of scope
 * for this prototype — TQ-17's job was comparing resolution/rendering
 * performance, which this still does.
 */
export type FogResolution = 11 | 12;
export const RESOLUTION: FogResolution = 11;

/**
 * Edge length per resolution, in meters. These are the real values h3-js
 * reported before it was removed (getHexagonEdgeLengthAvg) — kept as fixed
 * constants so the TQ-17 resolution comparison/decision stays valid even
 * though the grid itself is now hand-rolled.
 */
const EDGE_LENGTH_METERS: Record<FogResolution, number> = {
  11: 28.66389748,
  12: 10.83018784,
};

const METERS_PER_DEGREE_LATITUDE = 111_320;
// Fixed reference latitude (not each point's own) so the lat/lng <-> meters
// projection is consistent for every cell regardless of which point produced
// it — this is a regional prototype (central Europe), not a global grid.
const REFERENCE_LATITUDE_DEGREES = 50.0;
const METERS_PER_DEGREE_LONGITUDE =
  METERS_PER_DEGREE_LATITUDE * Math.cos((REFERENCE_LATITUDE_DEGREES * Math.PI) / 180);

export type LatLng = { latitude: number; longitude: number };

function latLngToMeters(point: LatLng): { x: number; y: number } {
  return {
    x: point.longitude * METERS_PER_DEGREE_LONGITUDE,
    y: point.latitude * METERS_PER_DEGREE_LATITUDE,
  };
}

function metersToLatLng(x: number, y: number): LatLng {
  return {
    latitude: y / METERS_PER_DEGREE_LATITUDE,
    longitude: x / METERS_PER_DEGREE_LONGITUDE,
  };
}

type AxialCoord = { q: number; r: number };

/** Cube-coordinate rounding so fractional axial coords snap to the nearest hex. */
function roundAxial(q: number, r: number): AxialCoord {
  let x = q;
  let z = r;
  let y = -x - z;
  let rx = Math.round(x);
  let ry = Math.round(y);
  let rz = Math.round(z);

  const xDiff = Math.abs(rx - x);
  const yDiff = Math.abs(ry - y);
  const zDiff = Math.abs(rz - z);

  if (xDiff > yDiff && xDiff > zDiff) rx = -ry - rz;
  else if (yDiff > zDiff) ry = -rx - rz;
  else rz = -rx - ry;

  return { q: rx, r: rz };
}

/** Pointy-top axial grid: meters -> nearest hex. */
function metersToAxial(x: number, y: number, size: number): AxialCoord {
  const q = ((Math.sqrt(3) / 3) * x - y / 3) / size;
  const r = ((2 / 3) * y) / size;
  return roundAxial(q, r);
}

/** Pointy-top axial grid: hex center -> meters. */
function axialToMeters(coord: AxialCoord, size: number): { x: number; y: number } {
  return {
    x: size * (Math.sqrt(3) * coord.q + (Math.sqrt(3) / 2) * coord.r),
    y: size * ((3 / 2) * coord.r),
  };
}

const NEIGHBOR_OFFSETS: AxialCoord[] = [
  { q: 0, r: 0 },
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 },
];

function encodeCell(resolution: FogResolution, coord: AxialCoord): string {
  return `${resolution}:${coord.q}:${coord.r}`;
}

function decodeCell(cellId: string): { resolution: FogResolution; coord: AxialCoord } {
  const [resolutionRaw, qRaw, rRaw] = cellId.split(':');
  return {
    resolution: Number(resolutionRaw) as FogResolution,
    coord: { q: Number(qRaw), r: Number(rRaw) },
  };
}

function cellCenterMeters(cellId: string): { x: number; y: number } {
  const { resolution, coord } = decodeCell(cellId);
  return axialToMeters(coord, EDGE_LENGTH_METERS[resolution]);
}

/** One hex ring around a visited cell — a rough per-ping "you were here" radius. */
export function cellsRevealedByPoint(point: TrackPoint, resolution: FogResolution = RESOLUTION): string[] {
  const size = EDGE_LENGTH_METERS[resolution];
  const { x, y } = latLngToMeters(point);
  const center = metersToAxial(x, y, size);
  return NEIGHBOR_OFFSETS.map((offset) => encodeCell(resolution, { q: center.q + offset.q, r: center.r + offset.r }));
}

export function cellsRevealedByRoute(route: readonly TrackPoint[], resolution: FogResolution = RESOLUTION): Set<string> {
  const cells = new Set<string>();
  for (const point of route) {
    for (const cell of cellsRevealedByPoint(point, resolution)) cells.add(cell);
  }
  return cells;
}

/**
 * TQ-23: the single hex cell a point actually falls in — deliberately
 * narrower than cellsRevealedByPoint's ring, and computed independently of
 * it. This is what counts as an "exploration unit" for XP (docs 03:
 * "průzkumná jednotka" = normalized cell intersected by the route's own
 * centerline), so growing the wider visual reveal ring can never inflate
 * XP — the two are separate cell sets by construction, not just by flag.
 */
export function centerlineCellForPoint(point: TrackPoint, resolution: FogResolution = RESOLUTION): string {
  const size = EDGE_LENGTH_METERS[resolution];
  const { x, y } = latLngToMeters(point);
  const center = metersToAxial(x, y, size);
  return encodeCell(resolution, center);
}

export function centerlineCellsForRoute(route: readonly TrackPoint[], resolution: FogResolution = RESOLUTION): Set<string> {
  const cells = new Set<string>();
  for (const point of route) cells.add(centerlineCellForPoint(point, resolution));
  return cells;
}

const HEXAGON_CORNER_COUNT = 6;
/** Pointy-top hexagon corners start 30° off the x-axis. */
const CORNER_ANGLE_OFFSET_DEGREES = -30;

export function cellBoundaryLatLng(cellId: string): LatLng[] {
  const { resolution, coord } = decodeCell(cellId);
  const size = EDGE_LENGTH_METERS[resolution];
  const center = axialToMeters(coord, size);

  const corners: LatLng[] = [];
  for (let i = 0; i < HEXAGON_CORNER_COUNT; i += 1) {
    const angleRad = (Math.PI / 180) * (60 * i + CORNER_ANGLE_OFFSET_DEGREES);
    corners.push(metersToLatLng(center.x + size * Math.cos(angleRad), center.y + size * Math.sin(angleRad)));
  }
  return corners;
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
export function isCellCenterInViewport(cellId: string, bounds: ViewportBounds, paddingDegrees = 0.01): boolean {
  const { x, y } = cellCenterMeters(cellId);
  const { latitude, longitude } = metersToLatLng(x, y);
  return (
    latitude >= bounds.minLatitude - paddingDegrees &&
    latitude <= bounds.maxLatitude + paddingDegrees &&
    longitude >= bounds.minLongitude - paddingDegrees &&
    longitude <= bounds.maxLongitude + paddingDegrees
  );
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
 * the viewport, with one hole per revealed, currently-visible hex cell.
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

/** Regular-hexagon area from edge length: (3√3/2) × edge². */
export function resolutionStats(resolution: FogResolution): ResolutionStats {
  const edge = EDGE_LENGTH_METERS[resolution];
  return {
    resolution,
    averageCellAreaM2: ((3 * Math.sqrt(3)) / 2) * edge * edge,
    averageEdgeLengthM: edge,
  };
}
