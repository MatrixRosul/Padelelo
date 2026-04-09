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
  const { signIn, signUp, isSubmitting, authError } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');

  const [registerFullName, setRegisterFullName] = useState('');
  const [registerDisplayName, setRegisterDisplayName] = useState('');
  const [registerLogin, setRegisterLogin] = useState('');
  const [registerPassword, setRegisterPassword] = useState('');
  const [registerPasswordConfirm, setRegisterPasswordConfirm] = useState('');

  const [localError, setLocalError] = useState<string | null>(null);

  const isLoginDisabled = isSubmitting || !identifier.trim() || !password.trim();
  const isRegisterDisabled =
    isSubmitting ||
    !registerFullName.trim() ||
    !registerLogin.trim() ||
    !registerPassword.trim() ||
    !registerPasswordConfirm.trim();

  const handleLogin = async () => {
    setLocalError(null);

    try {
      await signIn(identifier, password);
    } catch {
      setLocalError('Не вдалось увійти. Перевір логін/пароль.');
    }
  };

  const handleRegister = async () => {
    setLocalError(null);

    const normalizedLogin = registerLogin.trim().toLowerCase();
    if (!/^[a-z0-9_]+$/.test(normalizedLogin)) {
      setLocalError('Логін: тільки латиниця, цифри, underscore (_).');
      return;
    }

    if (registerPassword.length < 8) {
      setLocalError('Пароль має містити мінімум 8 символів.');
      return;
    }

    if (registerPassword !== registerPasswordConfirm) {
      setLocalError('Паролі не співпадають.');
      return;
    }

    try {
      await signUp({
        fullName: registerFullName,
        displayName: registerDisplayName || undefined,
        login: normalizedLogin,
        password: registerPassword,
      });
    } catch {
      setLocalError('Не вдалось створити акаунт. Спробуй ще раз.');
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
          <Text style={styles.heroTitle}>{mode === 'login' ? 'Вхід' : 'Реєстрація'}</Text>
          <Text style={styles.heroSubtitle}>
            {mode === 'login'
              ? 'Увійди у свій профіль, щоб бачити рейтинг, матчі й турніри.'
              : 'Створи акаунт або привʼяжи існуючий профіль гравця за логіном/іменем.'}
          </Text>

          <View style={styles.modeRow}>
            <Pressable
              onPress={() => {
                setMode('login');
                setLocalError(null);
              }}
              style={({ pressed }) => [
                styles.modeButton,
                mode === 'login' && styles.modeButtonActive,
                pressed && styles.submitButtonPressed,
              ]}
            >
              <Text style={[styles.modeButtonText, mode === 'login' && styles.modeButtonTextActive]}>Увійти</Text>
            </Pressable>

            <Pressable
              onPress={() => {
                setMode('register');
                setLocalError(null);
              }}
              style={({ pressed }) => [
                styles.modeButton,
                mode === 'register' && styles.modeButtonActive,
                pressed && styles.submitButtonPressed,
              ]}
            >
              <Text style={[styles.modeButtonText, mode === 'register' && styles.modeButtonTextActive]}>
                Створити акаунт
              </Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.formCard}>
          {mode === 'login' ? (
            <>
              <View style={styles.inputWrap}>
                <Text style={styles.inputLabel}>Login or Email</Text>
                <TextInput
                  autoCapitalize="none"
                  autoCorrect={false}
                  onChangeText={setIdentifier}
                  placeholder="name_surname"
                  placeholderTextColor={Colors.outline}
                  style={styles.input}
                  value={identifier}
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
            </>
          ) : (
            <>
              <View style={styles.inputWrap}>
                <Text style={styles.inputLabel}>Імʼя та прізвище</Text>
                <TextInput
                  onChangeText={setRegisterFullName}
                  placeholder="Andrii Samsonov"
                  placeholderTextColor={Colors.outline}
                  style={styles.input}
                  value={registerFullName}
                />
              </View>

              <View style={styles.inputWrap}>
                <Text style={styles.inputLabel}>Display name (optional)</Text>
                <TextInput
                  onChangeText={setRegisterDisplayName}
                  placeholder="Andrii"
                  placeholderTextColor={Colors.outline}
                  style={styles.input}
                  value={registerDisplayName}
                />
              </View>

              <View style={styles.inputWrap}>
                <Text style={styles.inputLabel}>Login</Text>
                <TextInput
                  autoCapitalize="none"
                  autoCorrect={false}
                  onChangeText={setRegisterLogin}
                  placeholder="name_surname"
                  placeholderTextColor={Colors.outline}
                  style={styles.input}
                  value={registerLogin}
                />
              </View>

              <View style={styles.inputWrap}>
                <Text style={styles.inputLabel}>Password</Text>
                <TextInput
                  autoCapitalize="none"
                  onChangeText={setRegisterPassword}
                  placeholder="minimum 8 chars"
                  placeholderTextColor={Colors.outline}
                  secureTextEntry
                  style={styles.input}
                  value={registerPassword}
                />
              </View>

              <View style={styles.inputWrap}>
                <Text style={styles.inputLabel}>Confirm Password</Text>
                <TextInput
                  autoCapitalize="none"
                  onChangeText={setRegisterPasswordConfirm}
                  placeholder="repeat password"
                  placeholderTextColor={Colors.outline}
                  secureTextEntry
                  style={styles.input}
                  value={registerPasswordConfirm}
                />
              </View>
            </>
          )}

          {authError || localError ? <Text style={styles.errorText}>{authError ?? localError}</Text> : null}

          <View style={styles.helperCard}>
            <Text style={styles.helperTitle}>Швидкий тест</Text>
            <Text style={styles.helperText}>admin | player123</Text>
            <Text style={styles.helperText}>andrii_samsonov | player123</Text>
          </View>

          <Pressable
            disabled={mode === 'login' ? isLoginDisabled : isRegisterDisabled}
            onPress={() => {
              if (mode === 'login') {
                void handleLogin();
                return;
              }

              void handleRegister();
            }}
            style={({ pressed }) => [
              styles.submitButton,
              (mode === 'login' ? isLoginDisabled : isRegisterDisabled) && styles.submitButtonDisabled,
              pressed && !(mode === 'login' ? isLoginDisabled : isRegisterDisabled) && styles.submitButtonPressed,
            ]}
          >
            {isSubmitting ? (
              <ActivityIndicator color={Colors.onPrimary} size="small" />
            ) : (
              <Text style={styles.submitButtonText}>{mode === 'login' ? 'Увійти' : 'Створити акаунт'}</Text>
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
  modeButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: 999,
    justifyContent: 'center',
    minHeight: 36,
    paddingHorizontal: 12,
  },
  modeButtonActive: {
    backgroundColor: Colors.secondaryContainer,
  },
  modeButtonText: {
    color: Colors.onPrimary,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  modeButtonTextActive: {
    color: Colors.onSecondaryContainer,
  },
  modeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  helperCard: {
    backgroundColor: Colors.surfaceLow,
    borderRadius: 10,
    gap: 2,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  helperTitle: {
    color: Colors.textPrimary,
    fontSize: 11,
    fontWeight: '800',
  },
  helperText: {
    color: Colors.textSecondary,
    fontSize: 11,
    fontWeight: '700',
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