import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { CompositeNavigationProp, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { apiClient } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { AppTopBar } from '../components/AppTopBar';
import { PlayerProfileResponse, usePlayerProfile } from '../hooks/usePlayerProfile';
import { RootTabParamList } from '../navigation/MainTabs';
import { RootStackParamList } from '../navigation/RootNavigator';
import { Colors } from '../theme/colors';

type RivalApiItem = {
  id: string;
  fullName: string;
  displayName: string | null;
  nickname: string | null;
  currentElo: number;
};

type PlayersListResponse = {
  items: RivalApiItem[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasMore: boolean;
};

type RivalCard = {
  id: string;
  title: string;
  elo: number;
};

type MatchEntry = PlayerProfileResponse['matchHistory'][number];
type MatchMember = MatchEntry['teams'][number]['player1'];

type Navigation = CompositeNavigationProp<
  BottomTabNavigationProp<RootTabParamList>,
  NativeStackNavigationProp<RootStackParamList>
>;

function resolveUserIdentifier(user: ReturnType<typeof useAuth>['user']): string | null {
  if (!user?.playerProfile?.id) {
    return null;
  }

  return user.playerProfile.id;
}

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

function resolvePlayerTitle(player: RivalApiItem): string {
  return (
    normalizeHumanName(player.displayName) ||
    normalizeHumanName(player.fullName) ||
    normalizeHumanName(player.nickname) ||
    'Player'
  );
}

function displayPlayerName(member: MatchMember): string {
  return normalizeHumanName(member.fullName) || normalizeHumanName(member.nickname) || 'Player';
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

function formatSetScores(
  setScores: Array<{
    setNumber: number;
    teamAScore: number;
    teamBScore: number;
  }>,
): string {
  if (setScores.length === 0) {
    return '-';
  }

  return setScores
    .slice(0, 3)
    .map((setScore) => `${setScore.teamAScore}-${setScore.teamBScore}`)
    .join(', ');
}

function resolveOutcomeToken(match: MatchEntry, playerId: string): 'W' | 'L' | 'D' {
  const ownTeam = match.teams.find(
    (team) => team.player1.id === playerId || team.player2.id === playerId,
  );

  if (!ownTeam || !match.winnerTeamSide) {
    return 'D';
  }

  return ownTeam.side === match.winnerTeamSide ? 'W' : 'L';
}

function resolveOpponents(match: MatchEntry, playerId: string): string {
  const ownTeam = match.teams.find(
    (team) => team.player1.id === playerId || team.player2.id === playerId,
  );

  const opponentTeam = ownTeam
    ? match.teams.find((team) => team.side !== ownTeam.side)
    : match.teams.find((team) => team.side === 'B') ?? match.teams[0];

  if (!opponentTeam) {
    return 'Recent Rival';
  }

  return `${displayPlayerName(opponentTeam.player1)} & ${displayPlayerName(opponentTeam.player2)}`;
}

function formatWhen(value: string | null): string {
  if (!value) {
    return 'NOW';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return 'NOW';
  }

  const diffMs = Date.now() - parsed.getTime();
  const diffHours = Math.floor(diffMs / 3_600_000);

  if (diffHours < 24) {
    return `${Math.max(diffHours, 1)}H AGO`;
  }

  const diffDays = Math.floor(diffHours / 24);
  return `${Math.max(diffDays, 1)}D AGO`;
}

export function DashboardScreen() {
  const navigation = useNavigation<Navigation>();
  const { user } = useAuth();
  const identifier = resolveUserIdentifier(user);
  const { profile, loading, error, reload } = usePlayerProfile(identifier);

  const [rivals, setRivals] = useState<RivalCard[]>([]);
  const [rivalsLoading, setRivalsLoading] = useState(false);

  const loadRivals = useCallback(async () => {
    if (!identifier) {
      setRivals([]);
      return;
    }

    setRivalsLoading(true);

    try {
      const { data } = await apiClient.get<PlayersListResponse>('/players?page=1&limit=14');
      const nextRivals = data.items
        .filter((item) => item.id !== identifier)
        .slice(0, 8)
        .map((item) => ({
          id: item.id,
          title: resolvePlayerTitle(item),
          elo: item.currentElo,
        }));

      setRivals(nextRivals);
    } catch {
      setRivals([]);
    } finally {
      setRivalsLoading(false);
    }
  }, [identifier]);

  useEffect(() => {
    void loadRivals();
  }, [loadRivals]);

  const recentMatches = useMemo(() => profile?.matchHistory.slice(0, 3) ?? [], [profile]);

  return (
    <SafeAreaView edges={['top']} style={styles.safeArea}>
      <AppTopBar />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Pressable
          onPress={() => {
            navigation.navigate('Leaderboard');
          }}
          style={({ pressed }) => [styles.searchBar, pressed && styles.pressed]}
        >
          <MaterialIcons color={Colors.outline} name="search" size={24} />
          <Text style={styles.searchText}>Find players by Elo or name</Text>
        </Pressable>

        <View style={styles.inviteCard}>
          <View style={styles.inviteGlow} />
          <View style={styles.inviteTopIcon}>
            <MaterialIcons color={Colors.secondaryContainer} name="rocket-launch" size={46} />
          </View>

          <Text style={styles.inviteLabel}>Tactical Advantage</Text>
          <Text style={styles.inviteTitle}>Invite Your Squad</Text>

          <Pressable
            onPress={() => {
              navigation.navigate('Tournaments');
            }}
            style={({ pressed }) => [styles.inviteButton, pressed && styles.pressed]}
          >
            <Text style={styles.inviteButtonText}>Generate Link</Text>
            <MaterialIcons color={Colors.onSecondaryContainer} name="share" size={18} />
          </Pressable>

          <View style={styles.inviteGroups}>
            <MaterialIcons color="rgba(255, 255, 255, 0.16)" name="groups" size={104} />
          </View>
        </View>

        {!identifier ? (
          <View style={styles.infoCard}>
            <Text style={styles.infoTitle}>Player Account Required</Text>
            <Text style={styles.infoText}>This dashboard is available for player accounts with a linked profile.</Text>
          </View>
        ) : null}

        {identifier && loading ? (
          <View style={styles.loadingCard}>
            <ActivityIndicator color={Colors.primary} size="small" />
            <Text style={styles.loadingText}>Loading strategy feed...</Text>
          </View>
        ) : null}

        {identifier && !loading && error ? (
          <View style={styles.errorCard}>
            <Text style={styles.errorText}>{error}</Text>
            <Pressable
              onPress={() => {
                void reload();
              }}
              style={({ pressed }) => [styles.retryButton, pressed && styles.pressed]}
            >
              <Text style={styles.retryText}>Retry</Text>
            </Pressable>
          </View>
        ) : null}

        {identifier && !loading && !error && profile ? (
          <>
            <View style={styles.sectionHead}>
              <Text style={styles.sectionTitle}>Active Strategizing</Text>
              <View style={styles.sectionBadge}>
                <Text style={styles.sectionBadgeText}>{recentMatches.length} NEW</Text>
              </View>
            </View>

            <View style={styles.messageList}>
              {recentMatches.map((match, index) => {
                const token = resolveOutcomeToken(match, profile.id);
                const opponentName = resolveOpponents(match, profile.id);
                const scoreLine = formatSetScores(match.setScores);
                const leagueName = match.tournamentCategory?.name || 'League';
                const detail =
                  token === 'W'
                    ? `Won ${scoreLine} in ${leagueName}. Ready for a rematch?`
                    : token === 'L'
                      ? `Dropped ${scoreLine} in ${leagueName}. Time to respond.`
                      : `Finished ${scoreLine} in ${leagueName}. Tactical draw.`;

                return (
                  <View key={match.id} style={[styles.messageCard, index === 0 && styles.messageCardActive]}>
                    <View
                      style={[
                        styles.messageAccent,
                        token === 'W'
                          ? styles.messageAccentWin
                          : token === 'L'
                            ? styles.messageAccentLoss
                            : styles.messageAccentDraw,
                      ]}
                    />

                    <View style={[styles.avatarStub, index !== 0 && styles.avatarStubMuted]}>
                      <Text style={styles.avatarStubText}>{initials(opponentName)}</Text>
                    </View>

                    <View style={styles.messageContent}>
                      <View style={styles.messageTopRow}>
                        <Text numberOfLines={1} style={[styles.messageTitle, index === 0 && styles.messageTitleActive]}>
                          {opponentName}
                        </Text>
                        <Text style={styles.messageTime}>{formatWhen(match.playedAt)}</Text>
                      </View>

                      <Text numberOfLines={1} style={[styles.messageBody, index === 0 && styles.messageBodyActive]}>
                        {detail}
                      </Text>
                    </View>

                    {index > 0 ? <MaterialIcons color={Colors.outlineVariant} name="chevron-right" size={20} /> : null}
                  </View>
                );
              })}
            </View>
          </>
        ) : null}

        <View style={styles.rivalSectionHead}>
          <Text style={styles.sectionTitle}>Recommended Rivals</Text>
        </View>

        {rivalsLoading ? (
          <View style={styles.loadingCard}>
            <ActivityIndicator color={Colors.primary} size="small" />
            <Text style={styles.loadingText}>Loading rivals...</Text>
          </View>
        ) : null}

        {!rivalsLoading && rivals.length === 0 ? (
          <View style={styles.emptyRivalsCard}>
            <Text style={styles.emptyRivalsText}>Play more matches to unlock rival suggestions.</Text>
          </View>
        ) : null}

        {rivals.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.rivalsScroll}>
            <View style={styles.rivalsRow}>
              {rivals.map((rival) => (
                <Pressable
                  key={rival.id}
                  onPress={() => {
                    navigation.navigate('PlayerDetails', {
                      identifier: rival.id,
                      title: rival.title,
                    });
                  }}
                  style={({ pressed }) => [styles.rivalCard, pressed && styles.pressed]}
                >
                  <View style={styles.rivalAvatar}>
                    <Text style={styles.rivalAvatarText}>{initials(rival.title)}</Text>
                  </View>

                  <Text style={styles.rivalElo}>ELO {rival.elo}</Text>
                  <Text numberOfLines={1} style={styles.rivalName}>{rival.title}</Text>
                </Pressable>
              ))}
            </View>
          </ScrollView>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  avatarStub: {
    alignItems: 'center',
    backgroundColor: Colors.primaryContainer,
    borderRadius: 18,
    height: 56,
    justifyContent: 'center',
    width: 56,
  },
  avatarStubMuted: {
    backgroundColor: Colors.surfaceHigh,
  },
  avatarStubText: {
    color: Colors.onPrimary,
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  content: {
    paddingBottom: 136,
    paddingHorizontal: 20,
    paddingTop: 14,
  },
  emptyRivalsCard: {
    backgroundColor: Colors.surfaceLow,
    borderRadius: 22,
    paddingHorizontal: 14,
    paddingVertical: 16,
  },
  emptyRivalsText: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  errorCard: {
    alignItems: 'center',
    backgroundColor: Colors.surfaceLow,
    borderRadius: 18,
    gap: 10,
    marginBottom: 16,
    padding: 14,
  },
  errorText: {
    color: Colors.error,
    fontSize: 12,
    fontWeight: '700',
  },
  infoCard: {
    backgroundColor: Colors.surfaceLow,
    borderRadius: 18,
    marginBottom: 14,
    padding: 14,
  },
  infoText: {
    color: Colors.textSecondary,
    fontSize: 12,
    lineHeight: 17,
  },
  infoTitle: {
    color: Colors.primary,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1,
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  inviteButton: {
    alignItems: 'center',
    backgroundColor: Colors.secondaryContainer,
    borderRadius: 999,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: 22,
    width: 206,
  },
  inviteButtonText: {
    color: Colors.onSecondaryContainer,
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  inviteCard: {
    backgroundColor: Colors.primary,
    borderRadius: 38,
    marginBottom: 22,
    minHeight: 292,
    overflow: 'hidden',
    paddingHorizontal: 22,
    paddingVertical: 24,
    position: 'relative',
  },
  inviteGlow: {
    backgroundColor: Colors.primaryContainer,
    borderRadius: 999,
    height: 220,
    opacity: 0.46,
    position: 'absolute',
    right: -64,
    top: -74,
    width: 220,
  },
  inviteGroups: {
    bottom: -8,
    opacity: 0.95,
    position: 'absolute',
    right: -8,
  },
  inviteLabel: {
    color: Colors.onPrimaryContainer,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 2,
    marginBottom: 10,
    textTransform: 'uppercase',
  },
  inviteTitle: {
    color: Colors.onPrimary,
    fontSize: 54,
    fontStyle: 'italic',
    fontWeight: '900',
    letterSpacing: -1.2,
    lineHeight: 52,
    marginBottom: 24,
    maxWidth: 260,
    textTransform: 'uppercase',
  },
  inviteTopIcon: {
    position: 'absolute',
    right: 18,
    top: 18,
  },
  loadingCard: {
    alignItems: 'center',
    backgroundColor: Colors.surfaceLow,
    borderRadius: 18,
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
    padding: 14,
  },
  loadingText: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  messageAccent: {
    borderRadius: 999,
    height: 56,
    width: 4,
  },
  messageAccentDraw: {
    backgroundColor: Colors.outlineVariant,
  },
  messageAccentLoss: {
    backgroundColor: 'rgba(186, 26, 26, 0.74)',
  },
  messageAccentWin: {
    backgroundColor: Colors.secondary,
  },
  messageBody: {
    color: Colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
  },
  messageBodyActive: {
    color: Colors.textPrimary,
  },
  messageCard: {
    alignItems: 'center',
    backgroundColor: Colors.surfaceLow,
    borderRadius: 26,
    flexDirection: 'row',
    gap: 12,
    overflow: 'hidden',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  messageCardActive: {
    backgroundColor: Colors.surfaceLowest,
  },
  messageContent: {
    flex: 1,
  },
  messageList: {
    gap: 10,
    marginBottom: 22,
  },
  messageTime: {
    color: Colors.outline,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
    marginLeft: 8,
    textTransform: 'uppercase',
  },
  messageTitle: {
    color: Colors.textPrimary,
    flex: 1,
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: -0.2,
  },
  messageTitleActive: {
    color: Colors.primaryContainer,
  },
  messageTopRow: {
    alignItems: 'center',
    flexDirection: 'row',
    marginBottom: 1,
  },
  pressed: {
    opacity: 0.84,
  },
  retryButton: {
    backgroundColor: Colors.primary,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  retryText: {
    color: Colors.onPrimary,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  rivalAvatar: {
    alignItems: 'center',
    backgroundColor: Colors.primaryContainer,
    borderColor: Colors.surfaceLow,
    borderRadius: 999,
    borderWidth: 4,
    height: 78,
    justifyContent: 'center',
    marginBottom: 10,
    width: 78,
  },
  rivalAvatarText: {
    color: Colors.onPrimary,
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: 0.4,
  },
  rivalCard: {
    alignItems: 'center',
    backgroundColor: Colors.surfaceLowest,
    borderRadius: 24,
    minHeight: 184,
    paddingHorizontal: 12,
    paddingTop: 12,
    width: 146,
  },
  rivalElo: {
    color: Colors.primary,
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 0.3,
    marginBottom: 4,
  },
  rivalName: {
    color: Colors.textPrimary,
    fontSize: 14,
    fontWeight: '800',
    maxWidth: 120,
    textAlign: 'center',
  },
  rivalSectionHead: {
    marginBottom: 12,
  },
  rivalsRow: {
    flexDirection: 'row',
    gap: 12,
    paddingBottom: 4,
  },
  rivalsScroll: {
    marginRight: -20,
    paddingRight: 20,
  },
  safeArea: {
    backgroundColor: Colors.surface,
    flex: 1,
  },
  searchBar: {
    alignItems: 'center',
    backgroundColor: Colors.surfaceLow,
    borderRadius: 22,
    flexDirection: 'row',
    gap: 8,
    marginBottom: 18,
    minHeight: 76,
    paddingHorizontal: 18,
  },
  searchText: {
    color: Colors.outline,
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  sectionBadge: {
    alignItems: 'center',
    backgroundColor: Colors.primary,
    borderRadius: 999,
    justifyContent: 'center',
    minHeight: 26,
    minWidth: 56,
    paddingHorizontal: 10,
  },
  sectionBadgeText: {
    color: Colors.onPrimary,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.7,
    textTransform: 'uppercase',
  },
  sectionHead: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  sectionTitle: {
    color: Colors.textSecondary,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 2.4,
    textTransform: 'uppercase',
  },
});
