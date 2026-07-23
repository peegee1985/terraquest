import { authTables } from '@convex-dev/auth/server';
import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

// Schema version v0.2.0 — adds Convex Auth (TQ-18).

const movementMode = v.union(v.literal('walk'), v.literal('run'), v.literal('bike'), v.literal('auto'));

// `authTables.users` is replaced by our own inlined `users` definition below,
// so it's excluded here to avoid clobbering the app-specific fields.
const { users: _authUsersTable, ...otherAuthTables } = authTables;

export default defineSchema({
  // `users` inlines the fields required by @convex-dev/auth (name, image,
  // email(+verified), phone(+verified), isAnonymous) alongside TerraQuest's
  // own profile fields, instead of spreading `authTables.users`, so that the
  // required app fields (handle, avatarId, ...) stay part of the schema.
  // See node_modules/@convex-dev/auth/src/server/implementation/types.ts.
  users: defineTable({
    // Auth-managed fields.
    name: v.optional(v.string()),
    image: v.optional(v.string()),
    email: v.optional(v.string()),
    emailVerificationTime: v.optional(v.number()),
    phone: v.optional(v.string()),
    phoneVerificationTime: v.optional(v.number()),
    isAnonymous: v.optional(v.boolean()),
    // TerraQuest profile fields.
    handle: v.string(),
    displayName: v.optional(v.string()),
    avatarId: v.string(),
    locale: v.string(),
    timezone: v.string(),
    status: v.union(v.literal('active'), v.literal('suspended'), v.literal('deletion_pending')),
    consentVersion: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_handle', ['handle'])
    .index('email', ['email'])
    .index('phone', ['phone']),

  ...otherAuthTables,

  userStats: defineTable({
    userId: v.id('users'),
    totalXp: v.number(),
    level: v.number(),
    rankId: v.string(),
    verifiedSteps: v.number(),
    verifiedDistanceMeters: v.number(),
    explorationUnits: v.number(),
    visualAreaSquareMeters: v.number(),
    currentStreakDays: v.number(),
    longestStreakDays: v.number(),
    updatedAt: v.number(),
  }).index('by_user', ['userId']),

  trackingSessions: defineTable({
    userId: v.id('users'),
    deviceId: v.string(),
    requestedMode: movementMode,
    status: v.union(
      v.literal('active'),
      v.literal('paused'),
      v.literal('processing'),
      v.literal('completed'),
      v.literal('rejected'),
    ),
    startedAt: v.number(),
    endedAt: v.optional(v.number()),
    verifiedDistanceMeters: v.number(),
    verifiedSteps: v.number(),
    normalizedNewCells: v.number(),
    xpAwarded: v.number(),
    validationCode: v.optional(v.string()),
    rulesVersion: v.string(),
  }).index('by_user_started_at', ['userId', 'startedAt']),

  exploredCellShards: defineTable({
    userId: v.id('users'),
    regionPrefix: v.string(),
    shard: v.number(),
    h3Resolution: v.number(),
    compressedCellIds: v.bytes(),
    version: v.number(),
    updatedAt: v.number(),
  }).index('by_user_region_shard', ['userId', 'regionPrefix', 'shard']),

  xpLedger: defineTable({
    userId: v.id('users'),
    eventId: v.string(),
    sourceType: v.union(
      v.literal('distance'),
      v.literal('new_area'),
      v.literal('quest'),
      v.literal('poi'),
      v.literal('streak'),
      v.literal('achievement'),
      v.literal('adjustment'),
    ),
    sourceId: v.string(),
    amount: v.number(),
    capBucket: v.optional(v.string()),
    reasonCode: v.string(),
    rulesVersion: v.string(),
    occurredAt: v.number(),
    createdAt: v.number(),
  })
    .index('by_user_created_at', ['userId', 'createdAt'])
    .index('by_user_event', ['userId', 'eventId'])
    .index('by_user_cap_bucket', ['userId', 'capBucket']),

  userQuests: defineTable({
    userId: v.id('users'),
    definitionId: v.string(),
    periodKey: v.string(),
    target: v.number(),
    progress: v.number(),
    rewardXp: v.number(),
    status: v.union(v.literal('active'), v.literal('completed'), v.literal('claimed'), v.literal('expired')),
    assignedAt: v.number(),
    completedAt: v.optional(v.number()),
    claimedAt: v.optional(v.number()),
  })
    .index('by_user_period', ['userId', 'periodKey'])
    .index('by_user_status', ['userId', 'status']),
});
