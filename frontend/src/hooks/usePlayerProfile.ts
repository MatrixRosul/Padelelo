import { useCallback, useEffect, useState } from 'react';

import { apiClient } from '../api/client';
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

type MatchHistoryEntry = {
  id: string;
  playedAt: string | null;
  winnerTeamSide: 'A' | 'B' | null;
  teams: MatchTeam[];
  setScores: MatchSetScore[];
  tournamentCategory: {
    id: string;
    name: string;
    discipline: string;
  } | null;
};

type EloHistoryEntry = {
  id: string;
  matchId: string | null;
  beforeRating: number;
  afterRating: number;
  delta: number;
  kFactor: number;
  createdAt: string;
};

export type PlayerProfileResponse = {
  id: string;
  email: string;
  username: string;
  fullName: string;
  displayName: string | null;
  currentElo: number;
  wins: number;
  losses: number;
  matchesPlayed: number;
  matchHistory: MatchHistoryEntry[];
  eloHistory: EloHistoryEntry[];
};

export function usePlayerProfile(identifier: string | null) {
  const [profile, setProfile] = useState<PlayerProfileResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadProfile = useCallback(async () => {
    if (!identifier) {
      setProfile(null);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { data } = await apiClient.get<PlayerProfileResponse>(`/players/${encodeURIComponent(identifier)}`);
      setProfile(data);
    } catch (error) {
      setProfile(null);
      setError(toUserFriendlyError(error, 'Could not load player profile'));
    } finally {
      setLoading(false);
    }
  }, [identifier]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  return {
    profile,
    loading,
    error,
    reload: loadProfile,
  };
}