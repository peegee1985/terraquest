import { DarkTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { ReactNode, useEffect } from 'react';

import { AppErrorBoundary } from '@/components/app-error-boundary';
import { AuthProvider } from '@/state/auth-context';
import { convex } from '@/state/convex-client';
import { ExplorerProvider } from '@/state/explorer-context';
import { initSentry, Sentry } from '@/state/sentry';
import { colors } from '@/theme/tokens';

// TQ-21: registers the background location task. Must happen at module
// scope (TaskManager's own requirement) so the OS can invoke it even when
// it restarts the app process with no screen mounted, just to deliver a
// batch of background location updates.
import '@/domain/tracking-task';

// As early as possible — before the root component (or anything it renders)
// runs — so a crash anywhere in the render tree still has a chance of being
// reported instead of leaving zero diagnostic trail. Import statements
// above are hoisted and run first regardless of this call's position, so
// this can't protect against a crash during e.g. tracking-task.ts's own
// module-scope registration, only against what runs after that.
initSentry();

SplashScreen.preventAutoHideAsync();

const navigationTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: colors.brand,
    background: colors.background,
    card: colors.surface,
    text: colors.textPrimary,
    border: colors.outline,
    notification: colors.amber,
  },
};

function BackendProvider({ children }: { children: ReactNode }) {
  if (!convex) return children;
  return <AuthProvider client={convex}>{children}</AuthProvider>;
}

function RootLayout() {
  useEffect(() => {
    SplashScreen.hideAsync();
  }, []);

  return (
    <AppErrorBoundary>
      <BackendProvider>
        <ExplorerProvider>
          <ThemeProvider value={navigationTheme}>
            <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
              <Stack.Screen name="(tabs)" />
            </Stack>
          </ThemeProvider>
        </ExplorerProvider>
      </BackendProvider>
    </AppErrorBoundary>
  );
}

// Sentry.wrap is a no-op passthrough when Sentry.init was never called (no
// DSN configured), so this is safe to leave unconditional.
export default Sentry.wrap(RootLayout);
