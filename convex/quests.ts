import { getAuthUserId } from '@convex-dev/auth/server';
import { mutationGeneric as mutation, queryGeneric as query } from 'convex/server';
import { v } from 'convex/values';

import { checkAndGrantAchievements } from './achievements';
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
import { bumpUserStatsCounter } from './userStatsCounters';
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
 *
 * userId comes from getAuthUserId(ctx), not a client-supplied argument —
 * this became the first real client caller (the quests screen), so it
 * needs the same identity guarantee as submitTrackingSession/discoverPoi:
 * no caller can generate/read another user's quests by supplying their id.
 */
export const ensureDailyQuests = mutation({
  args: { now: v.number(), isExplorationSaturated: v.boolean() },
  returns: v.array(questRowValidator),
  handler: async (ctx: any, args: any) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error('ensureDailyQuests: not authenticated');
    const user = await ctx.db.get(userId);
    if (!user) throw new Error('ensureDailyQuests: user not found');

    const dayKey = gameDayKey(args.now, user.timezone);
    const existing = await ctx.db
      .query('userQuests')
      .withIndex('by_user_period', (q: any) => q.eq('userId', userId).eq('periodKey', dayKey))
      .collect();
    if (existing.length > 0) return existing.map(toQuestRow);

    const definitions = generateDailyQuests(userId, dayKey, args.isExplorationSaturated);
    const rows: ReturnType<typeof toQuestRow>[] = [];
    for (const definition of definitions) {
      const _id = await ctx.db.insert('userQuests', {
        userId,
        definitionId: definition.definitionId,
        periodKey: dayKey,
        category: definition.category,
        metric: definition.metric,
        kind: 'daily',
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

/** Same idempotency shape as ensureDailyQuests, keyed by week instead of day; same auth-derived userId. */
export const ensureWeeklyQuest = mutation({
  args: { now: v.number() },
  returns: questRowValidator,
  handler: async (ctx: any, args: any) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error('ensureWeeklyQuest: not authenticated');
    const user = await ctx.db.get(userId);
    if (!user) throw new Error('ensureWeeklyQuest: user not found');

    const weekKey = gameWeekKey(args.now, user.timezone);
    const existing = await ctx.db
      .query('userQuests')
      .withIndex('by_user_period', (q: any) => q.eq('userId', userId).eq('periodKey', weekKey))
      .unique();
    if (existing) return toQuestRow(existing);

    const definition = generateWeeklyQuest(userId, weekKey);
    const _id = await ctx.db.insert('userQuests', {
      userId,
      definitionId: definition.definitionId,
      periodKey: weekKey,
      category: definition.category,
      metric: definition.metric,
      kind: 'weekly',
      target: definition.target,
      progress: 0,
      rewardXp: definition.rewardXp,
      status: 'active',
      assignedAt: args.now,
    });
    return { ...definition, _id, periodKey: weekKey, progress: 0, status: 'active' as const };
  },
});

/**
 * Advances a quest's progress; flips it to 'completed' once target is met.
 * A no-op once the quest is no longer 'active' (already
 * completed/claimed/expired), so replaying the same progress update never
 * re-fires completion. Plain function (not exported as a mutation directly)
 * so submitTrackingSession (sessions.ts) can call it within its own
 * transaction — a session's quest progress should land in the same commit
 * as its XP, not a separate round trip.
 */
async function applyUpdateQuestProgress(ctx: any, args: { questId: any; progress: number; now: number }): Promise<void> {
  const quest = await ctx.db.get(args.questId);
  if (!quest || quest.status !== 'active') return;

  const progress = Math.max(quest.progress, args.progress);
  const completed = progress >= quest.target;
  await ctx.db.patch(args.questId, {
    progress,
    status: completed ? 'completed' : 'active',
    completedAt: completed ? args.now : undefined,
  });
}

/**
 * TQ-31 adjacent: called from submitTrackingSession once a tracked session
 * ends, bumping every active quest (today's daily periodKey + this week's
 * weekly periodKey) whose metric this session actually produced evidence
 * for. `steps` is deliberately excluded, even though TQ-46 (Health Connect)
 * now has real step data available — the project's own TQ-46 brainstorm
 * decision (2026-07-23) is explicit: "kroky zůstávají mimo XP ledger"
 * (steps stay out of the XP ledger). Health Connect/HealthKit both accept
 * manually-entered step data from other apps, making a raw step count
 * trivially fakeable — unlike distance/exploration/active-minutes, which
 * are only ever produced by this app's own GPS-derived evidence. A
 * movement-category "steps" quest therefore never progresses via this
 * path; TQ-46's actual reward mechanic is a separate goal-completion
 * streak/badge track, isolated from awardXp, not built here.
 */
export async function applyQuestProgressForSession(
  ctx: any,
  args: { userId: any; now: number; distanceMeters: number; newExplorationUnitsCount: number; elapsedSeconds: number },
): Promise<void> {
  const user = await ctx.db.get(args.userId);
  if (!user) return;

  const dayKey = gameDayKey(args.now, user.timezone);
  const weekKey = gameWeekKey(args.now, user.timezone);
  const [dailyRows, weeklyRows] = await Promise.all([
    ctx.db.query('userQuests').withIndex('by_user_period', (q: any) => q.eq('userId', args.userId).eq('periodKey', dayKey)).collect(),
    ctx.db.query('userQuests').withIndex('by_user_period', (q: any) => q.eq('userId', args.userId).eq('periodKey', weekKey)).collect(),
  ]);

  const activeMinutes = Math.floor(args.elapsedSeconds / 60);
  const contributionFor = (metric: string): number => {
    if (metric === 'new_units') return args.newExplorationUnitsCount;
    if (metric === 'active_minutes') return activeMinutes;
    if (metric === 'distance_m') return args.distanceMeters;
    return 0; // 'steps' — intentionally never awarded XP; see comment above.
  };

  for (const quest of [...dailyRows, ...weeklyRows]) {
    if (quest.status !== 'active') continue;
    const contribution = contributionFor(quest.metric);
    if (contribution <= 0) continue;
    await applyUpdateQuestProgress(ctx, { questId: quest._id, progress: quest.progress + contribution, now: args.now });
  }
}

export const updateQuestProgress = mutation({
  args: { questId: v.id('userQuests'), progress: v.number(), now: v.number() },
  returns: v.null(),
  handler: async (ctx: any, args: any) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error('updateQuestProgress: not authenticated');
    const quest = await ctx.db.get(args.questId);
    if (!quest || quest.userId !== userId) return null;
    await applyUpdateQuestProgress(ctx, args);
    return null;
  },
});

/**
 * TQ-28 acceptance criterion "claim je jednorázový": guarded twice —
 * the status check here (only 'completed' quests can be claimed, so a
 * second call sees 'claimed' and is a no-op) and, underneath, awardXp's own
 * eventId dedup for a concurrent double-claim race. Ownership (quest.userId
 * === the caller) is checked via getAuthUserId(ctx) since this is a real
 * client-invoked mutation (the quests screen's "claim" button) — a client
 * only ever supplies the questId, never whose quest it is.
 */
export const claimQuest = mutation({
  args: { questId: v.id('userQuests'), now: v.number() },
  returns: v.object({ claimed: v.boolean(), awarded: v.number() }),
  handler: async (ctx: any, args: any) => {
    const callerId = await getAuthUserId(ctx);
    if (!callerId) throw new Error('claimQuest: not authenticated');
    const quest = await ctx.db.get(args.questId);
    if (!quest || quest.userId !== callerId || quest.status !== 'completed') return { claimed: false, awarded: 0 };

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

    // TQ-30: quests inserted before the `kind` field existed have none —
    // skip the counter bump rather than guess from periodKey shape.
    if (quest.kind === 'daily') {
      await bumpUserStatsCounter(ctx, quest.userId, 'dailyQuestsClaimedCount', 1, args.now);
    } else if (quest.kind === 'weekly') {
      await bumpUserStatsCounter(ctx, quest.userId, 'weeklyQuestsClaimedCount', 1, args.now);
    }
    await checkAndGrantAchievements(ctx, { userId: quest.userId, occurredAt: args.now });

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
 *
 * TQ-31: extracted to a plain function (same pattern as xpAward.ts's
 * awardXp) so sessions.ts's submitTrackingSession can call it directly
 * within its own transaction — a qualifying session should record its
 * streak day in the same atomic commit as its distance/exploration XP,
 * not via a separate mutation call.
 */
export async function applyRecordQualifyingDay(
  ctx: any,
  args: { userId: any; now: number },
): Promise<{ currentStreakDays: number; streakChanged: boolean; restTokenConsumed: boolean }> {
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

    // TQ-30: longestStreakDays just changed above, so this is the moment
    // a streak-tier achievement (streak_3/7/14/30/100) can newly unlock —
    // the achievement system now owns "grant a badge at day 30" generically
    // rather than questRules.ts's old one-off `badge` field.
    await checkAndGrantAchievements(ctx, { userId: args.userId, occurredAt: args.now });
  }

  return {
    currentStreakDays: result.next.currentStreakDays,
    streakChanged: result.streakChanged,
    restTokenConsumed: result.restTokenConsumed,
  };
}

export const recordQualifyingDay = mutation({
  args: { now: v.number() },
  returns: v.object({ currentStreakDays: v.number(), streakChanged: v.boolean(), restTokenConsumed: v.boolean() }),
  handler: async (ctx: any, args: any) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error('recordQualifyingDay: not authenticated');
    return applyRecordQualifyingDay(ctx, { userId, now: args.now });
  },
});

/**
 * Read-only board for the quests screen: today's daily quests + this
 * week's quest, in one call so the client never needs to replicate
 * gameDayKey/gameWeekKey's timezone-dependent logic itself. userId comes
 * from getAuthUserId(ctx) — same reasoning as ensureDailyQuests above.
 */
export const getMyQuestBoard = query({
  args: { now: v.number() },
  returns: v.object({ daily: v.array(questRowValidator), weekly: v.optional(questRowValidator) }),
  handler: async (ctx: any, args: any) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return { daily: [], weekly: undefined };
    const user = await ctx.db.get(userId);
    if (!user) return { daily: [], weekly: undefined };

    const dayKey = gameDayKey(args.now, user.timezone);
    const weekKey = gameWeekKey(args.now, user.timezone);
    const [dailyRows, weeklyRows] = await Promise.all([
      ctx.db.query('userQuests').withIndex('by_user_period', (q: any) => q.eq('userId', userId).eq('periodKey', dayKey)).collect(),
      ctx.db.query('userQuests').withIndex('by_user_period', (q: any) => q.eq('userId', userId).eq('periodKey', weekKey)).collect(),
    ]);
    const weekly = weeklyRows.find((row: any) => row.kind === 'weekly');
    return {
      daily: dailyRows.filter((row: any) => row.kind === 'daily').map(toQuestRow),
      weekly: weekly ? toQuestRow(weekly) : undefined,
    };
  },
});
