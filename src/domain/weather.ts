/**
 * Pure WMO weather-code → icon/label mapping, dependency-free so it's
 * unit-testable without a network call (same convention as every other
 * *Rules.ts/domain module in this project). Codes per the WMO weather
 * interpretation table Open-Meteo's API documents:
 * https://open-meteo.com/en/docs (see "WMO Weather interpretation codes").
 */

export type WeatherIconName =
  | 'weather-sunny'
  | 'weather-partly-cloudy'
  | 'weather-cloudy'
  | 'weather-fog'
  | 'weather-rainy'
  | 'weather-snowy'
  | 'weather-lightning-rainy';

export type WeatherSummary = { icon: WeatherIconName; label: string };

const WEATHER_CODE_MAP: Record<number, WeatherSummary> = {
  0: { icon: 'weather-sunny', label: 'Jasno' },
  1: { icon: 'weather-partly-cloudy', label: 'Skoro jasno' },
  2: { icon: 'weather-partly-cloudy', label: 'Polojasno' },
  3: { icon: 'weather-cloudy', label: 'Zataženo' },
  45: { icon: 'weather-fog', label: 'Mlha' },
  48: { icon: 'weather-fog', label: 'Mlha s jinovatkou' },
  51: { icon: 'weather-rainy', label: 'Slabé mrholení' },
  53: { icon: 'weather-rainy', label: 'Mrholení' },
  55: { icon: 'weather-rainy', label: 'Silné mrholení' },
  56: { icon: 'weather-rainy', label: 'Mrznoucí mrholení' },
  57: { icon: 'weather-rainy', label: 'Silné mrznoucí mrholení' },
  61: { icon: 'weather-rainy', label: 'Slabý déšť' },
  63: { icon: 'weather-rainy', label: 'Déšť' },
  65: { icon: 'weather-rainy', label: 'Silný déšť' },
  66: { icon: 'weather-rainy', label: 'Mrznoucí déšť' },
  67: { icon: 'weather-rainy', label: 'Silný mrznoucí déšť' },
  71: { icon: 'weather-snowy', label: 'Slabé sněžení' },
  73: { icon: 'weather-snowy', label: 'Sněžení' },
  75: { icon: 'weather-snowy', label: 'Silné sněžení' },
  77: { icon: 'weather-snowy', label: 'Sněhová zrna' },
  80: { icon: 'weather-rainy', label: 'Přeháňky' },
  81: { icon: 'weather-rainy', label: 'Přeháňky' },
  82: { icon: 'weather-rainy', label: 'Prudké přeháňky' },
  85: { icon: 'weather-snowy', label: 'Sněhové přeháňky' },
  86: { icon: 'weather-snowy', label: 'Silné sněhové přeháňky' },
  95: { icon: 'weather-lightning-rainy', label: 'Bouřka' },
  96: { icon: 'weather-lightning-rainy', label: 'Bouřka s kroupami' },
  99: { icon: 'weather-lightning-rainy', label: 'Silná bouřka s kroupami' },
};

const UNKNOWN_SUMMARY: WeatherSummary = { icon: 'weather-cloudy', label: 'Neznámo' };

export function weatherCodeToSummary(code: number): WeatherSummary {
  return WEATHER_CODE_MAP[code] ?? UNKNOWN_SUMMARY;
}

export function formatTemperatureC(celsius: number): string {
  return `${Math.round(celsius)}°`;
}
