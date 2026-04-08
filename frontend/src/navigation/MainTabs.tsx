import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import type { ComponentProps } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { DashboardScreen } from '../screens/DashboardScreen';
import { LeaderboardScreen } from '../screens/LeaderboardScreen';
import { MatchesScreen } from '../screens/MatchesScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import { TournamentsScreen } from '../screens/TournamentsScreen';
import { Colors } from '../theme/colors';

export type RootTabParamList = {
  Dashboard: undefined;
  Leaderboard: undefined;
  Matches: undefined;
  Tournaments: undefined;
  Profile: undefined;
};

const Tab = createBottomTabNavigator<RootTabParamList>();
type TabIconName = ComponentProps<typeof MaterialIcons>['name'];

function getTabIcon(routeName: keyof RootTabParamList): TabIconName {
  switch (routeName) {
    case 'Dashboard':
      return 'dashboard';
    case 'Leaderboard':
      return 'leaderboard';
    case 'Matches':
      return 'sports-score';
    case 'Tournaments':
      return 'emoji-events';
    case 'Profile':
      return 'person';
    default:
      return 'dashboard';
  }
}

export function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: Colors.primaryContainer,
        tabBarInactiveTintColor: Colors.outline,
        tabBarStyle: styles.tabBar,
        tabBarItemStyle: styles.item,
        tabBarLabel: ({ focused, color }) => (
          <Text style={[styles.label, focused && styles.labelActive, { color }]}>{route.name}</Text>
        ),
        tabBarIcon: ({ focused, color }) => (
          <View style={[styles.iconWrap, focused && styles.iconWrapActive]}>
            <MaterialIcons
              color={focused ? Colors.onPrimary : color}
              name={getTabIcon(route.name)}
              size={20}
            />
          </View>
        ),
      })}
    >
      <Tab.Screen name="Dashboard" component={DashboardScreen} />
      <Tab.Screen name="Leaderboard" component={LeaderboardScreen} />
      <Tab.Screen name="Matches" component={MatchesScreen} />
      <Tab.Screen name="Tournaments" component={TournamentsScreen} />
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  label: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1,
    marginTop: 3,
    textTransform: 'uppercase',
  },
  labelActive: {
    color: Colors.primary,
  },
  tabBar: {
    backgroundColor: Colors.tabBarGlass,
    borderColor: 'rgba(195, 198, 210, 0.2)',
    borderWidth: 1,
    borderTopWidth: 1,
    borderRadius: 34,
    bottom: 10,
    elevation: 0,
    height: 90,
    left: 12,
    paddingBottom: 12,
    paddingHorizontal: 8,
    paddingTop: 8,
    position: 'absolute',
    right: 12,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: -10 },
    shadowOpacity: 0.09,
    shadowRadius: 20,
  },
  item: {
    paddingTop: 0,
  },
  iconWrap: {
    alignItems: 'center',
    borderRadius: 999,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  iconWrapActive: {
    backgroundColor: Colors.primaryContainer,
    height: 44,
    transform: [{ translateY: -3 }],
    width: 44,
  },
});
