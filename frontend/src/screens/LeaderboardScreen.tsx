import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { apiClient } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { AppTopBar } from '../components/AppTopBar';
import { RootStackParamList } from '../navigation/RootNavigator';
import { Colors } from '../theme/colors';
import { toUserFriendlyError } from '../utils/httpError';

type PlayerListItem = {
  id: string;
  fullName: string;
  displayName: string | null;
  nickname: string | null;
  country: string | null;
  currentElo: number;
  wins: number;
  losses: number;
  matchesPlayed: number;
  draws?: number;
};

type PlayersListResponse = {
  items: PlayerListItem[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasMore: boolean;
};

const PAGE_LIMIT = 30;

type Navigation = NativeStackNavigationProp<RootStackParamList>;

function normalizeHumanName(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const normalized = value
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/^\d+\s+/, '');

  if (!normalized) {
    return null;
  }

  if (/^csv-[a-f0-9]{12,}$/i.test(normalized)) {
    return null;
  }

  if (/^[a-f0-9]{16,}$/i.test(normalized)) {
    return null;
  }

  return normalized;
}

function resolvePlayerTitle(player: PlayerListItem): string {
  return (
    normalizeHumanName(player.displayName) ||
    normalizeHumanName(player.fullName) ||
    normalizeHumanName(player.nickname) ||
    'Player'
  );
}

function initials(value: string): string {
  const parts = value
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);

  if (parts.length === 0) {
    return 'P';
  }

  return parts.map((part) => part[0]?.toUpperCase() ?? '').join('');
}

export function LeaderboardScreen() {
  const navigation = useNavigation<Navigation>();
  const { user } = useAuth();
  const [players, setPlayers] = useState<PlayerListItem[]>([]);
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentPlayerId = user?.playerProfile?.id ?? null;

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchQuery(searchInput.trim());
    }, 250);

    return () => {
      clearTimeout(timer);
    };
  }, [searchInput]);

  const loadPlayers = useCallback(async (pageToLoad: number, append: boolean) => {
    if (append) {
      setLoadingMore(true);
    } else {
      setLoading(true);
    }

    setError(null);

    try {
      const query = new URLSearchParams();
      query.set('page', String(pageToLoad));
      query.set('limit', String(PAGE_LIMIT));

      if (searchQuery) {
        query.set('search', searchQuery);
      }

      const { data } = await apiClient.get<PlayersListResponse>(`/players?${query.toString()}`);

      setPlayers((previous) => (append ? [...previous, ...data.items] : data.items));
      setPage(data.page);
      setTotal(data.total);
      setHasMore(data.hasMore);
    } catch (requestError) {
      if (!append) {
        setPlayers([]);
      }

      setError(toUserFriendlyError(requestError, 'Could not load leaderboard'));
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [searchQuery]);

  useEffect(() => {
    void loadPlayers(1, false);
  }, [loadPlayers]);

  const showPodium = searchQuery.length === 0;
  const podium = useMemo(() => (showPodium ? players.slice(0, 3) : []), [players, showPodium]);
  const listStartIndex = showPodium ? Math.min(3, players.length) : 0;
  const listPlayers = useMemo(
    () => (listStartIndex > 0 ? players.slice(listStartIndex) : players),
    [listStartIndex, players],
  );

  return (
    <SafeAreaView edges={['top']} style={styles.safeArea}>
      <AppTopBar rightBadge={total > 0 ? `${total}` : undefined} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.heroCard}>
          <View style={styles.heroGlow} />

          <View style={styles.heroTopRow}>
            <View>
              <Text style={styles.heroLabel}>Current Ranking</Text>
              <Text style={styles.heroTitle}>Ranking</Text>
            </View>
            <View style={styles.heroBadge}>
              <Text style={styles.heroBadgeText}>Top Players</Text>
            </View>
          </View>
        </View>

        {showPodium ? (
          <View style={styles.podiumRow}>
            {[1, 0, 2].map((index) => {
              const player = podium[index];

              if (!player) {
                return <View key={`empty-${index}`} style={styles.podiumGhost} />;
              }

              const rank = index + 1;
              const title = resolvePlayerTitle(player);

              return (
                <Pressable
                  key={player.id}
                  onPress={() => {
                    navigation.navigate('PlayerDetails', {
                      identifier: player.id,
                      title,
                    });
                  }}
                  style={({ pressed }) => [
                    styles.podiumCard,
                    rank === 1 && styles.podiumChampion,
                    rank === 2 && styles.podiumSecond,
                    rank === 3 && styles.podiumThird,
                    pressed && styles.pressed,
                  ]}
                >
                  <View style={[styles.podiumAvatar, rank === 1 && styles.podiumAvatarChampion]}>
                    <Text style={styles.podiumAvatarText}>{initials(title)}</Text>
                  </View>
                  <Text style={styles.podiumRank}>#{rank}</Text>
                  <Text numberOfLines={1} style={styles.podiumName}>{title}</Text>
                  <Text style={[styles.podiumElo, rank === 1 && styles.podiumEloChampion]}>{player.currentElo} ELO</Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}

        <View style={styles.fullRankHeader}>
          <Text style={styles.fullRankTitle}>Full Rankings</Text>
          <Text style={styles.fullRankMeta}>{searchQuery ? `Results ${total}` : `Active Players ${total}`}</Text>
        </View>

        <View style={styles.searchWrap}>
          <TextInput
            autoCapitalize="none"
            autoCorrect={false}
            onChangeText={setSearchInput}
            placeholder="Search player"
            placeholderTextColor={Colors.outline}
            style={styles.searchInput}
            value={searchInput}
          />
          {searchInput.length > 0 ? (
            <Pressable
              onPress={() => {
                setSearchInput('');
              }}
              style={({ pressed }) => [styles.clearButton, pressed && styles.pressed]}
            >
              <Text style={styles.clearButtonText}>Clear</Text>
            </Pressable>
          ) : null}
        </View>

        {loading ? (
          <View style={styles.loaderWrap}>
            <ActivityIndicator color={Colors.primary} size="small" />
            <Text style={styles.loaderText}>Loading players...</Text>
          </View>
        ) : null}

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        {!loading && !error && players.length === 0 ? (
          <Text style={styles.emptyText}>No players found. Try another search.</Text>
        ) : null}

        <View style={styles.rankList}>
          {listPlayers.map((player, index) => {
            const rank = index + 1 + listStartIndex;
            const title = resolvePlayerTitle(player);
            const draws = player.draws ?? Math.max(player.matchesPlayed - player.wins - player.losses, 0);
            const record = `${player.wins}/${draws}/${player.losses}`;
            const isCurrentUser = player.id === currentPlayerId;

            return (
              <Pressable
                key={player.id}
                onPress={() => {
                  navigation.navigate('PlayerDetails', {
                    identifier: player.id,
                    title,
                  });
                }}
                style={({ pressed }) => [
                  styles.rankCard,
                  isCurrentUser && styles.rankCardCurrentUser,
                  pressed && styles.pressed,
                ]}
              >
                <View style={styles.rankLeft}>
                  <Text style={[styles.rankNumber, isCurrentUser && styles.rankNumberCurrent]}>#{rank}</Text>
                  <View>
                    <Text style={[styles.rankName, isCurrentUser && styles.rankNameCurrent]}>{isCurrentUser ? `You (${title})` : title}</Text>
                    <Text style={[styles.rankMeta, isCurrentUser && styles.rankMetaCurrent]}>W/D/L {record} | {player.matchesPlayed} matches</Text>
                  </View>
                </View>
                <View style={styles.rankRight}>
                  <Text style={[styles.rankElo, isCurrentUser && styles.rankEloCurrent]}>{player.currentElo}</Text>
                  <Text style={[styles.rankCountry, isCurrentUser && styles.rankCountryCurrent]}>ELO</Text>
                </View>
              </Pressable>
            );
          })}
        </View>

        {hasMore ? (
          <Pressable
            disabled={loadingMore}
            onPress={() => {
              void loadPlayers(page + 1, true);
            }}
            style={({ pressed }) => [styles.loadMoreButton, pressed && !loadingMore && styles.pressed]}
          >
            {loadingMore ? (
              <ActivityIndicator color={Colors.onPrimary} size="small" />
            ) : (
              <Text style={styles.loadMoreText}>Load More Players</Text>
            )}
          </Pressable>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  clearButton: {
    alignItems: 'center',
    backgroundColor: Colors.primaryContainer,
    borderRadius: 12,
    justifyContent: 'center',
    marginLeft: 8,
    minHeight: 46,
    paddingHorizontal: 14,
  },
  clearButtonText: {
    color: Colors.onPrimary,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
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
  fullRankHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  fullRankMeta: {
    color: Colors.outline,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.7,
    textTransform: 'uppercase',
  },
  fullRankTitle: {
    color: Colors.primary,
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  heroBadge: {
    alignItems: 'center',
    backgroundColor: Colors.secondaryContainer,
    borderRadius: 999,
    justifyContent: 'center',
    minHeight: 30,
    paddingHorizontal: 14,
  },
  heroBadgeText: {
    color: Colors.onSecondaryContainer,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  heroCard: {
    backgroundColor: Colors.primary,
    borderRadius: 30,
    marginBottom: 18,
    overflow: 'hidden',
    padding: 16,
    position: 'relative',
  },
  heroGlow: {
    backgroundColor: Colors.primaryContainer,
    borderRadius: 999,
    height: 220,
    opacity: 0.45,
    position: 'absolute',
    right: -66,
    top: -90,
    width: 220,
  },
  heroLabel: {
    color: Colors.onPrimaryContainer,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
    marginBottom: 3,
    textTransform: 'uppercase',
  },
  heroTitle: {
    color: Colors.onPrimary,
    fontSize: 38,
    fontStyle: 'italic',
    fontWeight: '900',
    letterSpacing: -0.9,
    textTransform: 'uppercase',
  },
  heroTopRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  loadMoreButton: {
    alignItems: 'center',
    backgroundColor: Colors.primary,
    borderRadius: 16,
    justifyContent: 'center',
    marginTop: 16,
    minHeight: 48,
  },
  loadMoreText: {
    color: Colors.onPrimary,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  loaderText: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  loaderWrap: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  podiumAvatar: {
    alignItems: 'center',
    backgroundColor: Colors.surfaceHigh,
    borderColor: Colors.surfaceLow,
    borderRadius: 999,
    borderWidth: 4,
    height: 50,
    justifyContent: 'center',
    marginBottom: 8,
    width: 50,
  },
  podiumAvatarChampion: {
    backgroundColor: Colors.secondaryContainer,
    height: 62,
    width: 62,
  },
  podiumAvatarText: {
    color: Colors.primaryContainer,
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 0.4,
  },
  podiumCard: {
    alignItems: 'center',
    backgroundColor: Colors.surfaceLowest,
    borderRadius: 22,
    justifyContent: 'flex-end',
    paddingHorizontal: 8,
    paddingVertical: 10,
  },
  podiumChampion: {
    borderTopColor: Colors.secondaryContainer,
    borderTopWidth: 4,
    minHeight: 192,
    width: 112,
  },
  podiumElo: {
    color: Colors.primary,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  podiumEloChampion: {
    color: Colors.secondary,
  },
  podiumGhost: {
    flex: 1,
  },
  podiumName: {
    color: Colors.textPrimary,
    fontSize: 12,
    fontWeight: '800',
    marginBottom: 3,
    textAlign: 'center',
  },
  podiumRank: {
    color: Colors.outline,
    fontSize: 11,
    fontWeight: '900',
    marginBottom: 2,
  },
  podiumRow: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between',
    marginBottom: 18,
  },
  podiumSecond: {
    minHeight: 170,
    width: 100,
  },
  podiumThird: {
    minHeight: 158,
    width: 92,
  },
  pressed: {
    opacity: 0.84,
  },
  rankCard: {
    alignItems: 'center',
    backgroundColor: Colors.surfaceLow,
    borderRadius: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  rankCardCurrentUser: {
    backgroundColor: Colors.primaryContainer,
  },
  rankCountry: {
    color: Colors.outline,
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  rankCountryCurrent: {
    color: Colors.onPrimaryContainer,
  },
  rankElo: {
    color: Colors.primary,
    fontSize: 20,
    fontWeight: '900',
    lineHeight: 22,
    textAlign: 'right',
  },
  rankEloCurrent: {
    color: Colors.onPrimary,
  },
  rankLeft: {
    flex: 1,
    gap: 3,
  },
  rankList: {
    gap: 10,
  },
  rankMeta: {
    color: Colors.textSecondary,
    fontSize: 10,
    fontWeight: '700',
  },
  rankMetaCurrent: {
    color: Colors.onPrimaryContainer,
  },
  rankName: {
    color: Colors.textPrimary,
    fontSize: 14,
    fontWeight: '900',
  },
  rankNameCurrent: {
    color: Colors.onPrimary,
  },
  rankNumber: {
    color: Colors.secondary,
    fontSize: 11,
    fontWeight: '900',
  },
  rankNumberCurrent: {
    color: Colors.onPrimaryContainer,
  },
  rankRight: {
    alignItems: 'flex-end',
    marginLeft: 10,
  },
  safeArea: {
    backgroundColor: Colors.surface,
    flex: 1,
  },
  searchInput: {
    backgroundColor: Colors.surfaceLowest,
    borderColor: 'rgba(195, 198, 210, 0.34)',
    borderRadius: 12,
    borderWidth: 1,
    color: Colors.textPrimary,
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    minHeight: 46,
    paddingHorizontal: 12,
  },
  searchWrap: {
    alignItems: 'center',
    flexDirection: 'row',
    marginBottom: 12,
  },
});
