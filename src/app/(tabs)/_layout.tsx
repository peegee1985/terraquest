import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Tabs } from 'expo-router';

import { colors, typography } from '@/theme/tokens';

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

function TabIcon({ name, color }: { name: IconName; color: React.ComponentProps<typeof MaterialCommunityIcons>['color'] }) {
  return <MaterialCommunityIcons color={color} name={name} size={24} />;
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.brand,
        tabBarInactiveTintColor: colors.textDisabled,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.outline,
          height: 72,
          paddingTop: 8,
          paddingBottom: 10,
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
