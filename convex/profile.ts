import { mutationGeneric as mutation } from 'convex/server';
import { v } from 'convex/values';

// TQ-45: sets the profile's ISO 3166-1 alpha-2 country code, the field the
// country leaderboard filters on (convex/leaderboards.ts). Deliberately not
// validated against a hardcoded country-code list here — that's a client-side
// concern (a picker backed by a real list), and rejecting unknown codes
// server-side would just make this mutation the single point of failure for
// keeping that list in sync.
export const setCountry = mutation({
  args: { userId: v.id('users'), country: v.string() },
  returns: v.null(),
  handler: async (ctx: any, args: any) => {
    await ctx.db.patch(args.userId, { country: args.country, updatedAt: Date.now() });
    return null;
  },
});
