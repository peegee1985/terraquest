import { describe, expect, it } from 'vitest';

import { formatTemperatureC, weatherCodeToSummary } from '../src/domain/weather';

describe('weatherCodeToSummary', () => {
  it('maps clear sky to a sun icon', () => {
    expect(weatherCodeToSummary(0).icon).toBe('weather-sunny');
  });

  it('maps rain codes to a rain icon', () => {
    for (const code of [51, 61, 63, 65, 80, 82]) {
      expect(weatherCodeToSummary(code).icon).toBe('weather-rainy');
    }
  });

  it('maps snow codes to a snow icon', () => {
    for (const code of [71, 73, 75, 85, 86]) {
      expect(weatherCodeToSummary(code).icon).toBe('weather-snowy');
    }
  });

  it('maps thunderstorm codes to a lightning icon', () => {
    for (const code of [95, 96, 99]) {
      expect(weatherCodeToSummary(code).icon).toBe('weather-lightning-rainy');
    }
  });

  it('maps fog codes to a fog icon', () => {
    expect(weatherCodeToSummary(45).icon).toBe('weather-fog');
    expect(weatherCodeToSummary(48).icon).toBe('weather-fog');
  });

  it('falls back to a cloudy icon for an unknown code', () => {
    expect(weatherCodeToSummary(-1)).toEqual({ icon: 'weather-cloudy', label: 'Neznámo' });
  });
});

describe('formatTemperatureC', () => {
  it('rounds to the nearest whole degree', () => {
    expect(formatTemperatureC(21.4)).toBe('21°');
    expect(formatTemperatureC(21.6)).toBe('22°');
  });

  it('handles negative temperatures', () => {
    expect(formatTemperatureC(-3.2)).toBe('-3°');
  });
});
