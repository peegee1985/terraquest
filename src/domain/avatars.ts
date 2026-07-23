import type { ComponentProps } from 'react';
import type MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';

// `emoji` is a plain-text stand-in for `icon` wherever a MaterialCommunityIcons
// glyph isn't renderable — the Leaflet map marker is built from a raw HTML
// string injected into a WebView (native) / an SVG <Text> node (web SVG
// fallback), neither of which can load the icon font.
export type AvatarPreset = { id: string; icon: ComponentProps<typeof MaterialCommunityIcons>['name']; emoji: string; label: string };

export const AVATAR_PRESETS: readonly AvatarPreset[] = [
  { id: 'compass', icon: 'compass-rose', emoji: '🧭', label: 'Kompas' },
  { id: 'explorer', icon: 'hiking', emoji: '🥾', label: 'Průzkumník' },
  { id: 'ranger', icon: 'pine-tree', emoji: '🌲', label: 'Hraničář' },
  { id: 'cartographer', icon: 'map-outline', emoji: '🗺️', label: 'Kartograf' },
  { id: 'summit', icon: 'image-filter-hdr', emoji: '🏔️', label: 'Vrchol' },
  { id: 'nightwalker', icon: 'weather-night', emoji: '🌙', label: 'Noční chodec' },
  { id: 'river', icon: 'waves', emoji: '🌊', label: 'Řeka' },
  { id: 'star', icon: 'star-four-points-outline', emoji: '⭐', label: 'Hvězda' },
];

export const DEFAULT_AVATAR_ID = AVATAR_PRESETS[0].id;

export function avatarPresetById(id: string): AvatarPreset {
  return AVATAR_PRESETS.find((preset) => preset.id === id) ?? AVATAR_PRESETS[0];
}
