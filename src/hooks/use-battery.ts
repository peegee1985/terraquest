import * as Battery from 'expo-battery';
import { useEffect, useState } from 'react';

export type BatteryStateInfo = { level: number; charging: boolean };

/** Battery level (0-1) + charging state, kept live via expo-battery's push listeners rather than polling. */
export function useBattery(): BatteryStateInfo | null {
  const [state, setState] = useState<BatteryStateInfo | null>(null);

  useEffect(() => {
    let mounted = true;

    Promise.all([Battery.getBatteryLevelAsync(), Battery.getBatteryStateAsync()])
      .then(([level, batteryState]) => {
        if (mounted) setState({ level, charging: batteryState === Battery.BatteryState.CHARGING });
      })
      .catch(() => undefined);

    const levelSubscription = Battery.addBatteryLevelListener(({ batteryLevel }) => {
      setState((current) => (current ? { ...current, level: batteryLevel } : { level: batteryLevel, charging: false }));
    });
    const stateSubscription = Battery.addBatteryStateListener(({ batteryState }) => {
      setState((current) => (current ? { ...current, charging: batteryState === Battery.BatteryState.CHARGING } : null));
    });

    return () => {
      mounted = false;
      levelSubscription.remove();
      stateSubscription.remove();
    };
  }, []);

  return state;
}
