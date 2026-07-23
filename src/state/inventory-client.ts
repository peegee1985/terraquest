import type { FunctionReference } from 'convex/server';
import { useMutation, useQuery } from 'convex/react';

function clientFunctionReference<F extends FunctionReference<'query' | 'mutation'>>(name: string): F {
  return { [Symbol.for('functionName')]: name } as unknown as F;
}

export type InventoryItemId = 'map_theme_token' | 'scanner_pulse' | 'memory_marker' | 'radius_boost_potion' | 'xp_boost_potion';

export type InventoryEntry = { itemId: InventoryItemId; quantity: number };

export type UseItemResult = { ok: true; expiresAt: number } | { ok: false; reason: 'not_owned' };

type ListInventoryForUserQuery = FunctionReference<'query', 'public', { userId: string }, InventoryEntry[]>;
type UseItemMutation = FunctionReference<
  'mutation',
  'public',
  { itemId: 'radius_boost_potion' | 'xp_boost_potion' },
  UseItemResult
>;

const listInventoryForUserRef =
  clientFunctionReference<ListInventoryForUserQuery>('inventory:listInventoryForUser');
const useItemRef = clientFunctionReference<UseItemMutation>('items:useItem');

/** Only ever called when a Convex client exists and `userId` is known (the caller's own profile.userId) — same precondition as every other useQuery call site in this codebase. */
export function useMyInventory(userId: string | undefined): InventoryEntry[] | undefined {
  return useQuery(listInventoryForUserRef, userId ? { userId } : 'skip');
}

export function useUseItem() {
  return useMutation(useItemRef);
}
