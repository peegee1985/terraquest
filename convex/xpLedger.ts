import { mutationGeneric as mutation, queryGeneric as query } from 'convex/server';
import { v } from 'convex/values';

import { awardXp } from './xpAward';

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
 * Idempotent, transactional, auditable XP awarding (TQ-26/27) — thin
 * wrapper around the shared awardXp() helper (see xpAward.ts for the full
 * guarantees), which quest claims and streak milestones (TQ-28) also call
 * directly to reuse the exact same path.
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
  handler: async (ctx: any, args: any) => awardXp(ctx, args),
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
