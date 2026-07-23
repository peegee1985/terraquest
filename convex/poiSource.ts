/**
 * TQ-29b: pure OSM-tag-to-TerraQuest-category mapping, dependency-free so
 * it's unit-testable without a network call. Deliberately an *allowlist*:
 * only tag combinations recognized below ever map to a category — anything
 * unrecognized (place of worship, cemetery, healthcare, military,
 * government, residential, ...) returns null and is never ingested. This
 * is the primary safety filter for docs 02's "Citlivé objekty a místa
 * nevhodná pro gamifikované návštěvy jsou vyloučené" — allowlisting is
 * simpler to reason about and audit than trying to enumerate every
 * sensitive OSM tag combination that should be blocked.
 */
import type { PoiCategory } from './poiRules';

export type OsmTags = Readonly<Record<string, string>>;

export type OsmElement = {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: OsmTags;
};

export function categorizeOsmTags(tags: OsmTags): PoiCategory | null {
  if (tags.tourism === 'viewpoint') return 'viewpoint';

  if (tags.historic) return 'history';

  if (tags.tourism === 'museum' || tags.tourism === 'gallery' || tags.tourism === 'artwork' || tags.amenity === 'theatre' || tags.amenity === 'arts_centre') {
    return 'culture';
  }

  if (tags.leisure === 'park' || tags.leisure === 'nature_reserve' || tags.natural === 'peak' || tags.natural === 'wood') {
    return 'nature';
  }

  if (tags.amenity === 'restaurant' || tags.amenity === 'cafe' || tags.amenity === 'bar' || tags.amenity === 'pub') {
    return 'gastronomy';
  }

  if (tags.leisure === 'sports_centre' || tags.leisure === 'pitch' || tags.leisure === 'stadium' || tags.leisure === 'golf_course') {
    return 'sport';
  }

  return null;
}

// Defense-in-depth on top of the allowlist above — a name-based check for
// anything that slipped through with a sensitive framing (e.g. a "historic"
// war memorial that is actually a grave site). Not a substitute for the
// allowlist; a second, independent check.
const SENSITIVE_NAME_PATTERN = /hřbitov|cemetery|graveyard|mass grave|memorial.*(dead|fallen)/i;

export function isSensitiveByName(name: string | undefined): boolean {
  return typeof name === 'string' && SENSITIVE_NAME_PATTERN.test(name);
}

export type MappedPoi = {
  sourceId: string;
  name: string;
  category: PoiCategory;
  latitude: number;
  longitude: number;
};

const DEFAULT_DISCOVERY_RADIUS_METERS = 30;

/** Maps one Overpass element to a POI ready for upsertPoiBatch, or null if it's uncategorizable, missing coordinates/a name, or matched the sensitive-name check. */
export function mapOsmElementToPoi(element: OsmElement): MappedPoi | null {
  const tags = element.tags;
  if (!tags) return null;

  const category = categorizeOsmTags(tags);
  if (!category) return null;

  const name = tags.name;
  if (!name || isSensitiveByName(name)) return null;

  const latitude = element.lat ?? element.center?.lat;
  const longitude = element.lon ?? element.center?.lon;
  if (latitude === undefined || longitude === undefined) return null;

  return {
    sourceId: `osm:${element.type}:${element.id}`,
    name,
    category,
    latitude,
    longitude,
  };
}

export { DEFAULT_DISCOVERY_RADIUS_METERS };
