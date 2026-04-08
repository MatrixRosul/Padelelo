export interface EloDelta {
  playerId: string;
  before: number;
  after: number;
  change: number;
}

export interface EloComputation {
  matchId: string;
  kFactor: number;
  deltas: EloDelta[];
  computedAt: string;
}
