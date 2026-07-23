import { Platform, TextStyle, ViewStyle } from 'react-native';

export const colors = {
  background: '#07111A',
  surface: '#0E1C28',
  surfaceElevated: '#142636',
  surfaceMuted: '#1A2E3E',
  textPrimary: '#F5F7F4',
  textSecondary: '#A7B8C5',
  textDisabled: '#667985',
  brand: '#38E68A',
  onBrand: '#04120B',
  amber: '#FFB84D',
  blue: '#4CB8FF',
  purple: '#B38CFF',
  danger: '#FF5D66',
  warning: '#FFC857',
  outline: '#294153',
  // Deliberately a mid grey, not a near-black shade — the basemap tiles
  // (CARTO dark_all, see explorer-map.native.tsx) and colors.background are
  // both already near-black, so a dark fog color used to blend into them
  // almost invisibly, making unlocked (revealed) areas hard to tell apart
  // from still-fogged ones. High opacity keeps it reading as solid grey
  // rather than washing back toward black once blended over the map tile.
  fog: 'rgba(112, 124, 138, 0.92)',
  brandSoft: 'rgba(56, 230, 138, 0.14)',
  amberSoft: 'rgba(255, 184, 77, 0.14)',
  blueSoft: 'rgba(76, 184, 255, 0.14)',
} as const;

export const spacing = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const radii = {
  sm: 10,
  md: 14,
  lg: 18,
  xl: 24,
  pill: 999,
} as const;

export const typography = {
  display: { fontSize: 32, lineHeight: 38, fontWeight: '800' } satisfies TextStyle,
  h1: { fontSize: 24, lineHeight: 30, fontWeight: '700' } satisfies TextStyle,
  h2: { fontSize: 20, lineHeight: 26, fontWeight: '700' } satisfies TextStyle,
  h3: { fontSize: 17, lineHeight: 22, fontWeight: '700' } satisfies TextStyle,
  body: { fontSize: 15, lineHeight: 22, fontWeight: '400' } satisfies TextStyle,
  label: { fontSize: 13, lineHeight: 17, fontWeight: '600' } satisfies TextStyle,
  caption: { fontSize: 12, lineHeight: 16, fontWeight: '500' } satisfies TextStyle,
  metric: { fontSize: 34, lineHeight: 40, fontWeight: '800' } satisfies TextStyle,
} as const;

export const cardShadow: ViewStyle = Platform.select({
  ios: {
    shadowColor: '#000',
    shadowOpacity: 0.24,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
  },
  android: { elevation: 4 },
  default: {},
}) as ViewStyle;
