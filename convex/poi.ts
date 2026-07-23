import { getAuthUserId } from '@convex-dev/auth/server';
import { mutationGeneric as mutation, queryGeneric as query } from 'convex/server';
import { v } from 'convex/values';

import { checkAndGrantAchievements } from './achievements';
import { PROGRESSION_VERSION } from './progressionRules';
import {
  hasReachedCommonDailyCap,
  isPubliclyDiscoverable,
  isWithinDiscoveryRadius,
  poiRewardXp,
} from './poiRules';
import { bumpUserStatsCounter } from './userStatsCounters';
import { awardXp } from './xpAward';
import { gameDayKey } from './xpLedgerRules';

const categoryValidator = v.union(
  v.literal('nature'),
  v.literal('culture'),
  v.literal('viewpoint'),
  v.literal('gastronomy'),
  v.literal('sport'),
  v.literal('history'),
);

/**
 * TQ-29b: idempotent upsert keyed by sourceId (the external provider's own
 * element id, e.g. "osm:node:12345") — called by syncPoiFromOverpass
 * (poiSync.ts) via makeFunctionReference rather than a direct import,
 * since it's invoked from an *action*, not another mutation (see poiSync.ts
 * for why that needs a different call mechanism than awardXp's).
 * Re-running a sync is always safe: an existing row is patched in place
 * (name/location can drift as the source data changes), never duplicated.
 */
export const upsertPoiBatch = mutation({
  args: {
    pois: v.array(
      v.object({
        sourceId: v.string(),
        name: v.string(),
        category: categoryValidator,
        rarity: v.union(v.literal('common'), v.literal('rare')),
        latitude: v.number(),
        longitude: v.number(),
        discoveryRadiusMeters: v.number(),
      }),
    ),
    now: v.number(),
  },
  returns: v.object({ inserted: v.number(), updated: v.number() }),
  handler: async (ctx: any, args: any) => {
    let inserted = 0;
    let updated = 0;
    for (const poi of args.pois) {
      const existing = await ctx.db
        .query('poi')
        .withIndex('by_source', (q: any) => q.eq('sourceId', poi.sourceId))
        .unique();

      if (existing) {
        await ctx.db.patch(existing._id, {
          name: poi.name,
          category: poi.category,
          rarity: poi.rarity,
          latitude: poi.latitude,
          longitude: poi.longitude,
          discoveryRadiusMeters: poi.discoveryRadiusMeters,
          updatedAt: args.now,
        });
        updated += 1;
      } else {
        await ctx.db.insert('poi', {
          sourceId: poi.sourceId,
          name: poi.name,
          category: poi.category,
          rarity: poi.rarity,
          latitude: poi.latitude,
          longitude: poi.longitude,
          discoveryRadiusMeters: poi.discoveryRadiusMeters,
          // New rows default to safe/public — anything ingested here
          // already passed poiSource.ts's allowlist categorization, which
          // is the primary safety filter (see that module's comment).
          safetyStatus: 'safe',
          visibility: 'public',
          updatedAt: args.now,
        });
        inserted += 1;
      }
    }
    return { inserted, updated };
  },
});

const poiMarkerValidator = v.object({
  poiId: v.id('poi'),
  name: v.string(),
  category: categoryValidator,
  rarity: v.union(v.literal('common'), v.literal('rare')),
  latitude: v.number(),
  longitude: v.number(),
  discoveryRadiusMeters: v.number(),
});

// How many public POI rows the by_visibility index is scanned for before
// filtering down to the requested bounding box — same "live query suffices
// at this scale" call as leaderboards.ts's COUNTRY_SCAN_LIMIT; there's no
// real geo-index available here (poi.latitude/longitude aren't indexed as
// a spatial type), so the bbox filter runs in application code over this
// scan window rather than as a proper range query.
const BOUNDS_SCAN_LIMIT = 500;
const MAX_MARKERS = 200;

/**
 * TQ-29 client UI: the first read path for the map — returns publicly
 * discoverable POI within a lat/lng bounding box (the same shape the
 * Leaflet bridge already reports via postBounds()). Never exposes
 * safetyStatus/sourceId/updatedAt to the client — only the fields a map
 * marker + discover-tap actually need.
 */
export const listPoiInBounds = query({
  args: {
    minLatitude: v.number(),
    maxLatitude: v.number(),
    minLongitude: v.number(),
    maxLongitude: v.number(),
  },
  returns: v.array(poiMarkerValidator),
  handler: async (ctx: any, args: any) => {
    const rows = await ctx.db
      .query('poi')
      .withIndex('by_visibility', (q: any) => q.eq('visibility', 'public'))
      .take(BOUNDS_SCAN_LIMIT);

    const markers = [];
    for (const poi of rows) {
      if (markers.length >= MAX_MARKERS) break;
      if (!isPubliclyDiscoverable(poi)) continue;
      if (
        poi.latitude < args.minLatitude ||
        poi.latitude > args.maxLatitude ||
        poi.longitude < args.minLongitude ||
        poi.longitude > args.maxLongitude
      ) {
        continue;
      }
      markers.push({
        poiId: poi._id,
        name: poi.name,
        category: poi.category,
        rarity: poi.rarity,
        latitude: poi.latitude,
        longitude: poi.longitude,
        discoveryRadiusMeters: poi.discoveryRadiusMeters,
      });
    }
    return markers;
  },
});

/**
 * TQ-29: verifies a first-visit POI discovery entirely server-side.
 *
 * - "Radius a integrita se ověřují serverem": the client only supplies its
 *   claimed location; eligibility (safety/visibility) and the distance
 *   check both happen here against the stored POI row, never trusted from
 *   the client.
 * - "Citlivé kategorie jsou vyloučené": isPubliclyDiscoverable rejects
 *   anything not explicitly safetyStatus:'safe' + visibility:'public'.
 * - "Jeden POI dá první odměnu jen jednou": existence of a (userId, poiId)
 *   row in poiDiscoveries is the idempotency check — a repeat call for an
 *   already-discovered POI is a no-op, same pattern as userLevelClaims.
 *
 * userId comes from getAuthUserId(ctx), not a client-supplied argument —
 * this became the first real client caller of this mutation (the map's
 * discover-tap interaction), so it needed the same identity guarantee
 * submitTrackingSession already has (sessions.ts): no caller can claim a
 * discovery "as" another user by passing an arbitrary id.
 */
export const discoverPoi = mutation({
  args: {
    poiId: v.id('poi'),
    latitude: v.number(),
    longitude: v.number(),
    occurredAt: v.number(),
  },
  returns: v.object({ discovered: v.boolean(), awarded: v.number(), reason: v.optional(v.string()) }),
  handler: async (ctx: any, args: any) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error('discoverPoi: not authenticated');

    const poi = await ctx.db.get(args.poiId);
    if (!poi) return { discovered: false, awarded: 0, reason: 'not_found' };
    if (!isPubliclyDiscoverable(poi)) return { discovered: false, awarded: 0, reason: 'ineligible' };
    if (!isWithinDiscoveryRadius({ latitude: args.latitude, longitude: args.longitude }, poi)) {
      return { discovered: false, awarded: 0, reason: 'too_far' };
    }

    const existing = await ctx.db
      .query('poiDiscoveries')
      .withIndex('by_user_poi', (q: any) => q.eq('userId', userId).eq('poiId', args.poiId))
      .unique();
    if (existing) return { discovered: false, awarded: 0, reason: 'already_discovered' };

    const user = await ctx.db.get(userId);
    if (!user) throw new Error('discoverPoi: user not found');
    const dayKey = gameDayKey(args.occurredAt, user.timezone);

    const todayDiscoveries = await ctx.db
      .query('poiDiscoveries')
      .withIndex('by_user_day', (q: any) => q.eq('userId', userId).eq('dayKey', dayKey))
      .collect();
    // Only common-rarity discoveries count against the 10/day cap (docs
    // 03); rare/area POI have no fixed count cap ("dle definice").
    const commonDiscoveriesToday = todayDiscoveries.filter((row: any) => row.poiRarity === 'common').length;

    await ctx.db.insert('poiDiscoveries', {
      userId,
      poiId: args.poiId,
      poiRarity: poi.rarity,
      dayKey,
      firstDiscoveredAt: args.occurredAt,
    });

    // TQ-30: counts every discovery toward the lifetime total (used by the
    // "Průzkum" achievement tier), independent of whether this particular
    // discovery still earns XP under the daily cap below.
    await bumpUserStatsCounter(ctx, userId, 'poiDiscoveriesCount', 1, args.occurredAt);
    await checkAndGrantAchievements(ctx, { userId, occurredAt: args.occurredAt });

    if (hasReachedCommonDailyCap(poi.rarity, commonDiscoveriesToday)) {
      // Discovery itself is still recorded (personal map/history value),
      // just no XP once the daily cap for common POI is reached.
      return { discovered: true, awarded: 0, reason: 'daily_cap_reached' };
    }

    const result = await awardXp(ctx, {
      userId,
      eventId: `poi-discovery:${args.poiId}`,
      sourceType: 'poi',
      sourceId: String(args.poiId),
      amount: poiRewardXp(poi.rarity),
      reasonCode: 'poi_discovery',
      rulesVersion: PROGRESSION_VERSION,
      occurredAt: args.occurredAt,
    });

    return { discovered: true, awarded: result.awarded };
  },
});
