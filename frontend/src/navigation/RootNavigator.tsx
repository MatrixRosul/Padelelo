import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { MainTabs } from './MainTabs';
import { PlayerDetailsScreen } from '../screens/PlayerDetailsScreen';
import { Colors } from '../theme/colors';

export type RootStackParamList = {
  MainTabs: undefined;
  PlayerDetails: {
    identifier: string;
    title?: string;
  };
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export function RootNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: {
          backgroundColor: Colors.surface,
        },
        headerTintColor: Colors.primary,
        headerTitleStyle: {
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
    </Stack.Navigator>
  );
}
