import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';

import { apiClient } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { PlayerProfileSummary } from '../components/PlayerProfileInsights';
import { AppTopBar } from '../components/AppTopBar';
import { usePlayerProfile } from '../hooks/usePlayerProfile';
import { RootTabParamList } from '../navigation/MainTabs';
import { Colors } from '../theme/colors';
import { toUserFriendlyError } from '../utils/httpError';

function resolveUserIdentifier(user: ReturnType<typeof useAuth>['user']): string | null {
  if (!user) {
    return null;
  }

  if (user.playerProfile?.id) {
    return user.playerProfile.id;
  }

  return user.email || null;
}

type ClubItem = {
  id: string;
  name: string;
  city: string | null;
  address: string | null;
  courtsCount: number;
};

export function ProfileScreen() {
  const navigation = useNavigation<BottomTabNavigationProp<RootTabParamList>>();
  const { signOut, user, isSubmitting } = useAuth();
  const isAdmin = user?.role === 'ADMIN';

  const identifier = resolveUserIdentifier(user);
  const { profile, loading, error, reload } = usePlayerProfile(identifier);

  useFocusEffect(
    useCallback(() => {
      void reload();

      return undefined;
    }, [reload]),
  );

  const [adminIdentifier, setAdminIdentifier] = useState('');
  const [adminFullName, setAdminFullName] = useState('');
  const [adminDisplayName, setAdminDisplayName] = useState('');
  const [adminCountry, setAdminCountry] = useState('');
  const [adminCity, setAdminCity] = useState('');
  const [adminSubmitting, setAdminSubmitting] = useState(false);
  const [adminError, setAdminError] = useState<string | null>(null);
  const [adminSuccess, setAdminSuccess] = useState<string | null>(null);

  const [clubName, setClubName] = useState('');
  const [clubCity, setClubCity] = useState('');
  const [clubAddress, setClubAddress] = useState('');
  const [clubCourtsCount, setClubCourtsCount] = useState('2');
  const [clubSubmitting, setClubSubmitting] = useState(false);
  const [clubError, setClubError] = useState<string | null>(null);
  const [clubSuccess, setClubSuccess] = useState<string | null>(null);
  const [clubs, setClubs] = useState<ClubItem[]>([]);
  const [clubsLoading, setClubsLoading] = useState(false);

  const loadClubs = useCallback(async () => {
    if (!isAdmin) {
      setClubs([]);
      return;
    }

    setClubsLoading(true);
    try {
      const { data } = await apiClient.get<ClubItem[]>('/clubs');
      setClubs(data);
    } catch {
      setClubs([]);
    } finally {
      setClubsLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    void loadClubs();
  }, [loadClubs]);

  const handleAdminSavePlayer = async () => {
    const targetIdentifier = adminIdentifier.trim();
    if (!targetIdentifier) {
      setAdminError('Вкажи player id/email/login');
      setAdminSuccess(null);
      return;
    }

    setAdminSubmitting(true);
    setAdminError(null);
    setAdminSuccess(null);

    try {
      await apiClient.patch(`/players/${encodeURIComponent(targetIdentifier)}`, {
        fullName: adminFullName.trim() || undefined,
        displayName: adminDisplayName.trim() || undefined,
        country: adminCountry.trim() || undefined,
        city: adminCity.trim() || undefined,
      });

      setAdminSuccess('Профіль гравця оновлено');
    } catch (requestError) {
      setAdminError(toUserFriendlyError(requestError, 'Не вдалось оновити профіль гравця'));
    } finally {
      setAdminSubmitting(false);
    }
  };

  const handleAdminCreateClub = async () => {
    const name = clubName.trim();
    const courtsCount = Number.parseInt(clubCourtsCount, 10);

    if (!name) {
      setClubError('Вкажи назву клубу');
      setClubSuccess(null);
      return;
    }

    if (!Number.isFinite(courtsCount) || courtsCount < 1 || courtsCount > 64) {
      setClubError('Кількість кортів: від 1 до 64');
      setClubSuccess(null);
      return;
    }

    setClubSubmitting(true);
    setClubError(null);
    setClubSuccess(null);

    try {
      await apiClient.post('/clubs', {
        name,
        city: clubCity.trim() || undefined,
        address: clubAddress.trim() || undefined,
        courtsCount,
      });

      setClubSuccess('Клуб створено');
      setClubName('');
      setClubCity('');
      setClubAddress('');
      setClubCourtsCount('2');
      await loadClubs();
    } catch (requestError) {
      setClubError(toUserFriendlyError(requestError, 'Не вдалось створити клуб'));
    } finally {
      setClubSubmitting(false);
    }
  };

  return (
    <SafeAreaView edges={['top']} style={styles.safeArea}>
      <AppTopBar />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardAvoiding}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
        <View style={styles.accountStrip}>
          <View>
            <Text style={styles.accountLabel}>Signed In</Text>
            <Text style={styles.accountEmail}>{user?.email ?? 'Unknown account'}</Text>
          </View>
          <Pressable
            disabled={isSubmitting}
            onPress={() => {
              void signOut();
            }}
            style={({ pressed }) => [styles.signOutButton, pressed && !isSubmitting && styles.signOutPressed]}
          >
            <Text style={styles.signOutText}>{isSubmitting ? '...' : 'Sign Out'}</Text>
          </Pressable>
        </View>

        {loading ? (
          <View style={styles.centeredState}>
            <ActivityIndicator color={Colors.primary} size="small" />
            <Text style={styles.centeredText}>Loading profile...</Text>
          </View>
        ) : null}

        {!loading && error ? (
          <View style={styles.centeredState}>
            <Text style={styles.errorText}>{error}</Text>
            <Pressable
              onPress={() => {
                void reload();
              }}
              style={styles.retryButton}
            >
              <Text style={styles.retryText}>Retry</Text>
            </Pressable>
          </View>
        ) : null}

        {!loading && !error && profile ? <PlayerProfileSummary profile={profile} /> : null}

          {isAdmin ? (
            <View style={styles.adminPanel}>
              <Text style={styles.adminPanelTitle}>Admin Panel</Text>

              <View style={styles.adminQuickActions}>
                <Pressable
                  onPress={() => {
                    navigation.navigate('Tournaments');
                  }}
                  style={({ pressed }) => [styles.adminQuickButton, pressed && styles.signOutPressed]}
                >
                  <Text style={styles.adminQuickText}>Турніри</Text>
                </Pressable>

                <Pressable
                  onPress={() => {
                    navigation.navigate('Leaderboard');
                  }}
                  style={({ pressed }) => [styles.adminQuickButton, pressed && styles.signOutPressed]}
                >
                  <Text style={styles.adminQuickText}>Гравці</Text>
                </Pressable>
              </View>

              <Text style={styles.adminSectionLabel}>Створення клубу</Text>
              <TextInput
                onChangeText={setClubName}
                placeholder="Назва клубу"
                placeholderTextColor={Colors.outline}
                style={styles.adminInput}
                value={clubName}
              />

              <View style={styles.adminInlineGrid}>
                <TextInput
                  onChangeText={setClubCity}
                  placeholder="Місто"
                  placeholderTextColor={Colors.outline}
                  style={[styles.adminInput, styles.adminInlineInput]}
                  value={clubCity}
                />
                <TextInput
                  keyboardType="number-pad"
                  onChangeText={setClubCourtsCount}
                  placeholder="Кортів"
                  placeholderTextColor={Colors.outline}
                  style={[styles.adminInput, styles.adminInlineInput]}
                  value={clubCourtsCount}
                />
              </View>

              <TextInput
                onChangeText={setClubAddress}
                placeholder="Адреса (optional)"
                placeholderTextColor={Colors.outline}
                style={styles.adminInput}
                value={clubAddress}
              />

              {clubError ? <Text style={styles.adminError}>{clubError}</Text> : null}
              {clubSuccess ? <Text style={styles.adminSuccess}>{clubSuccess}</Text> : null}

              <Pressable
                disabled={clubSubmitting}
                onPress={() => {
                  void handleAdminCreateClub();
                }}
                style={({ pressed }) => [
                  styles.adminSubmitButton,
                  clubSubmitting && styles.adminSubmitButtonDisabled,
                  pressed && !clubSubmitting && styles.signOutPressed,
                ]}
              >
                {clubSubmitting ? (
                  <ActivityIndicator color={Colors.onPrimary} size="small" />
                ) : (
                  <Text style={styles.adminSubmitText}>Створити клуб</Text>
                )}
              </Pressable>

              <View style={styles.clubsListWrap}>
                <Text style={styles.adminSectionLabel}>Існуючі клуби</Text>
                {clubsLoading ? <Text style={styles.centeredText}>Завантаження...</Text> : null}
                {!clubsLoading && clubs.length === 0 ? (
                  <Text style={styles.centeredText}>Клубів поки немає</Text>
                ) : null}

                {!clubsLoading
                  ? clubs.map((club) => (
                      <View key={club.id} style={styles.clubItem}>
                        <Text style={styles.clubName}>{club.name}</Text>
                        <Text style={styles.clubMeta}>
                          {[club.city, club.address].filter(Boolean).join(', ') || 'Локація не вказана'}
                        </Text>
                        <Text style={styles.clubMeta}>Кортів: {club.courtsCount}</Text>
                      </View>
                    ))
                  : null}
              </View>

              <Text style={styles.adminSectionLabel}>Редагування гравця</Text>
              <TextInput
                autoCapitalize="none"
                onChangeText={setAdminIdentifier}
                placeholder="Player ID / email / login"
                placeholderTextColor={Colors.outline}
                style={styles.adminInput}
                value={adminIdentifier}
              />

              <View style={styles.adminInlineGrid}>
                <TextInput
                  onChangeText={setAdminFullName}
                  placeholder="Full name"
                  placeholderTextColor={Colors.outline}
                  style={[styles.adminInput, styles.adminInlineInput]}
                  value={adminFullName}
                />
                <TextInput
                  onChangeText={setAdminDisplayName}
                  placeholder="Display name"
                  placeholderTextColor={Colors.outline}
                  style={[styles.adminInput, styles.adminInlineInput]}
                  value={adminDisplayName}
                />
              </View>

              <View style={styles.adminInlineGrid}>
                <TextInput
                  onChangeText={setAdminCountry}
                  placeholder="Country"
                  placeholderTextColor={Colors.outline}
                  style={[styles.adminInput, styles.adminInlineInput]}
                  value={adminCountry}
                />
                <TextInput
                  onChangeText={setAdminCity}
                  placeholder="City"
                  placeholderTextColor={Colors.outline}
                  style={[styles.adminInput, styles.adminInlineInput]}
                  value={adminCity}
                />
              </View>

              {adminError ? <Text style={styles.adminError}>{adminError}</Text> : null}
              {adminSuccess ? <Text style={styles.adminSuccess}>{adminSuccess}</Text> : null}

              <Pressable
                disabled={adminSubmitting}
                onPress={() => {
                  void handleAdminSavePlayer();
                }}
                style={({ pressed }) => [
                  styles.adminSubmitButton,
                  adminSubmitting && styles.adminSubmitButtonDisabled,
                  pressed && !adminSubmitting && styles.signOutPressed,
                ]}
              >
                {adminSubmitting ? (
                  <ActivityIndicator color={Colors.onPrimary} size="small" />
                ) : (
                  <Text style={styles.adminSubmitText}>Зберегти зміни гравця</Text>
                )}
              </Pressable>
            </View>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  adminError: {
    color: Colors.error,
    fontSize: 12,
    fontWeight: '700',
  },
  adminInlineGrid: {
    flexDirection: 'row',
    gap: 8,
  },
  adminInlineInput: {
    flex: 1,
  },
  adminInput: {
    backgroundColor: Colors.surfaceLowest,
    borderColor: Colors.outlineVariant,
    borderRadius: 10,
    borderWidth: 1,
    color: Colors.textPrimary,
    fontSize: 13,
    fontWeight: '600',
    minHeight: 40,
    paddingHorizontal: 10,
  },
  adminPanel: {
    backgroundColor: Colors.surfaceLow,
    borderRadius: 16,
    gap: 10,
    marginTop: 12,
    padding: 12,
  },
  adminPanelTitle: {
    color: Colors.primary,
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  adminQuickActions: {
    flexDirection: 'row',
    gap: 8,
  },
  adminQuickButton: {
    alignItems: 'center',
    backgroundColor: Colors.surfaceLowest,
    borderColor: Colors.outlineVariant,
    borderRadius: 10,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 36,
    paddingHorizontal: 12,
  },
  adminQuickText: {
    color: Colors.textPrimary,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  adminSectionLabel: {
    color: Colors.outline,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  adminSubmitButton: {
    alignItems: 'center',
    backgroundColor: Colors.primary,
    borderRadius: 10,
    justifyContent: 'center',
    minHeight: 40,
    paddingHorizontal: 10,
  },
  adminSubmitButtonDisabled: {
    opacity: 0.7,
  },
  adminSubmitText: {
    color: Colors.onPrimary,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  adminSuccess: {
    color: Colors.success,
    fontSize: 12,
    fontWeight: '700',
  },
  accountEmail: {
    color: Colors.textPrimary,
    fontSize: 13,
    fontWeight: '800',
  },
  accountLabel: {
    color: Colors.textSecondary,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
    marginBottom: 2,
    textTransform: 'uppercase',
  },
  accountStrip: {
    alignItems: 'center',
    backgroundColor: Colors.surfaceLowest,
    borderRadius: 18,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  centeredState: {
    alignItems: 'center',
    backgroundColor: Colors.surfaceLow,
    borderRadius: 14,
    gap: 8,
    marginBottom: 14,
    padding: 14,
  },
  centeredText: {
    color: Colors.textSecondary,
    fontSize: 12,
  },
  clubItem: {
    backgroundColor: Colors.surfaceLowest,
    borderColor: Colors.outlineVariant,
    borderRadius: 10,
    borderWidth: 1,
    gap: 2,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  clubMeta: {
    color: Colors.outline,
    fontSize: 10,
    fontWeight: '700',
  },
  clubName: {
    color: Colors.textPrimary,
    fontSize: 12,
    fontWeight: '800',
  },
  clubsListWrap: {
    gap: 6,
  },
  content: {
    paddingBottom: 130,
    paddingHorizontal: 20,
  },
  errorText: {
    color: Colors.error,
    fontSize: 12,
    fontWeight: '600',
  },
  retryButton: {
    backgroundColor: Colors.primary,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  retryText: {
    color: Colors.onPrimary,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  safeArea: {
    backgroundColor: Colors.surface,
    flex: 1,
  },
  keyboardAvoiding: {
    flex: 1,
  },
  signOutButton: {
    alignItems: 'center',
    backgroundColor: Colors.secondaryContainer,
    borderRadius: 999,
    justifyContent: 'center',
    minHeight: 34,
    paddingHorizontal: 14,
  },
  signOutPressed: {
    opacity: 0.85,
  },
  signOutText: {
    color: Colors.onSecondaryContainer,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.7,
    textTransform: 'uppercase',
  },
});