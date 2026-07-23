import { ConvexReactClient } from 'convex/react';

/**
 * TQ-31: pulled out of _layout.tsx into its own module so a single
 * ConvexReactClient instance can be shared between the React provider tree
 * (_layout.tsx) and non-React callers that need to call a mutation
 * imperatively outside of render (session-sync.ts's real transport, called
 * from a plain setInterval effect, not a component). `null` when
 * EXPO_PUBLIC_CONVEX_URL isn't configured — every caller must handle that
 * the same way _layout.tsx's BackendProvider already does.
 */
export const convex = process.env.EXPO_PUBLIC_CONVEX_URL ? new ConvexReactClient(process.env.EXPO_PUBLIC_CONVEX_URL) : null;
