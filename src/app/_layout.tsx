import { ConvexReactClient } from 'convex/react';
import { DarkTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { ReactNode, useEffect } from 'react';

import { AppErrorBoundary } from '@/components/app-error-boundary';
import { AuthProvider } from '@/state/auth-context';
import { ExplorerProvider } from '@/state/explorer-context';
import { colors } from '@/theme/tokens';

SplashScreen.preventAutoHideAsync();

const convexUrl = process.env.EXPO_PUBLIC_CONVEX_URL;
const convex = convexUrl ? new ConvexReactClient(convexUrl) : null;

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

export default function RootLayout() {
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
