import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text } from 'react-native';
import HomeScreen from '../screens/HomeScreen';
import MatchesListScreen from '../screens/matches/MatchesListScreen';
import SettingsScreen from '../screens/settings/SettingsScreen';
import { useTheme } from '../theme/ThemeProvider';
import { useWebSocket } from '../hooks/useWebSocket';

export type MainTabParamList = {
  Home: undefined;
  Matches: undefined;
  Settings: undefined;
};

const Tab = createBottomTabNavigator<MainTabParamList>();

const TabLabel = ({ label, color }: { label: string; color: string }) => (
  <Text style={{ fontSize: 12, marginBottom: 4, color }}>{label}</Text>
);

export default function MainTabNavigator() {
  const { colors } = useTheme();
  useWebSocket();

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.card,
          borderTopColor: colors.border,
        },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.muted,
      }}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen as React.ComponentType}
        options={{ tabBarLabel: ({ color }) => <TabLabel label="Home" color={color} /> }}
      />
      <Tab.Screen
        name="Matches"
        component={MatchesListScreen as React.ComponentType}
        options={{ tabBarLabel: ({ color }) => <TabLabel label="Matches" color={color} /> }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
        options={{ tabBarLabel: ({ color }) => <TabLabel label="Settings" color={color} /> }}
      />
    </Tab.Navigator>
  );
}
