import { DefaultTheme, NavigationContainer } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AuthProvider, useAuth } from './src/auth';
import { RootNavigator } from './src/navigation/RootNavigator';
import { LoginScreen } from './src/screens/LoginScreen';
import { Colors } from './src/theme/colors';

const navigationTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: Colors.primary,
    background: Colors.background,
    card: Colors.surface,
    text: Colors.textPrimary,
    border: Colors.outlineVariant,
    notification: Colors.accent,
  },
};

function RootContent() {
  const { isLoading, token } = useAuth();

  if (isLoading) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator color={Colors.primary} size="large" />
        <Text style={styles.loadingText}>Loading session...</Text>
      </View>
    );
  }

  if (!token) {
    return <LoginScreen />;
  }

  return <RootNavigator />;
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <NavigationContainer theme={navigationTheme}>
          <StatusBar style="dark" />
          <RootContent />
        </NavigationContainer>
      </AuthProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loadingText: {
    color: Colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
    marginTop: 10,
  },
  loadingWrap: {
    alignItems: 'center',
    backgroundColor: Colors.surface,
    flex: 1,
    justifyContent: 'center',
  },
});
