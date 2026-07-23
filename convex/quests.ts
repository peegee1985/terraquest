import { mutationGeneric as mutation, queryGeneric as query } from 'convex/server';
import { v } from 'convex/values';

import {
  applyQualifyingDay,
  gameDayKey,
  gameWeekKey,
  generateDailyQuests,
  generateWeeklyQuest,
  streakMilestoneReward,
  type StreakState,
} from './questRules';
import { PROGRESSION_VERSION } from './progressionRules';
import { awardXp } from './xpAward';

const categoryValidator = v.union(v.literal('movement'), v.literal('exploration'), v.literal('discovery'));
const metricValidator = v.union(v.literal('steps'), v.literal('distance_m'), v.literal('new_units'), v.literal('active_minutes'));
const questRowValidator = v.object({
  _id: v.id('userQuests'),
  definitionId: v.string(),
  periodKey: v.string(),
  category: categoryValidator,
  metric: metricValidator,
  target: v.number(),
  progress: v.number(),
  rewardXp: v.number(),
  status: v.union(v.literal('active'), v.literal('completed'), v.literal('claimed'), v.literal('expired')),
});

function toQuestRow(row: any) {
  return {
    _id: row._id,
    definitionId: row.definitionId,
    periodKey: row.periodKey,
    category: row.category,
    metric: row.metric,
    target: row.target,
    progress: row.progress,
    rewardXp: row.rewardXp,
    status: row.status,
  };
}

/**
 * TQ-28 acceptance criterion "denně vzniknou tři vhodné úkoly": idempotent
 * on periodKey — calling this again for a day that already has quests just
 * returns the existing 3 rows instead of creating duplicates.
 *
 * isExplorationSaturated is supplied by the caller rather than computed
 * here: detecting a 14-day new-exploration-units plateau needs a rolling
 * activity history this function doesn't have access to (see questRules.ts
 * module comment) — a reasonable future refinement, not this task's scope.
 */
export const ensureDailyQuests = mutation({
  args: { userId: v.id('users'), now: v.number(), isExplorationSaturated: v.boolean() },
  returns: v.array(questRowValidator),
  handler: async (ctx: any, args: any) => {
    const user = await ctx.db.get(args.userId);
    if (!user) throw new Error('ensureDailyQuests: user not found');

    const dayKey = gameDayKey(args.now, user.timezone);
    const existing = await ctx.db
      .query('userQuests')
      .withIndex('by_user_period', (q: any) => q.eq('userId', args.userId).eq('periodKey', dayKey))
      .collect();
    if (existing.length > 0) return existing.map(toQuestRow);

    const definitions = generateDailyQuests(args.userId, dayKey, args.isExplorationSaturated);
    const rows: ReturnType<typeof toQuestRow>[] = [];
    for (const definition of definitions) {
      const _id = await ctx.db.insert('userQuests', {
        userId: args.userId,
        definitionId: definition.definitionId,
        periodKey: dayKey,
        category: definition.category,
        metric: definition.metric,
        target: definition.target,
        progress: 0,
        rewardXp: definition.rewardXp,
        status: 'active',
        assignedAt: args.now,
      });
      rows.push({ ...definition, _id, periodKey: dayKey, progress: 0, status: 'active' as const });
    }
    return rows;
  },
});

/** Same idempotency shape as ensureDailyQuests, keyed by week instead of day. */
export const ensureWeeklyQuest = mutation({
  args: { userId: v.id('users'), now: v.number() },
  returns: questRowValidator,
  handler: async (ctx: any, args: any) => {
    const user = await ctx.db.get(args.userId);
    if (!user) throw new Error('ensureWeeklyQuest: user not found');

    const weekKey = gameWeekKey(args.now, user.timezone);
    const existing = await ctx.db
      .query('userQuests')
      .withIndex('by_user_period', (q: any) => q.eq('userId', args.userId).eq('periodKey', weekKey))
      .unique();
    if (existing) return toQuestRow(existing);

    const definition = generateWeeklyQuest(args.userId, weekKey);
    const _id = await ctx.db.insert('userQuests', {
      userId: args.userId,
      definitionId: definition.definitionId,
      periodKey: weekKey,
      category: definition.category,
      metric: definition.metric,
      target: definition.target,
      progress: 0,
      rewardXp: definition.rewardXp,
      status: 'active',
      assignedAt: args.now,
    });
    return { ...definition, _id, periodKey: weekKey, progress: 0, status: 'active' as const };
  },
});

/** Advances a quest's progress; flips it to 'completed' once target is met. A no-op once the quest is no longer 'active' (already completed/claimed/expired), so replaying the same progress update never re-fires completion. */
export const updateQuestProgress = mutation({
  args: { questId: v.id('userQuests'), progress: v.number(), now: v.number() },
  returns: v.null(),
  handler: async (ctx: any, args: any) => {
    const quest = await ctx.db.get(args.questId);
    if (!quest || quest.status !== 'active') return null;

    const progress = Math.max(quest.progress, args.progress);
    const completed = progress >= quest.target;
    await ctx.db.patch(args.questId, {
      progress,
      status: completed ? 'completed' : 'active',
      completedAt: completed ? args.now : undefined,
    });
    return null;
  },
});

/**
 * TQ-28 acceptance criterion "claim je jednorázový": guarded twice —
 * the status check here (only 'completed' quests can be claimed, so a
 * second call sees 'claimed' and is a no-op) and, underneath, awardXp's own
 * eventId dedup for a concurrent double-claim race.
 */
export const claimQuest = mutation({
  args: { questId: v.id('userQuests'), now: v.number() },
  returns: v.object({ claimed: v.boolean(), awarded: v.number() }),
  handler: async (ctx: any, args: any) => {
    const quest = await ctx.db.get(args.questId);
    if (!quest || quest.status !== 'completed') return { claimed: false, awarded: 0 };

    const result = await awardXp(ctx, {
      userId: quest.userId,
      eventId: `quest-claim:${args.questId}`,
      sourceType: 'quest',
      sourceId: quest.definitionId,
      amount: quest.rewardXp,
      reasonCode: 'quest_claim',
      rulesVersion: PROGRESSION_VERSION,
      occurredAt: args.now,
    });

    await ctx.db.patch(args.questId, { status: 'claimed', claimedAt: args.now });
    return { claimed: true, awarded: result.awarded };
  },
});

/**
 * Records one qualifying day toward the streak (TQ-28 acceptance criterion
 * "streak respektuje časovou zónu a rest token pravidla"): the day boundary
 * is computed server-side from the user's stored timezone, never a
 * client-supplied "today". Idempotent for the same day; bridges exactly
 * one missed day with a Rest Day Token if available; anything more resets
 * the streak. Awards any streak-milestone XP through the same awardXp path.
 */
export const recordQualifyingDay = mutation({
  args: { userId: v.id('users'), now: v.number() },
  returns: v.object({ currentStreakDays: v.number(), streakChanged: v.boolean(), restTokenConsumed: v.boolean() }),
  handler: async (ctx: any, args: any) => {
    const user = await ctx.db.get(args.userId);
    if (!user) throw new Error('recordQualifyingDay: user not found');

    const dayKey = gameDayKey(args.now, user.timezone);
    const stats = await ctx.db
      .query('userStats')
      .withIndex('by_user', (q: any) => q.eq('userId', args.userId))
      .unique();

    const state: StreakState = {
      currentStreakDays: stats?.currentStreakDays ?? 0,
      longestStreakDays: stats?.longestStreakDays ?? 0,
      lastQualifiedDayKey: stats?.lastQualifiedDayKey ?? null,
      restTokens: stats?.restTokens ?? 0,
    };
    const result = applyQualifyingDay(state, dayKey);

    if (result.streakChanged) {
      if (stats) {
        await ctx.db.patch(stats._id, {
          currentStreakDays: result.next.currentStreakDays,
          longestStreakDays: result.next.longestStreakDays,
          lastQualifiedDayKey: result.next.lastQualifiedDayKey,
          restTokens: result.next.restTokens,
          updatedAt: args.now,
        });
      } else {
        // Brand new user's first-ever qualifying day — no userStats row
        // yet (awardXp normally creates one on first XP, but a streak day
        // can be recorded before any XP event does).
        await ctx.db.insert('userStats', {
          userId: args.userId,
          totalXp: 0,
          level: 1,
          rankId: 'tulak',
          verifiedSteps: 0,
          verifiedDistanceMeters: 0,
          explorationUnits: 0,
          visualAreaSquareMeters: 0,
          currentStreakDays: result.next.currentStreakDays,
          longestStreakDays: result.next.longestStreakDays,
          lastQualifiedDayKey: result.next.lastQualifiedDayKey,
          restTokens: result.next.restTokens,
          updatedAt: args.now,
        });
      }

      const milestone = streakMilestoneReward(result.next.currentStreakDays);
      if (milestone) {
        await awardXp(ctx, {
          userId: args.userId,
          eventId: `streak-milestone:${args.userId}:${dayKey}:${result.next.currentStreakDays}`,
          sourceType: 'streak',
          sourceId: `streak:${result.next.currentStreakDays}`,
          amount: milestone.xp,
          reasonCode: 'streak_milestone',
          rulesVersion: PROGRESSION_VERSION,
          occurredAt: args.now,
        });
      }
    }

    return {
      currentStreakDays: result.next.currentStreakDays,
      streakChanged: result.streakChanged,
      restTokenConsumed: result.restTokenConsumed,
    };
  },
});

/** Read-only view of a user's currently active/completed quests for a given period. */
export const listQuestsForPeriod = query({
  args: { userId: v.id('users'), periodKey: v.string() },
  returns: v.array(questRowValidator),
  handler: async (ctx: any, args: any) => {
    const rows = await ctx.db
      .query('userQuests')
      .withIndex('by_user_period', (q: any) => q.eq('userId', args.userId).eq('periodKey', args.periodKey))
      .collect();
    return rows.map(toQuestRow);
  },
});
