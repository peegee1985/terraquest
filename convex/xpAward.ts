import { levelForXp, levelsToClaim, PROGRESSION_VERSION, rankForLevel } from './progressionRules';
import { capBucketKey, clampToCapBudget, gameDayKey, type XpSourceType } from './xpLedgerRules';

export type AwardXpArgs = {
  userId: any;
  eventId: string;
  sourceType: XpSourceType;
  sourceId: string;
  amount: number;
  reasonCode: string;
  rulesVersion: string;
  occurredAt: number;
};

export type AwardXpResult = {
  ledgerId: any;
  awarded: number;
  duplicate: boolean;
  levelUps: { level: number; rankId: string }[];
};

/**
 * TQ-26/28: the single place that ever awards XP — extracted out of the
 * applyXpEvent mutation so quest claims and streak-milestone rewards
 * (TQ-28) can reuse the exact same idempotent/transactional/level-recompute
 * path by calling this function directly, instead of one mutation calling
 * another through a FunctionReference (which needs the generated api.ts
 * this environment doesn't have — same blocker as TQ-18/19/26). Calling a
 * plain function from within another mutation's handler still runs inside
 * that mutation's own atomic transaction, so all the same guarantees hold.
 *
 * - Idempotent: user_id + event_id + source_type never creates XP twice —
 *   checked via the by_user_event index, disambiguated by sourceType in
 *   memory (Convex indexes here only cover [userId, eventId]).
 * - Transactional: Convex commits every read+write a mutation makes as one
 *   atomic unit with optimistic concurrency control, so the cap-budget and
 *   level-claim read-then-write sequences below can't race with a
 *   concurrent call for the same user.
 * - Auditable: xpLedger is insert-only from here on — nothing is ever
 *   patched or deleted, so the full ledger reconstructs history at any
 *   point. userStats is a derived projection kept in sync in the same
 *   transaction, never the source of truth.
 */
export async function awardXp(ctx: any, args: AwardXpArgs): Promise<AwardXpResult> {
  const existingForEvent = await ctx.db
    .query('xpLedger')
    .withIndex('by_user_event', (q: any) => q.eq('userId', args.userId).eq('eventId', args.eventId))
    .collect();
  const duplicate = existingForEvent.find((row: any) => row.sourceType === args.sourceType);
  if (duplicate) {
    return { ledgerId: duplicate._id, awarded: 0, duplicate: true, levelUps: [] };
  }

  const user = await ctx.db.get(args.userId);
  if (!user) throw new Error('awardXp: user not found');

  const dayKey = gameDayKey(args.occurredAt, user.timezone);
  const bucket = capBucketKey(args.sourceType, dayKey);

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
  // userLevelClaims IS the idempotency check, so a level's reward is
  // granted at most once no matter how many times this recompute runs.
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
}
