/** Rounds a 0-1 battery level to the nearest MaterialCommunityIcons battery-N glyph (icons exist at every 10% step, plus a charging and a low-battery variant). */
export function batteryIconName(level: number, charging: boolean): string {
  if (charging) return 'battery-charging';
  const percent = Math.round(Math.max(0, Math.min(1, level)) * 100);
  if (percent <= 10) return 'battery-alert-variant-outline';
  const step = Math.round(percent / 10) * 10;
  if (step >= 100) return 'battery';
  return `battery-${step}`;
}

export function formatBatteryPercent(level: number): string {
  return `${Math.round(Math.max(0, Math.min(1, level)) * 100)} %`;
}
