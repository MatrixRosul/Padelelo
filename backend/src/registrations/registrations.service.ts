import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { GenderEligibility, RegistrationStatus, UserRole } from '@prisma/client';

import { JwtPayload } from '../common/types/jwt-payload.type';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterTournamentDto } from './dto/register-tournament.dto';

@Injectable()
export class RegistrationsService {
  constructor(private readonly prisma: PrismaService) {}

  async registerTeam(tournamentId: string, dto: RegisterTournamentDto, actor: JwtPayload) {
    if (dto.player1Id === dto.player2Id) {
      throw new BadRequestException('A team must have two distinct players');
    }

    const tournament = await this.prisma.tournament.findUnique({
      where: { id: tournamentId },
      include: {
        categories: true,
      },
    });

    if (!tournament) {
      throw new NotFoundException('Tournament not found');
    }

    if (tournament.registrationStatus !== 'OPEN') {
      throw new BadRequestException('Tournament registration is closed');
    }

    const category = tournament.categories.find((item) => item.id === dto.categoryId);
    if (!category) {
      throw new NotFoundException('Tournament category not found');
    }

    const players = await this.prisma.playerProfile.findMany({
      where: { id: { in: [dto.player1Id, dto.player2Id] } },
      include: { user: { select: { id: true, role: true } } },
    });

    if (players.length !== 2) {
      throw new NotFoundException('Both players are required');
    }

    if (actor.role === UserRole.PLAYER) {
      const playerUserIds = players.map((player) => player.userId);
      if (!playerUserIds.includes(actor.sub)) {
        throw new ForbiddenException('Player can only register a team containing themselves');
      }
    }

    this.validateCategoryEligibility(category, players[0], players[1]);

    const [player1Id, player2Id] = [dto.player1Id, dto.player2Id].sort();

    const existingTeam = await this.prisma.tournamentTeam.findUnique({
      where: {
        tournamentCategoryId_player1Id_player2Id: {
          tournamentCategoryId: category.id,
          player1Id,
          player2Id,
        },
      },
    });

    if (existingTeam) {
      throw new BadRequestException('This team is already registered in the category');
    }

    const currentRegistrations = await this.prisma.tournamentRegistration.count({
      where: {
        tournamentCategoryId: category.id,
        status: { in: [RegistrationStatus.CONFIRMED, RegistrationStatus.PENDING] },
      },
    });

    const status =
      currentRegistrations >= category.maxParticipants
        ? RegistrationStatus.WAITLISTED
        : RegistrationStatus.CONFIRMED;

    const result = await this.prisma.$transaction(async (tx) => {
      const team = await tx.tournamentTeam.create({
        data: {
          tournamentCategoryId: category.id,
          player1Id,
          player2Id,
          isWildCard: dto.isWildCard ?? false,
          seedNumber: dto.seedNumber,
        },
      });

      const registration = await tx.tournamentRegistration.create({
        data: {
          tournamentId,
          tournamentCategoryId: category.id,
          teamId: team.id,
          status,
        },
        include: {
          team: {
            include: {
              player1: true,
              player2: true,
            },
          },
        },
      });

      await tx.auditLog.create({
        data: {
          actorUserId: actor.sub,
          action: 'registration.create',
          entityType: 'TournamentRegistration',
          entityId: registration.id,
          context: {
            tournamentId,
            categoryId: category.id,
            teamId: team.id,
            status,
          },
        },
      });

      return registration;
    });

    return result;
  }

  async listTournamentRegistrations(tournamentId: string) {
    const tournament = await this.prisma.tournament.findUnique({ where: { id: tournamentId }, select: { id: true } });
    if (!tournament) {
      throw new NotFoundException('Tournament not found');
    }

    return this.prisma.tournamentRegistration.findMany({
      where: { tournamentId },
      include: {
        tournamentCategory: true,
        team: {
          include: {
            player1: true,
            player2: true,
          },
        },
      },
      orderBy: [{ createdAt: 'asc' }],
    });
  }

  private validateCategoryEligibility(
    category: {
      genderEligibility: GenderEligibility;
      rankingMin: number | null;
      rankingMax: number | null;
      ageMin: number | null;
      ageMax: number | null;
    },
    playerOne: {
      currentElo: number;
      gender: 'MALE' | 'FEMALE' | 'OTHER' | 'UNDISCLOSED' | null;
      birthDate: Date | null;
    },
    playerTwo: {
      currentElo: number;
      gender: 'MALE' | 'FEMALE' | 'OTHER' | 'UNDISCLOSED' | null;
      birthDate: Date | null;
    },
  ) {
    if (category.rankingMin !== null && (playerOne.currentElo < category.rankingMin || playerTwo.currentElo < category.rankingMin)) {
      throw new BadRequestException('Team does not meet minimum ranking requirement');
    }

    if (category.rankingMax !== null && (playerOne.currentElo > category.rankingMax || playerTwo.currentElo > category.rankingMax)) {
      throw new BadRequestException('Team exceeds maximum ranking restriction');
    }

    if (category.genderEligibility === GenderEligibility.MALE) {
      if (playerOne.gender !== 'MALE' || playerTwo.gender !== 'MALE') {
        throw new BadRequestException('Category allows only male teams');
      }
    }

    if (category.genderEligibility === GenderEligibility.FEMALE) {
      if (playerOne.gender !== 'FEMALE' || playerTwo.gender !== 'FEMALE') {
        throw new BadRequestException('Category allows only female teams');
      }
    }

    if (category.genderEligibility === GenderEligibility.MIXED_ONLY) {
      const genders = [playerOne.gender, playerTwo.gender];
      const hasMale = genders.includes('MALE');
      const hasFemale = genders.includes('FEMALE');
      if (!hasMale || !hasFemale) {
        throw new BadRequestException('Mixed category requires one male and one female player');
      }
    }

    if (category.ageMin !== null || category.ageMax !== null) {
      const ages = [playerOne.birthDate, playerTwo.birthDate].map((birthDate) =>
        birthDate ? this.calculateAge(birthDate) : null,
      );

      if (ages.some((age) => age === null)) {
        throw new BadRequestException('Both players must have birth date for age-restricted category');
      }

      if (category.ageMin !== null && ages.some((age) => (age ?? 0) < category.ageMin!)) {
        throw new BadRequestException('Team does not meet minimum age requirement');
      }

      if (category.ageMax !== null && ages.some((age) => (age ?? 0) > category.ageMax!)) {
        throw new BadRequestException('Team exceeds maximum age requirement');
      }
    }
  }

  private calculateAge(birthDate: Date): number {
    const now = new Date();
    let age = now.getFullYear() - birthDate.getFullYear();
    const monthDiff = now.getMonth() - birthDate.getMonth();

    if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birthDate.getDate())) {
      age -= 1;
    }

    return age;
  }
}
