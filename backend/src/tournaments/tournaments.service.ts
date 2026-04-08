import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  BracketStage,
  Prisma,
  RegistrationStatus,
  TeamSide,
  TournamentFormat,
  TournamentStatus,
} from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { CreateTournamentDto } from './dto/create-tournament.dto';
import { UpdateTournamentDto } from './dto/update-tournament.dto';

@Injectable()
export class TournamentsService {
  constructor(private readonly prisma: PrismaService) {}

  async createTournament(dto: CreateTournamentDto, actorUserId: string) {
    if (dto.startDate >= dto.endDate) {
      throw new BadRequestException('Tournament startDate must be before endDate');
    }

    const slugBase = dto.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');

    const slug = `${slugBase}-${Date.now()}`;

    const tournament = await this.prisma.tournament.create({
      data: {
        name: dto.name,
        slug,
        description: dto.description,
        location: dto.location,
        startDate: dto.startDate,
        endDate: dto.endDate,
        createdByUserId: actorUserId,
        categories: {
          create: dto.categories.map((category) => ({
            name: category.name,
            discipline: category.discipline,
            customDisciplineLabel: category.customDisciplineLabel,
            genderEligibility: category.genderEligibility,
            ageMin: category.ageMin,
            ageMax: category.ageMax,
            rankingMin: category.rankingMin,
            rankingMax: category.rankingMax,
            maxParticipants: category.maxParticipants,
            format: category.format,
            allowsWildCards: category.allowsWildCards ?? false,
            seededEntriesCount: category.seededEntriesCount ?? 0,
            qualificationSpots: category.qualificationSpots ?? 0,
            groupCount: category.groupCount,
            playoffSize: category.playoffSize,
          })),
        },
      },
      include: {
        categories: true,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        actorUserId,
        action: 'tournament.create',
        entityType: 'Tournament',
        entityId: tournament.id,
      },
    });

    return tournament;
  }

  listTournaments() {
    return this.prisma.tournament.findMany({
      include: { categories: true },
      orderBy: { startDate: 'desc' },
    });
  }

  async getTournamentById(id: string) {
    const tournament = await this.prisma.tournament.findUnique({
      where: { id },
      include: {
        categories: true,
      },
    });

    if (!tournament) {
      throw new NotFoundException('Tournament not found');
    }

    return tournament;
  }

  async updateTournament(id: string, dto: UpdateTournamentDto, actorUserId: string) {
    await this.ensureTournamentExists(id);

    const tournament = await this.prisma.tournament.update({
      where: { id },
      data: dto,
      include: { categories: true },
    });

    await this.prisma.auditLog.create({
      data: {
        actorUserId,
        action: 'tournament.update',
        entityType: 'Tournament',
        entityId: id,
        context: dto as Prisma.InputJsonValue,
      },
    });

    return tournament;
  }

  async publishTournament(id: string, actorUserId: string) {
    const tournament = await this.prisma.tournament.update({
      where: { id },
      data: {
        status: TournamentStatus.PUBLISHED,
        publishedAt: new Date(),
      },
    });

    await this.prisma.auditLog.create({
      data: {
        actorUserId,
        action: 'tournament.publish',
        entityType: 'Tournament',
        entityId: id,
      },
    });

    return tournament;
  }

  async openRegistration(id: string, actorUserId: string) {
    const tournament = await this.prisma.tournament.update({
      where: { id },
      data: {
        registrationStatus: 'OPEN',
        registrationOpenAt: new Date(),
      },
    });

    await this.prisma.auditLog.create({
      data: {
        actorUserId,
        action: 'tournament.registration.open',
        entityType: 'Tournament',
        entityId: id,
      },
    });

    return tournament;
  }

  async closeRegistration(id: string, actorUserId: string) {
    const tournament = await this.prisma.tournament.update({
      where: { id },
      data: {
        registrationStatus: 'CLOSED',
        registrationCloseAt: new Date(),
      },
    });

    await this.prisma.auditLog.create({
      data: {
        actorUserId,
        action: 'tournament.registration.close',
        entityType: 'Tournament',
        entityId: id,
      },
    });

    return tournament;
  }

  async generateDraw(tournamentId: string, actorUserId: string) {
    const tournament = await this.prisma.tournament.findUnique({
      where: { id: tournamentId },
      include: {
        categories: {
          include: {
            registrations: {
              where: { status: RegistrationStatus.CONFIRMED },
              include: {
                team: {
                  include: {
                    player1: true,
                    player2: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!tournament) {
      throw new NotFoundException('Tournament not found');
    }

    const createdMatches: Array<{ categoryId: string; count: number }> = [];

    for (const category of tournament.categories) {
      if (category.registrations.length < 2) {
        continue;
      }

      const orderedTeams = [...category.registrations]
        .sort((a, b) => (a.team.seedNumber ?? Number.MAX_SAFE_INTEGER) - (b.team.seedNumber ?? Number.MAX_SAFE_INTEGER))
        .map((registration) => registration.team);

      const matchesToCreate: Prisma.MatchCreateInput[] = [];

      if (category.format === TournamentFormat.SINGLE_ELIMINATION || category.format === TournamentFormat.DOUBLE_ELIMINATION) {
        for (let i = 0; i < orderedTeams.length - 1; i += 2) {
          const teamA = orderedTeams[i];
          const teamB = orderedTeams[i + 1];
          if (!teamB) {
            break;
          }

          matchesToCreate.push({
            status: 'SCHEDULED',
            bracketStage: this.pickInitialStage(orderedTeams.length),
            roundLabel: 'Round 1',
            tournament: { connect: { id: tournamentId } },
            tournamentCategory: { connect: { id: category.id } },
            createdBy: { connect: { id: actorUserId } },
            teams: {
              create: [
                {
                  side: TeamSide.A,
                  player1: { connect: { id: teamA.player1Id } },
                  player2: { connect: { id: teamA.player2Id } },
                  teamAverageElo: this.calculateTeamAverage(teamA.player1.currentElo, teamA.player2.currentElo),
                },
                {
                  side: TeamSide.B,
                  player1: { connect: { id: teamB.player1Id } },
                  player2: { connect: { id: teamB.player2Id } },
                  teamAverageElo: this.calculateTeamAverage(teamB.player1.currentElo, teamB.player2.currentElo),
                },
              ],
            },
          });
        }
      }

      if (category.format === TournamentFormat.ROUND_ROBIN || category.format === TournamentFormat.GROUPS_PLAYOFFS || category.format === TournamentFormat.QUALIFICATION_MAIN_DRAW) {
        for (let i = 0; i < orderedTeams.length; i += 1) {
          for (let j = i + 1; j < orderedTeams.length; j += 1) {
            const teamA = orderedTeams[i];
            const teamB = orderedTeams[j];

            matchesToCreate.push({
              status: 'SCHEDULED',
              bracketStage: BracketStage.GROUP_STAGE,
              roundLabel: 'Group Stage',
              tournament: { connect: { id: tournamentId } },
              tournamentCategory: { connect: { id: category.id } },
              createdBy: { connect: { id: actorUserId } },
              teams: {
                create: [
                  {
                    side: TeamSide.A,
                    player1: { connect: { id: teamA.player1Id } },
                    player2: { connect: { id: teamA.player2Id } },
                    teamAverageElo: this.calculateTeamAverage(teamA.player1.currentElo, teamA.player2.currentElo),
                  },
                  {
                    side: TeamSide.B,
                    player1: { connect: { id: teamB.player1Id } },
                    player2: { connect: { id: teamB.player2Id } },
                    teamAverageElo: this.calculateTeamAverage(teamB.player1.currentElo, teamB.player2.currentElo),
                  },
                ],
              },
            });
          }
        }
      }

      for (const matchInput of matchesToCreate) {
        await this.prisma.match.create({ data: matchInput });
      }

      createdMatches.push({ categoryId: category.id, count: matchesToCreate.length });
    }

    await this.prisma.auditLog.create({
      data: {
        actorUserId,
        action: 'tournament.draw.generate',
        entityType: 'Tournament',
        entityId: tournamentId,
        context: createdMatches,
      },
    });

    return {
      tournamentId,
      createdMatches,
    };
  }

  private async ensureTournamentExists(id: string) {
    const tournament = await this.prisma.tournament.findUnique({ where: { id }, select: { id: true } });
    if (!tournament) {
      throw new NotFoundException('Tournament not found');
    }
  }

  private calculateTeamAverage(ratingOne: number, ratingTwo: number): number {
    return Math.round((ratingOne + ratingTwo) / 2);
  }

  private pickInitialStage(teamCount: number): BracketStage {
    if (teamCount >= 32) {
      return BracketStage.ROUND_OF_32;
    }
    if (teamCount >= 16) {
      return BracketStage.ROUND_OF_16;
    }
    if (teamCount >= 8) {
      return BracketStage.QUARTERFINAL;
    }
    if (teamCount >= 4) {
      return BracketStage.SEMIFINAL;
    }
    return BracketStage.FINAL;
  }
}
