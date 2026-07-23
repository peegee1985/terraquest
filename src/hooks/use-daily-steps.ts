import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { getStepsBetween, isHealthConnectAvailable, isStepsPermissionGranted, requestStepsPermission } from '@/domain/health-connect';
import { startOfLocalDay } from '@/domain/steps';

export type DailyStepsState =
  | { status: 'loading' }
  | { status: 'unavailable' }
  | { status: 'needs-permission' }
  | { status: 'ready'; steps: number };

/**
 * TQ-46: today's step count from Health Connect, re-checked whenever the
 * app returns to the foreground (same pattern as
 * use-location-permissions.ts) so a permission grant made from the system
 * Settings/Health Connect app is picked up without a manual refresh.
 */
export function useDailySteps() {
  const [state, setState] = useState<DailyStepsState>({ status: 'loading' });
  const mountedRef = useRef(true);

  const refresh = useCallback(async () => {
    if (!(await isHealthConnectAvailable())) {
      if (mountedRef.current) setState({ status: 'unavailable' });
      return;
    }
    if (!(await isStepsPermissionGranted())) {
      if (mountedRef.current) setState({ status: 'needs-permission' });
      return;
    }
    const steps = await getStepsBetween(startOfLocalDay(), new Date());
    if (mountedRef.current) setState({ status: 'ready', steps });
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    refresh().catch(() => undefined);
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') refresh().catch(() => undefined);
    });
    return () => {
      mountedRef.current = false;
      subscription.remove();
    };
  }, [refresh]);

  const requestAccess = useCallback(async () => {
    const granted = await requestStepsPermission();
    if (granted) await refresh();
    else if (mountedRef.current) setState({ status: 'needs-permission' });
  }, [refresh]);

  return { ...state, requestAccess };
}
