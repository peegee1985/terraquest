import { useEffect, useState } from 'react';

export type WeatherState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; temperatureC: number; code: number };

// No API key needed (Open-Meteo's free tier), matching the build-nothing-
// blind approach this project already uses for OSM Overpass (poiSync.ts) —
// picking a keyless provider means there's no secret to store or leak.
const REFRESH_INTERVAL_MS = 15 * 60 * 1000;

function weatherUrl(latitude: number, longitude: number): string {
  return `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,weather_code&timezone=auto`;
}

/** Refetches on an interval and whenever latitude/longitude changes meaningfully (map.tsx rounds these before passing them in, so this doesn't refetch on every GPS jitter). */
export function useWeather(latitude: number, longitude: number): WeatherState {
  const [state, setState] = useState<WeatherState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;

    const fetchWeather = async () => {
      try {
        const response = await fetch(weatherUrl(latitude, longitude));
        if (!response.ok) throw new Error(`weather fetch failed: ${response.status}`);
        const data = (await response.json()) as { current?: { temperature_2m?: number; weather_code?: number } };
        if (cancelled) return;
        if (typeof data.current?.temperature_2m !== 'number' || typeof data.current?.weather_code !== 'number') {
          throw new Error('weather response missing expected fields');
        }
        setState({ status: 'ready', temperatureC: data.current.temperature_2m, code: data.current.weather_code });
      } catch {
        if (!cancelled) setState({ status: 'error' });
      }
    };

    void fetchWeather();
    const interval = setInterval(() => void fetchWeather(), REFRESH_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [latitude, longitude]);

  return state;
}
