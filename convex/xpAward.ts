import { isBoostActive } from './boostRules';
import { grantItem } from './inventory';
import { levelRewards } from './levelRewardRules';
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

  const statsBeforeAward = await ctx.db
    .query('userStats')
    .withIndex('by_user', (q: any) => q.eq('userId', args.userId))
    .unique();

  const dayKey = gameDayKey(args.occurredAt, user.timezone);
  const bucket = capBucketKey(args.sourceType, dayKey);

  // TQ-122: an active XP Boost Potion (items.ts's useItem) multiplies every
  // XP award while it hasn't expired — applied before the daily cap clamp
  // below, so DAILY_BASE_XP_CAP stays a real ceiling in XP terms rather
  // than something a boost lets a player exceed.
  const xpBoostMultiplier = isBoostActive(statsBeforeAward?.activeXpBoostExpiresAt, Date.now())
    ? (statsBeforeAward?.activeXpBoostMultiplier ?? 1)
    : 1;

  let amount = Math.round(Math.max(0, args.amount) * xpBoostMultiplier);
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

  const stats = statsBeforeAward;
  const previousLevel = stats?.level ?? 1;
  const newTotalXp = (stats?.totalXp ?? 0) + amount;
  const newLevel = levelForXp(newTotalXp);
  const newRankId = rankForLevel(newLevel).rankId;

  let statsId: any;
  if (stats) {
    statsId = stats._id;
    await ctx.db.patch(statsId, { totalXp: newTotalXp, level: newLevel, rankId: newRankId, updatedAt: now });
  } else {
    statsId = await ctx.db.insert('userStats', {
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
  // TQ-122: levelRewardRules.ts's levelRewards replaces the old single
  // hardcoded item grant — each claimed level can grant any mix of
  // consumables and a permanent reveal-ring bump.
  const levelUps: { level: number; rankId: string }[] = [];
  let permanentRadiusRingBonusGained = 0;
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
    // Safe to call unguarded here (grantItem itself has no dedup check) —
    // this loop iteration only runs once per level thanks to the
    // alreadyClaimed check above, same reasoning achievements.ts documents
    // for its own grantItem call.
    for (const reward of levelRewards(level)) {
      if (reward.kind === 'item') {
        await grantItem(ctx, { userId: args.userId, itemId: reward.itemId, quantity: reward.quantity, now });
      } else {
        permanentRadiusRingBonusGained += reward.ringBonus;
      }
    }
    levelUps.push({ level, rankId });
  }

  if (permanentRadiusRingBonusGained > 0) {
    const statsRow = await ctx.db.get(statsId);
    await ctx.db.patch(statsId, {
      permanentRadiusRingBonus: (statsRow?.permanentRadiusRingBonus ?? 0) + permanentRadiusRingBonusGained,
      updatedAt: now,
    });
  }

  return { ledgerId, awarded: amount, duplicate: false, levelUps };
}
