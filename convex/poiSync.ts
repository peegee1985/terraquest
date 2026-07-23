import { actionGeneric, makeFunctionReference } from 'convex/server';
import { v } from 'convex/values';

import { DEFAULT_DISCOVERY_RADIUS_METERS, mapOsmElementToPoi, type OsmElement } from './poiSource';

// TQ-29b: matches the project's existing regional-prototype convention
// (fog.ts's REFERENCE_LATITUDE_DEGREES = 50.0 "central Europe" comment,
// the same Prague coordinates used across the test suite) — expanding
// coverage beyond this test region is a later, separate decision.
const DEFAULT_BOUNDING_BOX = { south: 50.05, west: 14.35, north: 50.13, east: 14.5 };

const OVERPASS_TAG_FILTERS = [
  'tourism=viewpoint',
  'historic',
  'tourism=museum',
  'tourism=gallery',
  'tourism=artwork',
  'amenity=theatre',
  'amenity=arts_centre',
  'leisure=park',
  'leisure=nature_reserve',
  'natural=peak',
  'natural=wood',
  'amenity=restaurant',
  'amenity=cafe',
  'amenity=bar',
  'amenity=pub',
  'leisure=sports_centre',
  'leisure=pitch',
  'leisure=stadium',
  'leisure=golf_course',
];

function buildOverpassQuery(box: { south: number; west: number; north: number; east: number }): string {
  const bbox = `${box.south},${box.west},${box.north},${box.east}`;
  // nwr = node/way/relation; [~"^(tag)$"~"."] filters aren't used here —
  // simpler to just OR every concrete key/key=value filter, since the list
  // is short and fixed. `out center;` gives way/relation elements a
  // representative point instead of a full geometry, which is all we need.
  const clauses = OVERPASS_TAG_FILTERS.map((filter) => `nwr[${filter}](${bbox});`).join('\n');
  return `[out:json][timeout:25];(\n${clauses}\n);\nout center tags;`;
}

// Simple starting heuristic — "rare" gets a bigger reward (docs 03: 75-150
// XP) for the more genuinely destination-worthy categories; exact tuning
// per-POI is a later balance pass, not this sync's job.
function inferRarity(element: OsmElement): 'common' | 'rare' {
  const tags = element.tags ?? {};
  if (tags.tourism === 'viewpoint') return 'rare';
  if (tags.historic === 'castle' || tags.historic === 'fort') return 'rare';
  return 'common';
}

const upsertPoiBatchRef = makeFunctionReference<'mutation'>('poi:upsertPoiBatch');
const UPSERT_BATCH_SIZE = 50;

/**
 * TQ-29b: one-off/manually-triggered sync against the public Overpass API
 * (OSM data, ODbL-licensed — attribution required wherever discovered POI
 * are shown to users). Not scheduled/automatic: the public instance's
 * usage policy discourages frequent or large automated queries, so this
 * is meant to be invoked deliberately, not polled.
 *
 * Runs as an *action* (not a mutation) because it needs `fetch` — actions
 * can't touch ctx.db directly, so it calls the upsertPoiBatch mutation via
 * makeFunctionReference('poi:upsertPoiBatch') instead of a generated
 * api.ts reference (same environment blocker as TQ-18/19/26; Convex's own
 * docs note FunctionReferences can be constructed from a plain string for
 * exactly this "no generated code" situation).
 */
export const syncPoiFromOverpass = actionGeneric({
  args: {
    south: v.optional(v.number()),
    west: v.optional(v.number()),
    north: v.optional(v.number()),
    east: v.optional(v.number()),
  },
  returns: v.object({ fetched: v.number(), mapped: v.number(), inserted: v.number(), updated: v.number() }),
  handler: async (ctx: any, args: any) => {
    const box = {
      south: args.south ?? DEFAULT_BOUNDING_BOX.south,
      west: args.west ?? DEFAULT_BOUNDING_BOX.west,
      north: args.north ?? DEFAULT_BOUNDING_BOX.north,
      east: args.east ?? DEFAULT_BOUNDING_BOX.east,
    };

    const response = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: buildOverpassQuery(box),
    });
    if (!response.ok) {
      throw new Error(`syncPoiFromOverpass: Overpass API returned ${response.status}`);
    }
    const data = (await response.json()) as { elements: OsmElement[] };
    const elements = data.elements ?? [];

    const mapped = elements
      .map((element) => {
        const poi = mapOsmElementToPoi(element);
        if (!poi) return null;
        return { ...poi, rarity: inferRarity(element), discoveryRadiusMeters: DEFAULT_DISCOVERY_RADIUS_METERS };
      })
      .filter((poi): poi is NonNullable<typeof poi> => poi !== null);

    let inserted = 0;
    let updated = 0;
    const now = Date.now();
    for (let i = 0; i < mapped.length; i += UPSERT_BATCH_SIZE) {
      const batch = mapped.slice(i, i + UPSERT_BATCH_SIZE);
      const result = await ctx.runMutation(upsertPoiBatchRef, { pois: batch, now });
      inserted += result.inserted;
      updated += result.updated;
    }

    return { fetched: elements.length, mapped: mapped.length, inserted, updated };
  },
});
