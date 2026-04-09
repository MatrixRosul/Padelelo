import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { GenderEligibility, RegistrationStatus, TournamentStatus, UserRole } from '@prisma/client';

import { JwtPayload } from '../common/types/jwt-payload.type';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterTournamentDto } from './dto/register-tournament.dto';

@Injectable()
export class RegistrationsService {
  constructor(private readonly prisma: PrismaService) {}

  async registerTeam(tournamentId: string, dto: RegisterTournamentDto, actor: JwtPayload) {
    const usesLegacyTeamFlow = Boolean(dto.categoryId || dto.player1Id || dto.player2Id);
    if (usesLegacyTeamFlow) {
      return this.registerLegacyTeam(tournamentId, dto, actor);
    }

    return this.registerPlayer(tournamentId, dto, actor);
  }

  async unregisterPlayer(tournamentId: string, actor: JwtPayload) {
    if (actor.role !== UserRole.PLAYER) {
      throw new BadRequestException('Admins must use explicit player management endpoints');
    }

    await this.ensureRegistrationMutationAllowed(tournamentId);
    const player = await this.resolveRegistrationPlayer(undefined, actor);

    const registration = await this.prisma.tournamentRegistration.findFirst({
      where: {
        tournamentId,
        playerId: player.id,
        status: {
          in: [RegistrationStatus.PENDING, RegistrationStatus.CONFIRMED, RegistrationStatus.WAITLISTED],
        },
      },
      select: {
        id: true,
      },
    });

    if (!registration) {
      throw new NotFoundException('Registration not found');
    }

    const updated = await this.prisma.tournamentRegistration.update({
      where: { id: registration.id },
      data: {
        status: RegistrationStatus.CANCELLED,
      },
      include: {
        player: true,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        actorUserId: actor.sub,
        action: 'registration.player.cancel',
        entityType: 'TournamentRegistration',
        entityId: registration.id,
        context: {
          tournamentId,
          playerId: player.id,
        },
      },
    });

    return updated;
  }

  async adminAddPlayer(tournamentId: string, playerId: string, actor: JwtPayload) {
    await this.ensureAdminRegistrationMutationAllowed(tournamentId);
    return this.registerPlayer(tournamentId, { playerId }, actor, { adminOverride: true });
  }

  async adminRemovePlayer(tournamentId: string, playerId: string, actor: JwtPayload) {
    await this.ensureAdminRegistrationMutationAllowed(tournamentId);

    const registration = await this.prisma.tournamentRegistration.findFirst({
      where: {
        tournamentId,
        playerId,
        status: {
          in: [RegistrationStatus.PENDING, RegistrationStatus.CONFIRMED, RegistrationStatus.WAITLISTED],
        },
      },
      select: {
        id: true,
      },
    });

    if (!registration) {
      throw new NotFoundException('Registration not found');
    }

    const updated = await this.prisma.tournamentRegistration.update({
      where: { id: registration.id },
      data: {
        status: RegistrationStatus.CANCELLED,
      },
      include: {
        player: true,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        actorUserId: actor.sub,
        action: 'registration.admin.remove-player',
        entityType: 'TournamentRegistration',
        entityId: registration.id,
        context: {
          tournamentId,
          playerId,
        },
      },
    });

    return updated;
  }

  async adminConfirmPlayer(tournamentId: string, playerId: string, actor: JwtPayload) {
    const tournament = await this.ensureAdminRegistrationMutationAllowed(tournamentId);

    const registration = await this.prisma.tournamentRegistration.findFirst({
      where: {
        tournamentId,
        playerId,
        status: {
          in: [RegistrationStatus.PENDING, RegistrationStatus.WAITLISTED],
        },
      },
      select: {
        id: true,
        status: true,
      },
    });

    if (!registration) {
      throw new NotFoundException('Pending registration not found');
    }

    if (registration.status === RegistrationStatus.WAITLISTED) {
      const confirmedPlayersCount = await this.prisma.tournamentRegistration.count({
        where: {
          tournamentId,
          playerId: {
            not: null,
          },
          status: RegistrationStatus.CONFIRMED,
        },
      });

      if (confirmedPlayersCount >= tournament.maxPlayers) {
        throw new BadRequestException('Cannot confirm waitlisted player: max players limit reached');
      }
    }

    const updated = await this.prisma.tournamentRegistration.update({
      where: { id: registration.id },
      data: {
        status: RegistrationStatus.CONFIRMED,
      },
      include: {
        player: true,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        actorUserId: actor.sub,
        action: 'registration.admin.confirm-player',
        entityType: 'TournamentRegistration',
        entityId: registration.id,
        context: {
          tournamentId,
          playerId,
        },
      },
    });

    return updated;
  }

  private async registerPlayer(
    tournamentId: string,
    dto: RegisterTournamentDto,
    actor: JwtPayload,
    options?: { adminOverride?: boolean },
  ) {
    const tournament = await this.prisma.tournament.findUnique({
      where: { id: tournamentId },
      select: {
        id: true,
        status: true,
        registrationStatus: true,
        registrationCloseAt: true,
        maxPlayers: true,
      },
    });

    if (!tournament) {
      throw new NotFoundException('Tournament not found');
    }

    const canRegister = this.isRegistrationOpen(
      tournament.status,
      tournament.registrationStatus,
      tournament.registrationCloseAt,
    );
    const adminOverride = options?.adminOverride === true && actor.role === UserRole.ADMIN;

    if (!canRegister && !adminOverride) {
      if (this.isRegistrationDeadlinePassed(tournament.registrationCloseAt)) {
        throw new BadRequestException('Tournament registration deadline has passed');
      }

      throw new BadRequestException('Tournament registration is closed');
    }

    const player = await this.resolveRegistrationPlayer(dto.playerId, actor);

    const existingRegistration = await this.prisma.tournamentRegistration.findFirst({
      where: {
        tournamentId,
        playerId: player.id,
        status: {
          in: [RegistrationStatus.PENDING, RegistrationStatus.CONFIRMED, RegistrationStatus.WAITLISTED],
        },
      },
      select: { id: true },
    });

    if (existingRegistration) {
      throw new BadRequestException('Player is already registered for this tournament');
    }

    const activeRegistrations = await this.prisma.tournamentRegistration.count({
      where: {
        tournamentId,
        playerId: {
          not: null,
        },
        status: {
          in: [RegistrationStatus.PENDING, RegistrationStatus.CONFIRMED],
        },
      },
    });

    const status =
      activeRegistrations >= tournament.maxPlayers
        ? adminOverride
          ? RegistrationStatus.PENDING
          : RegistrationStatus.WAITLISTED
        : RegistrationStatus.PENDING;

    const registration = await this.prisma.tournamentRegistration.create({
      data: {
        tournamentId,
        playerId: player.id,
        status,
      },
      include: {
        player: true,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        actorUserId: actor.sub,
        action: 'registration.player.create',
        entityType: 'TournamentRegistration',
        entityId: registration.id,
        context: {
          tournamentId,
          playerId: player.id,
          status,
        },
      },
    });

    return registration;
  }

  private async registerLegacyTeam(tournamentId: string, dto: RegisterTournamentDto, actor: JwtPayload) {
    if (!dto.categoryId || !dto.player1Id || !dto.player2Id) {
      throw new BadRequestException('Legacy team registration requires categoryId, player1Id and player2Id');
    }

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

    if (!this.isRegistrationOpen(tournament.status, tournament.registrationStatus, tournament.registrationCloseAt)) {
      if (this.isRegistrationDeadlinePassed(tournament.registrationCloseAt)) {
        throw new BadRequestException('Tournament registration deadline has passed');
      }

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
        : RegistrationStatus.PENDING;

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
        player: true,
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

  private async ensureRegistrationMutationAllowed(tournamentId: string) {
    const tournament = await this.prisma.tournament.findUnique({
      where: { id: tournamentId },
      select: {
        id: true,
        status: true,
        registrationStatus: true,
        registrationCloseAt: true,
        maxPlayers: true,
      },
    });

    const blockedStatuses: TournamentStatus[] = [
      TournamentStatus.READY,
      TournamentStatus.REGISTRATION_CLOSED,
      TournamentStatus.IN_PROGRESS,
      TournamentStatus.FINISHED,
      TournamentStatus.COMPLETED,
      TournamentStatus.CANCELLED,
    ];

    if (!tournament) {
      throw new NotFoundException('Tournament not found');
    }

    if (blockedStatuses.includes(tournament.status)) {
      throw new BadRequestException('Registration changes are blocked after registration is closed');
    }

    if (!this.isRegistrationOpen(tournament.status, tournament.registrationStatus, tournament.registrationCloseAt)) {
      if (this.isRegistrationDeadlinePassed(tournament.registrationCloseAt)) {
        throw new BadRequestException('Tournament registration deadline has passed');
      }

      throw new BadRequestException('Tournament registration is closed');
    }

    return tournament;
  }

  private async ensureAdminRegistrationMutationAllowed(tournamentId: string) {
    const tournament = await this.prisma.tournament.findUnique({
      where: { id: tournamentId },
      select: {
        id: true,
        status: true,
        registrationStatus: true,
        registrationCloseAt: true,
        maxPlayers: true,
      },
    });

    const blockedStatuses: TournamentStatus[] = [
      TournamentStatus.IN_PROGRESS,
      TournamentStatus.FINISHED,
      TournamentStatus.COMPLETED,
      TournamentStatus.CANCELLED,
    ];

    if (!tournament) {
      throw new NotFoundException('Tournament not found');
    }

    if (blockedStatuses.includes(tournament.status)) {
      throw new BadRequestException('Registration changes are blocked after tournament start');
    }

    return tournament;
  }

  private async resolveRegistrationPlayer(playerId: string | undefined, actor: JwtPayload) {
    if (playerId) {
      const profile = await this.prisma.playerProfile.findUnique({
        where: { id: playerId },
        select: {
          id: true,
          userId: true,
        },
      });

      if (!profile) {
        throw new NotFoundException('Player not found');
      }

      if (actor.role === UserRole.PLAYER && profile.userId !== actor.sub) {
        throw new ForbiddenException('Player can only register themselves');
      }

      return profile;
    }

    if (actor.role !== UserRole.PLAYER) {
      throw new BadRequestException('playerId is required for admin registration');
    }

    const ownProfile = await this.prisma.playerProfile.findUnique({
      where: { userId: actor.sub },
      select: {
        id: true,
        userId: true,
      },
    });

    if (!ownProfile) {
      throw new NotFoundException('Current user does not have a player profile');
    }

    return ownProfile;
  }

  private isRegistrationOpen(
    status: TournamentStatus,
    registrationStatus: 'OPEN' | 'CLOSED',
    registrationCloseAt?: Date | null,
  ): boolean {
    const openStatuses: TournamentStatus[] = [
      TournamentStatus.REGISTRATION,
      TournamentStatus.REGISTRATION_OPEN,
      TournamentStatus.PUBLISHED,
      TournamentStatus.CREATED,
    ];

    return (
      registrationStatus === 'OPEN' &&
      !this.isRegistrationDeadlinePassed(registrationCloseAt) &&
      openStatuses.includes(status)
    );
  }

  private isRegistrationDeadlinePassed(registrationCloseAt?: Date | null): boolean {
    if (!registrationCloseAt) {
      return false;
    }

    return registrationCloseAt.getTime() <= Date.now();
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
