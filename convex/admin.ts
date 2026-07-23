import { getAuthUserId } from '@convex-dev/auth/server';
import { mutationGeneric as mutation, queryGeneric as query } from 'convex/server';
import { v } from 'convex/values';

import { generatePromoCode, normalizePromoCode } from './promoCodeRules';
import { awardXp } from './xpAward';
import { grantItem } from './inventory';
import { PROGRESSION_VERSION } from './progressionRules';

/**
 * Placeholder admin gate until the real admin web app has its own role
 * system — a hardcoded allowlist of admin emails, checked against the
 * calling user's own authenticated identity. Every admin.ts query/mutation
 * runs this first; it's the only thing standing between "any authenticated
 * user" and full user-management/bonus-granting power, so it must never be
 * skipped on a new export.
 */
const ADMIN_EMAILS: readonly string[] = ['petr.gottstein@gmail.com'];

async function requireAdmin(ctx: any): Promise<void> {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error('requireAdmin: not authenticated');
  const user = await ctx.db.get(userId);
  if (!user?.email || !ADMIN_EMAILS.includes(user.email)) {
    throw new Error('requireAdmin: not an admin');
  }
}

const itemIdValidator = v.union(v.literal('map_theme_token'), v.literal('scanner_pulse'), v.literal('memory_marker'));

function defaultUserStatsRow(userId: any, now: number, overrides: Record<string, unknown> = {}) {
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

async function getStatsRow(ctx: any, userId: any) {
  return ctx.db
    .query('userStats')
    .withIndex('by_user', (q: any) => q.eq('userId', userId))
    .unique();
}

async function findUserByHandle(ctx: any, handle: string) {
  return ctx.db
    .query('users')
    .withIndex('by_handle', (q: any) => q.eq('handle', handle))
    .unique();
}

// Scanning the full users table with a client-side substring filter is the
// same "small user count → live scan suffices" call leaderboards.ts already
// makes (see its COUNTRY_SCAN_LIMIT comment) — revisit only if this stops
// being cheap enough.
const USER_LIST_SCAN_LIMIT = 500;

const userSummaryValidator = v.object({
  userId: v.id('users'),
  handle: v.string(),
  displayName: v.optional(v.string()),
  email: v.optional(v.string()),
  status: v.union(v.literal('active'), v.literal('suspended'), v.literal('deletion_pending')),
  createdAt: v.number(),
  totalXp: v.number(),
  level: v.number(),
  plan: v.optional(v.union(v.literal('free'), v.literal('vip'))),
  xpMultiplier: v.optional(v.number()),
  flaggedForReview: v.optional(v.boolean()),
});

async function toUserSummary(ctx: any, user: any) {
  const stats = await getStatsRow(ctx, user._id);
  return {
    userId: user._id,
    handle: user.handle,
    displayName: user.displayName,
    email: user.email,
    status: user.status,
    createdAt: user.createdAt,
    totalXp: stats?.totalXp ?? 0,
    level: stats?.level ?? 1,
    plan: stats?.plan,
    xpMultiplier: stats?.xpMultiplier,
    flaggedForReview: stats?.flaggedForReview,
  };
}

/** searchTerm matches handle/displayName/email (case-insensitive substring); empty/omitted returns the most recently created users up to the scan limit. */
export const listUsers = query({
  args: { searchTerm: v.optional(v.string()) },
  returns: v.array(userSummaryValidator),
  handler: async (ctx: any, args: any) => {
    await requireAdmin(ctx);
    const users = await ctx.db.query('users').order('desc').take(USER_LIST_SCAN_LIMIT);
    const term = args.searchTerm?.trim().toLowerCase();
    const filtered = term
      ? users.filter(
          (u: any) =>
            u.handle.toLowerCase().includes(term) ||
            u.displayName?.toLowerCase().includes(term) ||
            u.email?.toLowerCase().includes(term),
        )
      : users;
    return Promise.all(filtered.map((u: any) => toUserSummary(ctx, u)));
  },
});

export const listFlaggedUsers = query({
  args: {},
  returns: v.array(userSummaryValidator),
  handler: async (ctx: any) => {
    await requireAdmin(ctx);
    const flaggedStats = await ctx.db.query('userStats').collect();
    const users = await Promise.all(
      flaggedStats
        .filter((s: any) => s.flaggedForReview)
        .map(async (s: any) => {
          const user = await ctx.db.get(s.userId);
          return user ? toUserSummary(ctx, user) : null;
        }),
    );
    return users.filter((u: any) => u !== null);
  },
});

export const getUserDetail = query({
  args: { userId: v.id('users') },
  returns: v.union(
    v.null(),
    v.object({
      userId: v.id('users'),
      handle: v.string(),
      displayName: v.optional(v.string()),
      email: v.optional(v.string()),
      status: v.union(v.literal('active'), v.literal('suspended'), v.literal('deletion_pending')),
      createdAt: v.number(),
      totalXp: v.number(),
      level: v.number(),
      currentStreakDays: v.number(),
      longestStreakDays: v.number(),
      verifiedDistanceMeters: v.number(),
      verifiedSteps: v.number(),
      plan: v.optional(v.union(v.literal('free'), v.literal('vip'))),
      xpMultiplier: v.optional(v.number()),
      planExpiresAt: v.optional(v.number()),
      flaggedForReview: v.optional(v.boolean()),
      flagReason: v.optional(v.string()),
      flaggedAt: v.optional(v.number()),
      inventory: v.array(v.object({ itemId: itemIdValidator, quantity: v.number() })),
      recentXpEvents: v.array(
        v.object({ sourceType: v.string(), reasonCode: v.string(), amount: v.number(), occurredAt: v.number() }),
      ),
    }),
  ),
  handler: async (ctx: any, args: any) => {
    await requireAdmin(ctx);
    const user = await ctx.db.get(args.userId);
    if (!user) return null;
    const stats = await getStatsRow(ctx, args.userId);
    const inventoryRows = await ctx.db
      .query('userInventoryItems')
      .withIndex('by_user_item', (q: any) => q.eq('userId', args.userId))
      .collect();
    const ledgerRows = await ctx.db
      .query('xpLedger')
      .withIndex('by_user_created_at', (q: any) => q.eq('userId', args.userId))
      .order('desc')
      .take(20);

    return {
      userId: user._id,
      handle: user.handle,
      displayName: user.displayName,
      email: user.email,
      status: user.status,
      createdAt: user.createdAt,
      totalXp: stats?.totalXp ?? 0,
      level: stats?.level ?? 1,
      currentStreakDays: stats?.currentStreakDays ?? 0,
      longestStreakDays: stats?.longestStreakDays ?? 0,
      verifiedDistanceMeters: stats?.verifiedDistanceMeters ?? 0,
      verifiedSteps: stats?.verifiedSteps ?? 0,
      plan: stats?.plan,
      xpMultiplier: stats?.xpMultiplier,
      planExpiresAt: stats?.planExpiresAt,
      flaggedForReview: stats?.flaggedForReview,
      flagReason: stats?.flagReason,
      flaggedAt: stats?.flaggedAt,
      inventory: inventoryRows.map((row: any) => ({ itemId: row.itemId, quantity: row.quantity })),
      recentXpEvents: ledgerRows.map((row: any) => ({
        sourceType: row.sourceType,
        reasonCode: row.reasonCode,
        amount: row.amount,
        occurredAt: row.occurredAt,
      })),
    };
  },
});

/** Grants or revokes VIP for a target user by handle. planExpiresAt omitted means a permanent grant (isVipActive treats an absent expiry as never-expiring). */
export const setUserPlan = mutation({
  args: {
    handle: v.string(),
    plan: v.union(v.literal('free'), v.literal('vip')),
    xpMultiplier: v.optional(v.number()),
    planExpiresAt: v.optional(v.number()),
  },
  returns: v.union(v.object({ ok: v.literal(true) }), v.object({ ok: v.literal(false), reason: v.literal('user_not_found') })),
  handler: async (ctx: any, args: any) => {
    await requireAdmin(ctx);

    const targetUser = await findUserByHandle(ctx, args.handle);
    if (!targetUser) return { ok: false as const, reason: 'user_not_found' as const };

    const now = Date.now();
    const stats = await getStatsRow(ctx, targetUser._id);

    const patch = {
      plan: args.plan,
      xpMultiplier: args.plan === 'vip' ? (args.xpMultiplier ?? 1.5) : 1,
      planExpiresAt: args.plan === 'vip' ? args.planExpiresAt : undefined,
      planSource: args.plan === 'vip' ? ('admin_grant' as const) : undefined,
      updatedAt: now,
    };

    if (stats) {
      await ctx.db.patch(stats._id, patch);
    } else {
      await ctx.db.insert('userStats', defaultUserStatsRow(targetUser._id, now, patch));
    }
    return { ok: true as const };
  },
});

/** status='suspended' is this app's ban state — see schema.ts's users.status comment; nothing currently reads it to block sign-in itself (that's a real follow-up), but the client's profile query can gate on it. */
export const banUser = mutation({
  args: { userId: v.id('users') },
  returns: v.null(),
  handler: async (ctx: any, args: any) => {
    await requireAdmin(ctx);
    const user = await ctx.db.get(args.userId);
    if (!user) throw new Error('banUser: user not found');
    await ctx.db.patch(args.userId, { status: 'suspended', updatedAt: Date.now() });
    return null;
  },
});

export const unbanUser = mutation({
  args: { userId: v.id('users') },
  returns: v.null(),
  handler: async (ctx: any, args: any) => {
    await requireAdmin(ctx);
    const user = await ctx.db.get(args.userId);
    if (!user) throw new Error('unbanUser: user not found');
    await ctx.db.patch(args.userId, { status: 'active', updatedAt: Date.now() });
    return null;
  },
});

/** Soft delete — marks the account 'deletion_pending' (schema's existing enum literal, previously unused) rather than erasing rows outright, so a mistaken click stays recoverable until a real purge job (out of scope here) processes it. */
export const deleteUser = mutation({
  args: { userId: v.id('users') },
  returns: v.null(),
  handler: async (ctx: any, args: any) => {
    await requireAdmin(ctx);
    const user = await ctx.db.get(args.userId);
    if (!user) throw new Error('deleteUser: user not found');
    await ctx.db.patch(args.userId, { status: 'deletion_pending', updatedAt: Date.now() });
    return null;
  },
});

export const flagUser = mutation({
  args: { userId: v.id('users'), reason: v.string() },
  returns: v.null(),
  handler: async (ctx: any, args: any) => {
    await requireAdmin(ctx);
    const now = Date.now();
    const stats = await getStatsRow(ctx, args.userId);
    const patch = { flaggedForReview: true, flagReason: args.reason, flaggedAt: now, updatedAt: now };
    if (stats) {
      await ctx.db.patch(stats._id, patch);
    } else {
      await ctx.db.insert('userStats', defaultUserStatsRow(args.userId, now, patch));
    }
    return null;
  },
});

export const unflagUser = mutation({
  args: { userId: v.id('users') },
  returns: v.null(),
  handler: async (ctx: any, args: any) => {
    await requireAdmin(ctx);
    const stats = await getStatsRow(ctx, args.userId);
    if (!stats) return null;
    await ctx.db.patch(stats._id, {
      flaggedForReview: false,
      flagReason: undefined,
      flaggedAt: undefined,
      updatedAt: Date.now(),
    });
    return null;
  },
});

/** Manual XP/item bonus, routed through the same awardXp path as every other XP grant (sourceType 'adjustment') so it's auditable in xpLedger like any other award, not a side-channel stat bump. */
export const grantBonus = mutation({
  args: {
    userId: v.id('users'),
    xpAmount: v.optional(v.number()),
    itemId: v.optional(itemIdValidator),
    itemQuantity: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx: any, args: any) => {
    await requireAdmin(ctx);
    const user = await ctx.db.get(args.userId);
    if (!user) throw new Error('grantBonus: user not found');
    const now = Date.now();

    if (args.xpAmount && args.xpAmount > 0) {
      await awardXp(ctx, {
        userId: args.userId,
        eventId: `admin-bonus:${args.userId}:${now}`,
        sourceType: 'adjustment',
        sourceId: `admin-bonus:${now}`,
        amount: args.xpAmount,
        reasonCode: 'admin_bonus',
        rulesVersion: PROGRESSION_VERSION,
        occurredAt: now,
      });
    }

    if (args.itemId && args.itemQuantity && args.itemQuantity > 0) {
      await grantItem(ctx, { userId: args.userId, itemId: args.itemId, quantity: args.itemQuantity, now });
    }
    return null;
  },
});

// --- Discount codes ---------------------------------------------------

const discountCodeValidator = v.object({
  code: v.string(),
  percentOff: v.optional(v.number()),
  bonusXpMultiplier: v.optional(v.number()),
  active: v.boolean(),
  maxRedemptions: v.optional(v.number()),
  redemptionsCount: v.number(),
  expiresAt: v.optional(v.number()),
  note: v.optional(v.string()),
  createdAt: v.number(),
});

export const listDiscountCodes = query({
  args: {},
  returns: v.array(discountCodeValidator),
  handler: async (ctx: any) => {
    await requireAdmin(ctx);
    const rows = await ctx.db.query('discountCodes').order('desc').collect();
    return rows.map((row: any) => ({
      code: row.code,
      percentOff: row.percentOff,
      bonusXpMultiplier: row.bonusXpMultiplier,
      active: row.active,
      maxRedemptions: row.maxRedemptions,
      redemptionsCount: row.redemptionsCount,
      expiresAt: row.expiresAt,
      note: row.note,
      createdAt: row.createdAt,
    }));
  },
});

export const createDiscountCode = mutation({
  args: {
    percentOff: v.optional(v.number()),
    bonusXpMultiplier: v.optional(v.number()),
    maxRedemptions: v.optional(v.number()),
    expiresAt: v.optional(v.number()),
    note: v.optional(v.string()),
  },
  returns: v.object({ code: v.string() }),
  handler: async (ctx: any, args: any) => {
    const adminUserId = await getAuthUserId(ctx);
    await requireAdmin(ctx);
    const adminUser = adminUserId ? await ctx.db.get(adminUserId) : null;
    const code = generatePromoCode(crypto.getRandomValues(new Uint8Array(8)));
    await ctx.db.insert('discountCodes', {
      code,
      percentOff: args.percentOff,
      bonusXpMultiplier: args.bonusXpMultiplier,
      active: true,
      maxRedemptions: args.maxRedemptions,
      redemptionsCount: 0,
      expiresAt: args.expiresAt,
      note: args.note,
      createdByAdminEmail: adminUser?.email ?? 'unknown',
      createdAt: Date.now(),
    });
    return { code };
  },
});

export const setDiscountCodeActive = mutation({
  args: { code: v.string(), active: v.boolean() },
  returns: v.null(),
  handler: async (ctx: any, args: any) => {
    await requireAdmin(ctx);
    const row = await ctx.db
      .query('discountCodes')
      .withIndex('by_code', (q: any) => q.eq('code', normalizePromoCode(args.code)))
      .unique();
    if (!row) throw new Error('setDiscountCodeActive: code not found');
    await ctx.db.patch(row._id, { active: args.active });
    return null;
  },
});

// --- Invite codes -------------------------------------------------------

const inviteCodeValidator = v.object({
  code: v.string(),
  active: v.boolean(),
  maxRedemptions: v.optional(v.number()),
  redemptionsCount: v.number(),
  expiresAt: v.optional(v.number()),
  note: v.optional(v.string()),
  createdAt: v.number(),
});

export const listInviteCodes = query({
  args: {},
  returns: v.array(inviteCodeValidator),
  handler: async (ctx: any) => {
    await requireAdmin(ctx);
    const rows = await ctx.db.query('inviteCodes').order('desc').collect();
    return rows.map((row: any) => ({
      code: row.code,
      active: row.active,
      maxRedemptions: row.maxRedemptions,
      redemptionsCount: row.redemptionsCount,
      expiresAt: row.expiresAt,
      note: row.note,
      createdAt: row.createdAt,
    }));
  },
});

export const createInviteCode = mutation({
  args: { maxRedemptions: v.optional(v.number()), expiresAt: v.optional(v.number()), note: v.optional(v.string()) },
  returns: v.object({ code: v.string() }),
  handler: async (ctx: any, args: any) => {
    const adminUserId = await getAuthUserId(ctx);
    await requireAdmin(ctx);
    const adminUser = adminUserId ? await ctx.db.get(adminUserId) : null;
    const code = generatePromoCode(crypto.getRandomValues(new Uint8Array(8)));
    await ctx.db.insert('inviteCodes', {
      code,
      active: true,
      maxRedemptions: args.maxRedemptions,
      redemptionsCount: 0,
      expiresAt: args.expiresAt,
      note: args.note,
      createdByAdminEmail: adminUser?.email ?? 'unknown',
      createdAt: Date.now(),
    });
    return { code };
  },
});

export const setInviteCodeActive = mutation({
  args: { code: v.string(), active: v.boolean() },
  returns: v.null(),
  handler: async (ctx: any, args: any) => {
    await requireAdmin(ctx);
    const row = await ctx.db
      .query('inviteCodes')
      .withIndex('by_code', (q: any) => q.eq('code', normalizePromoCode(args.code)))
      .unique();
    if (!row) throw new Error('setInviteCodeActive: code not found');
    await ctx.db.patch(row._id, { active: args.active });
    return null;
  },
});
