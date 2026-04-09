import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import axios from 'axios';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { apiClient } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { AppTopBar } from '../components/AppTopBar';
import { OpenMatchesPanel } from '../components/OpenMatchesPanel';
import { RootStackParamList } from '../navigation/RootNavigator';
import { Colors } from '../theme/colors';
import { toUserFriendlyError } from '../utils/httpError';

type MatchSetScore = {
  setNumber: number;
  teamAScore: number;
  teamBScore: number;
};

type MatchTeamMember = {
  id: string;
  fullName: string;
  nickname: string | null;
};

type MatchTeam = {
  side: 'A' | 'B';
  player1: MatchTeamMember;
  player2: MatchTeamMember;
};

type OpenMatchScoringMode = 'POINTS' | 'SETS';

type MatchItem = {
  id: string;
  status: 'SCHEDULED' | 'COMPLETED' | 'CANCELLED' | 'CANCELED';
  scheduledAt: string | null;
  playedAt: string | null;
  winnerTeamSide: 'A' | 'B' | null;
  isRated: boolean;
  teams: MatchTeam[];
  setScores: MatchSetScore[];
  tournamentCategory: {
    id: string;
    name: string;
    discipline: string;
  } | null;
};

type PlayerMatchesResponse = {
  playerId: string;
  username: string;
  matches: MatchItem[];
};

const INITIAL_VISIBLE = 20;
type Navigation = NativeStackNavigationProp<RootStackParamList>;

function resolveIdentifier(user: ReturnType<typeof useAuth>['user']): string | null {
  if (!user?.playerProfile?.id) {
    return null;
  }

  return user.playerProfile.id;
}

function formatDateParts(value: string | null): { day: string; month: string } {
  if (!value) {
    return { day: '--', month: '---' };
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return { day: '--', month: '---' };
  }

  return {
    day: String(parsed.getDate()).padStart(2, '0'),
    month: parsed.toLocaleString('en-US', { month: 'short' }).toUpperCase(),
  };
}

function formatSetScores(setScores: MatchSetScore[]): string {
  if (setScores.length === 0) {
    return '-';
  }

  return setScores.map((setScore) => `${setScore.teamAScore}-${setScore.teamBScore}`).join(', ');
}

function resolveOutcome(match: MatchItem, playerId: string | null): { label: string; won: boolean | null } {
  if (match.status !== 'COMPLETED') {
    return { label: 'Scheduled', won: null };
  }

  if (!match.winnerTeamSide) {
    return { label: 'Draw', won: null };
  }

  if (!playerId) {
    return { label: 'Completed', won: null };
  }

  const playerTeam = match.teams.find(
    (team) => team.player1.id === playerId || team.player2.id === playerId,
  );

  if (!playerTeam) {
    return { label: 'Completed', won: null };
  }

  if (playerTeam.side === match.winnerTeamSide) {
    return { label: 'Victory', won: true };
  }

  return { label: 'Defeat', won: false };
}

function resolveOpponent(match: MatchItem, playerId: string | null): { id: string | null; title: string } {
  if (!playerId) {
    const fallback = match.teams[0]?.player1;
    return {
      id: fallback?.id ?? null,
      title: fallback?.fullName ?? 'Player',
    };
  }

  const ownTeam = match.teams.find(
    (team) => team.player1.id === playerId || team.player2.id === playerId,
  );

  const opponentTeam = ownTeam
    ? match.teams.find((team) => team.side !== ownTeam.side)
    : match.teams[0];

  const candidate = opponentTeam?.player1 ?? null;

  return {
    id: candidate?.id ?? null,
    title: candidate?.fullName ?? candidate?.nickname ?? 'Player',
  };
}

function parsePositiveInt(input: string, fallback: number): number {
  const parsed = Number.parseInt(input, 10);
  if (Number.isNaN(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
}

function toOpenMatchCreateError(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const responseMessage = error.response?.data?.message;

    if (typeof responseMessage === 'string' && responseMessage.trim().length > 0) {
      return responseMessage;
    }

    if (Array.isArray(responseMessage) && responseMessage.length > 0) {
      return responseMessage.join(', ');
    }

    if (error.response?.status === 404) {
      return 'Open match API not found. Restart backend with latest code.';
    }
  }

  return toUserFriendlyError(error, 'Could not create open match');
}

export function MatchesScreen() {
  const navigation = useNavigation<Navigation>();
  const { user } = useAuth();
  const identifier = resolveIdentifier(user);

  const [playerId, setPlayerId] = useState<string | null>(user?.playerProfile?.id ?? null);
  const [matches, setMatches] = useState<MatchItem[]>([]);
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openMatchRefreshToken, setOpenMatchRefreshToken] = useState(0);
  const [showInviteSquadComposer, setShowInviteSquadComposer] = useState(false);
  const [createScoringMode, setCreateScoringMode] = useState<OpenMatchScoringMode>('POINTS');
  const [createIsRated, setCreateIsRated] = useState(true);
  const [createPointsToWin, setCreatePointsToWin] = useState('21');
  const [createSetsToWin, setCreateSetsToWin] = useState('2');
  const [createLocation, setCreateLocation] = useState('');
  const [createNotes, setCreateNotes] = useState('');
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const loadMatches = useCallback(async () => {
    if (!identifier) {
      setMatches([]);
      setError(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { data } = await apiClient.get<PlayerMatchesResponse>(
        `/players/${encodeURIComponent(identifier)}/matches`,
      );

      setPlayerId(data.playerId);
      setMatches(data.matches);
      setVisibleCount(INITIAL_VISIBLE);
    } catch (requestError) {
      setMatches([]);
      setError(toUserFriendlyError(requestError, 'Could not load matches'));
    } finally {
      setLoading(false);
    }
  }, [identifier]);

  useEffect(() => {
    void loadMatches();
  }, [loadMatches]);

  const createOpenMatch = useCallback(async () => {
    if (!identifier) {
      return;
    }

    setCreateLoading(true);
    setCreateError(null);

    try {
      const payload: {
        scoringMode: OpenMatchScoringMode;
        isRated: boolean;
        pointsToWin?: number;
        setsToWin?: number;
        location?: string;
        notes?: string;
      } = {
        scoringMode: createScoringMode,
        isRated: createIsRated,
        location: createLocation.trim() || undefined,
        notes: createNotes.trim() || undefined,
      };

      if (createScoringMode === 'POINTS') {
        payload.pointsToWin = parsePositiveInt(createPointsToWin, 21);
      } else {
        payload.setsToWin = parsePositiveInt(createSetsToWin, 2);
      }

      await apiClient.post('/matches/open', payload);
      setOpenMatchRefreshToken((previous) => previous + 1);
      setShowInviteSquadComposer(false);
      setCreateLocation('');
      setCreateNotes('');
      await loadMatches();
    } catch (requestError) {
      setCreateError(toOpenMatchCreateError(requestError));
    } finally {
      setCreateLoading(false);
    }
  }, [
    createIsRated,
    createLocation,
    createNotes,
    createPointsToWin,
    createScoringMode,
    createSetsToWin,
    identifier,
    loadMatches,
  ]);

  const visibleMatches = useMemo(
    () => matches.slice(0, visibleCount),
    [matches, visibleCount],
  );

  const hasMore = visibleCount < matches.length;

  const summary = useMemo(() => {
    let wins = 0;
    let losses = 0;
    let draws = 0;
    let completed = 0;

    for (const match of matches) {
      if (match.status !== 'COMPLETED') {
        continue;
      }

      completed += 1;
      const outcome = resolveOutcome(match, playerId);

      if (outcome.won === true) {
        wins += 1;
      } else if (outcome.won === false) {
        losses += 1;
      } else {
        draws += 1;
      }
    }

    const decisive = wins + losses;
    const winRate = decisive > 0 ? Math.round((wins / decisive) * 100) : 0;

    return {
      wins,
      losses,
      draws,
      completed,
      winRate,
    };
  }, [matches, playerId]);

  return (
    <SafeAreaView edges={['top']} style={styles.safeArea}>
      <AppTopBar rightBadge={matches.length > 0 ? `${matches.length}` : undefined} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.heroCard}>
          <View style={styles.heroGlow} />
          <Text style={styles.heroLabel}>Match Center</Text>
          <Text style={styles.heroTitle}>Dominate the Court</Text>
          <Text style={styles.heroBody}>
            Track every battle, monitor form, and keep your Elo momentum alive.
          </Text>

          {identifier ? (
            <View style={styles.heroButtonsRow}>
              <Pressable
                onPress={() => {
                  setShowInviteSquadComposer((previous) => !previous);
                  setCreateError(null);
                }}
                style={({ pressed }) => [styles.heroButtonPrimary, pressed && styles.pressed]}
              >
                <MaterialIcons color={Colors.onSecondaryContainer} name="group-add" size={18} />
                <Text style={styles.heroButtonPrimaryText}>Invite Your Squad</Text>
              </Pressable>

              <Pressable
                onPress={() => {
                  setOpenMatchRefreshToken((previous) => previous + 1);
                }}
                style={({ pressed }) => [styles.heroButtonSecondary, pressed && styles.pressed]}
              >
                <MaterialIcons color={Colors.onPrimary} name="refresh" size={18} />
                <Text style={styles.heroButtonSecondaryText}>Refresh Lobbies</Text>
              </Pressable>
            </View>
          ) : null}

          {identifier && showInviteSquadComposer ? (
            <View style={styles.heroComposeCard}>
              <Text style={styles.heroComposeTitle}>Create Open 2v2 Match</Text>

              <View style={styles.heroComposeToggleRow}>
                <Pressable
                  onPress={() => {
                    setCreateScoringMode('POINTS');
                  }}
                  style={({ pressed }) => [
                    styles.heroComposeToggle,
                    createScoringMode === 'POINTS' && styles.heroComposeToggleActive,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text
                    style={[
                      styles.heroComposeToggleText,
                      createScoringMode === 'POINTS' && styles.heroComposeToggleTextActive,
                    ]}
                  >
                    Points
                  </Text>
                </Pressable>

                <Pressable
                  onPress={() => {
                    setCreateScoringMode('SETS');
                  }}
                  style={({ pressed }) => [
                    styles.heroComposeToggle,
                    createScoringMode === 'SETS' && styles.heroComposeToggleActive,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text
                    style={[
                      styles.heroComposeToggleText,
                      createScoringMode === 'SETS' && styles.heroComposeToggleTextActive,
                    ]}
                  >
                    Sets
                  </Text>
                </Pressable>

                <Pressable
                  onPress={() => {
                    setCreateIsRated((previous) => !previous);
                  }}
                  style={({ pressed }) => [
                    styles.heroComposeToggle,
                    createIsRated && styles.heroComposeToggleActive,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text
                    style={[
                      styles.heroComposeToggleText,
                      createIsRated && styles.heroComposeToggleTextActive,
                    ]}
                  >
                    {createIsRated ? 'Rated' : 'Unrated'}
                  </Text>
                </Pressable>
              </View>

              {createScoringMode === 'POINTS' ? (
                <TextInput
                  keyboardType="number-pad"
                  onChangeText={setCreatePointsToWin}
                  placeholder="Points to win (e.g. 21)"
                  placeholderTextColor={Colors.outline}
                  style={styles.heroComposeInput}
                  value={createPointsToWin}
                />
              ) : (
                <TextInput
                  keyboardType="number-pad"
                  onChangeText={setCreateSetsToWin}
                  placeholder="Sets to win (e.g. 2)"
                  placeholderTextColor={Colors.outline}
                  style={styles.heroComposeInput}
                  value={createSetsToWin}
                />
              )}

              <TextInput
                onChangeText={setCreateLocation}
                placeholder="Location (optional)"
                placeholderTextColor={Colors.outline}
                style={styles.heroComposeInput}
                value={createLocation}
              />

              <TextInput
                multiline
                numberOfLines={2}
                onChangeText={setCreateNotes}
                placeholder="Note (optional)"
                placeholderTextColor={Colors.outline}
                style={[styles.heroComposeInput, styles.heroComposeInputMultiline]}
                value={createNotes}
              />

              {createError ? <Text style={styles.heroCreateError}>{createError}</Text> : null}

              <Pressable
                disabled={createLoading}
                onPress={() => {
                  void createOpenMatch();
                }}
                style={({ pressed }) => [
                  styles.heroButtonPrimary,
                  (pressed || createLoading) && styles.pressed,
                ]}
              >
                <MaterialIcons color={Colors.onSecondaryContainer} name="sports-tennis" size={18} />
                <Text style={styles.heroButtonPrimaryText}>Create Open Match</Text>
              </Pressable>
            </View>
          ) : null}
        </View>

        {!identifier ? (
          <View style={styles.infoCard}>
            <Text style={styles.infoTitle}>Player Account Required</Text>
            <Text style={styles.infoText}>Match history is available for accounts with a linked player profile.</Text>
          </View>
        ) : null}

        {identifier ? (
          <View style={styles.summaryGrid}>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>Win Rate</Text>
              <Text style={styles.summaryValue}>{summary.winRate}%</Text>
            </View>

            <View style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>Completed</Text>
              <Text style={styles.summaryValue}>{summary.completed}</Text>
            </View>

            <View style={styles.summaryCardWide}>
              <Text style={styles.summaryLabel}>Record</Text>
              <Text style={styles.summaryMeta}>W {summary.wins} | L {summary.losses} | D {summary.draws}</Text>
            </View>
          </View>
        ) : null}

        <OpenMatchesPanel
          hideCreateCard
          onLifecycleUpdate={loadMatches}
          playerId={identifier}
          refreshToken={openMatchRefreshToken}
        />

        <View style={styles.sectionHead}>
          <Text style={styles.sectionTitle}>Past Battles</Text>
          <Text style={styles.sectionMeta}>Showing {visibleMatches.length}</Text>
        </View>

        {identifier && loading ? (
          <View style={styles.loaderWrap}>
            <ActivityIndicator color={Colors.primary} size="small" />
            <Text style={styles.loaderText}>Loading matches...</Text>
          </View>
        ) : null}

        {identifier && error ? <Text style={styles.errorText}>{error}</Text> : null}

        {identifier && !loading && !error && visibleMatches.length === 0 ? (
          <Text style={styles.emptyText}>No matches found for this player yet.</Text>
        ) : null}

        <View style={styles.matchList}>
          {visibleMatches.map((match) => {
            const dateParts = formatDateParts(match.playedAt ?? match.scheduledAt);
            const outcome = resolveOutcome(match, playerId);
            const leagueName = match.tournamentCategory?.name || 'League';
            const mode = match.isRated ? 'Rated' : 'Unrated';
            const opponent = resolveOpponent(match, playerId);

            return (
              <Pressable
                disabled={!opponent.id}
                key={match.id}
                onPress={() => {
                  if (!opponent.id) {
                    return;
                  }

                  navigation.navigate('PlayerDetails', {
                    identifier: opponent.id,
                    title: opponent.title,
                  });
                }}
                style={({ pressed }) => [styles.matchCard, pressed && styles.pressed]}
              >
                <View style={styles.dateBlock}>
                  <Text style={styles.dateDay}>{dateParts.day}</Text>
                  <Text style={styles.dateMonth}>{dateParts.month}</Text>
                </View>

                <View style={styles.matchMiddle}>
                  <Text style={[styles.resultTitle, outcome.won === false && styles.resultTitleLoss]}>{outcome.label}</Text>
                  <Text style={styles.resultMeta}>{leagueName} | {mode}</Text>
                  <Text style={styles.scoreText}>{formatSetScores(match.setScores)}</Text>
                </View>

                <View style={styles.matchRight}>
                  <View
                    style={[
                      styles.statePill,
                      outcome.won === true
                        ? styles.statePillWin
                        : outcome.won === false
                          ? styles.statePillLoss
                          : styles.statePillDraw,
                    ]}
                  >
                    <Text style={styles.statePillText}>{outcome.won === true ? 'W' : outcome.won === false ? 'L' : 'D'}</Text>
                  </View>
                  <MaterialIcons color={Colors.outline} name="chevron-right" size={20} />
                </View>
              </Pressable>
            );
          })}
        </View>

        {identifier && hasMore ? (
          <Pressable
            onPress={() => {
              setVisibleCount((previous) => previous + INITIAL_VISIBLE);
            }}
            style={({ pressed }) => [styles.loadMoreButton, pressed && styles.pressed]}
          >
            <Text style={styles.loadMoreText}>Load More Matches</Text>
          </Pressable>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingBottom: 136,
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  dateBlock: {
    alignItems: 'center',
    backgroundColor: Colors.surfaceLowest,
    borderRadius: 14,
    justifyContent: 'center',
    minHeight: 62,
    width: 56,
  },
  dateDay: {
    color: Colors.primary,
    fontSize: 20,
    fontWeight: '900',
    lineHeight: 22,
  },
  dateMonth: {
    color: Colors.outline,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
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
  heroBody: {
    color: Colors.onPrimaryContainer,
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 14,
    maxWidth: 320,
  },
  heroButtonPrimary: {
    alignItems: 'center',
    backgroundColor: Colors.secondaryContainer,
    borderRadius: 999,
    flexDirection: 'row',
    gap: 6,
    justifyContent: 'center',
    minHeight: 42,
    paddingHorizontal: 14,
  },
  heroButtonPrimaryText: {
    color: Colors.onSecondaryContainer,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  heroButtonSecondary: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.16)',
    borderRadius: 999,
    flexDirection: 'row',
    gap: 6,
    justifyContent: 'center',
    minHeight: 42,
    paddingHorizontal: 14,
  },
  heroButtonSecondaryText: {
    color: Colors.onPrimary,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  heroButtonsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  heroComposeCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.14)',
    borderRadius: 16,
    gap: 8,
    marginTop: 10,
    padding: 10,
  },
  heroComposeInput: {
    backgroundColor: Colors.surfaceLowest,
    borderColor: Colors.ghostBorder,
    borderRadius: 10,
    borderWidth: 1,
    color: Colors.textPrimary,
    fontSize: 12,
    minHeight: 40,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  heroComposeInputMultiline: {
    minHeight: 64,
    textAlignVertical: 'top',
  },
  heroComposeTitle: {
    color: Colors.onPrimary,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.7,
    textTransform: 'uppercase',
  },
  heroComposeToggle: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 999,
    justifyContent: 'center',
    minHeight: 32,
    paddingHorizontal: 12,
  },
  heroComposeToggleActive: {
    backgroundColor: Colors.secondaryContainer,
  },
  heroComposeToggleRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  heroComposeToggleText: {
    color: Colors.onPrimary,
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  heroComposeToggleTextActive: {
    color: Colors.onSecondaryContainer,
  },
  heroCreateError: {
    color: '#FFD3D3',
    fontSize: 11,
    fontWeight: '700',
  },
  heroCard: {
    backgroundColor: Colors.primary,
    borderRadius: 28,
    marginBottom: 14,
    overflow: 'hidden',
    padding: 16,
    position: 'relative',
  },
  heroGlow: {
    backgroundColor: Colors.primaryContainer,
    borderRadius: 999,
    height: 190,
    opacity: 0.42,
    position: 'absolute',
    right: -56,
    top: -70,
    width: 190,
  },
  heroLabel: {
    color: Colors.onPrimaryContainer,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  heroTitle: {
    color: Colors.onPrimary,
    fontSize: 38,
    fontStyle: 'italic',
    fontWeight: '900',
    letterSpacing: -0.9,
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  infoCard: {
    backgroundColor: Colors.surfaceLow,
    borderRadius: 18,
    marginBottom: 12,
    padding: 14,
  },
  infoText: {
    color: Colors.textSecondary,
    fontSize: 12,
    lineHeight: 16,
  },
  infoTitle: {
    color: Colors.primary,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.8,
    marginBottom: 3,
    textTransform: 'uppercase',
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
  matchCard: {
    alignItems: 'center',
    backgroundColor: Colors.surfaceLow,
    borderRadius: 22,
    flexDirection: 'row',
    gap: 10,
    padding: 10,
  },
  matchList: {
    gap: 10,
  },
  matchMiddle: {
    flex: 1,
    gap: 1,
  },
  matchRight: {
    alignItems: 'center',
    gap: 2,
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.84,
  },
  resultMeta: {
    color: Colors.textSecondary,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  resultTitle: {
    color: Colors.tertiary,
    fontSize: 14,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  resultTitleLoss: {
    color: Colors.error,
  },
  safeArea: {
    backgroundColor: Colors.surface,
    flex: 1,
  },
  scoreText: {
    color: Colors.primary,
    fontSize: 13,
    fontWeight: '800',
  },
  sectionHead: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
    marginTop: 6,
  },
  sectionMeta: {
    color: Colors.outline,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  sectionTitle: {
    color: Colors.primary,
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  statePill: {
    alignItems: 'center',
    borderRadius: 999,
    justifyContent: 'center',
    minHeight: 22,
    minWidth: 22,
    paddingHorizontal: 7,
  },
  statePillDraw: {
    backgroundColor: Colors.outlineVariant,
  },
  statePillLoss: {
    backgroundColor: 'rgba(186, 26, 26, 0.22)',
  },
  statePillText: {
    color: Colors.textPrimary,
    fontSize: 10,
    fontWeight: '900',
  },
  statePillWin: {
    backgroundColor: 'rgba(0, 88, 82, 0.2)',
  },
  summaryCard: {
    backgroundColor: Colors.surfaceLowest,
    borderRadius: 18,
    flex: 1,
    minHeight: 80,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  summaryCardWide: {
    backgroundColor: Colors.surfaceLowest,
    borderRadius: 18,
    minHeight: 72,
    paddingHorizontal: 12,
    paddingVertical: 12,
    width: '100%',
  },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 14,
  },
  summaryLabel: {
    color: Colors.textSecondary,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  summaryMeta: {
    color: Colors.primary,
    fontSize: 15,
    fontWeight: '900',
    marginTop: 4,
  },
  summaryValue: {
    color: Colors.primary,
    fontSize: 30,
    fontWeight: '900',
    lineHeight: 32,
    marginTop: 2,
  },
});
