import { ConvexReactClient } from 'convex/react';

// Same deployment the mobile app talks to (EXPO_PUBLIC_CONVEX_URL in the
// repo root's .env) — the admin app is a second client against the same
// backend, not a separate deployment.
export const convex = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL);
