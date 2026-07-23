import type { ComponentProps } from 'react';
import type MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';

type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

export type AchievementDisplay = { label: string; icon: IconName };

// Display copy for every achievementId achievementRules.ts defines —
// achievements.ts's backend only ever stores the bare id, so this is the
// client's one place to turn that into something a player actually reads.
const ACHIEVEMENT_DISPLAY: Record<string, AchievementDisplay> = {
  streak_3: { label: 'Tři dny v pohybu', icon: 'fire' },
  streak_7: { label: 'Týdenní vytrvalost', icon: 'fire' },
  streak_14: { label: 'Dva týdny bez přestávky', icon: 'fire' },
  streak_30: { label: 'Měsíční streak', icon: 'trophy-outline' },
  streak_100: { label: 'Sto dní v pohybu', icon: 'trophy' },

  poi_10: { label: 'Prvních 10 objevů', icon: 'map-marker-star-outline' },
  poi_50: { label: '50 objevených míst', icon: 'map-marker-star' },
  poi_100: { label: '100 objevených míst', icon: 'star-circle-outline' },

  daily_quests_10: { label: '10 splněných denních výprav', icon: 'flag-checkered' },
  weekly_quests_10: { label: '10 splněných týdenních výprav', icon: 'flag-variant' },

  step_streak_3: { label: 'Ranní krok', icon: 'shoe-print' },
  step_streak_7: { label: 'Týdenní tempo', icon: 'shoe-print' },
  step_streak_14: { label: 'Vytrvalec', icon: 'walk' },
  step_streak_30: { label: 'Železná chůze', icon: 'run' },
  step_streak_100: { label: 'Legenda kroků', icon: 'trophy-variant' },
};

const FALLBACK_DISPLAY: AchievementDisplay = { label: 'Odznak', icon: 'medal-outline' };

export function achievementDisplay(achievementId: string): AchievementDisplay {
  return ACHIEVEMENT_DISPLAY[achievementId] ?? FALLBACK_DISPLAY;
}
