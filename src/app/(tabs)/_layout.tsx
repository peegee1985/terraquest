import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, typography } from '@/theme/tokens';

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

function TabIcon({ name, color }: { name: IconName; color: React.ComponentProps<typeof MaterialCommunityIcons>['color'] }) {
  return <MaterialCommunityIcons color={color} name={name} size={24} />;
}

const TAB_BAR_CONTENT_HEIGHT = 52;

export default function TabsLayout() {
  // A hardcoded tabBarStyle.height (the previous `72`) opts the bar out of
  // react-navigation's own automatic bottom-inset padding — on Android's
  // 3-button/gesture nav, that left the bar sitting flush against (or
  // partly behind) the system bar. Adding insets.bottom back in restores
  // the same effective tap-target height that removing the override would
  // give for free, just with an explicit number to reason about.
  const insets = useSafeAreaInsets();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.brand,
        tabBarInactiveTintColor: colors.textDisabled,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.outline,
          height: TAB_BAR_CONTENT_HEIGHT + insets.bottom,
          paddingTop: 8,
          paddingBottom: insets.bottom + 10,
        },
        tabBarLabelStyle: {
          fontSize: typography.caption.fontSize,
          fontWeight: '600',
        },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Domů',
          tabBarIcon: ({ color }) => <TabIcon color={color} name="compass-outline" />,
        }}
      />
      <Tabs.Screen
        name="map"
        options={{
          title: 'Mapa',
          tabBarIcon: ({ color }) => <TabIcon color={color} name="map-marker-radius-outline" />,
        }}
      />
      <Tabs.Screen
        name="quests"
        options={{
          title: 'Výpravy',
          tabBarIcon: ({ color }) => <TabIcon color={color} name="flag-variant-outline" />,
        }}
      />
      <Tabs.Screen
        name="progress"
        options={{
          title: 'Pokrok',
          tabBarIcon: ({ color }) => <TabIcon color={color} name="chart-timeline-variant-shimmer" />,
        }}
      />
    </Tabs>
  );
}
