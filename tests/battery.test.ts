import { describe, expect, it } from 'vitest';

import { batteryIconName, formatBatteryPercent } from '../src/domain/battery';

describe('batteryIconName', () => {
  it('returns the charging icon whenever charging is true, regardless of level', () => {
    expect(batteryIconName(0.05, true)).toBe('battery-charging');
    expect(batteryIconName(0.95, true)).toBe('battery-charging');
  });

  it('returns the low-battery alert icon at or below 10%', () => {
    expect(batteryIconName(0.1, false)).toBe('battery-alert-variant-outline');
    expect(batteryIconName(0.02, false)).toBe('battery-alert-variant-outline');
  });

  it('rounds to the nearest 10% step icon', () => {
    expect(batteryIconName(0.44, false)).toBe('battery-40');
    expect(batteryIconName(0.46, false)).toBe('battery-50');
  });

  it('returns the full "battery" icon at 100%', () => {
    expect(batteryIconName(1, false)).toBe('battery');
  });
});

describe('formatBatteryPercent', () => {
  it('rounds to a whole percent with a trailing % sign', () => {
    expect(formatBatteryPercent(0.759999)).toBe('76 %');
    expect(formatBatteryPercent(0)).toBe('0 %');
    expect(formatBatteryPercent(1)).toBe('100 %');
  });

  it('clamps out-of-range values', () => {
    expect(formatBatteryPercent(-1)).toBe('0 %');
    expect(formatBatteryPercent(2)).toBe('100 %');
  });
});
