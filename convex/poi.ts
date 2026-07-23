import { mutationGeneric as mutation } from 'convex/server';
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
 */
export const discoverPoi = mutation({
  args: {
    userId: v.id('users'),
    poiId: v.id('poi'),
    latitude: v.number(),
    longitude: v.number(),
    occurredAt: v.number(),
  },
  returns: v.object({ discovered: v.boolean(), awarded: v.number(), reason: v.optional(v.string()) }),
  handler: async (ctx: any, args: any) => {
    const poi = await ctx.db.get(args.poiId);
    if (!poi) return { discovered: false, awarded: 0, reason: 'not_found' };
    if (!isPubliclyDiscoverable(poi)) return { discovered: false, awarded: 0, reason: 'ineligible' };
    if (!isWithinDiscoveryRadius({ latitude: args.latitude, longitude: args.longitude }, poi)) {
      return { discovered: false, awarded: 0, reason: 'too_far' };
    }

    const existing = await ctx.db
      .query('poiDiscoveries')
      .withIndex('by_user_poi', (q: any) => q.eq('userId', args.userId).eq('poiId', args.poiId))
      .unique();
    if (existing) return { discovered: false, awarded: 0, reason: 'already_discovered' };

    const user = await ctx.db.get(args.userId);
    if (!user) throw new Error('discoverPoi: user not found');
    const dayKey = gameDayKey(args.occurredAt, user.timezone);

    const todayDiscoveries = await ctx.db
      .query('poiDiscoveries')
      .withIndex('by_user_day', (q: any) => q.eq('userId', args.userId).eq('dayKey', dayKey))
      .collect();
    // Only common-rarity discoveries count against the 10/day cap (docs
    // 03); rare/area POI have no fixed count cap ("dle definice").
    const commonDiscoveriesToday = todayDiscoveries.filter((row: any) => row.poiRarity === 'common').length;

    await ctx.db.insert('poiDiscoveries', {
      userId: args.userId,
      poiId: args.poiId,
      poiRarity: poi.rarity,
      dayKey,
      firstDiscoveredAt: args.occurredAt,
    });

    // TQ-30: counts every discovery toward the lifetime total (used by the
    // "Průzkum" achievement tier), independent of whether this particular
    // discovery still earns XP under the daily cap below.
    await bumpUserStatsCounter(ctx, args.userId, 'poiDiscoveriesCount', 1, args.occurredAt);
    await checkAndGrantAchievements(ctx, { userId: args.userId, occurredAt: args.occurredAt });

    if (hasReachedCommonDailyCap(poi.rarity, commonDiscoveriesToday)) {
      // Discovery itself is still recorded (personal map/history value),
      // just no XP once the daily cap for common POI is reached.
      return { discovered: true, awarded: 0, reason: 'daily_cap_reached' };
    }

    const result = await awardXp(ctx, {
      userId: args.userId,
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
