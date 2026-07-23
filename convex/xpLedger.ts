import { mutationGeneric as mutation, queryGeneric as query } from 'convex/server';
import { v } from 'convex/values';

import { levelForXp, levelsToClaim, PROGRESSION_VERSION, rankForLevel } from './progressionRules';
import { capBucketKey, clampToCapBudget, gameDayKey, type XpSourceType } from './xpLedgerRules';

// TQ-26: written against mutationGeneric/queryGeneric from 'convex/server'
// rather than the schema-bound `mutation`/`query` from './_generated/server'
// — that generated file only exists after `npx convex dev`'s interactive
// login has run at least once, unavailable in this environment (the same
// documented blocker as TQ-18/19's client _generated/api codegen). This
// still fully typechecks and deploys; it just infers ctx.db loosely (`any`
// document shapes) instead of getting schema-derived row types.
const sourceTypeValidator = v.union(
  v.literal('distance'),
  v.literal('new_area'),
  v.literal('quest'),
  v.literal('poi'),
  v.literal('streak'),
  v.literal('achievement'),
  v.literal('adjustment'),
);

/**
 * Idempotent, transactional, auditable XP awarding (TQ-26).
 *
 * - Idempotent: user_id + event_id + source_type never creates XP twice —
 *   checked via the by_user_event index, disambiguated by sourceType in
 *   memory (Convex indexes here only cover [userId, eventId]).
 * - Transactional: Convex commits every read+write a mutation makes as one
 *   atomic unit with optimistic concurrency control, so the cap-budget
 *   read-then-clamp-then-insert sequence below can't race with a
 *   concurrent call for the same user/bucket — no explicit transaction API
 *   needed here, unlike the local SQLite side (see session-sync.ts).
 * - Auditable: this table is insert-only from this function on — nothing
 *   is ever patched or deleted, so the full ledger reconstructs history at
 *   any point. userStats.totalXp is a derived running total kept in sync
 *   in the same mutation, never the source of truth.
 */
export const applyXpEvent = mutation({
  args: {
    userId: v.id('users'),
    eventId: v.string(),
    sourceType: sourceTypeValidator,
    sourceId: v.string(),
    amount: v.number(),
    reasonCode: v.string(),
    rulesVersion: v.string(),
    occurredAt: v.number(),
  },
  returns: v.object({
    ledgerId: v.id('xpLedger'),
    awarded: v.number(),
    duplicate: v.boolean(),
    levelUps: v.array(v.object({ level: v.number(), rankId: v.string() })),
  }),
  handler: async (ctx: any, args: any) => {
    const existingForEvent = await ctx.db
      .query('xpLedger')
      .withIndex('by_user_event', (q: any) => q.eq('userId', args.userId).eq('eventId', args.eventId))
      .collect();
    const duplicate = existingForEvent.find((row: any) => row.sourceType === args.sourceType);
    if (duplicate) {
      return { ledgerId: duplicate._id, awarded: 0, duplicate: true, levelUps: [] };
    }

    const user = await ctx.db.get(args.userId);
    if (!user) throw new Error('applyXpEvent: user not found');

    const dayKey = gameDayKey(args.occurredAt, user.timezone);
    const bucket = capBucketKey(args.sourceType as XpSourceType, dayKey);

    let amount = Math.max(0, args.amount);
    if (bucket) {
      const bucketRows = await ctx.db
        .query('xpLedger')
        .withIndex('by_user_cap_bucket', (q: any) => q.eq('userId', args.userId).eq('capBucket', bucket))
        .collect();
      const alreadyAwarded = bucketRows.reduce((sum: number, row: any) => sum + row.amount, 0);
      amount = clampToCapBudget(amount, alreadyAwarded);
    }

    const now = Date.now();
    const ledgerId = await ctx.db.insert('xpLedger', {
      userId: args.userId,
      eventId: args.eventId,
      sourceType: args.sourceType,
      sourceId: args.sourceId,
      amount,
      capBucket: bucket ?? undefined,
      reasonCode: args.reasonCode,
      rulesVersion: args.rulesVersion,
      occurredAt: args.occurredAt,
      createdAt: now,
    });

    // Keep userStats.totalXp/level/rankId in sync within the same
    // transaction, so they can never drift from the ledger they're derived
    // from, and a level-up can never be "half applied" by an interruption
    // (TQ-27 acceptance criterion: level-up survives interruption).
    const stats = await ctx.db
      .query('userStats')
      .withIndex('by_user', (q: any) => q.eq('userId', args.userId))
      .unique();
    const previousLevel = stats?.level ?? 1;
    const newTotalXp = (stats?.totalXp ?? 0) + amount;
    const newLevel = levelForXp(newTotalXp);
    const newRankId = rankForLevel(newLevel).rankId;

    if (stats) {
      await ctx.db.patch(stats._id, { totalXp: newTotalXp, level: newLevel, rankId: newRankId, updatedAt: now });
    } else {
      await ctx.db.insert('userStats', {
        userId: args.userId,
        totalXp: newTotalXp,
        level: newLevel,
        rankId: newRankId,
        verifiedSteps: 0,
        verifiedDistanceMeters: 0,
        explorationUnits: 0,
        visualAreaSquareMeters: 0,
        currentStreakDays: 0,
        longestStreakDays: 0,
        updatedAt: now,
      });
    }

    // TQ-27: "odemknutí je idempotentní" — a row's existence in
    // userLevelClaims IS the idempotency check, so even if this recompute
    // ever ran twice for the same crossing (it can't within one atomic
    // mutation, but future callers might recompute defensively), a level's
    // reward is still granted at most once.
    const levelUps: { level: number; rankId: string }[] = [];
    for (const level of levelsToClaim(previousLevel, newLevel)) {
      const alreadyClaimed = await ctx.db
        .query('userLevelClaims')
        .withIndex('by_user_level', (q: any) => q.eq('userId', args.userId).eq('level', level))
        .unique();
      if (alreadyClaimed) continue;

      const rankId = rankForLevel(level).rankId;
      await ctx.db.insert('userLevelClaims', {
        userId: args.userId,
        level,
        rankId,
        progressionVersion: PROGRESSION_VERSION,
        claimedAt: now,
      });
      levelUps.push({ level, rankId });
    }

    return { ledgerId, awarded: amount, duplicate: false, levelUps };
  },
});

/** Read-only audit view of a user's most recent ledger entries. */
export const listForUser = query({
  args: { userId: v.id('users'), limit: v.optional(v.number()) },
  returns: v.array(
    v.object({
      _id: v.id('xpLedger'),
      _creationTime: v.number(),
      sourceType: sourceTypeValidator,
      sourceId: v.string(),
      amount: v.number(),
      capBucket: v.optional(v.string()),
      reasonCode: v.string(),
      occurredAt: v.number(),
      createdAt: v.number(),
    }),
  ),
  handler: async (ctx: any, args: any) => {
    const rows = await ctx.db
      .query('xpLedger')
      .withIndex('by_user_created_at', (q: any) => q.eq('userId', args.userId))
      .order('desc')
      .take(args.limit ?? 50);
    return rows.map((row: any) => ({
      _id: row._id,
      _creationTime: row._creationTime,
      sourceType: row.sourceType,
      sourceId: row.sourceId,
      amount: row.amount,
      capBucket: row.capBucket,
      reasonCode: row.reasonCode,
      occurredAt: row.occurredAt,
      createdAt: row.createdAt,
    }));
  },
});
