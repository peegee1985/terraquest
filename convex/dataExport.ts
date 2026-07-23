import { getAuthUserId } from '@convex-dev/auth/server';
import { queryGeneric as query } from 'convex/server';
import { v } from 'convex/values';

// TQ-35 (scoped MVP): "Export mých dat" — the client already has the local
// route/session data (SQLite); this covers the piece that only exists
// server-side, the confirmed XP ledger. Only the fields meaningful to a
// user reading their own export are returned (no internal eventId/capBucket
// bookkeeping fields).
export const listMyXpLedger = query({
  args: { limit: v.optional(v.number()) },
  returns: v.array(
    v.object({
      sourceType: v.string(),
      amount: v.number(),
      reasonCode: v.string(),
      occurredAt: v.number(),
    }),
  ),
  handler: async (ctx: any, args: any) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const limit = Math.min(args.limit ?? 200, 500);
    const rows = await ctx.db
      .query('xpLedger')
      .withIndex('by_user_created_at', (q: any) => q.eq('userId', userId))
      .order('desc')
      .take(limit);
    return rows.map((row: any) => ({ sourceType: row.sourceType, amount: row.amount, reasonCode: row.reasonCode, occurredAt: row.occurredAt }));
  },
});
