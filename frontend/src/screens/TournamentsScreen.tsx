import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { apiClient } from '../api/client';
import { AppTopBar } from '../components/AppTopBar';
import { Colors } from '../theme/colors';
import { toUserFriendlyError } from '../utils/httpError';

type TournamentCategoryItem = {
  id: string;
  name: string;
  discipline: string;
  format: string;
  maxParticipants: number;
};

type TournamentItem = {
  id: string;
  name: string;
  location: string | null;
  startDate: string;
  endDate: string;
  status: string;
  registrationStatus: 'OPEN' | 'CLOSED';
  categories: TournamentCategoryItem[];
};

function formatDateRange(startDate: string, endDate: string): string {
  const start = new Date(startDate);
  const end = new Date(endDate);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return 'Dates pending';
  }

  const startPart = start.toLocaleDateString('uk-UA', { day: '2-digit', month: 'short' });
  const endPart = end.toLocaleDateString('uk-UA', { day: '2-digit', month: 'short' });

  return `${startPart} - ${endPart}`;
}

export function TournamentsScreen() {
  const [tournaments, setTournaments] = useState<TournamentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadTournaments = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const { data } = await apiClient.get<TournamentItem[]>('/tournaments');
      setTournaments(data);
    } catch (requestError) {
      setTournaments([]);
      setError(toUserFriendlyError(requestError, 'Could not load tournaments'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadTournaments();
  }, [loadTournaments]);

  return (
    <SafeAreaView edges={['top']} style={styles.safeArea}>
      <AppTopBar />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.heroCard}>
          <View style={styles.heroGlow} />
          <Text style={styles.heroLabel}>Tournament Hub</Text>
          <Text style={styles.heroTitle}>Доступні турніри</Text>
          <Text style={styles.heroSubtitle}>Список актуальних подій і категорій для участі.</Text>
        </View>

        <View style={styles.sectionHead}>
          <Text style={styles.sectionTitle}>Доступні турніри</Text>
          <Pressable
            onPress={() => {
              void loadTournaments();
            }}
            style={({ pressed }) => [styles.refreshButton, pressed && styles.pressed]}
          >
            <Text style={styles.refreshButtonText}>Оновити</Text>
          </Pressable>
        </View>

        {loading ? (
          <View style={styles.loadingLine}>
            <ActivityIndicator color={Colors.primary} size="small" />
            <Text style={styles.loadingText}>Завантажую турніри...</Text>
          </View>
        ) : null}

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        {!loading && !error && tournaments.length === 0 ? (
          <Text style={styles.emptyText}>Поки що немає опублікованих турнірів.</Text>
        ) : null}

        <View style={styles.tournamentList}>
          {tournaments.map((tournament) => {
            const registrationOpen = tournament.registrationStatus === 'OPEN';

            return (
              <View key={tournament.id} style={styles.tournamentCard}>
                <View style={styles.tournamentHead}>
                  <View style={styles.tournamentHeadLeft}>
                    <Text style={styles.tournamentName}>{tournament.name}</Text>
                    <Text style={styles.tournamentMeta}>{formatDateRange(tournament.startDate, tournament.endDate)}</Text>
                    <Text style={styles.tournamentMeta}>{tournament.location || 'Location TBD'}</Text>
                  </View>
                  <View style={[styles.statusPill, registrationOpen ? styles.statusPillOpen : styles.statusPillClosed]}>
                    <Text style={styles.statusPillText}>{registrationOpen ? 'OPEN' : 'CLOSED'}</Text>
                  </View>
                </View>

                <View style={styles.categoryList}>
                  {tournament.categories.map((category) => {
                    return (
                      <View key={category.id} style={styles.categoryCard}>
                        <Text style={styles.categoryName}>{category.name}</Text>
                        <Text style={styles.categoryMeta}>{category.discipline} | {category.format}</Text>
                        <Text style={styles.categoryMeta}>Max: {category.maxParticipants}</Text>
                      </View>
                    );
                  })}
                </View>
              </View>
            );
          })}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  categoryCard: {
    backgroundColor: Colors.surfaceLowest,
    borderRadius: 14,
    gap: 2,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  categoryList: {
    gap: 8,
  },
  categoryMeta: {
    color: Colors.outline,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  categoryName: {
    color: Colors.textPrimary,
    fontSize: 13,
    fontWeight: '900',
  },
  content: {
    paddingBottom: 136,
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  emptyText: {
    color: Colors.textSecondary,
    fontSize: 12,
    marginBottom: 12,
  },
  errorText: {
    color: Colors.error,
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 12,
  },
  heroCard: {
    backgroundColor: Colors.primary,
    borderRadius: 26,
    marginBottom: 14,
    overflow: 'hidden',
    padding: 16,
    position: 'relative',
  },
  heroGlow: {
    backgroundColor: Colors.primaryContainer,
    borderRadius: 999,
    height: 190,
    opacity: 0.45,
    position: 'absolute',
    right: -60,
    top: -74,
    width: 190,
  },
  heroLabel: {
    color: Colors.onPrimaryContainer,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  heroSubtitle: {
    color: Colors.onPrimaryContainer,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 6,
    maxWidth: 330,
  },
  heroTitle: {
    color: Colors.onPrimary,
    fontSize: 34,
    fontStyle: 'italic',
    fontWeight: '900',
    letterSpacing: -0.8,
    marginTop: 4,
    textTransform: 'uppercase',
  },
  loadingLine: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  loadingText: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  pressed: {
    opacity: 0.84,
  },
  refreshButton: {
    alignItems: 'center',
    backgroundColor: Colors.primaryContainer,
    borderRadius: 999,
    justifyContent: 'center',
    minHeight: 30,
    paddingHorizontal: 12,
  },
  refreshButtonText: {
    color: Colors.onPrimary,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.7,
    textTransform: 'uppercase',
  },
  safeArea: {
    backgroundColor: Colors.surface,
    flex: 1,
  },
  sectionHead: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
    marginTop: 4,
  },
  sectionTitle: {
    color: Colors.primary,
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  statusPill: {
    alignItems: 'center',
    borderRadius: 999,
    justifyContent: 'center',
    minHeight: 24,
    paddingHorizontal: 10,
  },
  statusPillClosed: {
    backgroundColor: Colors.outlineVariant,
  },
  statusPillOpen: {
    backgroundColor: 'rgba(0, 88, 82, 0.2)',
  },
  statusPillText: {
    color: Colors.textPrimary,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  tournamentCard: {
    backgroundColor: Colors.surfaceLow,
    borderRadius: 18,
    gap: 10,
    padding: 12,
  },
  tournamentHead: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  tournamentHeadLeft: {
    flex: 1,
    marginRight: 8,
  },
  tournamentList: {
    gap: 10,
  },
  tournamentMeta: {
    color: Colors.outline,
    fontSize: 11,
    fontWeight: '700',
  },
  tournamentName: {
    color: Colors.textPrimary,
    fontSize: 16,
    fontWeight: '900',
    marginBottom: 2,
  },
});
