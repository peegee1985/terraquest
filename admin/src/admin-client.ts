import type { FunctionReference } from 'convex/server';

// Same "reference by string name" trick the mobile app's src/state/*-client.ts
// modules use (see profile-client.ts's comment) — avoids importing
// convex/server as a *value* (only the type import above is erased at
// compile time), which is what crashes a client bundle. There's no
// generated convex/_generated/api here (this environment has no live
// `convex dev` codegen), so every function is referenced by its
// "file:exportName" string instead.
function clientFunctionReference<F extends FunctionReference<'query' | 'mutation'>>(name: string): F {
  return { [Symbol.for('functionName')]: name } as unknown as F;
}

export type UserSummary = {
  userId: string;
  handle: string;
  displayName?: string;
  email?: string;
  status: 'active' | 'suspended' | 'deletion_pending';
  createdAt: number;
  totalXp: number;
  level: number;
  plan?: 'free' | 'vip';
  xpMultiplier?: number;
  flaggedForReview?: boolean;
};

export type UserDetail = {
  userId: string;
  handle: string;
  displayName?: string;
  email?: string;
  status: 'active' | 'suspended' | 'deletion_pending';
  createdAt: number;
  totalXp: number;
  level: number;
  currentStreakDays: number;
  longestStreakDays: number;
  verifiedDistanceMeters: number;
  verifiedSteps: number;
  plan?: 'free' | 'vip';
  xpMultiplier?: number;
  planExpiresAt?: number;
  flaggedForReview?: boolean;
  flagReason?: string;
  flaggedAt?: number;
  inventory: { itemId: string; quantity: number }[];
  recentXpEvents: { sourceType: string; reasonCode: string; amount: number; occurredAt: number }[];
};

export type PromoCode = {
  code: string;
  active: boolean;
  maxRedemptions?: number;
  redemptionsCount: number;
  expiresAt?: number;
  note?: string;
  createdAt: number;
};

export type DiscountCode = PromoCode & { percentOff?: number; bonusXpMultiplier?: number };

type PlanMutationResult = { ok: true } | { ok: false; reason: 'user_not_found' };

export const listUsersRef =
  clientFunctionReference<FunctionReference<'query', 'public', { searchTerm?: string }, UserSummary[]>>(
    'admin:listUsers',
  );

export const listFlaggedUsersRef =
  clientFunctionReference<FunctionReference<'query', 'public', Record<string, never>, UserSummary[]>>(
    'admin:listFlaggedUsers',
  );

export const getUserDetailRef =
  clientFunctionReference<FunctionReference<'query', 'public', { userId: string }, UserDetail | null>>(
    'admin:getUserDetail',
  );

export const setUserPlanRef = clientFunctionReference<
  FunctionReference<
    'mutation',
    'public',
    { handle: string; plan: 'free' | 'vip'; xpMultiplier?: number; planExpiresAt?: number },
    PlanMutationResult
  >
>('admin:setUserPlan');

export const banUserRef = clientFunctionReference<FunctionReference<'mutation', 'public', { userId: string }, null>>(
  'admin:banUser',
);

export const unbanUserRef = clientFunctionReference<FunctionReference<'mutation', 'public', { userId: string }, null>>(
  'admin:unbanUser',
);

export const deleteUserRef = clientFunctionReference<FunctionReference<'mutation', 'public', { userId: string }, null>>(
  'admin:deleteUser',
);

export const flagUserRef =
  clientFunctionReference<FunctionReference<'mutation', 'public', { userId: string; reason: string }, null>>(
    'admin:flagUser',
  );

export const unflagUserRef = clientFunctionReference<FunctionReference<'mutation', 'public', { userId: string }, null>>(
  'admin:unflagUser',
);

export const grantBonusRef = clientFunctionReference<
  FunctionReference<
    'mutation',
    'public',
    { userId: string; xpAmount?: number; itemId?: string; itemQuantity?: number },
    null
  >
>('admin:grantBonus');

export const listDiscountCodesRef =
  clientFunctionReference<FunctionReference<'query', 'public', Record<string, never>, DiscountCode[]>>(
    'admin:listDiscountCodes',
  );

export const createDiscountCodeRef = clientFunctionReference<
  FunctionReference<
    'mutation',
    'public',
    { percentOff?: number; bonusXpMultiplier?: number; maxRedemptions?: number; expiresAt?: number; note?: string },
    { code: string }
  >
>('admin:createDiscountCode');

export const setDiscountCodeActiveRef = clientFunctionReference<
  FunctionReference<'mutation', 'public', { code: string; active: boolean }, null>
>('admin:setDiscountCodeActive');

export const listInviteCodesRef =
  clientFunctionReference<FunctionReference<'query', 'public', Record<string, never>, PromoCode[]>>(
    'admin:listInviteCodes',
  );

export const createInviteCodeRef = clientFunctionReference<
  FunctionReference<'mutation', 'public', { maxRedemptions?: number; expiresAt?: number; note?: string }, { code: string }>
>('admin:createInviteCode');

export const setInviteCodeActiveRef = clientFunctionReference<
  FunctionReference<'mutation', 'public', { code: string; active: boolean }, null>
>('admin:setInviteCodeActive');
