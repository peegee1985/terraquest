import { mutationGeneric as mutation } from 'convex/server';
import { v } from 'convex/values';

import { PROGRESSION_VERSION } from './progressionRules';
import {
  hasReachedCommonDailyCap,
  isPubliclyDiscoverable,
  isWithinDiscoveryRadius,
  poiRewardXp,
} from './poiRules';
import { awardXp } from './xpAward';
import { gameDayKey } from './xpLedgerRules';

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
