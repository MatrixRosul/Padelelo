import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { MatchResultSource, MatchStatus, TeamSide } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { RatingsService } from '../ratings/ratings.service';
import { CreateMatchDto } from './dto/create-match.dto';
import { SubmitMatchResultDto } from './dto/submit-match-result.dto';

@Injectable()
export class MatchesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ratingsService: RatingsService,
  ) {}

  async createMatch(dto: CreateMatchDto, actorUserId: string) {
    this.validateTeams(dto.teamA, dto.teamB);

    const players = await this.prisma.playerProfile.findMany({
      where: {
        id: {
          in: [
            dto.teamA.player1Id,
            dto.teamA.player2Id,
            dto.teamB.player1Id,
            dto.teamB.player2Id,
          ],
        },
      },
    });

    if (players.length !== 4) {
      throw new NotFoundException('All four players must exist');
    }

    const map = new Map(players.map((player) => [player.id, player.currentElo]));

    const teamAverage = (a: string, b: string) =>
      Math.round(((map.get(a) ?? 1400) + (map.get(b) ?? 1400)) / 2);

    const match = await this.prisma.match.create({
      data: {
        tournamentId: dto.tournamentId,
        tournamentCategoryId: dto.tournamentCategoryId,
        scheduledAt: dto.scheduledAt,
        isRated: dto.isRated ?? true,
        roundLabel: dto.roundLabel,
        bracketStage: dto.bracketStage,
        createdByUserId: actorUserId,
        status: MatchStatus.SCHEDULED,
        teams: {
          create: [
            {
              side: TeamSide.A,
              player1Id: dto.teamA.player1Id,
              player2Id: dto.teamA.player2Id,
              teamAverageElo: teamAverage(dto.teamA.player1Id, dto.teamA.player2Id),
            },
            {
              side: TeamSide.B,
              player1Id: dto.teamB.player1Id,
              player2Id: dto.teamB.player2Id,
              teamAverageElo: teamAverage(dto.teamB.player1Id, dto.teamB.player2Id),
            },
          ],
        },
      },
      include: {
        teams: true,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        actorUserId,
        action: 'match.create',
        entityType: 'Match',
        entityId: match.id,
      },
    });

    return match;
  }

  async getMatchById(matchId: string) {
    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
      include: {
        teams: {
          include: {
            player1: true,
            player2: true,
          },
        },
        setScores: true,
        tournament: true,
        tournamentCategory: true,
      },
    });

    if (!match) {
      throw new NotFoundException('Match not found');
    }

    return match;
  }

  async submitResult(matchId: string, dto: SubmitMatchResultDto, actorUserId: string) {
    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
      include: {
        teams: true,
      },
    });

    if (!match) {
      throw new NotFoundException('Match not found');
    }

    if (match.status === MatchStatus.COMPLETED) {
      throw new ConflictException('Match result already submitted');
    }

    if (dto.simulate) {
      const simulated = this.generateSimulatedResult(match.teams);
      dto.winnerSide = simulated.winnerSide;
      dto.setScores = simulated.setScores;
      dto.resultSource = MatchResultSource.SIMULATED;
    }

    if (!dto.winnerSide) {
      throw new BadRequestException('winnerSide is required when result is not simulated');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.match.update({
        where: { id: match.id },
        data: {
          status: MatchStatus.COMPLETED,
          playedAt: new Date(),
          winnerTeamSide: dto.winnerSide,
          resultSource: dto.resultSource ?? MatchResultSource.MANUAL,
        },
      });

      if (dto.setScores?.length) {
        await tx.matchSetScore.createMany({
          data: dto.setScores.map((set) => ({
            matchId: match.id,
            setNumber: set.setNumber,
            teamAScore: set.teamAScore,
            teamBScore: set.teamBScore,
            tieBreakAScore: set.tieBreakAScore,
            tieBreakBScore: set.tieBreakBScore,
          })),
        });
      }

      await tx.auditLog.create({
        data: {
          actorUserId,
          action: 'match.result.submit',
          entityType: 'Match',
          entityId: match.id,
          context: {
            winnerSide: dto.winnerSide,
            source: dto.resultSource ?? MatchResultSource.MANUAL,
          },
        },
      });
    });

    let ratingSummary: unknown = null;
    if (match.isRated) {
      ratingSummary = await this.ratingsService.applyRatingsForMatch(match.id);
    }

    return {
      matchId: match.id,
      winnerSide: dto.winnerSide,
      rated: match.isRated,
      ratingSummary,
    };
  }

  async simulateResult(matchId: string, actorUserId: string) {
    return this.submitResult(
      matchId,
      {
        simulate: true,
      },
      actorUserId,
    );
  }

  private validateTeams(
    teamA: { player1Id: string; player2Id: string },
    teamB: { player1Id: string; player2Id: string },
  ) {
    if (teamA.player1Id === teamA.player2Id || teamB.player1Id === teamB.player2Id) {
      throw new BadRequestException('Each team must have two distinct players');
    }

    const uniquePlayers = new Set([teamA.player1Id, teamA.player2Id, teamB.player1Id, teamB.player2Id]);
    if (uniquePlayers.size !== 4) {
      throw new BadRequestException('A match must contain exactly 4 unique players');
    }
  }

  private generateSimulatedResult(
    teams: Array<{
      side: TeamSide;
      teamAverageElo: number;
    }>,
  ): {
    winnerSide: TeamSide;
    setScores: Array<{
      setNumber: number;
      teamAScore: number;
      teamBScore: number;
    }>;
  } {
    const teamA = teams.find((item) => item.side === TeamSide.A);
    const teamB = teams.find((item) => item.side === TeamSide.B);

    if (!teamA || !teamB) {
      throw new BadRequestException('Both teams are required for simulation');
    }

    const expectedA = 1 / (1 + Math.pow(10, (teamB.teamAverageElo - teamA.teamAverageElo) / 400));
    const winnerSide = Math.random() < expectedA ? TeamSide.A : TeamSide.B;

    const setScores =
      winnerSide === TeamSide.A
        ? [
            { setNumber: 1, teamAScore: 6, teamBScore: 4 },
            { setNumber: 2, teamAScore: 6, teamBScore: 3 },
          ]
        : [
            { setNumber: 1, teamAScore: 4, teamBScore: 6 },
            { setNumber: 2, teamAScore: 3, teamBScore: 6 },
          ];

    return {
      winnerSide,
      setScores,
    };
  }
}
