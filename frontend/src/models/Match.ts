export type MatchStatus = 'scheduled' | 'completed' | 'canceled';

export interface MatchTeam {
  playerIds: [string, string];
  score: number;
}

export interface Match {
  id: string;
  playedAt: string;
  courtName?: string;
  isRanked: boolean;
  status: MatchStatus;
  teamA: MatchTeam;
  teamB: MatchTeam;
  winnerTeam: 'A' | 'B' | null;
}
