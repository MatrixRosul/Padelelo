import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '../auth/AuthContext';
import { PlayerProfileSummary } from '../components/PlayerProfileInsights';
import { AppTopBar } from '../components/AppTopBar';
import { usePlayerProfile } from '../hooks/usePlayerProfile';
import { Colors } from '../theme/colors';

function resolveUserIdentifier(user: ReturnType<typeof useAuth>['user']): string | null {
  if (!user) {
    return null;
  }

  if (user.playerProfile?.id) {
    return user.playerProfile.id;
  }

  return user.email || null;
}

export function ProfileScreen() {
  const { signOut, user, isSubmitting } = useAuth();
  const identifier = resolveUserIdentifier(user);
  const { profile, loading, error, reload } = usePlayerProfile(identifier);

  return (
    <SafeAreaView edges={['top']} style={styles.safeArea}>
      <AppTopBar />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
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
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
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