import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { apiClient } from '../api/client';
import { Colors } from '../theme/colors';
import { toUserFriendlyError } from '../utils/httpError';

type OpenMatchStatus = 'OPEN' | 'READY' | 'RESULT_PENDING' | 'COMPLETED' | 'CANCELLED';
type OpenMatchScoringMode = 'POINTS' | 'SETS';
type OpenMatchParticipantStatus =
  | 'JOINED'
  | 'INVITED'
  | 'REQUESTED'
  | 'DECLINED'
  | 'REJECTED'
  | 'REMOVED';
type OpenMatchApprovalDecision = 'PENDING' | 'APPROVED' | 'REJECTED';

type OpenMatchPlayer = {
  id: string;
  fullName: string;
  nickname: string | null;
  currentElo: number;
};

type OpenMatchParticipant = {
  id: string;
  playerId: string;
  status: OpenMatchParticipantStatus;
  teamSide: 'A' | 'B' | null;
  teamPosition: number | null;
  joinedAt: string | null;
  respondedAt: string | null;
  invitedByPlayerId: string | null;
  player: OpenMatchPlayer;
};

type OpenMatchApproval = {
  id: string;
  playerId: string;
  decision: OpenMatchApprovalDecision;
  decidedAt: string | null;
  player: OpenMatchPlayer;
};

type OpenMatchItem = {
  id: string;
  status: OpenMatchStatus;
  scoringMode: OpenMatchScoringMode;
  isRated: boolean;
  pointsToWin: number;
  setsToWin: number;
  scheduledAt: string | null;
  location: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  playedAt: string | null;
  finalMatchId: string | null;
  ratingAppliedAt: string | null;
  availableSlots: number;
  joinedCount: number;
  pendingRequestsCount: number;
  creator: OpenMatchPlayer;
  participants: OpenMatchParticipant[];
  approvals: OpenMatchApproval[];
  approvalSummary: {
    required: number;
    approved: number;
    rejected: number;
    pending: number;
  };
  resultProposal: {
    winnerSide: 'A' | 'B' | null;
    teamAPoints: number | null;
    teamBPoints: number | null;
    teamASetsWon: number | null;
    teamBSetsWon: number | null;
    submittedAt: string | null;
    submittedBy: OpenMatchPlayer | null;
  } | null;
  viewer: {
    playerId: string;
    isCaptain: boolean;
    participationStatus: OpenMatchParticipantStatus | null;
    isJoined: boolean;
  };
};

type OpenMatchesResponse = {
  items: OpenMatchItem[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

type PlayerSearchItem = {
  id: string;
  fullName: string;
  nickname: string | null;
  currentElo: number;
};

type PlayerSearchResponse = {
  items: PlayerSearchItem[];
};

type ResultDraft = {
  teamA: string;
  teamB: string;
};

type CreateDraft = {
  scoringMode: OpenMatchScoringMode;
  isRated: boolean;
  pointsToWin: string;
  setsToWin: string;
  location: string;
  notes: string;
};

type OpenMatchesPanelProps = {
  playerId: string | null;
  onLifecycleUpdate?: () => void;
  hideCreateCard?: boolean;
  refreshToken?: number;
};

const INITIAL_CREATE_DRAFT: CreateDraft = {
  scoringMode: 'POINTS',
  isRated: true,
  pointsToWin: '21',
  setsToWin: '2',
  location: '',
  notes: '',
};

function formatOpenMatchStatus(status: OpenMatchStatus): string {
  switch (status) {
    case 'OPEN':
      return 'Open';
    case 'READY':
      return 'Ready';
    case 'RESULT_PENDING':
      return 'Result Pending';
    case 'COMPLETED':
      return 'Completed';
    case 'CANCELLED':
      return 'Cancelled';
    default:
      return status;
  }
}

function formatParticipantStatus(status: OpenMatchParticipantStatus): string {
  switch (status) {
    case 'JOINED':
      return 'Joined';
    case 'INVITED':
      return 'Invited';
    case 'REQUESTED':
      return 'Requested';
    case 'DECLINED':
      return 'Declined';
    case 'REJECTED':
      return 'Rejected';
    case 'REMOVED':
      return 'Removed';
    default:
      return status;
  }
}

function formatResultValue(match: OpenMatchItem): string {
  if (!match.resultProposal) {
    return '-';
  }

  if (match.scoringMode === 'POINTS') {
    if (match.resultProposal.teamAPoints === null || match.resultProposal.teamBPoints === null) {
      return '-';
    }

    return `${match.resultProposal.teamAPoints}-${match.resultProposal.teamBPoints} pts`;
  }

  if (match.resultProposal.teamASetsWon === null || match.resultProposal.teamBSetsWon === null) {
    return '-';
  }

  return `${match.resultProposal.teamASetsWon}-${match.resultProposal.teamBSetsWon} sets`;
}

function formatSlot(participant: OpenMatchParticipant): string {
  if (!participant.teamSide || !participant.teamPosition) {
    return '--';
  }

  return `${participant.teamSide}${participant.teamPosition}`;
}

function parsePositiveInt(input: string, fallback: number): number {
  const parsed = Number.parseInt(input, 10);
  if (Number.isNaN(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
}

export function OpenMatchesPanel({
  playerId,
  onLifecycleUpdate,
  hideCreateCard = false,
  refreshToken = 0,
}: OpenMatchesPanelProps) {
  const [feedMatches, setFeedMatches] = useState<OpenMatchItem[]>([]);
  const [myMatches, setMyMatches] = useState<OpenMatchItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyActionKey, setBusyActionKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [createDraft, setCreateDraft] = useState<CreateDraft>(INITIAL_CREATE_DRAFT);
  const [resultDraftByMatchId, setResultDraftByMatchId] = useState<Record<string, ResultDraft>>({});
  const [inviteQueryByMatchId, setInviteQueryByMatchId] = useState<Record<string, string>>({});
  const [inviteResultsByMatchId, setInviteResultsByMatchId] = useState<Record<string, PlayerSearchItem[]>>({});

  const loadOpenMatches = useCallback(async () => {
    if (!playerId) {
      setFeedMatches([]);
      setMyMatches([]);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const [feedResponse, mineResponse] = await Promise.all([
        apiClient.get<OpenMatchesResponse>('/matches/open', {
          params: {
            status: 'OPEN',
            page: 1,
            limit: 20,
          },
        }),
        apiClient.get<OpenMatchesResponse>('/matches/open', {
          params: {
            mine: true,
            page: 1,
            limit: 20,
          },
        }),
      ]);

      setFeedMatches(feedResponse.data.items);
      setMyMatches(mineResponse.data.items);
    } catch (requestError) {
      setError(toUserFriendlyError(requestError, 'Could not load open matches'));
      setFeedMatches([]);
      setMyMatches([]);
    } finally {
      setLoading(false);
    }
  }, [playerId]);

  useEffect(() => {
    void loadOpenMatches();
  }, [loadOpenMatches, refreshToken]);

  const runOpenMatchAction = useCallback(
    async (key: string, task: () => Promise<void>) => {
      setBusyActionKey(key);
      setError(null);

      try {
        await task();
        await loadOpenMatches();
        onLifecycleUpdate?.();
      } catch (actionError) {
        setError(toUserFriendlyError(actionError, 'Open match action failed'));
      } finally {
        setBusyActionKey(null);
      }
    },
    [loadOpenMatches, onLifecycleUpdate],
  );

  const createOpenMatch = useCallback(async () => {
    await runOpenMatchAction('create-open-match', async () => {
      const payload: {
        scoringMode: OpenMatchScoringMode;
        isRated: boolean;
        pointsToWin?: number;
        setsToWin?: number;
        location?: string;
        notes?: string;
      } = {
        scoringMode: createDraft.scoringMode,
        isRated: createDraft.isRated,
        location: createDraft.location.trim() || undefined,
        notes: createDraft.notes.trim() || undefined,
      };

      if (createDraft.scoringMode === 'POINTS') {
        payload.pointsToWin = parsePositiveInt(createDraft.pointsToWin, 21);
      } else {
        payload.setsToWin = parsePositiveInt(createDraft.setsToWin, 2);
      }

      await apiClient.post('/matches/open', payload);
      setCreateDraft(INITIAL_CREATE_DRAFT);
    });
  }, [createDraft, runOpenMatchAction]);

  const searchInviteCandidates = useCallback(
    async (matchId: string) => {
      const query = inviteQueryByMatchId[matchId]?.trim() ?? '';
      if (query.length < 2) {
        setInviteResultsByMatchId((previous) => ({
          ...previous,
          [matchId]: [],
        }));
        return;
      }

      setBusyActionKey(`search:${matchId}`);
      setError(null);

      try {
        const { data } = await apiClient.get<PlayerSearchResponse>('/players', {
          params: {
            search: query,
            limit: 8,
            page: 1,
          },
        });

        const currentMatch = myMatches.find((item) => item.id === matchId);
        const blockedPlayerIds = new Set(currentMatch?.participants.map((participant) => participant.playerId) ?? []);

        setInviteResultsByMatchId((previous) => ({
          ...previous,
          [matchId]: data.items.filter((player) => !blockedPlayerIds.has(player.id)),
        }));
      } catch (requestError) {
        setError(toUserFriendlyError(requestError, 'Could not search players'));
      } finally {
        setBusyActionKey(null);
      }
    },
    [inviteQueryByMatchId, myMatches],
  );

  const activeFeed = useMemo(() => {
    const myMatchIds = new Set(myMatches.map((match) => match.id));
    return feedMatches.filter((match) => !myMatchIds.has(match.id));
  }, [feedMatches, myMatches]);

  if (!playerId) {
    return null;
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Open Match Lobby</Text>
        {loading ? <ActivityIndicator color={Colors.primary} size="small" /> : null}
      </View>

      {!hideCreateCard ? (
        <View style={styles.createCard}>
        <Text style={styles.blockTitle}>Create 2v2 Lobby</Text>
        <Text style={styles.blockMeta}>Publish an open rated or unrated challenge with free slots.</Text>

        <View style={styles.toggleRow}>
          <Pressable
            onPress={() => {
              setCreateDraft((previous) => ({ ...previous, scoringMode: 'POINTS' }));
            }}
            style={({ pressed }) => [
              styles.toggleButton,
              createDraft.scoringMode === 'POINTS' && styles.toggleButtonActive,
              pressed && styles.pressed,
            ]}
          >
            <Text
              style={[
                styles.toggleButtonText,
                createDraft.scoringMode === 'POINTS' && styles.toggleButtonTextActive,
              ]}
            >
              Points
            </Text>
          </Pressable>

          <Pressable
            onPress={() => {
              setCreateDraft((previous) => ({ ...previous, scoringMode: 'SETS' }));
            }}
            style={({ pressed }) => [
              styles.toggleButton,
              createDraft.scoringMode === 'SETS' && styles.toggleButtonActive,
              pressed && styles.pressed,
            ]}
          >
            <Text
              style={[
                styles.toggleButtonText,
                createDraft.scoringMode === 'SETS' && styles.toggleButtonTextActive,
              ]}
            >
              Sets
            </Text>
          </Pressable>

          <Pressable
            onPress={() => {
              setCreateDraft((previous) => ({ ...previous, isRated: !previous.isRated }));
            }}
            style={({ pressed }) => [
              styles.toggleButton,
              createDraft.isRated && styles.toggleButtonActive,
              pressed && styles.pressed,
            ]}
          >
            <Text style={[styles.toggleButtonText, createDraft.isRated && styles.toggleButtonTextActive]}>
              {createDraft.isRated ? 'Rated' : 'Unrated'}
            </Text>
          </Pressable>
        </View>

        {createDraft.scoringMode === 'POINTS' ? (
          <TextInput
            keyboardType="number-pad"
            onChangeText={(value) => {
              setCreateDraft((previous) => ({ ...previous, pointsToWin: value }));
            }}
            placeholder="Points to win (e.g. 21)"
            placeholderTextColor={Colors.outline}
            style={styles.input}
            value={createDraft.pointsToWin}
          />
        ) : (
          <TextInput
            keyboardType="number-pad"
            onChangeText={(value) => {
              setCreateDraft((previous) => ({ ...previous, setsToWin: value }));
            }}
            placeholder="Sets to win (e.g. 2)"
            placeholderTextColor={Colors.outline}
            style={styles.input}
            value={createDraft.setsToWin}
          />
        )}

        <TextInput
          onChangeText={(value) => {
            setCreateDraft((previous) => ({ ...previous, location: value }));
          }}
          placeholder="Location (optional)"
          placeholderTextColor={Colors.outline}
          style={styles.input}
          value={createDraft.location}
        />

        <TextInput
          multiline
          numberOfLines={2}
          onChangeText={(value) => {
            setCreateDraft((previous) => ({ ...previous, notes: value }));
          }}
          placeholder="Note (optional)"
          placeholderTextColor={Colors.outline}
          style={[styles.input, styles.inputMultiline]}
          value={createDraft.notes}
        />

        <Pressable
          disabled={busyActionKey === 'create-open-match'}
          onPress={() => {
            void createOpenMatch();
          }}
          style={({ pressed }) => [styles.primaryButton, (pressed || busyActionKey === 'create-open-match') && styles.pressed]}
        >
          <Text style={styles.primaryButtonText}>Create Open Match</Text>
        </Pressable>
        </View>
      ) : null}

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      <View style={styles.block}>
        <View style={styles.sectionHeaderCompact}>
          <Text style={styles.blockTitle}>My Open Matches</Text>
          <Text style={styles.blockMeta}>{myMatches.length}</Text>
        </View>

        {myMatches.length === 0 ? (
          <Text style={styles.emptyText}>No active lobbies yet.</Text>
        ) : (
          <View style={styles.stack}>
            {myMatches.map((match) => {
              const pendingRequests = match.participants.filter((participant) => participant.status === 'REQUESTED');
              const invitationForViewer =
                match.viewer.participationStatus === 'INVITED' ? match.viewer.participationStatus : null;
              const resultDraft = resultDraftByMatchId[match.id] ?? { teamA: '', teamB: '' };
              const canSubmitResult = match.status === 'READY' && match.viewer.isJoined;
              const canResolveResult = match.status === 'RESULT_PENDING' && match.viewer.isJoined;

              return (
                <View key={match.id} style={styles.matchCard}>
                  <View style={styles.matchHeader}>
                    <View style={styles.badgeRow}>
                      <View style={styles.statusBadge}>
                        <Text style={styles.statusBadgeText}>{formatOpenMatchStatus(match.status)}</Text>
                      </View>
                      <View style={styles.modeBadge}>
                        <Text style={styles.modeBadgeText}>
                          {match.scoringMode === 'POINTS' ? `Points ${match.pointsToWin}` : `Sets ${match.setsToWin}`}
                        </Text>
                      </View>
                    </View>
                    <Text style={styles.matchMeta}>Slots {match.joinedCount}/4</Text>
                  </View>

                  <Text style={styles.creatorText}>Creator: {match.creator.fullName}</Text>
                  {match.location ? <Text style={styles.locationText}>Location: {match.location}</Text> : null}
                  {match.notes ? <Text style={styles.notesText}>{match.notes}</Text> : null}

                  <View style={styles.participantsList}>
                    {match.participants.map((participant) => (
                      <View key={participant.id} style={styles.participantRow}>
                        <Text style={styles.participantName}>
                          {participant.player.fullName} ({formatSlot(participant)})
                        </Text>
                        <Text style={styles.participantStatus}>{formatParticipantStatus(participant.status)}</Text>
                      </View>
                    ))}
                  </View>

                  {match.viewer.isCaptain && match.status === 'OPEN' ? (
                    <View style={styles.actionBlock}>
                      <Text style={styles.actionTitle}>Invite Player</Text>
                      <View style={styles.inlineRow}>
                        <TextInput
                          onChangeText={(value) => {
                            setInviteQueryByMatchId((previous) => ({
                              ...previous,
                              [match.id]: value,
                            }));
                          }}
                          placeholder="Search players"
                          placeholderTextColor={Colors.outline}
                          style={[styles.input, styles.inlineInput]}
                          value={inviteQueryByMatchId[match.id] ?? ''}
                        />
                        <Pressable
                          onPress={() => {
                            void searchInviteCandidates(match.id);
                          }}
                          style={({ pressed }) => [styles.ghostButton, pressed && styles.pressed]}
                        >
                          <MaterialIcons color={Colors.primary} name="search" size={18} />
                        </Pressable>
                      </View>

                      {inviteResultsByMatchId[match.id]?.length ? (
                        <View style={styles.searchResults}>
                          {inviteResultsByMatchId[match.id].map((candidate) => (
                            <View key={candidate.id} style={styles.searchResultRow}>
                              <Text style={styles.searchResultText}>{candidate.fullName}</Text>
                              <Pressable
                                onPress={() => {
                                  void runOpenMatchAction(`invite:${match.id}:${candidate.id}`, async () => {
                                    await apiClient.post(`/matches/open/${encodeURIComponent(match.id)}/invite`, {
                                      playerId: candidate.id,
                                    });
                                    setInviteResultsByMatchId((previous) => ({
                                      ...previous,
                                      [match.id]: [],
                                    }));
                                    setInviteQueryByMatchId((previous) => ({
                                      ...previous,
                                      [match.id]: '',
                                    }));
                                  });
                                }}
                                style={({ pressed }) => [styles.ghostButtonSmall, pressed && styles.pressed]}
                              >
                                <Text style={styles.ghostButtonText}>Invite</Text>
                              </Pressable>
                            </View>
                          ))}
                        </View>
                      ) : null}

                      {pendingRequests.length > 0 ? (
                        <View style={styles.pendingRequestsBlock}>
                          <Text style={styles.actionTitle}>Pending Requests</Text>
                          {pendingRequests.map((request) => (
                            <View key={request.id} style={styles.pendingRequestRow}>
                              <Text style={styles.pendingRequestText}>{request.player.fullName}</Text>
                              <View style={styles.pendingButtonsRow}>
                                <Pressable
                                  onPress={() => {
                                    void runOpenMatchAction(`approve:${match.id}:${request.playerId}`, async () => {
                                      await apiClient.post(
                                        `/matches/open/${encodeURIComponent(match.id)}/requests/${encodeURIComponent(request.playerId)}/resolve`,
                                        { approve: true },
                                      );
                                    });
                                  }}
                                  style={({ pressed }) => [styles.successButtonSmall, pressed && styles.pressed]}
                                >
                                  <Text style={styles.successButtonText}>Approve</Text>
                                </Pressable>
                                <Pressable
                                  onPress={() => {
                                    void runOpenMatchAction(`reject:${match.id}:${request.playerId}`, async () => {
                                      await apiClient.post(
                                        `/matches/open/${encodeURIComponent(match.id)}/requests/${encodeURIComponent(request.playerId)}/resolve`,
                                        { approve: false },
                                      );
                                    });
                                  }}
                                  style={({ pressed }) => [styles.dangerButtonSmall, pressed && styles.pressed]}
                                >
                                  <Text style={styles.dangerButtonText}>Reject</Text>
                                </Pressable>
                              </View>
                            </View>
                          ))}
                        </View>
                      ) : null}
                    </View>
                  ) : null}

                  {invitationForViewer ? (
                    <View style={styles.actionBlock}>
                      <Text style={styles.actionTitle}>You are invited</Text>
                      <View style={styles.pendingButtonsRow}>
                        <Pressable
                          onPress={() => {
                            void runOpenMatchAction(`accept:${match.id}`, async () => {
                              await apiClient.post(`/matches/open/${encodeURIComponent(match.id)}/invite/respond`, {
                                accept: true,
                              });
                            });
                          }}
                          style={({ pressed }) => [styles.successButtonSmall, pressed && styles.pressed]}
                        >
                          <Text style={styles.successButtonText}>Accept</Text>
                        </Pressable>
                        <Pressable
                          onPress={() => {
                            void runOpenMatchAction(`decline:${match.id}`, async () => {
                              await apiClient.post(`/matches/open/${encodeURIComponent(match.id)}/invite/respond`, {
                                accept: false,
                              });
                            });
                          }}
                          style={({ pressed }) => [styles.dangerButtonSmall, pressed && styles.pressed]}
                        >
                          <Text style={styles.dangerButtonText}>Decline</Text>
                        </Pressable>
                      </View>
                    </View>
                  ) : null}

                  {canSubmitResult ? (
                    <View style={styles.actionBlock}>
                      <Text style={styles.actionTitle}>Submit Result</Text>
                      <View style={styles.inlineRow}>
                        <TextInput
                          keyboardType="number-pad"
                          onChangeText={(value) => {
                            setResultDraftByMatchId((previous) => ({
                              ...previous,
                              [match.id]: {
                                ...resultDraft,
                                teamA: value,
                              },
                            }));
                          }}
                          placeholder={match.scoringMode === 'POINTS' ? 'Team A points' : 'Team A sets'}
                          placeholderTextColor={Colors.outline}
                          style={[styles.input, styles.inlineInput]}
                          value={resultDraft.teamA}
                        />
                        <TextInput
                          keyboardType="number-pad"
                          onChangeText={(value) => {
                            setResultDraftByMatchId((previous) => ({
                              ...previous,
                              [match.id]: {
                                ...resultDraft,
                                teamB: value,
                              },
                            }));
                          }}
                          placeholder={match.scoringMode === 'POINTS' ? 'Team B points' : 'Team B sets'}
                          placeholderTextColor={Colors.outline}
                          style={[styles.input, styles.inlineInput]}
                          value={resultDraft.teamB}
                        />
                      </View>

                      <Pressable
                        onPress={() => {
                          void runOpenMatchAction(`submit-result:${match.id}`, async () => {
                            const teamA = parsePositiveInt(resultDraft.teamA, 0);
                            const teamB = parsePositiveInt(resultDraft.teamB, 0);

                            if (match.scoringMode === 'POINTS') {
                              await apiClient.post(`/matches/open/${encodeURIComponent(match.id)}/result`, {
                                teamAPoints: teamA,
                                teamBPoints: teamB,
                              });
                            } else {
                              await apiClient.post(`/matches/open/${encodeURIComponent(match.id)}/result`, {
                                teamASetsWon: teamA,
                                teamBSetsWon: teamB,
                              });
                            }
                          });
                        }}
                        style={({ pressed }) => [styles.primaryButtonSmall, pressed && styles.pressed]}
                      >
                        <Text style={styles.primaryButtonSmallText}>Submit Result</Text>
                      </Pressable>
                    </View>
                  ) : null}

                  {canResolveResult ? (
                    <View style={styles.actionBlock}>
                      <Text style={styles.actionTitle}>
                        Approvals {match.approvalSummary.approved}/{match.approvalSummary.required}
                      </Text>
                      <Text style={styles.resultText}>Proposed: {formatResultValue(match)}</Text>
                      <View style={styles.pendingButtonsRow}>
                        <Pressable
                          onPress={() => {
                            void runOpenMatchAction(`approve-result:${match.id}`, async () => {
                              await apiClient.post(`/matches/open/${encodeURIComponent(match.id)}/result/resolve`, {
                                approve: true,
                              });
                            });
                          }}
                          style={({ pressed }) => [styles.successButtonSmall, pressed && styles.pressed]}
                        >
                          <Text style={styles.successButtonText}>Approve</Text>
                        </Pressable>
                        <Pressable
                          onPress={() => {
                            void runOpenMatchAction(`reject-result:${match.id}`, async () => {
                              await apiClient.post(`/matches/open/${encodeURIComponent(match.id)}/result/resolve`, {
                                approve: false,
                              });
                            });
                          }}
                          style={({ pressed }) => [styles.dangerButtonSmall, pressed && styles.pressed]}
                        >
                          <Text style={styles.dangerButtonText}>Reject</Text>
                        </Pressable>
                      </View>
                    </View>
                  ) : null}

                  {match.viewer.isCaptain && match.status !== 'COMPLETED' && match.status !== 'CANCELLED' ? (
                    <Pressable
                      onPress={() => {
                        void runOpenMatchAction(`cancel:${match.id}`, async () => {
                          await apiClient.post(`/matches/open/${encodeURIComponent(match.id)}/cancel`);
                        });
                      }}
                      style={({ pressed }) => [styles.cancelButton, pressed && styles.pressed]}
                    >
                      <Text style={styles.cancelButtonText}>Cancel Match</Text>
                    </Pressable>
                  ) : null}
                </View>
              );
            })}
          </View>
        )}
      </View>

      <View style={styles.block}>
        <View style={styles.sectionHeaderCompact}>
          <Text style={styles.blockTitle}>Available Lobbies</Text>
          <Text style={styles.blockMeta}>{activeFeed.length}</Text>
        </View>

        {activeFeed.length === 0 ? (
          <Text style={styles.emptyText}>No public open lobbies at the moment.</Text>
        ) : (
          <View style={styles.stack}>
            {activeFeed.map((match) => {
              const canRequest =
                match.status === 'OPEN' &&
                match.availableSlots > 0 &&
                match.viewer.participationStatus !== 'REQUESTED' &&
                match.viewer.participationStatus !== 'JOINED' &&
                match.viewer.participationStatus !== 'INVITED';

              return (
                <View key={match.id} style={styles.feedCard}>
                  <View style={styles.matchHeader}>
                    <Text style={styles.feedTitle}>{match.creator.fullName}</Text>
                    <Text style={styles.feedMeta}>Slots {match.joinedCount}/4</Text>
                  </View>

                  <Text style={styles.feedMeta}>
                    {match.isRated ? 'Rated' : 'Unrated'} | {match.scoringMode === 'POINTS' ? `Points ${match.pointsToWin}` : `Sets ${match.setsToWin}`}
                  </Text>

                  {match.location ? <Text style={styles.feedMeta}>Location: {match.location}</Text> : null}

                  <View style={styles.participantsMiniList}>
                    {match.participants
                      .filter((participant) => participant.status === 'JOINED')
                      .map((participant) => (
                        <Text key={participant.id} style={styles.participantsMiniItem}>
                          {participant.player.fullName}
                        </Text>
                      ))}
                  </View>

                  {canRequest ? (
                    <Pressable
                      onPress={() => {
                        void runOpenMatchAction(`request:${match.id}`, async () => {
                          await apiClient.post(`/matches/open/${encodeURIComponent(match.id)}/request`);
                        });
                      }}
                      style={({ pressed }) => [styles.primaryButtonSmall, pressed && styles.pressed]}
                    >
                      <Text style={styles.primaryButtonSmallText}>Request to Join</Text>
                    </Pressable>
                  ) : (
                    <Text style={styles.feedStateText}>
                      {match.viewer.participationStatus
                        ? `Status: ${formatParticipantStatus(match.viewer.participationStatus)}`
                        : 'Viewing only'}
                    </Text>
                  )}
                </View>
              );
            })}
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  actionBlock: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    gap: 8,
    marginTop: 10,
    padding: 10,
  },
  actionTitle: {
    color: Colors.textPrimary,
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  badgeRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  block: {
    backgroundColor: Colors.surfaceLow,
    borderRadius: 20,
    marginBottom: 14,
    padding: 14,
  },
  blockMeta: {
    color: Colors.outline,
    fontSize: 11,
    fontWeight: '700',
  },
  blockTitle: {
    color: Colors.primary,
    fontSize: 15,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  cancelButton: {
    alignItems: 'center',
    borderColor: Colors.error,
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: 'center',
    marginTop: 10,
    minHeight: 38,
  },
  cancelButtonText: {
    color: Colors.error,
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  createCard: {
    backgroundColor: Colors.surfaceLow,
    borderRadius: 22,
    gap: 8,
    marginBottom: 14,
    padding: 14,
  },
  creatorText: {
    color: Colors.textPrimary,
    fontSize: 12,
    fontWeight: '700',
    marginTop: 4,
  },
  dangerButtonSmall: {
    alignItems: 'center',
    backgroundColor: 'rgba(186, 26, 26, 0.16)',
    borderRadius: 10,
    justifyContent: 'center',
    minHeight: 32,
    minWidth: 84,
    paddingHorizontal: 10,
  },
  dangerButtonText: {
    color: Colors.error,
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  emptyText: {
    color: Colors.textSecondary,
    fontSize: 12,
  },
  errorText: {
    color: Colors.error,
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 10,
  },
  feedCard: {
    backgroundColor: Colors.surfaceLowest,
    borderRadius: 16,
    gap: 6,
    padding: 12,
  },
  feedMeta: {
    color: Colors.textSecondary,
    fontSize: 11,
    fontWeight: '600',
  },
  feedStateText: {
    color: Colors.outline,
    fontSize: 11,
    fontWeight: '700',
    marginTop: 6,
  },
  feedTitle: {
    color: Colors.textPrimary,
    fontSize: 14,
    fontWeight: '800',
  },
  ghostButton: {
    alignItems: 'center',
    borderColor: Colors.ghostBorder,
    borderRadius: 10,
    borderWidth: 1,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  ghostButtonSmall: {
    alignItems: 'center',
    borderColor: Colors.ghostBorder,
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 28,
    minWidth: 66,
    paddingHorizontal: 8,
  },
  ghostButtonText: {
    color: Colors.primary,
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  inlineInput: {
    flex: 1,
    marginBottom: 0,
  },
  inlineRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  input: {
    backgroundColor: Colors.surfaceLowest,
    borderColor: Colors.ghostBorder,
    borderRadius: 12,
    borderWidth: 1,
    color: Colors.textPrimary,
    fontSize: 12,
    marginBottom: 2,
    minHeight: 40,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  inputMultiline: {
    minHeight: 66,
    textAlignVertical: 'top',
  },
  locationText: {
    color: Colors.textSecondary,
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
  },
  matchCard: {
    backgroundColor: Colors.surfaceLowest,
    borderRadius: 16,
    padding: 12,
  },
  matchHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  matchMeta: {
    color: Colors.outline,
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  modeBadge: {
    backgroundColor: Colors.secondaryContainer,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  modeBadgeText: {
    color: Colors.onSecondaryContainer,
    fontSize: 9,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  notesText: {
    color: Colors.textSecondary,
    fontSize: 11,
    marginTop: 2,
  },
  participantName: {
    color: Colors.textPrimary,
    flex: 1,
    fontSize: 11,
    fontWeight: '600',
  },
  participantRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  participantsList: {
    gap: 5,
    marginTop: 8,
  },
  participantsMiniItem: {
    color: Colors.textSecondary,
    fontSize: 10,
    fontWeight: '700',
  },
  participantsMiniList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 2,
  },
  participantStatus: {
    color: Colors.outline,
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  pendingButtonsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  pendingRequestRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  pendingRequestsBlock: {
    gap: 8,
  },
  pendingRequestText: {
    color: Colors.textPrimary,
    flex: 1,
    fontSize: 11,
    fontWeight: '700',
    marginRight: 8,
  },
  pressed: {
    opacity: 0.84,
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: Colors.primary,
    borderRadius: 12,
    justifyContent: 'center',
    marginTop: 4,
    minHeight: 42,
  },
  primaryButtonSmall: {
    alignItems: 'center',
    backgroundColor: Colors.primary,
    borderRadius: 10,
    justifyContent: 'center',
    minHeight: 34,
    paddingHorizontal: 12,
  },
  primaryButtonSmallText: {
    color: Colors.onPrimary,
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  primaryButtonText: {
    color: Colors.onPrimary,
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  resultText: {
    color: Colors.textSecondary,
    fontSize: 11,
    fontWeight: '600',
  },
  searchResults: {
    gap: 6,
  },
  searchResultRow: {
    alignItems: 'center',
    backgroundColor: Colors.surfaceLowest,
    borderRadius: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  searchResultText: {
    color: Colors.textPrimary,
    flex: 1,
    fontSize: 11,
    fontWeight: '700',
    marginRight: 8,
  },
  sectionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  sectionHeaderCompact: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  sectionTitle: {
    color: Colors.primary,
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  stack: {
    gap: 10,
  },
  statusBadge: {
    backgroundColor: Colors.primaryContainer,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  statusBadgeText: {
    color: Colors.onPrimaryContainer,
    fontSize: 9,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  successButtonSmall: {
    alignItems: 'center',
    backgroundColor: 'rgba(0, 88, 82, 0.18)',
    borderRadius: 10,
    justifyContent: 'center',
    minHeight: 32,
    minWidth: 84,
    paddingHorizontal: 10,
  },
  successButtonText: {
    color: Colors.success,
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  toggleButton: {
    alignItems: 'center',
    backgroundColor: Colors.surfaceLowest,
    borderColor: Colors.ghostBorder,
    borderRadius: 10,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 34,
    minWidth: 82,
    paddingHorizontal: 10,
  },
  toggleButtonActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  toggleButtonText: {
    color: Colors.textSecondary,
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  toggleButtonTextActive: {
    color: Colors.onPrimary,
  },
  toggleRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  wrap: {
    marginBottom: 12,
  },
});
