import * as Location from 'expo-location';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

export type PermissionState = {
  status: Location.PermissionStatus;
  canAskAgain: boolean;
};

const UNDETERMINED: PermissionState = { status: Location.PermissionStatus.UNDETERMINED, canAskAgain: true };

/**
 * Tracks foreground/background location permission state, re-checking
 * whenever the app returns to the foreground so changes made in the
 * system Settings app (not just in-app requests) are picked up.
 */
export function useLocationPermissions() {
  const [foreground, setForeground] = useState<PermissionState>(UNDETERMINED);
  const [background, setBackground] = useState<PermissionState>(UNDETERMINED);
  const mountedRef = useRef(true);

  const refresh = useCallback(async () => {
    const [fg, bg] = await Promise.all([
      Location.getForegroundPermissionsAsync(),
      Location.getBackgroundPermissionsAsync(),
    ]);
    if (!mountedRef.current) return;
    setForeground({ status: fg.status, canAskAgain: fg.canAskAgain });
    setBackground({ status: bg.status, canAskAgain: bg.canAskAgain });
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    refresh().catch(() => undefined);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh().catch(() => undefined);
    });
    return () => {
      mountedRef.current = false;
      subscription.remove();
    };
  }, [refresh]);

  const requestForeground = useCallback(async () => {
    const result = await Location.requestForegroundPermissionsAsync();
    if (mountedRef.current) setForeground({ status: result.status, canAskAgain: result.canAskAgain });
    return result;
  }, []);

  const requestBackground = useCallback(async () => {
    const result = await Location.requestBackgroundPermissionsAsync();
    if (mountedRef.current) setBackground({ status: result.status, canAskAgain: result.canAskAgain });
    return result;
  }, []);

  return {
    foreground,
    background,
    isForegroundGranted: foreground.status === Location.PermissionStatus.GRANTED,
    isForegroundDenied: foreground.status === Location.PermissionStatus.DENIED,
    isBackgroundGranted: background.status === Location.PermissionStatus.GRANTED,
    isBackgroundDenied: background.status === Location.PermissionStatus.DENIED,
    refresh,
    requestForeground,
    requestBackground,
  };
}
