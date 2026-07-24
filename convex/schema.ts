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
    // A preset avatar id (see src/domain/avatars.ts) — the fallback when no
    // photo has been uploaded, and the value new accounts start with.
    avatarId: v.string(),
    // Set when the user picks "upload a photo" instead of a preset — takes
    // priority over avatarId wherever an avatar is displayed. Convex file
    // storage (avatar.ts's setAvatarPhoto), not a raw URL, so access can
    // stay behind the same auth the rest of the profile data has.
    avatarStorageId: v.optional(v.id('_storage')),
    // Timestamps of every past username change — handleRules.ts's
    // canChangeHandle reads this to enforce "once ever" (regular) / "twice
    // per rolling year" (VIP) without a separate table.
    handleChangeTimestamps: v.optional(v.array(v.number())),
    // Same idea as handleChangeTimestamps but for avatar/photo changes —
    // avatarRules.ts's canChangeAvatar enforces the identical once-ever
    // (regular) / twice-per-year (VIP) limit against this array.
    avatarChangeTimestamps: v.optional(v.array(v.number())),
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
    // User-configurable daily step goal (stepGoal.ts's STEP_GOAL_PRESETS);
    // absent means the default (DEFAULT_DAILY_STEP_GOAL) applies.
    dailyStepGoal: v.optional(v.number()),
    // A streak/badge track for hitting the daily step goal, deliberately
    // separate from currentStreakDays/longestStreakDays (the movement-based
    // streak) and NEVER touched by awardXp — see stepGoal.ts's
    // recordStepGoalCheckIn. Health Connect step counts are client-reported
    // and trivially fakeable by other apps writing manual entries, so this
    // whole track stays isolated from XP/leaderboards by construction, per
    // TQ-46's anti-cheat decision (same rule as the 'steps' quest metric in
    // quests.ts's contributionFor).
    stepGoalCurrentStreakDays: v.optional(v.number()),
    stepGoalLongestStreakDays: v.optional(v.number()),
    lastStepGoalDayKey: v.optional(v.string()),
    // Entitlement/plan model — admin-settable only (see admin.ts), no real
    // checkout wired up yet. xpMultiplier is stored explicitly rather than
    // derived from plan so an admin can hand-tune an individual user's
    // bonus independent of their plan tier.
    plan: v.optional(v.union(v.literal('free'), v.literal('vip'))),
    xpMultiplier: v.optional(v.number()),
    planExpiresAt: v.optional(v.number()),
    planSource: v.optional(v.union(v.literal('admin_grant'), v.literal('iap'), v.literal('stripe'), v.literal('promo_code'))),
    // Idempotency guard for the daily login bonus (dailyBonus.ts) — one
    // claim per gameDayKey, mirroring lastQualifiedDayKey/lastStepGoalDayKey.
    lastDailyBonusDayKey: v.optional(v.string()),
    // Admin back office (admin.ts): a manual anti-cheat review flag, set by
    // an admin inspecting a suspicious profile (not an automated detector —
    // there isn't one yet). Absent/false means "not flagged", same
    // optional-means-default convention as the rest of this table.
    flaggedForReview: v.optional(v.boolean()),
    flagReason: v.optional(v.string()),
    flaggedAt: v.optional(v.number()),
    // TQ-122: lifetime reveal-ring bonus granted at every rank-tier level
    // (levelRewardRules.ts's PERMANENT_RADIUS_RING_BONUS_PER_TIER) — never
    // decreases, stacks with the base ring of 1 and any active temporary
    // radius boost below.
    permanentRadiusRingBonus: v.optional(v.number()),
    // A temporary Radius/XP Boost Potion's active effect — at most one of
    // each kind active at a time (using another potion of the same kind
    // while one is active just resets the expiry, see items.ts's useItem).
    // Expired (now >= expiresAt) is treated identically to absent by every
    // reader, so nothing needs to eagerly clear these on expiry.
    activeRadiusBoostExpiresAt: v.optional(v.number()),
    activeRadiusBoostRingBonus: v.optional(v.number()),
    activeXpBoostExpiresAt: v.optional(v.number()),
    activeXpBoostMultiplier: v.optional(v.number()),
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
  })
    .index('by_source', ['sourceId'])
    // TQ-29 client UI: listPoiInBounds scans this index (there's no
    // meaningful geo-index available without a real spatial data type) and
    // filters by lat/lng bounding box + isPubliclyDiscoverable in
    // application code — same "live query suffices at this scale" call as
    // the leaderboard's country scan (leaderboards.ts).
    .index('by_visibility', ['visibility']),

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
    // 'steps' (added for the daily-step-goal streak track) is deliberately
    // never paired with a rewardXp > 0 definition — see achievementRules.ts.
    category: v.union(v.literal('consistency'), v.literal('exploration'), v.literal('quests'), v.literal('steps')),
    rarity: v.union(v.literal('common'), v.literal('rare'), v.literal('epic'), v.literal('legendary')),
    unlockedAt: v.number(),
  }).index('by_user_achievement', ['userId', 'achievementId']),

  // TQ-30: MVP inventory — one row per (userId, itemId), quantity-stacking.
  // map_theme_token is still a truly inert collectible — sitting in
  // inventory, it never feeds an XP/ranking computation ("itemy nemění
  // leaderboard"). Everything else here IS activatable: radius_boost_potion/
  // xp_boost_potion/scanner_pulse (items.ts's useItem) consume one and write
  // a temporary effect into userStats' activeRadiusBoost*/activeXpBoost*
  // fields (which fog reveal / awardXp DO read); satellite_scan (also
  // useItem) consumes one and triggers a pure client-side fog reveal (never
  // touches userStats); memory_marker (memoryMarkers.ts's placeMemoryMarker,
  // a separate mutation since it needs a lat/lng/note payload useItem's
  // {itemId}-only shape doesn't fit) consumes one and inserts a row into the
  // memoryMarkers table below. The guarantee still holds for an unused item
  // sitting here, it just isn't inert once spent. Rest Day Token keeps using
  // userStats's dedicated restTokens counter from TQ-28 rather than
  // migrating into this table — that mechanic already ships and works, so
  // it's left alone.
  userInventoryItems: defineTable({
    userId: v.id('users'),
    itemId: v.union(
      v.literal('map_theme_token'),
      v.literal('scanner_pulse'),
      v.literal('memory_marker'),
      v.literal('radius_boost_potion'),
      v.literal('xp_boost_potion'),
      v.literal('satellite_scan'),
    ),
    quantity: v.number(),
    updatedAt: v.number(),
  }).index('by_user_item', ['userId', 'itemId']),

  // Memory Marker (convex/memoryMarkers.ts): a personal location note —
  // "smile more" at a spot on your daily commute, "don't forget milk" at
  // the grocery store. Always private to its owner (by_user index only, no
  // visibility field like poi's) — this is a personal reminder, not
  // shareable content, so there's no cross-user query path at all.
  memoryMarkers: defineTable({
    userId: v.id('users'),
    latitude: v.number(),
    longitude: v.number(),
    note: v.string(),
    createdAt: v.number(),
  }).index('by_user', ['userId']),

  // TQ-34 (scoped MVP for a one-day delivery): a user-defined circle they
  // want kept out of anything shared/exported — "Export mých dat" redacts
  // any of their own track points that fall inside one of these before
  // building the export bundle (src/domain/privacy-zones.ts's
  // redactPointsInZones). Masking the live map/fog rendering itself is a
  // real follow-up, not done here — this only covers the export path today.
  privateZones: defineTable({
    userId: v.id('users'),
    label: v.string(),
    latitude: v.number(),
    longitude: v.number(),
    radiusMeters: v.number(),
    createdAt: v.number(),
  }).index('by_user', ['userId']),

  // Admin back office: codes an admin mints, redeemed once per user via
  // redeemDiscountCode (a real redeem-in-app flow is a follow-up — for now
  // this is admin-CRUD + the data model). bonusXpMultiplier ties directly
  // into the existing userStats.xpMultiplier field a VIP grant also sets,
  // so a discount code can double as "VIP + a temporary XP boost".
  discountCodes: defineTable({
    code: v.string(),
    percentOff: v.optional(v.number()),
    bonusXpMultiplier: v.optional(v.number()),
    active: v.boolean(),
    maxRedemptions: v.optional(v.number()),
    redemptionsCount: v.number(),
    expiresAt: v.optional(v.number()),
    note: v.optional(v.string()),
    createdByAdminEmail: v.string(),
    createdAt: v.number(),
  }).index('by_code', ['code']),

  // Existence of a (userId, code) row is the idempotency check — one
  // redemption per user per code, same row-existence pattern used
  // throughout this schema (userAchievements, poiDiscoveries, ...).
  discountCodeRedemptions: defineTable({
    userId: v.id('users'),
    code: v.string(),
    redeemedAt: v.number(),
  })
    .index('by_user_code', ['userId', 'code'])
    .index('by_code', ['code']),

  // Admin-minted invite codes — a separate table from discountCodes even
  // though the shape overlaps, since invites and discounts are different
  // product concepts (access vs. price) that may diverge in fields later
  // (e.g. invites eventually granting a starter item bundle).
  inviteCodes: defineTable({
    code: v.string(),
    active: v.boolean(),
    maxRedemptions: v.optional(v.number()),
    redemptionsCount: v.number(),
    expiresAt: v.optional(v.number()),
    note: v.optional(v.string()),
    createdByAdminEmail: v.string(),
    createdAt: v.number(),
  }).index('by_code', ['code']),

  inviteCodeRedemptions: defineTable({
    userId: v.id('users'),
    code: v.string(),
    redeemedAt: v.number(),
  })
    .index('by_user_code', ['userId', 'code'])
    .index('by_code', ['code']),
});
