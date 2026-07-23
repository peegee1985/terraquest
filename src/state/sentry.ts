import * as Sentry from '@sentry/react-native';

/**
 * Graceful no-op until EXPO_PUBLIC_SENTRY_DSN is configured (same pattern as
 * convex-client.ts/session-sync.ts's NOT_YET_CONFIGURED_TRANSPORT) — without
 * this, every crash (including native ones a JS try/catch or React error
 * boundary can never see) leaves no diagnostic trail at all, which is what
 * turned each of TQ-21's tracking-crash regressions into a multi-build
 * guessing game. Sentry's native SDK installs its own crash handler at init
 * time, independent of anything in this app's own JS/React code, so it
 * catches process-level native crashes AppErrorBoundary structurally can't.
 */
export function initSentry(): void {
  const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;
  if (!dsn) return;
  Sentry.init({ dsn, tracesSampleRate: 0 });
}

export { Sentry };
