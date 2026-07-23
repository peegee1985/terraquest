import type { ComponentProps } from 'react';
import type MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';

export type AvatarPreset = { id: string; icon: ComponentProps<typeof MaterialCommunityIcons>['name']; label: string };

export const AVATAR_PRESETS: readonly AvatarPreset[] = [
  { id: 'compass', icon: 'compass-rose', label: 'Kompas' },
  { id: 'explorer', icon: 'hiking', label: 'Průzkumník' },
  { id: 'ranger', icon: 'pine-tree', label: 'Hraničář' },
  { id: 'cartographer', icon: 'map-outline', label: 'Kartograf' },
  { id: 'summit', icon: 'image-filter-hdr', label: 'Vrchol' },
  { id: 'nightwalker', icon: 'weather-night', label: 'Noční chodec' },
  { id: 'river', icon: 'waves', label: 'Řeka' },
  { id: 'star', icon: 'star-four-points-outline', label: 'Hvězda' },
];

export const DEFAULT_AVATAR_ID = AVATAR_PRESETS[0].id;

export function avatarPresetById(id: string): AvatarPreset {
  return AVATAR_PRESETS.find((preset) => preset.id === id) ?? AVATAR_PRESETS[0];
}
