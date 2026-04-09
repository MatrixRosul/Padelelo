import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { apiClient } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { RootStackParamList } from '../navigation/RootNavigator';
import { Colors } from '../theme/colors';
import { toUserFriendlyError } from '../utils/httpError';

type TournamentCategory = {
  id: string;
  name: string;
  discipline: string;
  format: string;
  maxParticipants: number;
};

type TournamentRound = {
  id: string;
  roundNumber: number;
  type: string;
  order: number;
  matches: Array<{
    id: string;
    status: string;
    isRated: boolean;
    winnerTeamSide: 'A' | 'B' | null;
    roundLabel: string | null;
    scores: Array<{
      setNumber: number;
      teamAScore: number;
      teamBScore: number;
    }>;
    teams: Array<{
      side: 'A' | 'B';
      players: Array<{
        id: string;
        fullName: string;
      }>;
    }>;
    group: {
      id: string;
      name: string;
    } | null;
  }>;
};

type TournamentStanding = {
  playerId: string;
  points: number;
  wins: number;
  losses: number;
  gamesWon: number;
  gamesLost: number;
  gameDifference: number;
  player: {
    id: string;
    fullName: string;
    displayName: string | null;
    nickname: string | null;
    currentElo: number;
  };
};

type TournamentRatingChange = {
  playerId: string;
  fullName: string;
  nickname: string | null;
  beforeRating: number;
  afterRating: number;
  totalDelta: number;
  matches: number;
  currentElo: number;
};

type TournamentTabKey = 'participants' | 'regulations' | 'matches' | 'results' | 'rating' | 'groups' | 'bracket';

type RegistrationStatus = 'PENDING' | 'CONFIRMED' | 'WAITLISTED' | 'REJECTED' | 'CANCELLED';

type TournamentRegistration = {
  id: string;
  status: RegistrationStatus;
  createdAt: string;
  player: {
    id: string;
    fullName: string;
    displayName: string | null;
    nickname: string | null;
    currentElo: number;
  } | null;
};

type TournamentDetails = {
  id: string;
  name: string;
  type: string;
  scoringMode: 'POINTS_SINGLE' | 'SETS';
  pointsToWin: number;
  setsToWin: number;
  status: string;
  registrationStatus: 'OPEN' | 'CLOSED';
  registrationCloseAt: string | null;
  date: string | null;
  startDate: string;
  endDate: string;
  location: string | null;
  description: string | null;
  courtsCount: number;
  maxPlayers: number;
  club: {
    id: string;
    name: string;
    city: string | null;
    address: string | null;
    courtsCount: number;
  } | null;
  categories: TournamentCategory[];
  rounds?: TournamentRound[];
};

type PlayerSearchItem = {
  id: string;
  fullName: string;
  displayName: string | null;
  nickname: string | null;
  currentElo: number;
};

type PlayersSearchResponse = {
  items: PlayerSearchItem[];
};

type TournamentDetailsScreenProps = {
  tournamentId: string;
};

type Navigation = NativeStackNavigationProp<RootStackParamList>;

type MatchWinnerSide = 'A' | 'B';

type TournamentScoringMode = 'POINTS_SINGLE' | 'SETS';

type MatchSetScoreInput = {
  setNumber: number;
  teamAScore: number;
  teamBScore: number;
};

type GroupStandingRow = {
  playerId: string;
  playerName: string;
  wins: number;
  scored: number;
  conceded: number;
  difference: number;
};

type GroupStandingBlock = {
  groupId: string;
  groupName: string;
  rows: GroupStandingRow[];
};

function formatDate(value: string | null): string {
  if (!value) {
    return 'Not specified';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return 'Not specified';
  }

  const day = String(parsed.getDate()).padStart(2, '0');
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  const year = parsed.getFullYear();
  const hour = String(parsed.getHours()).padStart(2, '0');
  const minute = String(parsed.getMinutes()).padStart(2, '0');

  return `${day}-${month}-${year} ${hour}:${minute}`;
}

function formatCountdown(registrationCloseAt: string | null, nowMs: number): {
  value: string;
  expired: boolean;
} {
  if (!registrationCloseAt) {
    return {
      value: '--:--:--',
      expired: false,
    };
  }

  const closeTime = new Date(registrationCloseAt).getTime();
  if (Number.isNaN(closeTime)) {
    return {
      value: '--:--:--',
      expired: false,
    };
  }

  const diff = closeTime - nowMs;
  if (diff <= 0) {
    return {
      value: '00:00:00',
      expired: true,
    };
  }

  const totalSeconds = Math.floor(diff / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const hh = String(hours).padStart(2, '0');
  const mm = String(minutes).padStart(2, '0');
  const ss = String(seconds).padStart(2, '0');

  if (days > 0) {
    return {
      value: `${days}д ${hh}:${mm}:${ss}`,
      expired: false,
    };
  }

  return {
    value: `${hh}:${mm}:${ss}`,
    expired: false,
  };
}

function resolvePlayerLabel(player: {
  fullName: string;
  displayName: string | null;
  nickname: string | null;
}) {
  return player.displayName || player.fullName || player.nickname || 'Гравець';
}

function registrationStatusLabel(status: RegistrationStatus): string {
  if (status === 'CONFIRMED') {
    return 'ПІДТВ.';
  }

  if (status === 'PENDING') {
    return 'ОЧІК.';
  }

  if (status === 'WAITLISTED') {
    return 'ЧЕРГА';
  }

  if (status === 'CANCELLED') {
    return 'СКАС.';
  }

  if (status === 'REJECTED') {
    return 'ВІДХИЛ.';
  }

  return status;
}

function parseManualSetScores(rawValue: string): MatchSetScoreInput[] {
  const trimmed = rawValue.trim();
  if (!trimmed) {
    return [];
  }

  const chunks = trimmed
    .split(/[;,\s]+/)
    .map((chunk) => chunk.trim())
    .filter(Boolean);

  if (chunks.length === 0) {
    return [];
  }

  return chunks.map((chunk, index) => {
    const match = chunk.match(/^(\d{1,2})\s*[-:]\s*(\d{1,2})$/);
    if (!match) {
      throw new Error('Невірний формат сетів. Приклад: 6-4 6-3');
    }

    const teamAScore = Number(match[1]);
    const teamBScore = Number(match[2]);

    if (!Number.isFinite(teamAScore) || !Number.isFinite(teamBScore)) {
      throw new Error('Очки в сеті мають бути числами');
    }

    if (teamAScore < 0 || teamBScore < 0 || teamAScore > 99 || teamBScore > 99) {
      throw new Error('Очки в сеті мають бути в межах 0..99');
    }

    if (teamAScore === teamBScore) {
      throw new Error('Сет не може завершитися нічиєю');
    }

    return {
      setNumber: index + 1,
      teamAScore,
      teamBScore,
    };
  });
}

function resolveWinnerFromSets(setScores: MatchSetScoreInput[]): MatchWinnerSide | null {
  if (setScores.length === 0) {
    return null;
  }

  let teamAWins = 0;
  let teamBWins = 0;

  for (const setScore of setScores) {
    if (setScore.teamAScore > setScore.teamBScore) {
      teamAWins += 1;
    }

    if (setScore.teamBScore > setScore.teamAScore) {
      teamBWins += 1;
    }
  }

  if (teamAWins === teamBWins) {
    return null;
  }

  return teamAWins > teamBWins ? 'A' : 'B';
}

export function TournamentDetailsScreen({ tournamentId }: TournamentDetailsScreenProps) {
  const navigation = useNavigation<Navigation>();
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const playerId = user?.playerProfile?.id ?? null;

  const [details, setDetails] = useState<TournamentDetails | null>(null);
  const [registrations, setRegistrations] = useState<TournamentRegistration[]>([]);
  const [rounds, setRounds] = useState<TournamentRound[]>([]);
  const [standings, setStandings] = useState<TournamentStanding[]>([]);
  const [ratingChanges, setRatingChanges] = useState<TournamentRatingChange[]>([]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const [playerSearchInput, setPlayerSearchInput] = useState('');
  const [playerSearchResults, setPlayerSearchResults] = useState<PlayerSearchItem[]>([]);
  const [playerSearchLoading, setPlayerSearchLoading] = useState(false);
  const [selectedAdminPlayer, setSelectedAdminPlayer] = useState<PlayerSearchItem | null>(null);
  const [activeTab, setActiveTab] = useState<TournamentTabKey>('participants');
  const [matchPointsInputById, setMatchPointsInputById] = useState<
    Record<string, { teamA: string; teamB: string }>
  >({});
  const [matchSetsInputById, setMatchSetsInputById] = useState<Record<string, string>>({});
  const [startScoringMode, setStartScoringMode] = useState<TournamentScoringMode>('POINTS_SINGLE');
  const [startPointsToWin, setStartPointsToWin] = useState('21');
  const [startSetsToWin, setStartSetsToWin] = useState('1');
  const [startConfigDirty, setStartConfigDirty] = useState(false);
  const startConfigInitializedTournamentIdRef = useRef<string | null>(null);

  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const timerId = setInterval(() => {
      setNowMs(Date.now());
    }, 1000);

    return () => {
      clearInterval(timerId);
    };
  }, []);

  const loadTournament = useCallback(async (options?: { silent?: boolean }) => {
    const silent = options?.silent === true;

    if (silent) {
      setRefreshing(true);
    } else {
      setLoading(true);
      setError(null);
      setActionError(null);
    }

    try {
      const [detailsResponse, registrationsResponse, roundsResponse, standingsResponse, ratingChangesResponse] =
        await Promise.all([
          apiClient.get<TournamentDetails>(`/tournaments/${tournamentId}`),
          apiClient.get<TournamentRegistration[]>(`/tournaments/${tournamentId}/registrations`),
          apiClient.get<TournamentRound[]>(`/tournaments/${tournamentId}/rounds`),
          apiClient.get<TournamentStanding[]>(`/tournaments/${tournamentId}/standings`),
          apiClient.get<TournamentRatingChange[]>(`/tournaments/${tournamentId}/rating-changes`),
        ]);

      setDetails(detailsResponse.data);
      setRegistrations(registrationsResponse.data);
      setRounds(roundsResponse.data);
      setStandings(standingsResponse.data);
      setRatingChanges(ratingChangesResponse.data);
    } catch (requestError) {
      if (silent) {
        throw requestError;
      }

      setDetails(null);
      setRegistrations([]);
      setRounds([]);
      setStandings([]);
      setRatingChanges([]);
      setError(toUserFriendlyError(requestError, 'Не вдалося завантажити турнір'));
    } finally {
      if (silent) {
        setRefreshing(false);
      } else {
        setLoading(false);
      }
    }
  }, [tournamentId]);

  const loadRegistrationsAndDetails = useCallback(async (options?: { silent?: boolean }) => {
    const silent = options?.silent === true;

    if (silent) {
      setRefreshing(true);
    }

    try {
      const [detailsResponse, registrationsResponse] = await Promise.all([
        apiClient.get<TournamentDetails>(`/tournaments/${tournamentId}`),
        apiClient.get<TournamentRegistration[]>(`/tournaments/${tournamentId}/registrations`),
      ]);

      setDetails(detailsResponse.data);
      setRegistrations(registrationsResponse.data);
    } catch (requestError) {
      if (silent) {
        throw requestError;
      }

      setError(toUserFriendlyError(requestError, 'Не вдалося оновити реєстрації'));
    } finally {
      if (silent) {
        setRefreshing(false);
      }
    }
  }, [tournamentId]);

  useEffect(() => {
    void loadTournament();
  }, [loadTournament]);

  const roundsCount = useMemo(() => rounds.length, [rounds]);

  const availableTabs = useMemo(() => {
    const baseTabs: Array<{ key: TournamentTabKey; title: string }> = [
      { key: 'participants', title: 'Учасники' },
      { key: 'regulations', title: 'Регламент' },
      { key: 'matches', title: 'Зустрічі' },
      { key: 'results', title: 'Результати' },
      { key: 'rating', title: 'Рейтинг' },
    ];

    if (details?.type === 'GROUP_STAGE') {
      baseTabs.splice(2, 0, { key: 'groups', title: 'Групи' });
    }

    if (details?.type === 'PLAYOFF') {
      baseTabs.splice(2, 0, { key: 'bracket', title: 'Сітка' });
    }

    return baseTabs;
  }, [details?.type]);

  const groupRounds = useMemo(
    () => rounds.filter((round) => round.type === 'GROUP'),
    [rounds],
  );

  const playoffRounds = useMemo(
    () => rounds.filter((round) => round.type === 'PLAYOFF'),
    [rounds],
  );

  const groupStandings = useMemo<GroupStandingBlock[]>(() => {
    const groups = new Map<
      string,
      {
        groupId: string;
        groupName: string;
        rows: Map<string, GroupStandingRow>;
      }
    >();

    const ensureGroup = (groupId: string, groupName: string) => {
      const existing = groups.get(groupId);
      if (existing) {
        return existing;
      }

      const next = {
        groupId,
        groupName,
        rows: new Map<string, GroupStandingRow>(),
      };

      groups.set(groupId, next);
      return next;
    };

    const ensureRow = (
      group: {
        rows: Map<string, GroupStandingRow>;
      },
      player: {
        id: string;
        fullName: string;
      },
    ) => {
      const existing = group.rows.get(player.id);
      if (existing) {
        return existing;
      }

      const next: GroupStandingRow = {
        playerId: player.id,
        playerName: player.fullName || 'Гравець',
        wins: 0,
        scored: 0,
        conceded: 0,
        difference: 0,
      };

      group.rows.set(player.id, next);
      return next;
    };

    for (const round of groupRounds) {
      for (const match of round.matches) {
        const groupId = match.group?.id;
        const groupName = match.group?.name || 'Група';

        if (!groupId) {
          continue;
        }

        const group = ensureGroup(groupId, groupName);
        const teamA = match.teams.find((team) => team.side === 'A');
        const teamB = match.teams.find((team) => team.side === 'B');

        if (!teamA || !teamB) {
          continue;
        }

        const teamAPlayers = teamA.players;
        const teamBPlayers = teamB.players;

        for (const player of teamAPlayers) {
          ensureRow(group, player);
        }

        for (const player of teamBPlayers) {
          ensureRow(group, player);
        }

        const hasRecordedResult =
          match.status === 'COMPLETED' || match.scores.length > 0 || Boolean(match.winnerTeamSide);

        if (!hasRecordedResult) {
          continue;
        }

        const scoredA = match.scores.reduce((sum, score) => sum + score.teamAScore, 0);
        const scoredB = match.scores.reduce((sum, score) => sum + score.teamBScore, 0);

        for (const player of teamAPlayers) {
          const row = ensureRow(group, player);
          row.scored += scoredA;
          row.conceded += scoredB;
          if (match.winnerTeamSide === 'A') {
            row.wins += 1;
          }
        }

        for (const player of teamBPlayers) {
          const row = ensureRow(group, player);
          row.scored += scoredB;
          row.conceded += scoredA;
          if (match.winnerTeamSide === 'B') {
            row.wins += 1;
          }
        }
      }
    }

    const blocks = Array.from(groups.values()).map((group) => {
      const rows = Array.from(group.rows.values())
        .map((row) => ({
          ...row,
          difference: row.scored - row.conceded,
        }))
        .sort(
          (a, b) =>
            b.wins - a.wins ||
            b.difference - a.difference ||
            b.scored - a.scored ||
            a.conceded - b.conceded ||
            a.playerName.localeCompare(b.playerName),
        );

      return {
        groupId: group.groupId,
        groupName: group.groupName,
        rows,
      };
    });

    return blocks.sort((a, b) => a.groupName.localeCompare(b.groupName));
  }, [groupRounds]);

  useEffect(() => {
    if (availableTabs.some((tab) => tab.key === activeTab)) {
      return;
    }

    setActiveTab(availableTabs[0]?.key ?? 'participants');
  }, [activeTab, availableTabs]);

  useEffect(() => {
    if (!details) {
      return;
    }

    const tournamentChanged = startConfigInitializedTournamentIdRef.current !== details.id;
    const tournamentAlreadyStarted =
      details.status === 'IN_PROGRESS' ||
      details.status === 'FINISHED' ||
      details.status === 'COMPLETED' ||
      details.status === 'CANCELLED';

    if (!tournamentChanged && startConfigDirty && !tournamentAlreadyStarted) {
      return;
    }

    const nextMode: TournamentScoringMode =
      details.type === 'AMERICANO' ? 'POINTS_SINGLE' : details.scoringMode;

    setStartScoringMode(nextMode);
    setStartPointsToWin(String(details.pointsToWin));
    setStartSetsToWin(String(details.setsToWin));
    setStartConfigDirty(false);
    startConfigInitializedTournamentIdRef.current = details.id;
  }, [details, startConfigDirty]);

  const ownRegistration = useMemo(
    () =>
      registrations.find(
        (registration) =>
          registration.player?.id === playerId &&
          registration.status !== 'CANCELLED' &&
          registration.status !== 'REJECTED',
      ) ?? null,
    [playerId, registrations],
  );

  const activeRegistrationPlayerIds = useMemo(() => {
    const set = new Set<string>();
    for (const registration of registrations) {
      if (registration.status === 'CANCELLED' || registration.status === 'REJECTED') {
        continue;
      }

      if (registration.player?.id) {
        set.add(registration.player.id);
      }
    }

    return set;
  }, [registrations]);

  const registrationCountdown = useMemo(
    () => formatCountdown(details?.registrationCloseAt ?? null, nowMs),
    [details?.registrationCloseAt, nowMs],
  );

  const registrationDeadlinePassed = registrationCountdown.expired;

  const canRegister = details?.registrationStatus === 'OPEN' && !registrationDeadlinePassed && !ownRegistration;

  const seededConfirmedRegistrations = useMemo(() => {
    return registrations
      .filter((registration) => registration.status === 'CONFIRMED' && Boolean(registration.player))
      .sort((a, b) => {
        const eloA = a.player?.currentElo ?? 0;
        const eloB = b.player?.currentElo ?? 0;

        if (eloB !== eloA) {
          return eloB - eloA;
        }

        const nameA = a.player?.displayName || a.player?.fullName || a.player?.nickname || '';
        const nameB = b.player?.displayName || b.player?.fullName || b.player?.nickname || '';
        return nameA.localeCompare(nameB);
      });
  }, [registrations]);

  const seedByPlayerId = useMemo(() => {
    const seedMap = new Map<string, number>();

    seededConfirmedRegistrations.forEach((registration, index) => {
      if (registration.player?.id) {
        seedMap.set(registration.player.id, index + 1);
      }
    });

    return seedMap;
  }, [seededConfirmedRegistrations]);

  const orderedRegistrations = useMemo(() => {
    const rankByStatus: Record<RegistrationStatus, number> = {
      CONFIRMED: 0,
      PENDING: 1,
      WAITLISTED: 2,
      REJECTED: 3,
      CANCELLED: 4,
    };

    return [...registrations].sort((a, b) => {
      const rankDelta = rankByStatus[a.status] - rankByStatus[b.status];
      if (rankDelta !== 0) {
        return rankDelta;
      }

      if (a.status === 'CONFIRMED' && b.status === 'CONFIRMED') {
        const seedA = a.player?.id ? seedByPlayerId.get(a.player.id) ?? 999 : 999;
        const seedB = b.player?.id ? seedByPlayerId.get(b.player.id) ?? 999 : 999;
        return seedA - seedB;
      }

      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });
  }, [registrations, seedByPlayerId]);

  const registrationStats = useMemo(() => {
    return registrations.reduce(
      (stats, registration) => {
        if (registration.status === 'PENDING') {
          stats.pending += 1;
        }

        if (registration.status === 'CONFIRMED') {
          stats.confirmed += 1;
        }

        if (registration.status === 'WAITLISTED') {
          stats.waitlisted += 1;
        }

        if (registration.status === 'CANCELLED' || registration.status === 'REJECTED') {
          stats.inactive += 1;
        }

        return stats;
      },
      {
        pending: 0,
        confirmed: 0,
        waitlisted: 0,
        inactive: 0,
      },
    );
  }, [registrations]);

  const tournamentStatus = details?.status ?? 'DRAFT';
  const registrationStatus = details?.registrationStatus ?? 'CLOSED';
  const isTournamentTerminal =
    tournamentStatus === 'CANCELLED' || tournamentStatus === 'COMPLETED';
  const isCompletionPending = tournamentStatus === 'FINISHED';
  const effectiveScoringMode: TournamentScoringMode =
    details?.type === 'AMERICANO' ? 'POINTS_SINGLE' : details?.scoringMode ?? 'POINTS_SINGLE';
  const isSingleScoreMode = effectiveScoringMode === 'POINTS_SINGLE';
  const isResultEditingLocked = tournamentStatus === 'CANCELLED' || tournamentStatus === 'COMPLETED';
  const americanoParticipantsInvalid =
    details?.type === 'AMERICANO' && registrationStats.confirmed % 4 !== 0;

  const totalMatches = useMemo(
    () => rounds.reduce((sum, round) => sum + round.matches.length, 0),
    [rounds],
  );

  const hasPendingMatches = useMemo(
    () => rounds.some((round) => round.matches.some((match) => match.status !== 'COMPLETED')),
    [rounds],
  );

  const canPublishTournament =
    Boolean(details) &&
    !isTournamentTerminal &&
    !isCompletionPending &&
    registrationStatus === 'CLOSED' &&
    (tournamentStatus === 'DRAFT' || tournamentStatus === 'CREATED' || tournamentStatus === 'PUBLISHED');

  const canOpenRegistration =
    Boolean(details) &&
    !isTournamentTerminal &&
    !isCompletionPending &&
    tournamentStatus !== 'IN_PROGRESS' &&
    registrationStatus === 'CLOSED';

  const canCloseRegistration =
    Boolean(details) &&
    !isTournamentTerminal &&
    !isCompletionPending &&
    tournamentStatus !== 'IN_PROGRESS' &&
    registrationStatus === 'OPEN';

  const canStartTournament =
    Boolean(details) &&
    !isTournamentTerminal &&
    !isCompletionPending &&
    !americanoParticipantsInvalid &&
    (tournamentStatus === 'READY' ||
      tournamentStatus === 'REGISTRATION_CLOSED' ||
      tournamentStatus === 'REGISTRATION' ||
      tournamentStatus === 'REGISTRATION_OPEN' ||
      tournamentStatus === 'PUBLISHED' ||
      tournamentStatus === 'CREATED' ||
      tournamentStatus === 'DRAFT');

  const canRestartTournament =
    Boolean(details) &&
    !isTournamentTerminal &&
    !isCompletionPending &&
    (tournamentStatus === 'READY' ||
      tournamentStatus === 'REGISTRATION_CLOSED' ||
      tournamentStatus === 'IN_PROGRESS');

  const canCompleteTournament =
    Boolean(details) &&
    !isTournamentTerminal &&
    totalMatches > 0 &&
    !hasPendingMatches &&
    (tournamentStatus === 'FINISHED' || tournamentStatus === 'IN_PROGRESS');

  const canCancelTournament =
    Boolean(details) &&
    !isTournamentTerminal &&
    !isCompletionPending;

  type ActionRefreshScope = 'full' | 'registration';

  const runAction = useCallback(
    async (
      action: () => Promise<void>,
      successMessage: string,
      options?: {
        refreshScope?: ActionRefreshScope;
      },
    ) => {
      setActionLoading(true);
      setActionError(null);
      setActionSuccess(null);

      try {
        await action();

        if (options?.refreshScope === 'registration') {
          await loadRegistrationsAndDetails({ silent: true });
        } else {
          await loadTournament({ silent: true });
        }

        setActionSuccess(successMessage);
      } catch (requestError) {
        setActionError(toUserFriendlyError(requestError, 'Операція не виконана'));
      } finally {
        setActionLoading(false);
      }
    },
    [loadRegistrationsAndDetails, loadTournament],
  );

  const handleRegister = useCallback(() => {
    void runAction(async () => {
      await apiClient.post(`/tournaments/${tournamentId}/register`, {});
    }, 'Ти успішно зареєстрований на турнір', { refreshScope: 'registration' });
  }, [runAction, tournamentId]);

  const handleUnregister = useCallback(() => {
    void runAction(async () => {
      await apiClient.delete(`/tournaments/${tournamentId}/unregister`);
    }, 'Реєстрація скасована', { refreshScope: 'registration' });
  }, [runAction, tournamentId]);

  const handleAdminAddPlayer = useCallback(() => {
    if (!selectedAdminPlayer?.id) {
      setActionError('Вибери гравця зі списку пошуку');
      return;
    }

    void runAction(async () => {
      await apiClient.post(`/tournaments/${tournamentId}/players`, {
        playerId: selectedAdminPlayer.id,
      });
      setPlayerSearchInput('');
      setPlayerSearchResults([]);
      setSelectedAdminPlayer(null);
    }, 'Гравця додано у список реєстрації', { refreshScope: 'registration' });
  }, [runAction, selectedAdminPlayer, tournamentId]);

  const handleAdminConfirm = useCallback(
    (targetPlayerId: string) => {
      void runAction(async () => {
        await apiClient.patch(`/tournaments/${tournamentId}/players/${targetPlayerId}/confirm`);
      }, 'Реєстрація підтверджена', { refreshScope: 'registration' });
    },
    [runAction, tournamentId],
  );

  const handleAdminRemove = useCallback(
    (targetPlayerId: string) => {
      void runAction(async () => {
        await apiClient.delete(`/tournaments/${tournamentId}/players/${targetPlayerId}`);
      }, 'Гравця видалено з реєстрації', { refreshScope: 'registration' });
    },
    [runAction, tournamentId],
  );

  const runLifecycleAction = useCallback(
    (params: {
      endpoint: string;
      successMessage: string;
      confirmationMessage?: string;
      confirmationTitle?: string;
      payload?: Record<string, unknown>;
    }) => {
      const perform = () => {
        void runAction(async () => {
          await apiClient.post(params.endpoint, params.payload ?? {});
        }, params.successMessage);
      };

      if (!params.confirmationMessage) {
        perform();
        return;
      }

      Alert.alert(params.confirmationTitle || 'Підтвердження', params.confirmationMessage, [
        {
          text: 'Ні',
          style: 'cancel',
        },
        {
          text: 'Так',
          style: 'destructive',
          onPress: perform,
        },
      ]);
    },
    [runAction],
  );

  const handlePublishTournament = useCallback(() => {
    runLifecycleAction({
      endpoint: `/tournaments/${tournamentId}/publish`,
      successMessage: 'Турнір опубліковано та реєстрацію відкрито',
    });
  }, [runLifecycleAction, tournamentId]);

  const handleOpenRegistration = useCallback(() => {
    runLifecycleAction({
      endpoint: `/tournaments/${tournamentId}/open-registration`,
      successMessage: 'Реєстрацію відкрито',
    });
  }, [runLifecycleAction, tournamentId]);

  const handleCloseRegistration = useCallback(() => {
    runLifecycleAction({
      endpoint: `/tournaments/${tournamentId}/close-registration`,
      successMessage: 'Реєстрацію закрито, турнір готовий до старту',
    });
  }, [runLifecycleAction, tournamentId]);

  const handleStartTournament = useCallback(() => {
    const parsedPointsToWin = Number.parseInt(startPointsToWin, 10);
    const parsedSetsToWin = Number.parseInt(startSetsToWin, 10);

    if (!Number.isFinite(parsedPointsToWin) || parsedPointsToWin < 1 || parsedPointsToWin > 99) {
      setActionError('Вкажи pointsToWin у діапазоні 1..99');
      setActionSuccess(null);
      return;
    }

    if (details?.type === 'AMERICANO' && startScoringMode !== 'POINTS_SINGLE') {
      setActionError('Для AMERICANO доступний лише формат одного рахунку');
      setActionSuccess(null);
      return;
    }

    if (startScoringMode === 'SETS' && (!Number.isFinite(parsedSetsToWin) || parsedSetsToWin < 1 || parsedSetsToWin > 5)) {
      setActionError('Вкажи setsToWin у діапазоні 1..5');
      setActionSuccess(null);
      return;
    }

    const payload = {
      scoringMode: details?.type === 'AMERICANO' ? 'POINTS_SINGLE' : startScoringMode,
      pointsToWin: parsedPointsToWin,
      setsToWin:
        details?.type === 'AMERICANO' || startScoringMode === 'POINTS_SINGLE' ? 1 : parsedSetsToWin,
    };

    runLifecycleAction({
      endpoint: `/tournaments/${tournamentId}/start`,
      successMessage: 'Сітку згенеровано, турнір запущено',
      confirmationTitle: 'Запуск турніру',
      confirmationMessage: 'Згенерувати сітку та перевести турнір у активний стан?',
      payload,
    });
  }, [details?.type, runLifecycleAction, startPointsToWin, startScoringMode, startSetsToWin, tournamentId]);

  const handleRestartTournament = useCallback(() => {
    runLifecycleAction({
      endpoint: `/tournaments/${tournamentId}/restart`,
      successMessage: 'Сітку перегенеровано',
      confirmationTitle: 'Перегенерація сітки',
      confirmationMessage: 'Поточні раунди будуть очищені. Продовжити?',
    });
  }, [runLifecycleAction, tournamentId]);

  const handleCompleteTournament = useCallback(() => {
    runLifecycleAction({
      endpoint: `/tournaments/${tournamentId}/complete`,
      successMessage: 'Турнір завершено. Рейтинг перераховано.',
      confirmationTitle: 'Завершення турніру',
      confirmationMessage: 'Після завершення буде нараховано рейтинг. Продовжити?',
    });
  }, [runLifecycleAction, tournamentId]);

  const handleCancelTournament = useCallback(() => {
    runLifecycleAction({
      endpoint: `/tournaments/${tournamentId}/cancel`,
      successMessage: 'Турнір скасовано',
      confirmationTitle: 'Скасування турніру',
      confirmationMessage: 'Скасувати турнір? Дію не можна відмінити.',
    });
  }, [runLifecycleAction, tournamentId]);

  const handleSubmitMatchResult = useCallback(
    (match: TournamentRound['matches'][number]) => {
      let parsedSetScores: MatchSetScoreInput[] = [];

      if (isSingleScoreMode) {
        const existingScore =
          match.scores.length === 1
            ? match.scores[0]
            : match.scores.length > 1
              ? {
                  teamAScore: match.scores.reduce((sum, set) => sum + set.teamAScore, 0),
                  teamBScore: match.scores.reduce((sum, set) => sum + set.teamBScore, 0),
                }
              : null;

        const draft = matchPointsInputById[match.id];
        const teamAScore = Number.parseInt(draft?.teamA ?? '', 10);
        const teamBScore = Number.parseInt(draft?.teamB ?? '', 10);

        const fallbackTeamAScore = existingScore?.teamAScore ?? Number.NaN;
        const fallbackTeamBScore = existingScore?.teamBScore ?? Number.NaN;

        const normalizedTeamAScore = Number.isFinite(teamAScore) ? teamAScore : fallbackTeamAScore;
        const normalizedTeamBScore = Number.isFinite(teamBScore) ? teamBScore : fallbackTeamBScore;

        if (!Number.isFinite(normalizedTeamAScore) || !Number.isFinite(normalizedTeamBScore)) {
          setActionError('Введи рахунок для обох пар');
          setActionSuccess(null);
          return;
        }

        if (normalizedTeamAScore < 0 || normalizedTeamBScore < 0 || normalizedTeamAScore > 99 || normalizedTeamBScore > 99) {
          setActionError('Рахунок має бути в діапазоні 0..99');
          setActionSuccess(null);
          return;
        }

        if (normalizedTeamAScore === normalizedTeamBScore) {
          setActionError('Матч не може завершитись нічиєю');
          setActionSuccess(null);
          return;
        }

        parsedSetScores = [
          {
            setNumber: 1,
            teamAScore: normalizedTeamAScore,
            teamBScore: normalizedTeamBScore,
          },
        ];
      } else {
        const rawScoreInput =
          matchSetsInputById[match.id] ||
          (match.scores.length > 0
            ? match.scores.map((setScore) => `${setScore.teamAScore}-${setScore.teamBScore}`).join(' ')
            : '');

        try {
          parsedSetScores = parseManualSetScores(rawScoreInput);
        } catch (parseError) {
          const message = parseError instanceof Error ? parseError.message : 'Невірний формат сетів';
          setActionError(message);
          setActionSuccess(null);
          return;
        }

        if (parsedSetScores.length === 0) {
          setActionError('Введи рахунок, напр. 6-4 6-3');
          setActionSuccess(null);
          return;
        }
      }

      const winnerFromSets = resolveWinnerFromSets(parsedSetScores);
      if (!winnerFromSets) {
        setActionError('Не вдалося визначити переможця за рахунком');
        setActionSuccess(null);
        return;
      }

      void runAction(async () => {
        await apiClient.post(`/tournaments/match/${match.id}/result`, {
          winnerSide: winnerFromSets,
          setScores: parsedSetScores,
        });

        setMatchPointsInputById((previous) => {
          const next = { ...previous };
          delete next[match.id];
          return next;
        });

        setMatchSetsInputById((previous) => {
          const next = { ...previous };
          delete next[match.id];
          return next;
        });
      }, match.status === 'COMPLETED' ? 'Результат матчу оновлено' : 'Результат матчу збережено');
    },
    [isSingleScoreMode, matchPointsInputById, matchSetsInputById, runAction],
  );

  useEffect(() => {
    if (!isAdmin) {
      return;
    }

    const query = playerSearchInput.trim();
    if (query.length < 2) {
      setPlayerSearchResults([]);
      setPlayerSearchLoading(false);
      return;
    }

    let isActive = true;
    const timer = setTimeout(() => {
      const runSearch = async () => {
        setPlayerSearchLoading(true);

        try {
          const { data } = await apiClient.get<PlayersSearchResponse>(
            `/players?limit=12&search=${encodeURIComponent(query)}`,
          );

          if (!isActive) {
            return;
          }

          const filtered = data.items.filter((player) => !activeRegistrationPlayerIds.has(player.id));
          setPlayerSearchResults(filtered);
        } catch {
          if (isActive) {
            setPlayerSearchResults([]);
          }
        } finally {
          if (isActive) {
            setPlayerSearchLoading(false);
          }
        }
      };

      void runSearch();
    }, 260);

    return () => {
      isActive = false;
      clearTimeout(timer);
    };
  }, [activeRegistrationPlayerIds, isAdmin, playerSearchInput]);

  useEffect(() => {
    if (!selectedAdminPlayer) {
      return;
    }

    if (activeRegistrationPlayerIds.has(selectedAdminPlayer.id)) {
      setSelectedAdminPlayer(null);
    }
  }, [activeRegistrationPlayerIds, selectedAdminPlayer]);

  return (
    <SafeAreaView edges={['top']} style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardAvoiding}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          keyboardShouldPersistTaps="handled"
          onScrollBeginDrag={Keyboard.dismiss}
          showsVerticalScrollIndicator={false}
        >
          {loading ? (
            <View style={styles.centeredState}>
              <ActivityIndicator color={Colors.primary} size="small" />
              <Text style={styles.centeredText}>Завантажую турнір...</Text>
            </View>
          ) : null}

          {!loading && error ? (
            <View style={styles.centeredState}>
              <Text style={styles.errorText}>{error}</Text>
              <Pressable
                onPress={() => {
                  void loadTournament();
                }}
                style={({ pressed }) => [styles.retryButton, pressed && styles.pressed]}
              >
                <Text style={styles.retryText}>Оновити</Text>
              </Pressable>
            </View>
          ) : null}

          {!loading && !error && details ? (
            <>
              <LinearGradient
                colors={[Colors.primary, Colors.primaryContainer]}
                end={{ x: 1, y: 1 }}
                start={{ x: 0, y: 0 }}
                style={styles.heroCard}
              >
                <Text style={styles.heroLabel}>Tournament</Text>
                <Text style={styles.heroTitle}>{details.name}</Text>
                <Text style={styles.heroMeta}>Тип: {details.type}</Text>
                <Text style={styles.heroMeta}>Статус: {details.status}</Text>
                <Text style={styles.heroMeta}>Реєстрація: {details.registrationStatus === 'OPEN' ? 'Відкрита' : 'Закрита'}</Text>
              </LinearGradient>

              <ScrollView
                horizontal
                contentContainerStyle={styles.tabsRow}
                showsHorizontalScrollIndicator={false}
              >
                {availableTabs.map((tab) => (
                  <Pressable
                    key={tab.key}
                    onPress={() => {
                      setActiveTab(tab.key);
                    }}
                    style={({ pressed }) => [
                      styles.tabButton,
                      activeTab === tab.key && styles.tabButtonActive,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text style={[styles.tabButtonText, activeTab === tab.key && styles.tabButtonTextActive]}>
                      {tab.title}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>

              {refreshing ? (
                <View style={styles.loadingLine}>
                  <ActivityIndicator color={Colors.primary} size="small" />
                  <Text style={styles.loadingText}>Оновлюю дані...</Text>
                </View>
              ) : null}

              {actionError ? (
                <View style={styles.feedbackCardError}>
                  <Text style={styles.errorText}>{actionError}</Text>
                </View>
              ) : null}

              {actionSuccess ? (
                <View style={styles.feedbackCardSuccess}>
                  <Text style={styles.successText}>{actionSuccess}</Text>
                </View>
              ) : null}

              {activeTab === 'participants' ? (
                <>

              <View style={styles.infoCard}>
                <Text style={styles.cardTitle}>Основна інформація</Text>
                <Text style={styles.infoRow}>Початок: {formatDate(details.startDate)}</Text>
                <Text style={styles.infoRow}>Завершення: {formatDate(details.endDate)}</Text>
                <Text style={styles.infoRow}>Локація: {details.location || 'Не вказано'}</Text>
                {details.club ? (
                  <Text style={styles.infoRow}>
                    Клуб: {[details.club.name, details.club.city].filter(Boolean).join(', ')}
                  </Text>
                ) : null}
                <Text style={styles.infoRow}>Кортів: {details.courtsCount}</Text>
                <Text style={styles.infoRow}>Макс. гравців: {details.maxPlayers}</Text>
                <Text style={styles.infoRow}>Раундів: {roundsCount}</Text>
              </View>

              {details.registrationStatus === 'OPEN' ? (
                <View style={styles.timerCard}>
                  <Text style={styles.timerLabel}>Реєстрація до</Text>
                  <Text style={[styles.timerValue, registrationDeadlinePassed && styles.timerValueExpired]}>
                    {registrationCountdown.value}
                  </Text>
                  <Text style={styles.timerMeta}>
                    {details.registrationCloseAt
                      ? `Кінцевий час: ${formatDate(details.registrationCloseAt)}`
                      : 'Кінцевий час не вказано'}
                  </Text>
                  {registrationDeadlinePassed ? (
                    <Text style={styles.timerExpiredNote}>Дедлайн минув. Нові реєстрації зупинено.</Text>
                  ) : null}
                </View>
              ) : null}

              <View style={styles.infoCard}>
                <Text style={styles.cardTitle}>Реєстрація</Text>
                <Text style={styles.infoRow}>Стан: {details.registrationStatus === 'OPEN' ? 'Відкрита' : 'Закрита'}</Text>

                {playerId ? (
                  ownRegistration ? (
                    <>
                      <Text style={styles.infoRow}>Твій статус: {ownRegistration.status}</Text>
                      <Pressable
                        disabled={actionLoading}
                        onPress={handleUnregister}
                        style={({ pressed }) => [styles.actionButtonSecondary, pressed && styles.pressed]}
                      >
                        {actionLoading ? (
                          <ActivityIndicator color={Colors.primary} size="small" />
                        ) : (
                          <Text style={styles.actionButtonSecondaryText}>Скасувати мою реєстрацію</Text>
                        )}
                      </Pressable>
                    </>
                  ) : (
                    <Pressable
                      disabled={!canRegister || actionLoading}
                      onPress={handleRegister}
                      style={({ pressed }) => [
                        styles.actionButton,
                        (!canRegister || actionLoading) && styles.actionButtonDisabled,
                        pressed && canRegister && styles.pressed,
                      ]}
                    >
                      {actionLoading ? (
                        <ActivityIndicator color={Colors.onPrimary} size="small" />
                      ) : (
                        <Text style={styles.actionButtonText}>
                          {canRegister ? 'Зареєструватись на турнір' : 'Реєстрацію закрито'}
                        </Text>
                      )}
                    </Pressable>
                  )
                ) : (
                  <Text style={styles.mutedText}>Увійди як гравець, щоб зареєструватись</Text>
                )}
              </View>

              {isAdmin ? (
                <View style={styles.infoCard}>
                  <Text style={styles.cardTitle}>Адмін: проведення турніру</Text>
                  <Text style={styles.infoRow}>Статус турніру: {details.status}</Text>
                  <Text style={styles.infoRow}>Підтверджено: {registrationStats.confirmed}</Text>
                  <Text style={styles.infoRow}>Очікують: {registrationStats.pending}</Text>
                  <Text style={styles.infoRow}>Waiting list: {registrationStats.waitlisted}</Text>
                  {americanoParticipantsInvalid ? (
                    <Text style={styles.errorText}>Для AMERICANO потрібно число підтверджених гравців кратне 4.</Text>
                  ) : null}

                  {canStartTournament ? (
                    <View style={styles.startConfigCard}>
                      <Text style={styles.startConfigTitle}>Налаштування матчів перед стартом</Text>

                      <View style={styles.startModeRow}>
                        <Pressable
                          onPress={() => {
                            setStartScoringMode('POINTS_SINGLE');
                            setStartSetsToWin('1');
                            setStartConfigDirty(true);
                          }}
                          style={({ pressed }) => [
                            styles.startModeButton,
                            startScoringMode === 'POINTS_SINGLE' && styles.startModeButtonActive,
                            pressed && styles.pressed,
                          ]}
                        >
                          <Text
                            style={[
                              styles.startModeButtonText,
                              startScoringMode === 'POINTS_SINGLE' && styles.startModeButtonTextActive,
                            ]}
                          >
                            Один рахунок
                          </Text>
                        </Pressable>

                        <Pressable
                          disabled={details.type === 'AMERICANO'}
                          onPress={() => {
                            setStartScoringMode('SETS');
                            setStartConfigDirty(true);
                            if (startSetsToWin === '1') {
                              setStartSetsToWin('2');
                            }
                          }}
                          style={({ pressed }) => [
                            styles.startModeButton,
                            startScoringMode === 'SETS' && styles.startModeButtonActive,
                            details.type === 'AMERICANO' && styles.actionButtonDisabled,
                            pressed && details.type !== 'AMERICANO' && styles.pressed,
                          ]}
                        >
                          <Text
                            style={[
                              styles.startModeButtonText,
                              startScoringMode === 'SETS' && styles.startModeButtonTextActive,
                            ]}
                          >
                            Кілька сетів
                          </Text>
                        </Pressable>
                      </View>

                      <View style={styles.startConfigGrid}>
                        <View style={styles.startConfigField}>
                          <Text style={styles.startConfigLabel}>Очки до перемоги</Text>
                          <TextInput
                            keyboardType="number-pad"
                            onChangeText={(value) => {
                              setStartPointsToWin(value);
                              setStartConfigDirty(true);
                            }}
                            placeholder="21"
                            placeholderTextColor={Colors.outline}
                            style={styles.input}
                            value={startPointsToWin}
                          />
                        </View>

                        {details.type !== 'AMERICANO' && startScoringMode === 'SETS' ? (
                          <View style={styles.startConfigField}>
                            <Text style={styles.startConfigLabel}>Сетів до перемоги</Text>
                            <TextInput
                              keyboardType="number-pad"
                              onChangeText={(value) => {
                                setStartSetsToWin(value);
                                setStartConfigDirty(true);
                              }}
                              placeholder="2"
                              placeholderTextColor={Colors.outline}
                              style={styles.input}
                              value={startSetsToWin}
                            />
                          </View>
                        ) : null}
                      </View>

                      {details.type === 'AMERICANO' ? (
                        <Text style={styles.mutedText}>Для AMERICANO використовується один рахунок на матч.</Text>
                      ) : null}
                    </View>
                  ) : null}

                  <View style={styles.adminActionsGrid}>
                    <Pressable
                      disabled={actionLoading || !canPublishTournament}
                      onPress={handlePublishTournament}
                      style={({ pressed }) => [
                        styles.adminActionButton,
                        (actionLoading || !canPublishTournament) && styles.actionButtonDisabled,
                        pressed && canPublishTournament && styles.pressed,
                      ]}
                    >
                      <Text style={styles.adminActionButtonText}>Опублікувати</Text>
                    </Pressable>

                    <Pressable
                      disabled={actionLoading || !canOpenRegistration}
                      onPress={handleOpenRegistration}
                      style={({ pressed }) => [
                        styles.adminActionButton,
                        (actionLoading || !canOpenRegistration) && styles.actionButtonDisabled,
                        pressed && canOpenRegistration && styles.pressed,
                      ]}
                    >
                      <Text style={styles.adminActionButtonText}>Відкрити реєстрацію</Text>
                    </Pressable>

                    <Pressable
                      disabled={actionLoading || !canCloseRegistration}
                      onPress={handleCloseRegistration}
                      style={({ pressed }) => [
                        styles.adminActionButton,
                        (actionLoading || !canCloseRegistration) && styles.actionButtonDisabled,
                        pressed && canCloseRegistration && styles.pressed,
                      ]}
                    >
                      <Text style={styles.adminActionButtonText}>Закрити реєстрацію</Text>
                    </Pressable>

                    <Pressable
                      disabled={actionLoading || !canStartTournament}
                      onPress={handleStartTournament}
                      style={({ pressed }) => [
                        styles.adminActionButton,
                        (actionLoading || !canStartTournament) && styles.actionButtonDisabled,
                        pressed && canStartTournament && styles.pressed,
                      ]}
                    >
                      <Text style={styles.adminActionButtonText}>Запустити турнір</Text>
                    </Pressable>

                    <Pressable
                      disabled={actionLoading || !canRestartTournament}
                      onPress={handleRestartTournament}
                      style={({ pressed }) => [
                        styles.adminActionButton,
                        (actionLoading || !canRestartTournament) && styles.actionButtonDisabled,
                        pressed && canRestartTournament && styles.pressed,
                      ]}
                    >
                      <Text style={styles.adminActionButtonText}>Перегенерувати</Text>
                    </Pressable>

                    <Pressable
                      disabled={actionLoading || !canCompleteTournament}
                      onPress={handleCompleteTournament}
                      style={({ pressed }) => [
                        styles.adminActionButton,
                        (actionLoading || !canCompleteTournament) && styles.actionButtonDisabled,
                        pressed && canCompleteTournament && styles.pressed,
                      ]}
                    >
                      <Text style={styles.adminActionButtonText}>Завершити турнір</Text>
                    </Pressable>

                    <Pressable
                      disabled={actionLoading || !canCancelTournament}
                      onPress={handleCancelTournament}
                      style={({ pressed }) => [
                        styles.adminActionButtonDanger,
                        (actionLoading || !canCancelTournament) && styles.actionButtonDisabled,
                        pressed && canCancelTournament && styles.pressed,
                      ]}
                    >
                      <Text style={styles.adminActionButtonText}>Скасувати</Text>
                    </Pressable>
                  </View>
                </View>
              ) : null}

              {isAdmin ? (
                <View style={styles.infoCard}>
                  <Text style={styles.cardTitle}>Адмін: керування реєстраціями</Text>

                  <TextInput
                    autoCapitalize="none"
                    onChangeText={(value) => {
                      setPlayerSearchInput(value);
                      setSelectedAdminPlayer(null);
                    }}
                    placeholder="Почни вводити ім'я гравця"
                    placeholderTextColor={Colors.outline}
                    style={styles.input}
                    value={playerSearchInput}
                  />

                  {selectedAdminPlayer ? (
                    <View style={styles.selectedPlayerBox}>
                      <Text style={styles.selectedPlayerText}>
                        Обрано: {resolvePlayerLabel(selectedAdminPlayer)} (ELO {selectedAdminPlayer.currentElo})
                      </Text>
                    </View>
                  ) : null}

                  {playerSearchLoading ? (
                    <View style={styles.loadingLine}>
                      <ActivityIndicator color={Colors.primary} size="small" />
                      <Text style={styles.loadingText}>Шукаю гравців...</Text>
                    </View>
                  ) : null}

                  {playerSearchInput.trim().length >= 2 && !playerSearchLoading && playerSearchResults.length === 0 ? (
                    <Text style={styles.mutedText}>Нічого не знайдено або всі вже у списку.</Text>
                  ) : null}

                  {playerSearchResults.length > 0 ? (
                    <View style={styles.searchResultsList}>
                      {playerSearchResults.map((player) => {
                        const title = resolvePlayerLabel(player);
                        return (
                          <Pressable
                            key={player.id}
                            onPress={() => {
                              setSelectedAdminPlayer(player);
                              setPlayerSearchInput(title);
                              setPlayerSearchResults([]);
                            }}
                            style={({ pressed }) => [styles.searchResultItem, pressed && styles.pressed]}
                          >
                            <Text style={styles.searchResultName}>{title}</Text>
                            <Text style={styles.searchResultMeta}>ELO {player.currentElo}</Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  ) : null}

                  <Pressable
                    disabled={actionLoading || !selectedAdminPlayer}
                    onPress={handleAdminAddPlayer}
                    style={({ pressed }) => [
                      styles.actionButton,
                      (!selectedAdminPlayer || actionLoading) && styles.actionButtonDisabled,
                      pressed && styles.pressed,
                    ]}
                  >
                    {actionLoading ? (
                      <ActivityIndicator color={Colors.onPrimary} size="small" />
                    ) : (
                      <Text style={styles.actionButtonText}>Додати гравця</Text>
                    )}
                  </Pressable>
                </View>
              ) : null}

              <View style={styles.infoCard}>
                <Text style={styles.cardTitle}>Список реєстрацій</Text>
                {orderedRegistrations.length === 0 ? (
                  <Text style={styles.mutedText}>Поки що реєстрацій немає</Text>
                ) : (
                  <View style={styles.registrationList}>
                    {orderedRegistrations.map((registration) => {
                      const title =
                        registration.player?.displayName ||
                        registration.player?.fullName ||
                        registration.player?.nickname ||
                        'Гравець';

                      const registrationPlayerId = registration.player?.id;
                      const canConfirm = registration.status === 'PENDING' || registration.status === 'WAITLISTED';
                      const canRemove =
                        registration.status !== 'CANCELLED' &&
                        registration.status !== 'REJECTED' &&
                        Boolean(registrationPlayerId);
                      const seed =
                        registration.status === 'CONFIRMED' && registrationPlayerId
                          ? seedByPlayerId.get(registrationPlayerId) ?? null
                          : null;

                      return (
                        <View key={registration.id} style={styles.registrationItem}>
                          <Pressable
                            disabled={!registrationPlayerId}
                            onPress={() => {
                              if (!registrationPlayerId) {
                                return;
                              }

                              navigation.navigate('PlayerDetails', {
                                identifier: registrationPlayerId,
                                title,
                              });
                            }}
                            style={({ pressed }) => [styles.registrationMain, pressed && styles.pressed]}
                          >
                            <Text style={styles.registrationName}>{seed ? `${seed}. ${title}` : title}</Text>
                            <Text style={styles.registrationMeta}>
                              ELO {registration.player?.currentElo ?? '-'} | {registrationStatusLabel(registration.status)}
                            </Text>
                          </Pressable>

                          {isAdmin && registrationPlayerId ? (
                            <View style={styles.registrationActions}>
                              {canConfirm ? (
                                <Pressable
                                  disabled={actionLoading}
                                  onPress={() => {
                                    handleAdminConfirm(registrationPlayerId);
                                  }}
                                  style={({ pressed }) => [styles.inlineActionButton, pressed && styles.pressed]}
                                >
                                  <Text style={styles.inlineActionText}>Підтв.</Text>
                                </Pressable>
                              ) : null}

                              {canRemove ? (
                                <Pressable
                                  disabled={actionLoading}
                                  onPress={() => {
                                    handleAdminRemove(registrationPlayerId);
                                  }}
                                  style={({ pressed }) => [styles.inlineActionButtonDanger, pressed && styles.pressed]}
                                >
                                  <Text style={styles.inlineActionTextDanger}>Видал.</Text>
                                </Pressable>
                              ) : null}
                            </View>
                          ) : null}
                        </View>
                      );
                    })}
                  </View>
                )}
              </View>

              <View style={styles.infoCard}>
                <Text style={styles.cardTitle}>Посів</Text>
                {seededConfirmedRegistrations.length === 0 ? (
                  <Text style={styles.mutedText}>Поки немає підтверджених</Text>
                ) : (
                  <View style={styles.seededList}>
                    {seededConfirmedRegistrations.map((registration, index) => {
                      const seededPlayer = registration.player;
                      if (!seededPlayer) {
                        return null;
                      }

                      const title =
                        seededPlayer.displayName || seededPlayer.fullName || seededPlayer.nickname || 'Гравець';

                      return (
                        <Pressable
                          key={registration.id}
                          onPress={() => {
                            navigation.navigate('PlayerDetails', {
                              identifier: seededPlayer.id,
                              title,
                            });
                          }}
                          style={({ pressed }) => [styles.seededRow, pressed && styles.pressed]}
                        >
                          <Text style={styles.seededPlace}>{index + 1}</Text>
                          <Text style={styles.seededName}>{title}</Text>
                          <Text style={styles.seededElo}>ELO {seededPlayer.currentElo}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                )}
              </View>

              <View style={styles.infoCard}>
                <Text style={styles.cardTitle}>Категорії</Text>
                {details.categories.length === 0 ? (
                  <Text style={styles.mutedText}>Категорій поки немає</Text>
                ) : (
                  details.categories.map((category) => (
                    <View key={category.id} style={styles.categoryItem}>
                      <Text style={styles.categoryName}>{category.name}</Text>
                      <Text style={styles.categoryMeta}>{category.discipline} | {category.format}</Text>
                      <Text style={styles.categoryMeta}>Max: {category.maxParticipants}</Text>
                    </View>
                  ))
                )}
              </View>
                </>
              ) : null}

              {activeTab === 'regulations' ? (
                <View style={styles.infoCard}>
                  <Text style={styles.cardTitle}>Регламент</Text>
                  {details.description?.trim() ? (
                    <Text style={styles.description}>{details.description}</Text>
                  ) : (
                    <Text style={styles.mutedText}>Опис турніру ще не додано.</Text>
                  )}

                  <Text style={styles.infoRow}>Тип: {details.type}</Text>
                  <Text style={styles.infoRow}>
                    Формат матчу:{' '}
                    {effectiveScoringMode === 'POINTS_SINGLE'
                      ? 'Один рахунок'
                      : `Сети до ${details.setsToWin}`}
                  </Text>
                  <Text style={styles.infoRow}>Очки до перемоги в сеті/матчі: {details.pointsToWin}</Text>
                  <Text style={styles.infoRow}>Кортів: {details.courtsCount}</Text>
                  <Text style={styles.infoRow}>Макс. гравців: {details.maxPlayers}</Text>
                </View>
              ) : null}

              {activeTab === 'matches' ? (
                <View style={styles.infoCard}>
                  <Text style={styles.cardTitle}>Зустрічі</Text>
                  {rounds.length === 0 ? (
                    <Text style={styles.mutedText}>Матчі ще не згенеровані.</Text>
                  ) : (
                    <View style={styles.roundList}>
                      {rounds.map((round) => (
                        <View key={round.id} style={styles.roundCard}>
                          <Text style={styles.roundTitle}>Раунд {round.roundNumber}</Text>
                          {round.matches.length === 0 ? (
                            <Text style={styles.mutedText}>Матчів немає</Text>
                          ) : (
                            round.matches.map((match) => {
                              const teamA = match.teams.find((team) => team.side === 'A');
                              const teamB = match.teams.find((team) => team.side === 'B');
                              const teamAName = teamA
                                ? `${teamA.players[0]?.fullName ?? '-'} / ${teamA.players[1]?.fullName ?? '-'}`
                                : 'Team A';
                              const teamBName = teamB
                                ? `${teamB.players[0]?.fullName ?? '-'} / ${teamB.players[1]?.fullName ?? '-'}`
                                : 'Team B';
                              const existingSingleScore =
                                match.scores.length === 1
                                  ? match.scores[0]
                                  : match.scores.length > 1
                                    ? {
                                        teamAScore: match.scores.reduce((sum, set) => sum + set.teamAScore, 0),
                                        teamBScore: match.scores.reduce((sum, set) => sum + set.teamBScore, 0),
                                      }
                                    : null;
                              const pointDraft = matchPointsInputById[match.id];

                              return (
                                <View key={match.id} style={styles.matchItemCard}>
                                  <Text style={styles.matchItemTitle}>{match.roundLabel || `Матч ${match.id.slice(0, 6)}`}</Text>
                                  <Text style={styles.matchItemTeams}>{teamAName}</Text>
                                  <Text style={styles.matchItemVs}>vs</Text>
                                  <Text style={styles.matchItemTeams}>{teamBName}</Text>
                                  <Text style={styles.matchItemMeta}>
                                    {match.scores.length > 0
                                      ? match.scores.map((setScore) => `${setScore.teamAScore}-${setScore.teamBScore}`).join(', ')
                                      : 'Очікує результат'}
                                  </Text>

                                  {match.status === 'COMPLETED' ? (
                                    <View style={styles.matchCompletedBox}>
                                      <Text style={styles.matchCompletedText}>Результат зафіксовано</Text>
                                    </View>
                                  ) : null}

                                  {isAdmin && !isResultEditingLocked ? (
                                    <View style={styles.matchAdminTools}>
                                      {isSingleScoreMode ? (
                                        <View style={styles.scoreEntryList}>
                                          <View style={styles.scoreEntryRow}>
                                            <Text style={styles.scoreEntryTeam} numberOfLines={2}>
                                              {teamAName}
                                            </Text>
                                            <TextInput
                                              keyboardType="number-pad"
                                              onChangeText={(value) => {
                                                setMatchPointsInputById((previous) => ({
                                                  ...previous,
                                                  [match.id]: {
                                                    teamA: value,
                                                    teamB: previous[match.id]?.teamB ?? '',
                                                  },
                                                }));
                                              }}
                                              placeholder={existingSingleScore ? String(existingSingleScore.teamAScore) : '0'}
                                              placeholderTextColor={Colors.outline}
                                              style={styles.matchScoreInputCompact}
                                              value={pointDraft?.teamA ?? ''}
                                            />
                                          </View>

                                          <View style={styles.scoreEntryRow}>
                                            <Text style={styles.scoreEntryTeam} numberOfLines={2}>
                                              {teamBName}
                                            </Text>
                                            <TextInput
                                              keyboardType="number-pad"
                                              onChangeText={(value) => {
                                                setMatchPointsInputById((previous) => ({
                                                  ...previous,
                                                  [match.id]: {
                                                    teamA: previous[match.id]?.teamA ?? '',
                                                    teamB: value,
                                                  },
                                                }));
                                              }}
                                              placeholder={existingSingleScore ? String(existingSingleScore.teamBScore) : '0'}
                                              placeholderTextColor={Colors.outline}
                                              style={styles.matchScoreInputCompact}
                                              value={pointDraft?.teamB ?? ''}
                                            />
                                          </View>
                                        </View>
                                      ) : (
                                        <View style={styles.matchAdminInlineRow}>
                                          <TextInput
                                            onChangeText={(value) => {
                                              setMatchSetsInputById((previous) => ({
                                                ...previous,
                                                [match.id]: value,
                                              }));
                                            }}
                                            placeholder="Рахунок по сетах: 6-4 6-3"
                                            placeholderTextColor={Colors.outline}
                                            style={[styles.matchResultInput, styles.matchResultInputInline]}
                                            value={
                                              matchSetsInputById[match.id] ??
                                              (match.scores.length > 0
                                                ? match.scores
                                                    .map((setScore) => `${setScore.teamAScore}-${setScore.teamBScore}`)
                                                    .join(' ')
                                                : '')
                                            }
                                          />
                                        </View>
                                      )}

                                      <Pressable
                                        disabled={actionLoading}
                                        onPress={() => {
                                          handleSubmitMatchResult(match);
                                        }}
                                        style={({ pressed }) => [
                                          styles.matchActionButton,
                                          actionLoading && styles.actionButtonDisabled,
                                          pressed && !actionLoading && styles.pressed,
                                        ]}
                                      >
                                        <Text style={styles.matchActionButtonText}>
                                          {match.status === 'COMPLETED' ? 'Оновити результат' : 'Зберегти результат'}
                                        </Text>
                                      </Pressable>
                                    </View>
                                  ) : null}

                                  {isAdmin && isResultEditingLocked ? (
                                    <Text style={styles.mutedText}>Редагування вимкнено після завершення/скасування турніру.</Text>
                                  ) : null}
                                </View>
                              );
                            })
                          )}
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              ) : null}

              {activeTab === 'groups' ? (
                <View style={styles.infoCard}>
                  <Text style={styles.cardTitle}>Групи</Text>
                  {groupStandings.length === 0 ? (
                    <Text style={styles.mutedText}>Груповий етап ще не згенеровано.</Text>
                  ) : (
                    <View style={styles.roundList}>
                      {groupStandings.map((group) => (
                        <View key={group.groupId} style={styles.roundCard}>
                          <Text style={styles.roundTitle}>{group.groupName}</Text>

                          <View style={styles.standingsTable}>
                            <View style={[styles.standingsTableRow, styles.standingsTableHead]}>
                              <Text style={[styles.standingsCell, styles.standingsCellPlace]}>#</Text>
                              <Text style={[styles.standingsCell, styles.standingsCellPlayer]}>Гравець</Text>
                              <Text style={[styles.standingsCell, styles.standingsCellStat]}>W</Text>
                              <Text style={[styles.standingsCell, styles.standingsCellPoints]}>S</Text>
                              <Text style={[styles.standingsCell, styles.standingsCellPoints]}>C</Text>
                              <Text style={[styles.standingsCell, styles.standingsCellDiff]}>Δ</Text>
                            </View>

                            {group.rows.map((row, index) => (
                              <View key={row.playerId} style={styles.standingsTableRow}>
                                <Text style={[styles.standingsCell, styles.standingsCellPlace]}>{index + 1}</Text>
                                <Text style={[styles.standingsCell, styles.standingsCellPlayer]} numberOfLines={1}>
                                  {row.playerName}
                                </Text>
                                <Text style={[styles.standingsCell, styles.standingsCellStat]}>{row.wins}</Text>
                                <Text style={[styles.standingsCell, styles.standingsCellPoints]}>{row.scored}</Text>
                                <Text style={[styles.standingsCell, styles.standingsCellPoints]}>{row.conceded}</Text>
                                <Text
                                  style={[
                                    styles.standingsCell,
                                    styles.standingsCellDiff,
                                    row.difference >= 0 ? styles.standingsDiffUp : styles.standingsDiffDown,
                                  ]}
                                >
                                  {row.difference >= 0 ? `+${row.difference}` : row.difference}
                                </Text>
                              </View>
                            ))}
                          </View>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              ) : null}

              {activeTab === 'bracket' ? (
                <View style={styles.infoCard}>
                  <Text style={styles.cardTitle}>Сітка</Text>
                  {playoffRounds.length === 0 ? (
                    <Text style={styles.mutedText}>Сітка ще не згенерована.</Text>
                  ) : (
                    <View style={styles.roundList}>
                      {playoffRounds.map((round) => (
                        <View key={round.id} style={styles.roundCard}>
                          <Text style={styles.roundTitle}>Раунд {round.roundNumber}</Text>
                          {round.matches.map((match) => (
                            <Text key={match.id} style={styles.groupLine}>
                              {match.teams
                                .map((team) => `${team.players[0]?.fullName ?? '-'} / ${team.players[1]?.fullName ?? '-'}`)
                                .join(' vs ')}
                            </Text>
                          ))}
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              ) : null}

              {activeTab === 'results' ? (
                <View style={styles.infoCard}>
                  <Text style={styles.cardTitle}>Результати</Text>
                  {standings.length === 0 ? (
                    <Text style={styles.mutedText}>Поки що немає розрахованої таблиці.</Text>
                  ) : (
                    <View style={styles.standingsTable}>
                      <View style={[styles.standingsTableRow, styles.standingsTableHead]}>
                        <Text style={[styles.standingsCell, styles.standingsCellPlace]}>#</Text>
                        <Text style={[styles.standingsCell, styles.standingsCellPlayer]}>Гравець</Text>
                        <Text style={[styles.standingsCell, styles.standingsCellStat]}>W</Text>
                        <Text style={[styles.standingsCell, styles.standingsCellStat]}>L</Text>
                        <Text style={[styles.standingsCell, styles.standingsCellGames]}>GW-GL</Text>
                        <Text style={[styles.standingsCell, styles.standingsCellDiff]}>Δ</Text>
                      </View>

                      {standings.map((item, index) => (
                        <View key={item.playerId} style={styles.standingsTableRow}>
                          <Text style={[styles.standingsCell, styles.standingsCellPlace]}>{index + 1}</Text>
                          <Text style={[styles.standingsCell, styles.standingsCellPlayer]} numberOfLines={1}>
                            {item.player.displayName || item.player.fullName}
                          </Text>
                          <Text style={[styles.standingsCell, styles.standingsCellStat]}>{item.wins}</Text>
                          <Text style={[styles.standingsCell, styles.standingsCellStat]}>{item.losses}</Text>
                          <Text style={[styles.standingsCell, styles.standingsCellGames]}>
                            {item.gamesWon}-{item.gamesLost}
                          </Text>
                          <Text
                            style={[
                              styles.standingsCell,
                              styles.standingsCellDiff,
                              item.gameDifference >= 0 ? styles.standingsDiffUp : styles.standingsDiffDown,
                            ]}
                          >
                            {item.gameDifference >= 0 ? `+${item.gameDifference}` : item.gameDifference}
                          </Text>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              ) : null}

              {activeTab === 'rating' ? (
                <View style={styles.infoCard}>
                  <Text style={styles.cardTitle}>Зміна рейтингу</Text>
                  {ratingChanges.length === 0 ? (
                    <Text style={styles.mutedText}>
                      {details.status === 'COMPLETED'
                        ? 'Поки що рейтингових змін немає.'
                        : 'Рейтинг зʼявиться після завершення турніру адміном.'}
                    </Text>
                  ) : (
                    <View style={styles.ratingList}>
                      {ratingChanges.map((item) => (
                        <View key={item.playerId} style={styles.ratingRow}>
                          <View style={styles.ratingMain}>
                            <Text style={styles.ratingName}>{item.fullName}</Text>
                            <Text style={styles.ratingMeta}>
                              {item.beforeRating} → {item.afterRating} · матчів: {item.matches}
                            </Text>
                          </View>
                          <Text style={[styles.ratingDelta, item.totalDelta >= 0 ? styles.ratingDeltaUp : styles.ratingDeltaDown]}>
                            {item.totalDelta >= 0 ? `+${item.totalDelta}` : item.totalDelta}
                          </Text>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              ) : null}
            </>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  cardTitle: {
    color: Colors.primary,
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 0.4,
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  categoryItem: {
    backgroundColor: Colors.surfaceLowest,
    borderRadius: 12,
    gap: 2,
    paddingHorizontal: 10,
    paddingVertical: 10,
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
  loadingLine: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  loadingText: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  content: {
    paddingBottom: 24,
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  description: {
    color: Colors.textSecondary,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 8,
  },
  errorText: {
    color: Colors.error,
    fontSize: 12,
    fontWeight: '600',
  },
  feedbackCardError: {
    backgroundColor: '#FFECEC',
    borderColor: '#FFB8B8',
    borderRadius: 12,
    borderWidth: 0,
    marginBottom: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  feedbackCardSuccess: {
    backgroundColor: '#E9F9EF',
    borderColor: '#A9E1BC',
    borderRadius: 12,
    borderWidth: 0,
    marginBottom: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  heroCard: {
    borderRadius: 18,
    gap: 4,
    marginBottom: 12,
    padding: 14,
    shadowColor: Colors.textPrimary,
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.06,
    shadowRadius: 40,
  },
  heroLabel: {
    color: Colors.onPrimaryContainer,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  heroMeta: {
    color: Colors.onPrimaryContainer,
    fontSize: 11,
    fontWeight: '700',
  },
  heroTitle: {
    color: Colors.onPrimary,
    fontSize: 22,
    fontWeight: '900',
    marginBottom: 4,
  },
  infoCard: {
    backgroundColor: Colors.surfaceLow,
    borderRadius: 14,
    gap: 6,
    marginBottom: 10,
    padding: 12,
    shadowColor: Colors.textPrimary,
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.06,
    shadowRadius: 40,
  },
  infoRow: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontWeight: '700',
  },
  mutedText: {
    color: Colors.outline,
    fontSize: 12,
  },
  successText: {
    color: Colors.primary,
    fontSize: 12,
    fontWeight: '700',
    marginTop: 6,
  },
  actionButton: {
    alignItems: 'center',
    backgroundColor: Colors.primary,
    borderRadius: 10,
    justifyContent: 'center',
    minHeight: 40,
    paddingHorizontal: 12,
  },
  actionButtonDisabled: {
    opacity: 0.65,
  },
  actionButtonText: {
    color: Colors.onPrimary,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  actionButtonSecondary: {
    alignItems: 'center',
    backgroundColor: Colors.surfaceLowest,
    borderColor: Colors.outlineVariant,
    borderRadius: 10,
    borderWidth: 0,
    justifyContent: 'center',
    minHeight: 40,
    paddingHorizontal: 12,
  },
  actionButtonSecondaryText: {
    color: Colors.textPrimary,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  adminActionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 6,
  },
  startConfigCard: {
    backgroundColor: Colors.surfaceLowest,
    borderColor: Colors.outlineVariant,
    borderRadius: 10,
    borderWidth: 0,
    gap: 8,
    marginTop: 8,
    padding: 10,
  },
  startConfigTitle: {
    color: Colors.textPrimary,
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  startModeRow: {
    flexDirection: 'row',
    gap: 6,
  },
  startModeButton: {
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderColor: Colors.outlineVariant,
    borderRadius: 8,
    borderWidth: 0,
    flex: 1,
    justifyContent: 'center',
    minHeight: 34,
    paddingHorizontal: 10,
  },
  startModeButtonActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  startModeButtonText: {
    color: Colors.textPrimary,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  startModeButtonTextActive: {
    color: Colors.onPrimary,
  },
  startConfigGrid: {
    flexDirection: 'row',
    gap: 8,
  },
  startConfigField: {
    flex: 1,
    gap: 4,
  },
  startConfigLabel: {
    color: Colors.outline,
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  adminActionButton: {
    alignItems: 'center',
    backgroundColor: Colors.primary,
    borderRadius: 10,
    justifyContent: 'center',
    minHeight: 36,
    minWidth: 150,
    paddingHorizontal: 10,
  },
  adminActionButtonDanger: {
    alignItems: 'center',
    backgroundColor: Colors.error,
    borderRadius: 10,
    justifyContent: 'center',
    minHeight: 36,
    minWidth: 150,
    paddingHorizontal: 10,
  },
  adminActionButtonText: {
    color: Colors.onPrimary,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  input: {
    backgroundColor: Colors.surfaceLowest,
    borderColor: Colors.outlineVariant,
    borderRadius: 10,
    borderWidth: 0,
    color: Colors.textPrimary,
    fontSize: 13,
    fontWeight: '600',
    minHeight: 42,
    paddingHorizontal: 10,
  },
  registrationActions: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  registrationItem: {
    alignItems: 'center',
    backgroundColor: Colors.surfaceLowest,
    borderRadius: 12,
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  registrationList: {
    gap: 8,
  },
  seededList: {
    gap: 6,
  },
  seededRow: {
    alignItems: 'center',
    backgroundColor: Colors.surfaceLowest,
    borderColor: Colors.outlineVariant,
    borderRadius: 10,
    borderWidth: 0,
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  seededPlace: {
    color: Colors.primary,
    fontSize: 14,
    fontWeight: '900',
    minWidth: 24,
    textAlign: 'center',
  },
  seededName: {
    color: Colors.textPrimary,
    flex: 1,
    fontSize: 12,
    fontWeight: '800',
  },
  seededElo: {
    color: Colors.outline,
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  registrationMain: {
    flex: 1,
  },
  registrationMeta: {
    color: Colors.outline,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  registrationName: {
    color: Colors.textPrimary,
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 2,
  },
  inlineActionButton: {
    alignItems: 'center',
    backgroundColor: Colors.primary,
    borderRadius: 8,
    justifyContent: 'center',
    minHeight: 30,
    minWidth: 56,
    paddingHorizontal: 8,
  },
  inlineActionButtonDanger: {
    alignItems: 'center',
    backgroundColor: Colors.error,
    borderRadius: 8,
    justifyContent: 'center',
    minHeight: 30,
    minWidth: 56,
    paddingHorizontal: 8,
  },
  inlineActionText: {
    color: Colors.onPrimary,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  inlineActionTextDanger: {
    color: Colors.onPrimary,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  pressed: {
    opacity: 0.85,
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
  searchResultItem: {
    backgroundColor: Colors.surfaceLowest,
    borderColor: Colors.outlineVariant,
    borderRadius: 10,
    borderWidth: 0,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  searchResultMeta: {
    color: Colors.outline,
    fontSize: 10,
    fontWeight: '700',
  },
  searchResultName: {
    color: Colors.textPrimary,
    fontSize: 12,
    fontWeight: '800',
  },
  searchResultsList: {
    gap: 6,
    maxHeight: 220,
  },
  selectedPlayerBox: {
    backgroundColor: Colors.surfaceLowest,
    borderColor: Colors.outlineVariant,
    borderRadius: 10,
    borderWidth: 0,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  selectedPlayerText: {
    color: Colors.textPrimary,
    fontSize: 12,
    fontWeight: '700',
  },
  timerCard: {
    alignItems: 'center',
    backgroundColor: Colors.primary,
    borderRadius: 16,
    gap: 6,
    marginBottom: 10,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  timerExpiredNote: {
    color: Colors.onPrimaryContainer,
    fontSize: 11,
    fontWeight: '700',
  },
  timerLabel: {
    color: Colors.onPrimaryContainer,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.7,
    textTransform: 'uppercase',
  },
  timerMeta: {
    color: Colors.onPrimaryContainer,
    fontSize: 12,
    fontWeight: '700',
  },
  timerValue: {
    color: Colors.onPrimary,
    fontSize: 36,
    fontWeight: '900',
    letterSpacing: 1,
  },
  timerValueExpired: {
    color: '#FFD4D4',
  },
  tabsRow: {
    alignItems: 'stretch',
    backgroundColor: Colors.surfaceLow,
    borderColor: Colors.outlineVariant,
    borderRadius: 10,
    borderWidth: 0,
    flexDirection: 'row',
    marginBottom: 10,
    paddingHorizontal: 2,
  },
  tabButton: {
    alignItems: 'center',
    backgroundColor: 'transparent',
    borderBottomColor: 'transparent',
    borderBottomWidth: 3,
    minHeight: 38,
    paddingHorizontal: 12,
  },
  tabButtonActive: {
    backgroundColor: Colors.surfaceLowest,
    borderBottomColor: Colors.primary,
  },
  tabButtonText: {
    color: Colors.textPrimary,
    fontSize: 10,
    fontWeight: '900',
    lineHeight: 34,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  tabButtonTextActive: {
    color: Colors.primary,
  },
  roundList: {
    gap: 8,
  },
  roundCard: {
    backgroundColor: Colors.surfaceLowest,
    borderRadius: 10,
    marginTop: 8,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  roundTitle: {
    color: Colors.textPrimary,
    fontSize: 12,
    fontWeight: '800',
  },
  matchItemCard: {
    backgroundColor: Colors.surface,
    borderRadius: 10,
    gap: 3,
    marginTop: 8,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  matchItemTitle: {
    color: Colors.primary,
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  matchItemTeams: {
    color: Colors.textPrimary,
    fontSize: 12,
    fontWeight: '700',
  },
  matchItemVs: {
    color: Colors.outline,
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  matchItemMeta: {
    color: Colors.outline,
    fontSize: 10,
    fontWeight: '700',
    marginTop: 4,
  },
  matchCompletedBox: {
    alignSelf: 'flex-start',
    backgroundColor: '#E9F9EF',
    borderColor: '#A9E1BC',
    borderRadius: 999,
    borderWidth: 1,
    marginTop: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  matchCompletedText: {
    color: '#206C3A',
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  matchAdminTools: {
    gap: 8,
    marginTop: 8,
  },
  scoreEntryList: {
    gap: 6,
  },
  scoreEntryRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  scoreEntryTeam: {
    color: Colors.textPrimary,
    flex: 1,
    fontSize: 11,
    fontWeight: '700',
  },
  matchScoreInputCompact: {
    backgroundColor: Colors.surfaceLowest,
    borderColor: Colors.outlineVariant,
    borderRadius: 8,
    borderWidth: 0,
    color: Colors.textPrimary,
    fontSize: 12,
    fontWeight: '700',
    minHeight: 34,
    minWidth: 64,
    paddingHorizontal: 10,
    textAlign: 'center',
  },
  matchAdminInlineRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  matchResultInput: {
    backgroundColor: Colors.surfaceLowest,
    borderColor: Colors.outlineVariant,
    borderRadius: 8,
    borderWidth: 0,
    color: Colors.textPrimary,
    fontSize: 12,
    fontWeight: '600',
    minHeight: 36,
    paddingHorizontal: 10,
  },
  matchResultInputInline: {
    flex: 1,
  },
  matchActionButton: {
    alignItems: 'center',
    backgroundColor: Colors.primary,
    borderRadius: 8,
    justifyContent: 'center',
    minHeight: 32,
    paddingHorizontal: 10,
  },
  matchActionButtonSecondary: {
    alignItems: 'center',
    backgroundColor: Colors.surfaceLowest,
    borderColor: Colors.outlineVariant,
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 32,
    paddingHorizontal: 10,
  },
  matchActionButtonText: {
    color: Colors.onPrimary,
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  matchActionButtonSecondaryText: {
    color: Colors.textPrimary,
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  groupLine: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  standingsTable: {
    backgroundColor: Colors.surfaceLowest,
    borderColor: Colors.outlineVariant,
    borderRadius: 10,
    borderWidth: 0,
    overflow: 'hidden',
  },
  standingsTableHead: {
    backgroundColor: Colors.surface,
  },
  standingsTableRow: {
    alignItems: 'center',
    flexDirection: 'row',
    minHeight: 36,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  standingsCell: {
    color: Colors.textPrimary,
    fontSize: 11,
    fontWeight: '700',
  },
  standingsCellPlayer: {
    flex: 1,
    fontWeight: '800',
    paddingRight: 6,
  },
  standingsCellPlace: {
    textAlign: 'center',
    width: 26,
  },
  standingsCellStat: {
    textAlign: 'center',
    width: 28,
  },
  standingsCellPoints: {
    textAlign: 'center',
    width: 38,
  },
  standingsCellGames: {
    textAlign: 'center',
    width: 66,
  },
  standingsCellDiff: {
    textAlign: 'right',
    width: 40,
  },
  standingsDiffUp: {
    color: Colors.primary,
    fontWeight: '900',
  },
  standingsDiffDown: {
    color: Colors.error,
    fontWeight: '900',
  },
  ratingList: {
    gap: 8,
  },
  ratingRow: {
    alignItems: 'center',
    backgroundColor: Colors.surfaceLowest,
    borderRadius: 10,
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  ratingMain: {
    flex: 1,
  },
  ratingName: {
    color: Colors.textPrimary,
    fontSize: 12,
    fontWeight: '800',
  },
  ratingMeta: {
    color: Colors.outline,
    fontSize: 10,
    fontWeight: '700',
  },
  ratingDelta: {
    fontSize: 13,
    fontWeight: '900',
  },
  ratingDeltaUp: {
    color: Colors.primary,
  },
  ratingDeltaDown: {
    color: Colors.error,
  },
  keyboardAvoiding: {
    flex: 1,
  },
});
