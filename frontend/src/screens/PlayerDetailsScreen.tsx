import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PlayerProfileSummary } from '../components/PlayerProfileInsights';
import { usePlayerProfile } from '../hooks/usePlayerProfile';
import { Colors } from '../theme/colors';

type PlayerDetailsScreenProps = {
  identifier: string;
};

export function PlayerDetailsScreen({ identifier }: PlayerDetailsScreenProps) {
  const { profile, loading, error, reload } = usePlayerProfile(identifier);

  return (
    <SafeAreaView edges={['top']} style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {loading ? (
          <View style={styles.centeredState}>
            <ActivityIndicator color={Colors.primary} size="small" />
            <Text style={styles.centeredText}>Loading player...</Text>
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
    paddingBottom: 24,
    paddingHorizontal: 20,
    paddingTop: 12,
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
});