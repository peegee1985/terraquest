/**
 * TQ-28: pure quest-generation and streak rules, dependency-free so they're
 * unit-testable without a Convex deployment (same convention as
 * xpLedgerRules.ts / progressionRules.ts).
 */

// Mirrors xpLedgerRules.ts's gameDayKey — duplicated rather than
// cross-imported to keep this module dependency-free (same deliberate
// small-duplication convention as DAILY_BASE_XP_CAP there).
export function gameDayKey(timestampMs: number, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(
    new Date(timestampMs),
  );
}

/** A stable, monotonically-increasing weekly bucket key — not calendar-ISO-week-aligned, just consistent enough to key a "weekly quest" period. */
export function gameWeekKey(timestampMs: number, timeZone: string): string {
  const weekIndex = Math.floor(dayKeyToUtcDays(gameDayKey(timestampMs, timeZone)) / 7);
  return `W${weekIndex}`;
}

export type QuestCategory = 'movement' | 'exploration' | 'discovery';
export type QuestMetric = 'steps' | 'distance_m' | 'new_units' | 'active_minutes';

export type QuestDefinition = {
  definitionId: string;
  category: QuestCategory;
  metric: QuestMetric;
  target: number;
  rewardXp: number;
};

const BASE_STEPS_TARGET = 3000;
const BASE_NEW_UNITS_TARGET = 20;
const BASE_ACTIVE_MINUTES_TARGET = 25;
const BASE_WEEKLY_DISTANCE_TARGET_M = 15_000;

const MOVEMENT_REWARD_XP = 50;
const EXPLORATION_REWARD_XP = 100;
const DISCOVERY_REWARD_XP = 150;
// TQ-24-adjacent brainstorm decision (23. 7. 2026, Notion "03 — XP"
// Generační pravidla): a player whose new-exploration-units/day has
// plateaued near zero must never get a structurally-impossible "explore"
// quest. This placeholder swaps it for a second movement-flavored quest;
// a real "beat your own time on this route" quest (Route Mastery) needs
// route recognition that doesn't exist as code yet.
const SATURATED_SWAP_REWARD_XP = 100;
const WEEKLY_REWARD_XP = 300;

/**
 * Deterministic pseudo-random in [0.7, 1.3] from a string seed — the same
 * seed always yields the same jitter, so regenerating "today's" quests
 * (ensureDailyQuests is idempotent) never changes their targets. Matches
 * docs 03: "Obtížnost odpovídá 70–130 % běžné aktivity."
 */
export function difficultyJitter(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  const unit = (Math.abs(hash) % 1000) / 1000; // [0, 1)
  return 0.7 + unit * 0.6; // [0.7, 1.3]
}

/**
 * Exactly 3 daily quest slots (docs 03: Pohybová / Průzkumná / Objevná).
 * isExplorationSaturated is an explicit input rather than computed here —
 * detecting a 14-day exploration plateau needs a rolling activity history
 * this module doesn't have access to; the caller (or a future task) is
 * responsible for supplying it.
 */
export function generateDailyQuests(userId: string, dayKey: string, isExplorationSaturated: boolean): QuestDefinition[] {
  const movement: QuestDefinition = {
    definitionId: `daily:${dayKey}:movement`,
    category: 'movement',
    metric: 'steps',
    target: Math.round(BASE_STEPS_TARGET * difficultyJitter(`${userId}:${dayKey}:movement`)),
    rewardXp: MOVEMENT_REWARD_XP,
  };

  const secondSlot: QuestDefinition = isExplorationSaturated
    ? {
        definitionId: `daily:${dayKey}:active_minutes`,
        category: 'movement',
        metric: 'active_minutes',
        target: Math.round(BASE_ACTIVE_MINUTES_TARGET * difficultyJitter(`${userId}:${dayKey}:second`)),
        rewardXp: SATURATED_SWAP_REWARD_XP,
      }
    : {
        definitionId: `daily:${dayKey}:exploration`,
        category: 'exploration',
        metric: 'new_units',
        target: Math.round(BASE_NEW_UNITS_TARGET * difficultyJitter(`${userId}:${dayKey}:second`)),
        rewardXp: EXPLORATION_REWARD_XP,
      };

  const discovery: QuestDefinition = {
    definitionId: `daily:${dayKey}:discovery`,
    category: 'discovery',
    metric: 'active_minutes',
    target: Math.round(BASE_ACTIVE_MINUTES_TARGET * difficultyJitter(`${userId}:${dayKey}:discovery`)),
    rewardXp: DISCOVERY_REWARD_XP,
  };

  return [movement, secondSlot, discovery];
}

export function generateWeeklyQuest(userId: string, weekKey: string): QuestDefinition {
  return {
    definitionId: `weekly:${weekKey}:distance`,
    category: 'movement',
    metric: 'distance_m',
    target: Math.round(BASE_WEEKLY_DISTANCE_TARGET_M * difficultyJitter(`${userId}:${weekKey}:weekly`)),
    rewardXp: WEEKLY_REWARD_XP,
  };
}

// --- Streak ---

export type StreakState = {
  currentStreakDays: number;
  longestStreakDays: number;
  lastQualifiedDayKey: string | null;
  restTokens: number;
};

export type StreakUpdateResult = {
  next: StreakState;
  streakChanged: boolean;
  restTokenConsumed: boolean;
};

function dayKeyToUtcDays(dayKey: string): number {
  const [year, month, day] = dayKey.split('-').map(Number);
  return Math.round(Date.UTC(year, month - 1, day) / 86_400_000);
}

/**
 * Applies one qualifying day to the streak. Idempotent for the same
 * dayKey (recording "today" twice is a no-op). A single missed day is
 * bridged by consuming a Rest Day Token if available (docs "Itemy MVP":
 * "zachová streak, nevytvoří aktivní den ani XP" — the skipped day itself
 * never becomes a qualifying day); a gap of 2+ days, or 1 day without a
 * token, resets the streak.
 */
export function applyQualifyingDay(state: StreakState, dayKey: string): StreakUpdateResult {
  if (state.lastQualifiedDayKey === dayKey) {
    return { next: state, streakChanged: false, restTokenConsumed: false };
  }

  if (state.lastQualifiedDayKey === null) {
    const next: StreakState = { ...state, currentStreakDays: 1, longestStreakDays: Math.max(1, state.longestStreakDays), lastQualifiedDayKey: dayKey };
    return { next, streakChanged: true, restTokenConsumed: false };
  }

  const gapDays = dayKeyToUtcDays(dayKey) - dayKeyToUtcDays(state.lastQualifiedDayKey);

  if (gapDays <= 0) {
    // Out-of-order/backfilled event for a day at or before the last
    // qualifying one — never rewind a streak already recorded.
    return { next: state, streakChanged: false, restTokenConsumed: false };
  }

  if (gapDays === 1) {
    const currentStreakDays = state.currentStreakDays + 1;
    const next: StreakState = {
      ...state,
      currentStreakDays,
      longestStreakDays: Math.max(state.longestStreakDays, currentStreakDays),
      lastQualifiedDayKey: dayKey,
    };
    return { next, streakChanged: true, restTokenConsumed: false };
  }

  if (gapDays === 2 && state.restTokens > 0) {
    const currentStreakDays = state.currentStreakDays + 1;
    const next: StreakState = {
      ...state,
      currentStreakDays,
      longestStreakDays: Math.max(state.longestStreakDays, currentStreakDays),
      lastQualifiedDayKey: dayKey,
      restTokens: state.restTokens - 1,
    };
    return { next, streakChanged: true, restTokenConsumed: true };
  }

  const next: StreakState = { ...state, currentStreakDays: 1, longestStreakDays: Math.max(1, state.longestStreakDays), lastQualifiedDayKey: dayKey };
  return { next, streakChanged: true, restTokenConsumed: false };
}

/** Docs 03 streak reward table, extended with the "every further 30-day block" rule. Returns null when currentStreakDays doesn't land on a milestone. */
export function streakMilestoneReward(currentStreakDays: number): { xp: number; badge?: string } | null {
  if (currentStreakDays === 3) return { xp: 25 };
  if (currentStreakDays === 7) return { xp: 75 };
  if (currentStreakDays === 14) return { xp: 125 };
  if (currentStreakDays === 30) return { xp: 250, badge: 'streak_30' };
  if (currentStreakDays > 30 && (currentStreakDays - 30) % 30 === 0) return { xp: 250 };
  return null;
}
