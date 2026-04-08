export interface Player {
  id: string;
  fullName: string;
  username: string;
  eloRating: number;
  avatarUrl?: string;
  matchesPlayed: number;
  wins: number;
  losses: number;
}
