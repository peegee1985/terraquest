import { getAuthUserId } from '@convex-dev/auth/server';
import { mutationGeneric as mutation } from 'convex/server';
import { v } from 'convex/values';

import { PROGRESSION_VERSION } from './progressionRules';
import { applyQuestProgressForSession, applyRecordQualifyingDay } from './quests';
import { bumpUserStatsCounter } from './userStatsCounters';
import { awardXp } from './xpAward';
import { distanceXp, explorationXp, sessionQualifiesForStreak } from './xpLedgerRules';

const movementModeValidator = v.union(v.literal('walk'), v.literal('run'), v.literal('bike'), v.literal('auto'));

/**
 * TQ-31: the first real client→server bridge for tracked movement — until
 * now the XP ledger (TQ-26+) existed but nothing ever fed it real distance
 * or exploration data (see Notion TQ-30's explicit note on the same gap).
 *
 * Identity is never taken from the client: `localSessionId` only identifies
 * *which* local session this is (for the idempotent eventId), never *whose*
 * — `getAuthUserId(ctx)` is the sole source of truth for that, so no caller
 * can submit an event on another user's behalf by supplying their id.
 *
 * distanceMeters/newExplorationUnitsCount are raw evidence the client
 * already validated locally (gps-filter.ts's teleport/accuracy rejection,
 * fog.ts's centerline-cell mode-gating) — the actual XP *amount* is always
 * recomputed here from that evidence, never trusted as a client-supplied
 * number, matching every other award path in this project.
 */
export const submitTrackingSession = mutation({
  args: {
    localSessionId: v.string(),
    startedAt: v.number(),
    endedAt: v.number(),
    movementMode: movementModeValidator,
    elapsedSeconds: v.number(),
    distanceMeters: v.number(),
    newExplorationUnitsCount: v.number(),
  },
  returns: v.object({
    distanceAwarded: v.number(),
    explorationAwarded: v.number(),
    totalConfirmedXp: v.number(),
    levelUps: v.array(v.object({ level: v.number(), rankId: v.string() })),
  }),
  handler: async (ctx: any, args: any) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error('submitTrackingSession: not authenticated');

    const distanceAward = distanceXp(args.distanceMeters, args.movementMode);
    const explorationAward = explorationXp(args.newExplorationUnitsCount, args.movementMode);

    const distanceResult = await awardXp(ctx, {
      userId,
      eventId: `session-distance:${args.localSessionId}:${args.startedAt}`,
      sourceType: 'distance',
      sourceId: args.localSessionId,
      amount: distanceAward,
      reasonCode: 'session_distance',
      rulesVersion: PROGRESSION_VERSION,
      occurredAt: args.endedAt,
    });

    const explorationResult = await awardXp(ctx, {
      userId,
      eventId: `session-exploration:${args.localSessionId}:${args.startedAt}`,
      sourceType: 'new_area',
      sourceId: args.localSessionId,
      amount: explorationAward,
      reasonCode: 'session_exploration',
      rulesVersion: PROGRESSION_VERSION,
      occurredAt: args.endedAt,
    });

    await bumpUserStatsCounter(ctx, userId, 'verifiedDistanceMeters', Math.max(0, args.distanceMeters), args.endedAt);
    await bumpUserStatsCounter(ctx, userId, 'explorationUnits', Math.max(0, args.newExplorationUnitsCount), args.endedAt);

    if (sessionQualifiesForStreak(args.movementMode, args.elapsedSeconds, args.distanceMeters)) {
      await applyRecordQualifyingDay(ctx, { userId, now: args.endedAt });
    }

    await applyQuestProgressForSession(ctx, {
      userId,
      now: args.endedAt,
      distanceMeters: Math.max(0, args.distanceMeters),
      newExplorationUnitsCount: Math.max(0, args.newExplorationUnitsCount),
      elapsedSeconds: Math.max(0, args.elapsedSeconds),
    });

    const stats = await ctx.db
      .query('userStats')
      .withIndex('by_user', (q: any) => q.eq('userId', userId))
      .unique();

    return {
      distanceAwarded: distanceResult.awarded,
      explorationAwarded: explorationResult.awarded,
      totalConfirmedXp: stats?.totalXp ?? 0,
      levelUps: [...distanceResult.levelUps, ...explorationResult.levelUps],
    };
  },
});

