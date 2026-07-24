import type { FunctionReference } from 'convex/server';
import { useMutation, useQuery } from 'convex/react';

function clientFunctionReference<F extends FunctionReference<'query' | 'mutation'>>(name: string): F {
  return { [Symbol.for('functionName')]: name } as unknown as F;
}

export type InventoryItemId =
  | 'map_theme_token'
  | 'scanner_pulse'
  | 'memory_marker'
  | 'radius_boost_potion'
  | 'xp_boost_potion'
  | 'satellite_scan';

export type ActivatableItemId = 'radius_boost_potion' | 'xp_boost_potion' | 'scanner_pulse' | 'satellite_scan';

export type InventoryEntry = { itemId: InventoryItemId; quantity: number };

/** expiresAt is only present for the temporary-boost items (Radius/XP Boost Potion, Scanner Pulse) — Satellite Scan's `ok: true` has no expiry, it's an instant one-shot reveal. */
export type UseItemResult = { ok: true; expiresAt?: number } | { ok: false; reason: 'not_owned' };

type ListInventoryForUserQuery = FunctionReference<'query', 'public', { userId: string }, InventoryEntry[]>;
type UseItemMutation = FunctionReference<'mutation', 'public', { itemId: ActivatableItemId }, UseItemResult>;

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
