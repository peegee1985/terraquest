import { getAuthUserId } from '@convex-dev/auth/server';
import { mutationGeneric as mutation } from 'convex/server';
import { v } from 'convex/values';

import { checkAndGrantAchievements } from './achievements';
import { applyQualifyingDay, gameDayKey, type StreakState } from './questRules';
import { DEFAULT_DAILY_STEP_GOAL, isValidStepGoalPreset } from './stepGoalRules';

function defaultUserStatsRow(userId: any, now: number, overrides: Record<string, unknown>) {
  return {
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
    updatedAt: now,
    ...overrides,
  };
}

export const setDailyStepGoal = mutation({
  args: { goal: v.number() },
  returns: v.union(v.object({ ok: v.literal(true) }), v.object({ ok: v.literal(false), reason: v.literal('invalid_goal') })),
  handler: async (ctx: any, args: any) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error('setDailyStepGoal: not authenticated');
    if (!isValidStepGoalPreset(args.goal)) return { ok: false as const, reason: 'invalid_goal' as const };

    const now = Date.now();
    const stats = await ctx.db
      .query('userStats')
      .withIndex('by_user', (q: any) => q.eq('userId', userId))
      .unique();
    if (stats) {
      await ctx.db.patch(stats._id, { dailyStepGoal: args.goal, updatedAt: now });
    } else {
      await ctx.db.insert('userStats', defaultUserStatsRow(userId, now, { dailyStepGoal: args.goal }));
    }
    return { ok: true as const };
  },
});

/**
 * TQ-46 anti-cheat: this NEVER calls awardXp. Reaching the daily step goal
 * only updates the isolated stepGoalCurrentStreakDays/
 * stepGoalLongestStreakDays counters and, through
 * checkAndGrantAchievements' 'steps' category, cosmetic-only badge/item
 * rewards (every 'steps' achievement definition has rewardXp: 0 — see
 * achievementRules.ts). Health Connect step counts are client-reported and
 * trivially fakeable by other apps writing manual entries, so this whole
 * track stays isolated from XP/leaderboards by construction — same rule as
 * the 'steps' quest metric in quests.ts's contributionFor.
 *
 * Idempotent per gameDayKey via applyQualifyingDay (questRules.ts) — safe
 * to call repeatedly through the day as the client's Health Connect poll
 * keeps crossing the goal again.
 */
export const recordStepGoalCheckIn = mutation({
  args: { steps: v.number(), now: v.number() },
  returns: v.object({ streakChanged: v.boolean(), currentStreakDays: v.number() }),
  handler: async (ctx: any, args: any) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error('recordStepGoalCheckIn: not authenticated');
    const user = await ctx.db.get(userId);
    if (!user) throw new Error('recordStepGoalCheckIn: user not found');

    const stats = await ctx.db
      .query('userStats')
      .withIndex('by_user', (q: any) => q.eq('userId', userId))
      .unique();
    const goal = stats?.dailyStepGoal ?? DEFAULT_DAILY_STEP_GOAL;
    if (args.steps < goal) {
      return { streakChanged: false, currentStreakDays: stats?.stepGoalCurrentStreakDays ?? 0 };
    }

    const dayKey = gameDayKey(args.now, user.timezone);
    const state: StreakState = {
      currentStreakDays: stats?.stepGoalCurrentStreakDays ?? 0,
      longestStreakDays: stats?.stepGoalLongestStreakDays ?? 0,
      lastQualifiedDayKey: stats?.lastStepGoalDayKey ?? null,
      restTokens: 0, // no rest-token bridging for this isolated track
    };
    const result = applyQualifyingDay(state, dayKey);
    if (!result.streakChanged) {
      return { streakChanged: false, currentStreakDays: state.currentStreakDays };
    }

    if (stats) {
      await ctx.db.patch(stats._id, {
        stepGoalCurrentStreakDays: result.next.currentStreakDays,
        stepGoalLongestStreakDays: result.next.longestStreakDays,
        lastStepGoalDayKey: result.next.lastQualifiedDayKey,
        updatedAt: args.now,
      });
    } else {
      await ctx.db.insert(
        'userStats',
        defaultUserStatsRow(userId, args.now, {
          stepGoalCurrentStreakDays: result.next.currentStreakDays,
          stepGoalLongestStreakDays: result.next.longestStreakDays,
          lastStepGoalDayKey: result.next.lastQualifiedDayKey,
        }),
      );
    }

    await checkAndGrantAchievements(ctx, { userId, occurredAt: args.now });
    return { streakChanged: true, currentStreakDays: result.next.currentStreakDays };
  },
});
