import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { MainTabs } from './MainTabs';
import { PlayerDetailsScreen } from '../screens/PlayerDetailsScreen';
import { TournamentDetailsScreen } from '../screens/TournamentDetailsScreen';
import { Colors } from '../theme/colors';

export type RootStackParamList = {
  MainTabs: undefined;
  PlayerDetails: {
    identifier: string;
    title?: string;
  };
  TournamentDetails: {
    tournamentId: string;
    title?: string;
  };
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export function RootNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: {
          backgroundColor: Colors.surfaceLow,
        },
        headerShadowVisible: false,
        headerTintColor: Colors.primary,
        headerTitleStyle: {
          color: Colors.textPrimary,
          fontWeight: '800',
        },
        contentStyle: {
          backgroundColor: Colors.surface,
        },
      }}
    >
      <Stack.Screen component={MainTabs} name="MainTabs" options={{ headerShown: false }} />
      <Stack.Screen
        name="PlayerDetails"
        options={({ route }) => ({
          title: route.params.title || 'Player Profile',
        })}
      >
        {({ route }) => <PlayerDetailsScreen identifier={route.params.identifier} />}
      </Stack.Screen>
      <Stack.Screen
        name="TournamentDetails"
        options={({ route }) => ({
          title: route.params.title || 'Tournament',
        })}
      >
        {({ route }) => <TournamentDetailsScreen tournamentId={route.params.tournamentId} />}
      </Stack.Screen>
    </Stack.Navigator>
  );
}
