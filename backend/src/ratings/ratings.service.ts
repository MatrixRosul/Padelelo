import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EloConfig, Match, TeamSide } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { UpdateEloConfigDto } from './dto/update-elo-config.dto';

type CompletedMatchForRating = Match & {
  teams: Array<{
    id: string;
    side: TeamSide;
    player1Id: string;
    player2Id: string;
  }>;
};

@Injectable()
export class RatingsService {
  private readonly K_FACTOR_NOVICE = 70;
  private readonly K_FACTOR_BEGINNER = 60;
  private readonly K_FACTOR_INTERMEDIATE = 50;
  private readonly K_FACTOR_EXPERIENCED = 40;

  constructor(private readonly prisma: PrismaService) {}

  async getActiveConfig(): Promise<EloConfig> {
    const config = await this.prisma.eloConfig.findFirst({
      where: { isActive: true },
      orderBy: { updatedAt: 'desc' },
    });

    if (config) {
      return config;
    }

    return this.prisma.eloConfig.create({
      data: {
        name: 'default',
        isActive: true,
        defaultRating: 1400,
        kFactor: 32,
        minKFactor: 16,
        maxKFactor: 64,
        provisionalGames: 20,
        provisionalKFactor: 40,
        homeAdvantage: 0,
      },
    });
  }

  async updateActiveConfig(dto: UpdateEloConfigDto, actorUserId: string) {
    const active = await this.getActiveConfig();

    return this.prisma.eloConfig.update({
      where: { id: active.id },
      data: {
        ...dto,
        updatedByUserId: actorUserId,
      },
    });
  }

  calculateTeamAverage(playerOneRating: number, playerTwoRating: number): number {
    return Math.round((playerOneRating + playerTwoRating) / 2);
  }

  calculateExpectedScore(teamRating: number, opponentRating: number): number {
    return 1 / (1 + Math.pow(10, (opponentRating - teamRating) / 400));
  }

  calculateDelta(params: { teamRating: number; opponentRating: number; score: 0 | 1; kFactor: number }): number {
    const expected = this.calculateExpectedScore(params.teamRating, params.opponentRating);
    return Math.round(params.kFactor * (params.score - expected));
  }

  async applyRatingsForMatch(matchId: string): Promise<{
    matchId: string;
    winner: TeamSide;
    deltaA: number;
    deltaB: number;
  }> {
    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
      include: {
        teams: true,
        tournamentCategory: {
          select: {
            name: true,
          },
        },
      },
    });

    if (!match) {
      throw new NotFoundException('Match not found');
    }

    if (!match.winnerTeamSide) {
      throw new BadRequestException('Winner side is required before rating calculation');
    }

    if (match.teams.length !== 2) {
      throw new BadRequestException('Match must contain exactly 2 teams');
    }

    const alreadyProcessed = await this.prisma.ratingHistory.findFirst({ where: { matchId } });
    if (alreadyProcessed) {
      throw new ConflictException('Ratings for this match were already processed');
    }

    const teamA = match.teams.find((team) => team.side === TeamSide.A);
    const teamB = match.teams.find((team) => team.side === TeamSide.B);

    if (!teamA || !teamB) {
      throw new BadRequestException('Both Team A and Team B are required');
    }

    const players = await this.prisma.playerProfile.findMany({
      where: { id: { in: [teamA.player1Id, teamA.player2Id, teamB.player1Id, teamB.player2Id] } },
    });

    if (players.length !== 4) {
      throw new BadRequestException('All four players must exist');
    }

    const playerMap = new Map(players.map((player) => [player.id, player]));

    const teamARating = this.calculateTeamAverage(
      playerMap.get(teamA.player1Id)!.currentElo,
      playerMap.get(teamA.player2Id)!.currentElo,
    );

    const teamBRating = this.calculateTeamAverage(
      playerMap.get(teamB.player1Id)!.currentElo,
      playerMap.get(teamB.player2Id)!.currentElo,
    );

    const leagueMultiplier = this.resolveLeagueMultiplier(match.tournamentCategory?.name ?? null);

    const scoreA: 0 | 1 = match.winnerTeamSide === TeamSide.A ? 1 : 0;
    const scoreB: 0 | 1 = scoreA === 1 ? 0 : 1;

    const expectedA = this.calculateExpectedScore(teamARating, teamBRating);
    const expectedB = 1 - expectedA;

    const teamAPlayers = [teamA.player1Id, teamA.player2Id];
    const teamBPlayers = [teamB.player1Id, teamB.player2Id];

    const playerDeltaById = new Map<string, { delta: number; appliedKFactor: number }>();

    for (const playerId of teamAPlayers) {
      const player = playerMap.get(playerId)!;
      const playerKFactor = this.resolvePlayerKFactor(player.matchesPlayed);
      const appliedKFactor = Math.max(1, Math.round(playerKFactor * leagueMultiplier));
      const delta = this.calculateDelta({
        teamRating: teamARating,
        opponentRating: teamBRating,
        score: scoreA,
        kFactor: appliedKFactor,
      });

      playerDeltaById.set(playerId, { delta, appliedKFactor });
    }

    for (const playerId of teamBPlayers) {
      const player = playerMap.get(playerId)!;
      const playerKFactor = this.resolvePlayerKFactor(player.matchesPlayed);
      const appliedKFactor = Math.max(1, Math.round(playerKFactor * leagueMultiplier));
      const delta = this.calculateDelta({
        teamRating: teamBRating,
        opponentRating: teamARating,
        score: scoreB,
        kFactor: appliedKFactor,
      });

      playerDeltaById.set(playerId, { delta, appliedKFactor });
    }

    const deltaA = Math.round(
      (playerDeltaById.get(teamAPlayers[0])!.delta + playerDeltaById.get(teamAPlayers[1])!.delta) / 2,
    );
    const deltaB = Math.round(
      (playerDeltaById.get(teamBPlayers[0])!.delta + playerDeltaById.get(teamBPlayers[1])!.delta) / 2,
    );

    await this.prisma.$transaction(async (tx) => {
      for (const playerId of teamAPlayers) {
        const current = playerMap.get(playerId)!;
        const playerDelta = playerDeltaById.get(playerId)!;

        await tx.playerProfile.update({
          where: { id: playerId },
          data: {
            currentElo: current.currentElo + playerDelta.delta,
            wins: scoreA === 1 ? { increment: 1 } : undefined,
            losses: scoreA === 0 ? { increment: 1 } : undefined,
            matchesPlayed: { increment: 1 },
          },
        });

        await tx.ratingHistory.create({
          data: {
            playerId,
            matchId: match.id,
            reason: 'MATCH_RESULT',
            beforeRating: current.currentElo,
            afterRating: current.currentElo + playerDelta.delta,
            delta: playerDelta.delta,
            kFactor: playerDelta.appliedKFactor,
            expectedScore: expectedA,
            actualScore: scoreA,
          },
        });
      }

      for (const playerId of teamBPlayers) {
        const current = playerMap.get(playerId)!;
        const playerDelta = playerDeltaById.get(playerId)!;

        await tx.playerProfile.update({
          where: { id: playerId },
          data: {
            currentElo: current.currentElo + playerDelta.delta,
            wins: scoreB === 1 ? { increment: 1 } : undefined,
            losses: scoreB === 0 ? { increment: 1 } : undefined,
            matchesPlayed: { increment: 1 },
          },
        });

        await tx.ratingHistory.create({
          data: {
            playerId,
            matchId: match.id,
            reason: 'MATCH_RESULT',
            beforeRating: current.currentElo,
            afterRating: current.currentElo + playerDelta.delta,
            delta: playerDelta.delta,
            kFactor: playerDelta.appliedKFactor,
            expectedScore: expectedB,
            actualScore: scoreB,
          },
        });
      }

      await tx.matchTeam.update({
        where: { matchId_side: { matchId: match.id, side: TeamSide.A } },
        data: {
          teamAverageElo: teamARating,
          expectedScore: expectedA,
          actualScore: scoreA,
          ratingDelta: deltaA,
          isWinner: scoreA === 1,
        },
      });

      await tx.matchTeam.update({
        where: { matchId_side: { matchId: match.id, side: TeamSide.B } },
        data: {
          teamAverageElo: teamBRating,
          expectedScore: expectedB,
          actualScore: scoreB,
          ratingDelta: deltaB,
          isWinner: scoreB === 1,
        },
      });

      await tx.match.update({
        where: { id: match.id },
        data: {
          status: 'COMPLETED',
          playedAt: match.playedAt ?? new Date(),
        },
      });

      await tx.auditLog.create({
        data: {
          actorUserId: match.createdByUserId,
          action: 'ratings.applied',
          entityType: 'Match',
          entityId: match.id,
          context: {
            deltaA,
            deltaB,
            winnerSide: match.winnerTeamSide,
            leagueMultiplier,
          },
        },
      });
    });

    return {
      matchId: match.id,
      winner: match.winnerTeamSide,
      deltaA,
      deltaB,
    };
  }

  async recomputeRatingsFromScratch() {
    const config = await this.getActiveConfig();

    await this.prisma.$transaction(async (tx) => {
      await tx.ratingHistory.deleteMany({});

      await tx.playerProfile.updateMany({
        data: {
          currentElo: config.defaultRating,
          wins: 0,
          losses: 0,
          matchesPlayed: 0,
        },
      });

      await tx.matchTeam.updateMany({
        data: {
          expectedScore: null,
          actualScore: null,
          ratingDelta: null,
          isWinner: null,
        },
      });
    });

    const completedMatches = await this.prisma.match.findMany({
      where: {
        status: 'COMPLETED',
        isRated: true,
        winnerTeamSide: { not: null },
      },
      include: { teams: true },
      orderBy: [{ playedAt: 'asc' }, { createdAt: 'asc' }],
    });

    for (const match of completedMatches as CompletedMatchForRating[]) {
      await this.applyRatingsForMatch(match.id);
    }

    return {
      processedMatches: completedMatches.length,
      defaultRating: config.defaultRating,
    };
  }

  private resolvePlayerKFactor(matchesPlayed: number): number {
    if (matchesPlayed < 10) {
      return this.K_FACTOR_NOVICE;
    }

    if (matchesPlayed < 25) {
      return this.K_FACTOR_BEGINNER;
    }

    if (matchesPlayed < 50) {
      return this.K_FACTOR_INTERMEDIATE;
    }

    return this.K_FACTOR_EXPERIENCED;
  }

  private resolveLeagueMultiplier(categoryName: string | null): number {
    if (!categoryName) {
      return 1;
    }

    const value = categoryName.trim().toLowerCase();

    if (value.includes('друга') || value.includes('second')) {
      return 0.5;
    }

    if (value.includes('перша') || value.includes('first')) {
      return 0.7;
    }

    return 1;
  }
}
