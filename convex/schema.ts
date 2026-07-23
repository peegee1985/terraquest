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
    // TQ-45: ISO 3166-1 alpha-2 country code, self-reported by the user —
    // powers the country leaderboard. Optional since existing users (and
    // guests who haven't set it yet) have none; they simply don't appear on
    // any country leaderboard until set.
    country: v.optional(v.string()),
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
    // TQ-28: the day this user last qualified for a streak day — the
    // idempotency guard against recording the same day twice, and the
    // anchor recordQualifyingDay compares a new day against.
    lastQualifiedDayKey: v.optional(v.string()),
    // TQ-28: minimal counter for the Rest Day Token mechanic (docs "Itemy
    // MVP"); a full generic inventory system is TQ-30's job, but the
    // streak logic needs *some* token count to bridge a missed day.
    restTokens: v.optional(v.number()),
    // TQ-30: denormalized lifetime counters that drive achievement-threshold
    // checks (checkAndGrantAchievements in achievements.ts) without scanning
    // full history tables on every check. Bumped in the same transaction as
    // the event they count (poi.ts's discoverPoi, quests.ts's claimQuest).
    poiDiscoveriesCount: v.optional(v.number()),
    dailyQuestsClaimedCount: v.optional(v.number()),
    weeklyQuestsClaimedCount: v.optional(v.number()),
    updatedAt: v.number(),
  })
    .index('by_user', ['userId'])
    // TQ-45: totalXp/explorationUnits are only ever mutated by awardXp's
    // confirmed-ledger recompute (xpAward.ts), never by anything boost- or
    // client-supplied — ranking directly off these fields is what makes
    // "žebříček řadí jen podle potvrzeného XP" a structural guarantee, not a
    // filter that could be forgotten. Country isn't denormalized here
    // (deliberately, per the docs' own "malý počet uživatelů → živý
    // indexovaný dotaz stačí" note) — the country leaderboard scans this
    // index and joins users.country per row instead; revisit only if that
    // stops being cheap enough.
    .index('by_total_xp', ['totalXp'])
    .index('by_exploration_units', ['explorationUnits']),

  // TQ-45: one-directional "lightweight" follow, keyed by handle — not the
  // full bidirectional friendships/{friendshipId} system from docs 02
  // (blocking, mutual requests, groups), which stays out of scope until
  // scaling actually needs it. Existence of a (followerId, followingId) row
  // is the idempotency check, same pattern as userAchievements/poiDiscoveries.
  follows: defineTable({
    followerId: v.id('users'),
    followingId: v.id('users'),
    createdAt: v.number(),
  }).index('by_follower_following', ['followerId', 'followingId']),

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
    // TQ-28: denormalized from the quest definition at assignment time so
    // progress-recording can dispatch on metric without re-deriving it
    // from definitionId string parsing.
    category: v.union(v.literal('movement'), v.literal('exploration'), v.literal('discovery')),
    metric: v.union(v.literal('steps'), v.literal('distance_m'), v.literal('new_units'), v.literal('active_minutes')),
    // TQ-30: denormalized like category/metric — lets claimQuest bump the
    // right achievement counter without parsing definitionId/periodKey.
    // Optional because rows inserted before this field existed have none;
    // claimQuest treats a missing kind as "don't count toward either
    // achievement track" rather than guessing from periodKey shape.
    kind: v.optional(v.union(v.literal('daily'), v.literal('weekly'))),
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

  // TQ-27: one row per (user, level) ever reached — existence of a row is
  // the idempotency check for granting that level's rank/cosmetic/reward
  // unlock, so a level can never be re-granted no matter how many times
  // applyXpEvent recomputes level from totalXp.
  userLevelClaims: defineTable({
    userId: v.id('users'),
    level: v.number(),
    rankId: v.string(),
    progressionVersion: v.string(),
    claimedAt: v.number(),
  }).index('by_user_level', ['userId', 'level']),

  // TQ-29: no real content seeded yet — populating this table needs a
  // chosen external POI data provider (OSM Overpass, Google Places, ...),
  // a separate product/licensing decision. The discovery mechanism below
  // is fully functional against whatever rows eventually land here.
  poi: defineTable({
    sourceId: v.string(),
    name: v.string(),
    category: v.union(
      v.literal('nature'),
      v.literal('culture'),
      v.literal('viewpoint'),
      v.literal('gastronomy'),
      v.literal('sport'),
      v.literal('history'),
    ),
    rarity: v.union(v.literal('common'), v.literal('rare')),
    latitude: v.number(),
    longitude: v.number(),
    discoveryRadiusMeters: v.number(),
    safetyStatus: v.union(v.literal('safe'), v.literal('excluded')),
    visibility: v.union(v.literal('public'), v.literal('hidden')),
    updatedAt: v.number(),
  }).index('by_source', ['sourceId']),

  // TQ-29: existence of a (userId, poiId) row is the idempotency check —
  // "jeden POI dá první odměnu jen jednou" — dayKey lets the mutation
  // count today's *common*-rarity discoveries for the 10/day cap without
  // scanning a user's entire discovery history.
  poiDiscoveries: defineTable({
    userId: v.id('users'),
    poiId: v.id('poi'),
    // Denormalized from the poi row at discovery time so the daily-cap
    // count query doesn't need to look up each POI individually.
    poiRarity: v.union(v.literal('common'), v.literal('rare')),
    dayKey: v.string(),
    firstDiscoveredAt: v.number(),
  })
    .index('by_user_poi', ['userId', 'poiId'])
    .index('by_user_day', ['userId', 'dayKey']),

  // TQ-30: existence of a (userId, achievementId) row is the idempotency
  // check — "tier se odemkne právě jednou" — same row-existence pattern as
  // userLevelClaims/poiDiscoveries. category/rarity are denormalized from
  // the achievement definition at unlock time so a later rebalance of the
  // rules doesn't retroactively change an already-unlocked badge's rarity.
  userAchievements: defineTable({
    userId: v.id('users'),
    achievementId: v.string(),
    category: v.union(v.literal('consistency'), v.literal('exploration'), v.literal('quests')),
    rarity: v.union(v.literal('common'), v.literal('rare'), v.literal('epic'), v.literal('legendary')),
    unlockedAt: v.number(),
  }).index('by_user_achievement', ['userId', 'achievementId']),

  // TQ-30: MVP inventory — one row per (userId, itemId), quantity-stacking.
  // Deliberately has no field that could ever feed an XP/ranking
  // computation ("itemy nemění leaderboard" is a structural guarantee, not
  // just a convention): nothing in this table is ever read by xpAward.ts or
  // any future leaderboard query. Rest Day Token keeps using userStats's
  // dedicated restTokens counter from TQ-28 rather than migrating into this
  // table — that mechanic already ships and works, so it's left alone.
  userInventoryItems: defineTable({
    userId: v.id('users'),
    itemId: v.union(v.literal('map_theme_token'), v.literal('scanner_pulse'), v.literal('memory_marker')),
    quantity: v.number(),
    updatedAt: v.number(),
  }).index('by_user_item', ['userId', 'itemId']),
});
