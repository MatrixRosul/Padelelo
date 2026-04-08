import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '../auth/AuthContext';
import { Colors } from '../theme/colors';

export function LoginScreen() {
  const { signIn, isSubmitting, authError } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  const isDisabled = isSubmitting || !email.trim() || !password.trim();

  const handleLogin = async () => {
    setLocalError(null);

    try {
      await signIn(email, password);
    } catch {
      setLocalError('Sign in failed. Check credentials and try again.');
    }
  };

  return (
    <SafeAreaView edges={['top']} style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardAvoidingView}
      >
        <View style={styles.heroCard}>
          <Text style={styles.heroLabel}>Padelelo</Text>
          <Text style={styles.heroTitle}>Welcome Back</Text>
          <Text style={styles.heroSubtitle}>Sign in to access leaderboard, profiles, and live match stats.</Text>
        </View>

        <View style={styles.formCard}>
          <View style={styles.inputWrap}>
            <Text style={styles.inputLabel}>Email</Text>
            <TextInput
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              onChangeText={setEmail}
              placeholder="import-admin@padelelo.local"
              placeholderTextColor={Colors.outline}
              style={styles.input}
              value={email}
            />
          </View>

          <View style={styles.inputWrap}>
            <Text style={styles.inputLabel}>Password</Text>
            <TextInput
              autoCapitalize="none"
              onChangeText={setPassword}
              placeholder="********"
              placeholderTextColor={Colors.outline}
              secureTextEntry
              style={styles.input}
              value={password}
            />
          </View>

          {authError || localError ? <Text style={styles.errorText}>{authError ?? localError}</Text> : null}

          <Pressable
            disabled={isDisabled}
            onPress={() => {
              void handleLogin();
            }}
            style={({ pressed }) => [
              styles.submitButton,
              isDisabled && styles.submitButtonDisabled,
              pressed && !isDisabled && styles.submitButtonPressed,
            ]}
          >
            {isSubmitting ? (
              <ActivityIndicator color={Colors.onPrimary} size="small" />
            ) : (
              <Text style={styles.submitButtonText}>Sign In</Text>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  errorText: {
    color: Colors.error,
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 4,
  },
  formCard: {
    backgroundColor: Colors.surfaceLowest,
    borderRadius: 24,
    gap: 14,
    marginHorizontal: 20,
    padding: 18,
  },
  heroCard: {
    backgroundColor: Colors.primaryContainer,
    borderRadius: 28,
    marginBottom: 18,
    marginHorizontal: 20,
    padding: 20,
  },
  heroLabel: {
    color: Colors.onPrimaryContainer,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  heroSubtitle: {
    color: Colors.onPrimaryContainer,
    fontSize: 13,
    lineHeight: 18,
  },
  heroTitle: {
    color: Colors.onPrimary,
    fontSize: 38,
    fontStyle: 'italic',
    fontWeight: '900',
    letterSpacing: -1,
    marginBottom: 10,
    textTransform: 'uppercase',
  },
  input: {
    backgroundColor: Colors.surfaceLow,
    borderColor: Colors.outlineVariant,
    borderRadius: 12,
    borderWidth: 1,
    color: Colors.textPrimary,
    fontSize: 16,
    minHeight: 48,
    paddingHorizontal: 12,
  },
  inputLabel: {
    color: Colors.textSecondary,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 5,
    textTransform: 'uppercase',
  },
  inputWrap: {
    width: '100%',
  },
  keyboardAvoidingView: {
    flex: 1,
    justifyContent: 'center',
  },
  safeArea: {
    backgroundColor: Colors.surface,
    flex: 1,
  },
  submitButton: {
    alignItems: 'center',
    backgroundColor: Colors.primary,
    borderRadius: 12,
    justifyContent: 'center',
    minHeight: 48,
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonPressed: {
    opacity: 0.85,
  },
  submitButtonText: {
    color: Colors.onPrimary,
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
});