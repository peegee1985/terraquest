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
    // TQ-46: feeds only the verifiedSteps lifetime stat below, never any
    // XP/quest path (see the brainstorm decision quoted next to
    // applyQuestProgressForSession's call site). 0 when Health Connect is
    // unavailable/permission not granted — the client never omits this, it
    // just sends 0 (see health-connect.ts's getStepsBetween, which itself
    // never throws and returns 0 the same way).
    stepsCount: v.number(),
    // Ambient tracking submits a checkpoint every few minutes rather than
    // once per expedition, so elapsedSeconds/distanceMeters above are only
    // this checkpoint's own delta (correctly small) — but
    // sessionQualifiesForStreak's threshold (20min OR 1km) was written
    // assuming those numbers describe a whole walk. A 5-minute delta at
    // walking pace never reaches either on its own, which would silently
    // stop the daily streak from ever qualifying. These two fields are the
    // day's cumulative totals so far (client-tracked, reset at local
    // midnight) — used ONLY for the streak check below, never for XP
    // amounts or the verifiedDistanceMeters stat, which still use the
    // per-checkpoint delta exactly as before.
    cumulativeElapsedSecondsToday: v.number(),
    cumulativeDistanceMetersToday: v.number(),
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

    // Ambient tracking submits a checkpoint every few minutes rather than
    // once at a manual "finish", all sharing the same localSessionId (a
    // fixed slot, see tracking-task.ts's LOCAL_SESSION_ID) and, since
    // there's no more per-expedition "start" tap, potentially the same
    // startedAt too. awardXp's idempotency key is (userId, eventId,
    // sourceType) with no other disambiguation, so eventId MUST include
    // endedAt — otherwise every checkpoint after the first would collide
    // with the first one's eventId and get silently discarded as a
    // "duplicate" (zero XP), rather than actually being a new checkpoint.
    // Retries of the SAME checkpoint (same endedAt) remain safely
    // idempotent; a later checkpoint (new endedAt) is correctly distinct.
    const distanceResult = await awardXp(ctx, {
      userId,
      eventId: `session-distance:${args.localSessionId}:${args.startedAt}:${args.endedAt}`,
      sourceType: 'distance',
      sourceId: args.localSessionId,
      amount: distanceAward,
      reasonCode: 'session_distance',
      rulesVersion: PROGRESSION_VERSION,
      occurredAt: args.endedAt,
    });

    const explorationResult = await awardXp(ctx, {
      userId,
      eventId: `session-exploration:${args.localSessionId}:${args.startedAt}:${args.endedAt}`,
      sourceType: 'new_area',
      sourceId: args.localSessionId,
      amount: explorationAward,
      reasonCode: 'session_exploration',
      rulesVersion: PROGRESSION_VERSION,
      occurredAt: args.endedAt,
    });

    await bumpUserStatsCounter(ctx, userId, 'verifiedDistanceMeters', Math.max(0, args.distanceMeters), args.endedAt);
    await bumpUserStatsCounter(ctx, userId, 'explorationUnits', Math.max(0, args.newExplorationUnitsCount), args.endedAt);
    if (args.stepsCount > 0) {
      await bumpUserStatsCounter(ctx, userId, 'verifiedSteps', Math.max(0, args.stepsCount), args.endedAt);
    }

    if (sessionQualifiesForStreak(args.movementMode, args.cumulativeElapsedSecondsToday, args.cumulativeDistanceMetersToday)) {
      await applyRecordQualifyingDay(ctx, { userId, now: args.endedAt });
    }

    // stepsCount deliberately does NOT flow into applyQuestProgressForSession
    // — see that function's own comment: TQ-46's brainstorm decision keeps
    // steps out of the XP ledger entirely (Health Connect/HealthKit both
    // accept manually-entered step data from other apps, making a raw step
    // count trivially fakeable). It only feeds the verifiedSteps stat above.
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

