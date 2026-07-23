/**
 * TQ-30: increments one of userStats' denormalized lifetime counters,
 * creating the row with defaults if this is the user's very first tracked
 * event (mirrors awardXp.ts's own insert-or-patch default-row shape). Kept
 * as a plain function, not a mutation, so callers (discoverPoi, claimQuest)
 * run it inside their own transaction — same pattern as awardXp.
 */
export type UserStatsCounterField =
  | 'poiDiscoveriesCount'
  | 'dailyQuestsClaimedCount'
  | 'weeklyQuestsClaimedCount'
  | 'verifiedDistanceMeters'
  | 'explorationUnits';

export async function bumpUserStatsCounter(
  ctx: any,
  userId: any,
  field: UserStatsCounterField,
  amount: number,
  now: number,
): Promise<void> {
  const stats = await ctx.db
    .query('userStats')
    .withIndex('by_user', (q: any) => q.eq('userId', userId))
    .unique();

  if (stats) {
    await ctx.db.patch(stats._id, { [field]: (stats[field] ?? 0) + amount, updatedAt: now });
    return;
  }

  await ctx.db.insert('userStats', {
    userId,
    totalXp: 0,
    level: 1,
    rankId: 'tulak',
    verifiedSteps: 0,
    verifiedDistanceMeters: 0,
    explorationUnits: 0,
    visualAreaSquareMeters: 0,
    currentStreakDays: 0,
    longestStreakDays: 0,
    [field]: amount,
    updatedAt: now,
  });
}
