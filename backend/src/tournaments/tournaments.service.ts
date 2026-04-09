import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  BracketStage,
  MatchResultSource,
  MatchStatus,
  Prisma,
  RegistrationStatus,
  TeamSide,
  TournamentScoringMode,
  TournamentRoundType,
  TournamentStatus,
  TournamentType,
  UserRole,
} from '@prisma/client';

import { SubmitMatchResultDto } from '../matches/dto/submit-match-result.dto';
import { MatchesService } from '../matches/matches.service';
import { PrismaService } from '../prisma/prisma.service';
import { RatingsService } from '../ratings/ratings.service';
import { ApiTournamentType, CreateTournamentDto } from './dto/create-tournament.dto';
import { StartTournamentDto } from './dto/start-tournament.dto';
import { UpdateTournamentDto } from './dto/update-tournament.dto';

type EnginePlayer = {
  id: string;
  currentElo: number;
  isBye: boolean;
  label: string;
};

type TeamSeed = {
  player1Id: string;
  player2Id: string;
};

type StandingAccumulator = {
  playerId: string;
  points: number;
  wins: number;
  losses: number;
  gamesWon: number;
  gamesLost: number;
  gameDifference: number;
};

type ResolvedScoringConfig = {
  scoringMode: TournamentScoringMode;
  pointsToWin: number;
  setsToWin: number;
};

const AMERICANO_PAIRING_VARIANTS: Array<{
  teamA: [number, number];
  teamB: [number, number];
}> = [
  { teamA: [0, 1], teamB: [2, 3] },
  { teamA: [0, 2], teamB: [1, 3] },
  { teamA: [0, 3], teamB: [1, 2] },
];

const READONLY_AFTER_START_STATUSES: TournamentStatus[] = [
  TournamentStatus.IN_PROGRESS,
  TournamentStatus.FINISHED,
  TournamentStatus.COMPLETED,
  TournamentStatus.CANCELLED,
];

@Injectable()
export class TournamentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly matchesService: MatchesService,
    private readonly ratingsService: RatingsService,
  ) {}

  async createTournament(dto: CreateTournamentDto, actorUserId: string) {
    const startDate = dto.startDate ?? dto.date;
    const endDate = dto.endDate ?? dto.date;
    const type = this.normalizeTournamentType(dto.type);
    const shouldOpenRegistration = dto.openRegistration ?? true;

    if (type === TournamentType.AMERICANO && dto.maxPlayers % 4 !== 0) {
      throw new BadRequestException('For AMERICANO tournaments maxPlayers must be a multiple of 4');
    }

    const scoringConfig = this.resolveScoringConfig({
      type,
      scoringMode: dto.scoringMode,
      pointsToWin: dto.pointsToWin,
      setsToWin: dto.setsToWin,
    });

    if (startDate > endDate) {
      throw new BadRequestException('Tournament startDate must be before or equal to endDate');
    }

    const registrationCloseAt = dto.registrationCloseAt ?? startDate;
    if (registrationCloseAt > startDate) {
      throw new BadRequestException('Registration deadline must be before tournament start');
    }

    const club = dto.clubId
      ? await this.prisma.club.findUnique({
          where: { id: dto.clubId },
          select: {
            id: true,
            name: true,
            city: true,
            address: true,
            courtsCount: true,
            isActive: true,
          },
        })
      : null;

    if (dto.clubId && (!club || !club.isActive)) {
      throw new BadRequestException('Selected club is not available');
    }

    const courtsCount = dto.courtsCount ?? club?.courtsCount ?? 1;

    const slugBase = dto.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');

    const slug = `${slugBase}-${Date.now()}`;

    const tournament = await this.prisma.tournament.create({
      data: {
        name: dto.name,
        type,
        date: dto.date,
        courtsCount,
        maxPlayers: dto.maxPlayers,
        scoringMode: scoringConfig.scoringMode,
        pointsToWin: scoringConfig.pointsToWin,
        setsToWin: scoringConfig.setsToWin,
        slug,
        description: dto.description,
        location: dto.location ?? this.composeTournamentLocationFromClub(club),
        clubId: club?.id,
        startDate,
        endDate,
        status: shouldOpenRegistration ? TournamentStatus.REGISTRATION : TournamentStatus.DRAFT,
        registrationStatus: shouldOpenRegistration ? 'OPEN' : 'CLOSED',
        registrationOpenAt: shouldOpenRegistration ? new Date() : null,
        registrationCloseAt,
        createdByUserId: actorUserId,
        categories: dto.categories?.length
          ? {
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
            }
          : undefined,
      },
      include: {
        categories: true,
        club: true,
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
      include: {
        categories: true,
        club: true,
        _count: {
          select: {
            registrations: true,
            rounds: true,
            matches: true,
          },
        },
      },
      orderBy: [{ date: 'desc' }, { startDate: 'desc' }],
    });
  }

  async getTournamentById(id: string) {
    const tournament = await this.prisma.tournament.findUnique({
      where: { id },
      include: {
        club: true,
        categories: true,
        groups: {
          orderBy: [{ order: 'asc' }],
          include: {
            players: {
              orderBy: [{ seed: 'asc' }],
              include: {
                player: {
                  select: {
                    id: true,
                    fullName: true,
                    displayName: true,
                    nickname: true,
                    currentElo: true,
                  },
                },
              },
            },
          },
        },
        rounds: {
          orderBy: [{ order: 'asc' }],
        },
      },
    });

    if (!tournament) {
      throw new NotFoundException('Tournament not found');
    }

    return tournament;
  }

  async updateTournament(id: string, dto: UpdateTournamentDto, actorUserId: string) {
    const existing = await this.prisma.tournament.findUnique({
      where: { id },
      select: {
        id: true,
        type: true,
        status: true,
        startDate: true,
        endDate: true,
        maxPlayers: true,
        scoringMode: true,
        pointsToWin: true,
        setsToWin: true,
        _count: {
          select: {
            rounds: true,
          },
        },
      },
    });

    if (!existing) {
      throw new NotFoundException('Tournament not found');
    }

    if (READONLY_AFTER_START_STATUSES.includes(existing.status)) {
      throw new BadRequestException('Tournament cannot be edited after it has started');
    }

    const resolvedType = dto.type !== undefined ? this.normalizeTournamentType(dto.type) : existing.type;
    const nextMaxPlayers = dto.maxPlayers ?? existing.maxPlayers;

    if (resolvedType === TournamentType.AMERICANO && nextMaxPlayers % 4 !== 0) {
      throw new BadRequestException('For AMERICANO tournaments maxPlayers must be a multiple of 4');
    }

    const scoringConfig = this.resolveScoringConfig({
      type: resolvedType,
      scoringMode: dto.scoringMode ?? existing.scoringMode,
      pointsToWin: dto.pointsToWin ?? existing.pointsToWin,
      setsToWin: dto.setsToWin ?? existing.setsToWin,
    });

    const touchesScheduleOrFormat =
      dto.type !== undefined ||
      dto.date !== undefined ||
      dto.startDate !== undefined ||
      dto.endDate !== undefined ||
      dto.courtsCount !== undefined ||
      dto.maxPlayers !== undefined ||
      dto.scoringMode !== undefined ||
      dto.pointsToWin !== undefined ||
      dto.setsToWin !== undefined;

    if (existing._count.rounds > 0 && touchesScheduleOrFormat) {
      throw new BadRequestException('Cannot change schedule/format after rounds were generated');
    }

    if (dto.status && READONLY_AFTER_START_STATUSES.includes(dto.status)) {
      throw new BadRequestException('Use start/cancel/result flow instead of manually forcing terminal statuses');
    }

    const nextStart = dto.startDate ?? dto.date ?? existing.startDate;
    const nextEnd = dto.endDate ?? dto.date ?? existing.endDate;

    if (nextStart > nextEnd) {
      throw new BadRequestException('Tournament startDate must be before or equal to endDate');
    }

    const nextRegistrationCloseAt = dto.registrationCloseAt ?? null;
    if (nextRegistrationCloseAt && nextRegistrationCloseAt > nextStart) {
      throw new BadRequestException('Registration deadline must be before tournament start');
    }

    const updateData: Prisma.TournamentUpdateInput = {};

    if (dto.name !== undefined) {
      updateData.name = dto.name;
    }

    if (dto.type !== undefined) {
      updateData.type = resolvedType;
    }

    if (dto.date !== undefined) {
      updateData.date = dto.date;
      if (dto.startDate === undefined) {
        updateData.startDate = dto.date;
      }
      if (dto.endDate === undefined) {
        updateData.endDate = dto.date;
      }
    }

    if (dto.courtsCount !== undefined) {
      updateData.courtsCount = dto.courtsCount;
    }

    if (dto.maxPlayers !== undefined) {
      updateData.maxPlayers = dto.maxPlayers;
    }

    if (
      dto.type !== undefined ||
      dto.scoringMode !== undefined ||
      dto.pointsToWin !== undefined ||
      dto.setsToWin !== undefined
    ) {
      updateData.scoringMode = scoringConfig.scoringMode;
      updateData.pointsToWin = scoringConfig.pointsToWin;
      updateData.setsToWin = scoringConfig.setsToWin;
    }

    if (dto.description !== undefined) {
      updateData.description = dto.description;
    }

    if (dto.location !== undefined) {
      updateData.location = dto.location;
    }

    if (dto.clubId !== undefined) {
      const club = await this.prisma.club.findUnique({
        where: { id: dto.clubId },
        select: {
          id: true,
          name: true,
          city: true,
          address: true,
          courtsCount: true,
          isActive: true,
        },
      });

      if (!club || !club.isActive) {
        throw new BadRequestException('Selected club is not available');
      }

      updateData.club = { connect: { id: club.id } };

      if (dto.location === undefined) {
        updateData.location = this.composeTournamentLocationFromClub(club);
      }

      if (dto.courtsCount === undefined) {
        updateData.courtsCount = club.courtsCount;
      }
    }

    if (dto.startDate !== undefined) {
      updateData.startDate = dto.startDate;
    }

    if (dto.endDate !== undefined) {
      updateData.endDate = dto.endDate;
    }

    if (dto.registrationCloseAt !== undefined) {
      updateData.registrationCloseAt = dto.registrationCloseAt;
    }

    if (dto.status !== undefined) {
      updateData.status = dto.status;
    }

    if (dto.registrationStatus !== undefined) {
      updateData.registrationStatus = dto.registrationStatus;
    }

    const tournament = await this.prisma.tournament.update({
      where: { id },
      data: updateData,
      include: {
        categories: true,
        club: true,
      },
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
    const current = await this.requireTournamentState(id);

    if (READONLY_AFTER_START_STATUSES.includes(current.status)) {
      throw new BadRequestException('Tournament cannot be published after it has started');
    }

    const tournament = await this.prisma.tournament.update({
      where: { id },
      data: {
        status: TournamentStatus.REGISTRATION,
        registrationStatus: 'OPEN',
        registrationOpenAt: new Date(),
        registrationCloseAt: current.registrationCloseAt ?? current.startDate,
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
    const current = await this.requireTournamentState(id);

    if (READONLY_AFTER_START_STATUSES.includes(current.status)) {
      throw new BadRequestException('Tournament registration cannot be opened after it has started');
    }

    const tournament = await this.prisma.tournament.update({
      where: { id },
      data: {
        status: TournamentStatus.REGISTRATION,
        registrationStatus: 'OPEN',
        registrationOpenAt: new Date(),
        registrationCloseAt: current.registrationCloseAt ?? current.startDate,
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
    const current = await this.requireTournamentState(id);

    if (READONLY_AFTER_START_STATUSES.includes(current.status)) {
      throw new BadRequestException('Tournament registration cannot be closed after it has started');
    }

    const tournament = await this.prisma.tournament.update({
      where: { id },
      data: {
        status: TournamentStatus.READY,
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

  async startTournament(
    tournamentId: string,
    actorUserId: string,
    startConfig?: StartTournamentDto,
  ) {
    const tournament = await this.requireTournamentState(tournamentId);
    const scoringConfig = this.resolveScoringConfig({
      type: tournament.type,
      scoringMode: startConfig?.scoringMode ?? tournament.scoringMode,
      pointsToWin: startConfig?.pointsToWin ?? tournament.pointsToWin,
      setsToWin: startConfig?.setsToWin ?? tournament.setsToWin,
    });

    const startableStatuses: TournamentStatus[] = [
      TournamentStatus.READY,
      TournamentStatus.REGISTRATION_CLOSED,
      TournamentStatus.REGISTRATION,
      TournamentStatus.REGISTRATION_OPEN,
      TournamentStatus.PUBLISHED,
      TournamentStatus.CREATED,
      TournamentStatus.DRAFT,
    ];

    if (READONLY_AFTER_START_STATUSES.includes(tournament.status)) {
      throw new BadRequestException('Tournament cannot be started from its current status');
    }

    if (!startableStatuses.includes(tournament.status)) {
      throw new BadRequestException('Tournament cannot be started from its current status');
    }

    const needsStateUpdate =
      tournament.status !== TournamentStatus.READY || tournament.registrationStatus !== 'CLOSED';
    const needsScoringUpdate =
      tournament.scoringMode !== scoringConfig.scoringMode ||
      tournament.pointsToWin !== scoringConfig.pointsToWin ||
      tournament.setsToWin !== scoringConfig.setsToWin;

    if (needsStateUpdate || needsScoringUpdate) {
      await this.prisma.tournament.update({
        where: { id: tournamentId },
        data: {
          status: TournamentStatus.READY,
          registrationStatus: 'CLOSED',
          registrationCloseAt: tournament.registrationCloseAt ?? new Date(),
          scoringMode: scoringConfig.scoringMode,
          pointsToWin: scoringConfig.pointsToWin,
          setsToWin: scoringConfig.setsToWin,
        },
      });
    }

    return this.generateTournament(tournamentId, actorUserId);
  }

  async restartTournament(tournamentId: string, actorUserId: string) {
    const tournament = await this.requireTournamentState(tournamentId);
    const restartableStatuses: TournamentStatus[] = [
      TournamentStatus.READY,
      TournamentStatus.REGISTRATION_CLOSED,
      TournamentStatus.IN_PROGRESS,
    ];

    if (!restartableStatuses.includes(tournament.status)) {
      throw new BadRequestException(
        'Tournament can be restarted only from READY or IN_PROGRESS (without results)',
      );
    }

    if (tournament.status === TournamentStatus.IN_PROGRESS) {
      const completedMatches = await this.prisma.match.count({
        where: {
          tournamentId,
          status: MatchStatus.COMPLETED,
        },
      });

      if (completedMatches > 0) {
        throw new BadRequestException('Tournament cannot be restarted after match results are submitted');
      }
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.match.deleteMany({
        where: {
          tournamentId,
        },
      });

      await tx.tournamentStanding.deleteMany({
        where: {
          tournamentId,
        },
      });

      await tx.tournamentRound.deleteMany({
        where: {
          tournamentId,
        },
      });

      await tx.tournamentGroupPlayer.deleteMany({
        where: {
          tournamentId,
        },
      });

      await tx.tournamentGroup.deleteMany({
        where: {
          tournamentId,
        },
      });

      await tx.tournament.update({
        where: { id: tournamentId },
        data: {
          status: TournamentStatus.READY,
          startedAt: null,
          finishedAt: null,
          cancelledAt: null,
          registrationStatus: 'CLOSED',
        },
      });

      await tx.auditLog.create({
        data: {
          actorUserId,
          action: 'tournament.restart',
          entityType: 'Tournament',
          entityId: tournamentId,
        },
      });
    });

    return this.getTournamentById(tournamentId);
  }

  async completeTournament(tournamentId: string, actorUserId: string) {
    const tournament = await this.requireTournamentState(tournamentId);

    if (tournament.status === TournamentStatus.CANCELLED) {
      throw new BadRequestException('Cancelled tournament cannot be completed');
    }

    if (tournament.status === TournamentStatus.COMPLETED) {
      throw new BadRequestException('Tournament is already completed');
    }

    const [roundsCount, pendingMatches] = await Promise.all([
      this.prisma.tournamentRound.count({
        where: {
          tournamentId,
        },
      }),
      this.prisma.match.count({
        where: {
          tournamentId,
          status: MatchStatus.SCHEDULED,
        },
      }),
    ]);

    if (roundsCount === 0) {
      throw new BadRequestException('Tournament has no generated rounds');
    }

    if (pendingMatches > 0) {
      throw new BadRequestException('Complete all matches before tournament completion');
    }

    const unratedCompletedMatches = await this.prisma.match.findMany({
      where: {
        tournamentId,
        status: MatchStatus.COMPLETED,
        isRated: true,
        ratingHistory: {
          none: {},
        },
      },
      select: {
        id: true,
      },
      orderBy: [{ playedAt: 'asc' }, { createdAt: 'asc' }],
    });

    for (const match of unratedCompletedMatches) {
      await this.ratingsService.applyRatingsForMatch(match.id);
    }

    const completed = await this.prisma.tournament.update({
      where: {
        id: tournamentId,
      },
      data: {
        status: TournamentStatus.COMPLETED,
        registrationStatus: 'CLOSED',
        finishedAt: new Date(),
      },
    });

    await this.prisma.auditLog.create({
      data: {
        actorUserId,
        action: 'tournament.complete',
        entityType: 'Tournament',
        entityId: tournamentId,
        context: {
          appliedRatingsMatches: unratedCompletedMatches.length,
        },
      },
    });

    return {
      ...completed,
      appliedRatingsMatches: unratedCompletedMatches.length,
    };
  }

  async cancelTournament(tournamentId: string, actorUserId: string) {
    const tournament = await this.requireTournamentState(tournamentId);
    const terminalStatuses: TournamentStatus[] = [
      TournamentStatus.CANCELLED,
      TournamentStatus.FINISHED,
      TournamentStatus.COMPLETED,
    ];

    if (terminalStatuses.includes(tournament.status)) {
      throw new BadRequestException('Tournament is already finished or cancelled');
    }

    const completedMatches = await this.prisma.match.count({
      where: {
        tournamentId,
        status: MatchStatus.COMPLETED,
      },
    });

    if (completedMatches > 0) {
      throw new BadRequestException('Tournament cannot be cancelled after completed match results exist');
    }

    const updated = await this.prisma.tournament.update({
      where: { id: tournamentId },
      data: {
        status: TournamentStatus.CANCELLED,
        registrationStatus: 'CLOSED',
        cancelledAt: new Date(),
      },
    });

    await this.prisma.auditLog.create({
      data: {
        actorUserId,
        action: 'tournament.cancel',
        entityType: 'Tournament',
        entityId: tournamentId,
      },
    });

    return updated;
  }

  async generateDraw(tournamentId: string, actorUserId: string) {
    return this.generateTournament(tournamentId, actorUserId);
  }

  async generateTournament(tournamentId: string, actorUserId: string) {
    const tournament = await this.prisma.tournament.findUnique({
      where: { id: tournamentId },
      select: {
        id: true,
        type: true,
        status: true,
        registrationStatus: true,
      },
    });

    if (!tournament) {
      throw new NotFoundException('Tournament not found');
    }

    const generationStatuses: TournamentStatus[] = [
      TournamentStatus.READY,
      TournamentStatus.REGISTRATION_CLOSED,
    ];

    if (!generationStatuses.includes(tournament.status) || tournament.registrationStatus !== 'CLOSED') {
      throw new BadRequestException('Close registration before generating rounds');
    }

    const existingRounds = await this.prisma.tournamentRound.count({
      where: { tournamentId },
    });

    if (existingRounds > 0) {
      throw new BadRequestException('Tournament rounds are already generated');
    }

    const registeredPlayers = await this.getRegisteredPlayers(tournamentId);
    if (registeredPlayers.length < 4) {
      throw new BadRequestException('At least 4 registered players are required');
    }

    if (tournament.type === TournamentType.AMERICANO && registeredPlayers.length % 4 !== 0) {
      throw new BadRequestException(
        'AMERICANO requires confirmed players count to be a multiple of 4',
      );
    }

    let generationSummary: { createdRounds: number; createdMatches: number };

    if (tournament.type === TournamentType.AMERICANO) {
      generationSummary = await this.generateAmericanoRounds(
        tournamentId,
        registeredPlayers,
        actorUserId,
      );
    } else if (tournament.type === TournamentType.GROUP_STAGE) {
      const participants = await this.padParticipantsToMultipleOfFour(
        tournamentId,
        registeredPlayers,
      );
      generationSummary = await this.generateGroupStageRounds(
        tournamentId,
        participants,
        actorUserId,
      );
    } else {
      generationSummary = await this.createInitialPlayoffFromParticipants({
        tournamentId,
        participants: registeredPlayers,
        actorUserId,
        roundNumber: 1,
        order: 1,
      });
    }

    await this.prisma.tournament.update({
      where: { id: tournamentId },
      data: {
        status: TournamentStatus.IN_PROGRESS,
        startedAt: new Date(),
        finishedAt: null,
        cancelledAt: null,
      },
    });

    await this.recomputeTournamentStandings(tournamentId);
    await this.tryPromoteGroupStageToPlayoff(tournamentId, actorUserId);
    await this.tryAdvancePlayoffRounds(tournamentId, actorUserId);
    await this.refreshTournamentCompletionStatus(tournamentId);

    await this.prisma.auditLog.create({
      data: {
        actorUserId,
        action: 'tournament.generate',
        entityType: 'Tournament',
        entityId: tournamentId,
        context: {
          type: tournament.type,
          players: registeredPlayers.length,
          ...generationSummary,
        },
      },
    });

    return {
      tournamentId,
      type: tournament.type,
      registeredPlayers: registeredPlayers.length,
      ...generationSummary,
    };
  }

  async submitTournamentMatchResult(
    matchId: string,
    dto: SubmitMatchResultDto,
    actorUserId: string,
  ) {
    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
      select: {
        id: true,
        tournamentId: true,
        tournament: {
          select: {
            id: true,
            type: true,
            status: true,
            scoringMode: true,
            pointsToWin: true,
            setsToWin: true,
          },
        },
      },
    });

    if (!match) {
      throw new NotFoundException('Match not found');
    }

    if (!match.tournamentId || !match.tournament) {
      throw new BadRequestException('This match is not linked to a tournament');
    }

    if (dto.simulate) {
      throw new BadRequestException('Simulation is disabled for tournament matches');
    }

    if (
      match.tournament.status === TournamentStatus.CANCELLED ||
      match.tournament.status === TournamentStatus.COMPLETED
    ) {
      throw new BadRequestException('Match results are locked for completed/cancelled tournament');
    }

    const normalizedSetScores = this.normalizeTournamentSetScores(
      dto.setScores ?? [],
      {
        type: match.tournament.type,
        scoringMode: match.tournament.scoringMode,
        pointsToWin: match.tournament.pointsToWin,
        setsToWin: match.tournament.setsToWin,
      },
    );

    const winnerSide = this.resolveWinnerFromSetScores(normalizedSetScores);
    if (!winnerSide) {
      throw new BadRequestException('Cannot determine winner from provided set scores');
    }

    const result = await this.matchesService.submitResult(
      matchId,
      {
        winnerSide,
        resultSource: dto.resultSource ?? MatchResultSource.MANUAL,
        setScores: normalizedSetScores,
      },
      actorUserId,
      {
        allowOverwrite: true,
      },
    );

    await this.recomputeTournamentStandings(match.tournamentId);

    if (match.tournament.type === TournamentType.GROUP_STAGE) {
      await this.tryPromoteGroupStageToPlayoff(match.tournamentId, actorUserId);
    }

    if (
      match.tournament.type === TournamentType.PLAYOFF ||
      match.tournament.type === TournamentType.GROUP_STAGE
    ) {
      await this.tryAdvancePlayoffRounds(match.tournamentId, actorUserId);
    }

    await this.refreshTournamentCompletionStatus(match.tournamentId);

    const standings = await this.readOrderedStandings(match.tournamentId);

    return {
      ...result,
      standings,
    };
  }

  async getTournamentStandings(tournamentId: string) {
    await this.ensureTournamentExists(tournamentId);
    await this.recomputeTournamentStandings(tournamentId);
    return this.readOrderedStandings(tournamentId);
  }

  async getTournamentRounds(tournamentId: string) {
    await this.ensureTournamentExists(tournamentId);

    const rounds = await this.prisma.tournamentRound.findMany({
      where: { tournamentId },
      orderBy: [{ order: 'asc' }],
      include: {
        matches: {
          orderBy: [{ createdAt: 'asc' }],
          include: {
            group: {
              select: {
                id: true,
                name: true,
              },
            },
            teams: {
              orderBy: [{ side: 'asc' }],
              include: {
                player1: {
                  select: {
                    id: true,
                    fullName: true,
                    displayName: true,
                    nickname: true,
                  },
                },
                player2: {
                  select: {
                    id: true,
                    fullName: true,
                    displayName: true,
                    nickname: true,
                  },
                },
              },
            },
            setScores: {
              orderBy: [{ setNumber: 'asc' }],
            },
          },
        },
      },
    });

    return rounds.map((round) => ({
      id: round.id,
      roundNumber: round.roundNumber,
      type: round.type,
      order: round.order,
      matches: round.matches.map((match) => ({
        id: match.id,
        roundNumber: round.roundNumber,
        status: match.status,
        winnerTeamSide: match.winnerTeamSide,
        isRated: match.isRated,
        scheduledAt: match.scheduledAt,
        playedAt: match.playedAt,
        roundLabel: match.roundLabel,
        scores: match.setScores.map((setScore) => ({
          setNumber: setScore.setNumber,
          teamAScore: setScore.teamAScore,
          teamBScore: setScore.teamBScore,
          tieBreakAScore: setScore.tieBreakAScore,
          tieBreakBScore: setScore.tieBreakBScore,
        })),
        group: match.group
          ? {
              id: match.group.id,
              name: match.group.name,
            }
          : null,
        teams: match.teams.map((team) => ({
          side: team.side,
          players: [
            {
              id: team.player1.id,
              fullName: team.player1.displayName ?? team.player1.fullName,
              nickname: team.player1.nickname,
            },
            {
              id: team.player2.id,
              fullName: team.player2.displayName ?? team.player2.fullName,
              nickname: team.player2.nickname,
            },
          ],
        })),
        players: match.teams.flatMap((team) => [
          {
            id: team.player1.id,
            fullName: team.player1.displayName ?? team.player1.fullName,
            nickname: team.player1.nickname,
          },
          {
            id: team.player2.id,
            fullName: team.player2.displayName ?? team.player2.fullName,
            nickname: team.player2.nickname,
          },
        ]),
      })),
    }));
  }

  async getTournamentMatches(tournamentId: string) {
    await this.ensureTournamentExists(tournamentId);

    return this.prisma.match.findMany({
      where: {
        tournamentId,
      },
      orderBy: [{ createdAt: 'asc' }],
      include: {
        group: true,
        round: true,
        teams: {
          orderBy: [{ side: 'asc' }],
          include: {
            player1: {
              select: {
                id: true,
                fullName: true,
                displayName: true,
              },
            },
            player2: {
              select: {
                id: true,
                fullName: true,
                displayName: true,
              },
            },
          },
        },
        setScores: {
          orderBy: [{ setNumber: 'asc' }],
        },
      },
    });
  }

  async getTournamentRatingChanges(tournamentId: string) {
    await this.ensureTournamentExists(tournamentId);

    const history = await this.prisma.ratingHistory.findMany({
      where: {
        match: {
          tournamentId,
        },
      },
      orderBy: [{ createdAt: 'asc' }],
      include: {
        player: {
          select: {
            id: true,
            fullName: true,
            displayName: true,
            nickname: true,
            currentElo: true,
          },
        },
      },
    });

    const byPlayer = new Map<
      string,
      {
        playerId: string;
        fullName: string;
        nickname: string | null;
        beforeRating: number;
        afterRating: number;
        totalDelta: number;
        matches: number;
        currentElo: number;
      }
    >();

    for (const entry of history) {
      const name = entry.player.displayName ?? entry.player.fullName;
      const existing = byPlayer.get(entry.playerId);

      if (!existing) {
        byPlayer.set(entry.playerId, {
          playerId: entry.playerId,
          fullName: name,
          nickname: entry.player.nickname,
          beforeRating: entry.beforeRating,
          afterRating: entry.afterRating,
          totalDelta: entry.delta,
          matches: 1,
          currentElo: entry.player.currentElo,
        });
        continue;
      }

      existing.afterRating = entry.afterRating;
      existing.totalDelta += entry.delta;
      existing.matches += 1;
      existing.currentElo = entry.player.currentElo;
    }

    return Array.from(byPlayer.values()).sort((a, b) => {
      if (b.totalDelta !== a.totalDelta) {
        return b.totalDelta - a.totalDelta;
      }

      return b.matches - a.matches;
    });
  }

  private async generateAmericanoRounds(
    tournamentId: string,
    participants: EnginePlayer[],
    actorUserId: string,
  ): Promise<{ createdRounds: number; createdMatches: number }> {
    const partnerHistory = new Map<string, number>();
    const opponentHistory = new Map<string, number>();

    let createdRounds = 0;
    let createdMatches = 0;

    const roundCount = Math.max(1, participants.length - 1);

    for (let roundIndex = 0; roundIndex < roundCount; roundIndex += 1) {
      const round = await this.prisma.tournamentRound.create({
        data: {
          tournamentId,
          roundNumber: roundIndex + 1,
          type: TournamentRoundType.AMERICANO,
          order: roundIndex + 1,
        },
      });
      createdRounds += 1;

      const rotated = this.rotateParticipants(participants, roundIndex);
      const groups = this.chunkPlayers(rotated, 4);

      for (const group of groups) {
        if (group.length < 4) {
          continue;
        }

        const selected = this.selectBestAmericanoPairing(group, partnerHistory, opponentHistory);

        const teamA: [EnginePlayer, EnginePlayer] = [
          group[selected.teamA[0]],
          group[selected.teamA[1]],
        ];
        const teamB: [EnginePlayer, EnginePlayer] = [
          group[selected.teamB[0]],
          group[selected.teamB[1]],
        ];

        this.bumpPartnerHistory(partnerHistory, teamA[0], teamA[1]);
        this.bumpPartnerHistory(partnerHistory, teamB[0], teamB[1]);
        this.bumpOpponentHistory(opponentHistory, teamA, teamB);

        if (this.teamContainsBye(teamA) || this.teamContainsBye(teamB)) {
          continue;
        }

        await this.createTournamentMatch({
          tournamentId,
          roundId: round.id,
          roundLabel: `Americano Round ${round.roundNumber}`,
          teamA,
          teamB,
          createdByUserId: actorUserId,
        });
        createdMatches += 1;
      }
    }

    return {
      createdRounds,
      createdMatches,
    };
  }

  private async generateGroupStageRounds(
    tournamentId: string,
    participants: EnginePlayer[],
    actorUserId: string,
  ): Promise<{ createdRounds: number; createdMatches: number }> {
    const sorted = [...participants].sort((a, b) => b.currentElo - a.currentElo);
    const groupCount = Math.max(1, Math.ceil(sorted.length / 4));
    const groups: EnginePlayer[][] = Array.from({ length: groupCount }, () => []);

    sorted.forEach((player, index) => {
      groups[index % groupCount].push(player);
    });

    let globalRoundNumber = 1;
    let globalOrder = 1;
    let createdRounds = 0;
    let createdMatches = 0;

    for (let groupIndex = 0; groupIndex < groups.length; groupIndex += 1) {
      const group = groups[groupIndex];
      if (group.length < 4) {
        continue;
      }

      const groupRecord = await this.prisma.tournamentGroup.create({
        data: {
          tournamentId,
          name: this.groupNameByOrder(groupIndex + 1),
          order: groupIndex + 1,
        },
      });

      const nonByePlayers = group.filter((player) => !player.isBye);
      if (nonByePlayers.length > 0) {
        await this.prisma.tournamentGroupPlayer.createMany({
          data: nonByePlayers.map((player, playerIndex) => ({
            tournamentId,
            groupId: groupRecord.id,
            playerId: player.id,
            seed: playerIndex + 1,
          })),
          skipDuplicates: true,
        });
      }

      for (let phase = 0; phase < AMERICANO_PAIRING_VARIANTS.length; phase += 1) {
        const variant = AMERICANO_PAIRING_VARIANTS[phase];

        const round = await this.prisma.tournamentRound.create({
          data: {
            tournamentId,
            roundNumber: globalRoundNumber,
            type: TournamentRoundType.GROUP,
            order: globalOrder,
          },
        });

        createdRounds += 1;

        const teamA: [EnginePlayer, EnginePlayer] = [
          group[variant.teamA[0]],
          group[variant.teamA[1]],
        ];
        const teamB: [EnginePlayer, EnginePlayer] = [
          group[variant.teamB[0]],
          group[variant.teamB[1]],
        ];

        if (!this.teamContainsBye(teamA) && !this.teamContainsBye(teamB)) {
          await this.createTournamentMatch({
            tournamentId,
            roundId: round.id,
            groupId: groupRecord.id,
            roundLabel: `${groupRecord.name} / Round ${phase + 1}`,
            teamA,
            teamB,
            createdByUserId: actorUserId,
            bracketStage: BracketStage.GROUP_STAGE,
          });
          createdMatches += 1;
        }

        globalRoundNumber += 1;
        globalOrder += 1;
      }
    }

    return {
      createdRounds,
      createdMatches,
    };
  }

  private async createInitialPlayoffFromParticipants(params: {
    tournamentId: string;
    participants: EnginePlayer[];
    actorUserId: string;
    roundNumber: number;
    order: number;
  }): Promise<{ createdRounds: number; createdMatches: number }> {
    const sorted = [...params.participants].sort((a, b) => b.currentElo - a.currentElo);

    if (sorted.length % 2 !== 0) {
      const bye = await this.getOrCreateByePlayers(
        params.tournamentId,
        1,
        new Set(sorted.map((player) => player.id)),
      );
      sorted.push(bye[0]);
    }

    const teamSeeds: TeamSeed[] = [];
    for (let index = 0; index < sorted.length; index += 2) {
      const player1 = sorted[index];
      const player2 = sorted[index + 1];
      if (!player1 || !player2) {
        continue;
      }

      teamSeeds.push({
        player1Id: player1.id,
        player2Id: player2.id,
      });
    }

    return this.createPlayoffRoundFromTeams({
      tournamentId: params.tournamentId,
      teamSeeds,
      actorUserId: params.actorUserId,
      roundNumber: params.roundNumber,
      order: params.order,
    });
  }

  private async createPlayoffRoundFromTeams(params: {
    tournamentId: string;
    teamSeeds: TeamSeed[];
    actorUserId: string;
    roundNumber: number;
    order: number;
  }): Promise<{ createdRounds: number; createdMatches: number }> {
    if (params.teamSeeds.length < 2) {
      return {
        createdRounds: 0,
        createdMatches: 0,
      };
    }

    let expandedTeams = [...params.teamSeeds];
    const targetTeamCount = this.nextPowerOfTwo(expandedTeams.length);

    if (targetTeamCount > expandedTeams.length) {
      const requiredByePlayers = (targetTeamCount - expandedTeams.length) * 2;
      const byePool = await this.getOrCreateByePlayers(
        params.tournamentId,
        requiredByePlayers,
        new Set(expandedTeams.flatMap((team) => [team.player1Id, team.player2Id])),
      );

      for (let index = 0; index < requiredByePlayers; index += 2) {
        expandedTeams.push({
          player1Id: byePool[index].id,
          player2Id: byePool[index + 1].id,
        });
      }
    }

    const playerMap = await this.getPlayerMap(
      expandedTeams.flatMap((team) => [team.player1Id, team.player2Id]),
    );

    const seededTeams = [...expandedTeams].sort(
      (a, b) => this.teamSeedRating(b, playerMap) - this.teamSeedRating(a, playerMap),
    );

    const round = await this.prisma.tournamentRound.create({
      data: {
        tournamentId: params.tournamentId,
        roundNumber: params.roundNumber,
        type: TournamentRoundType.PLAYOFF,
        order: params.order,
      },
    });

    const registeredPlayerIds = await this.getRegisteredPlayerIdSet(params.tournamentId);
    const bracketStage = this.resolvePlayoffBracketStage(seededTeams.length);
    const roundLabel = this.resolvePlayoffRoundLabel(seededTeams.length);

    let createdMatches = 0;

    for (let index = 0; index < seededTeams.length / 2; index += 1) {
      const teamASeed = seededTeams[index];
      const teamBSeed = seededTeams[seededTeams.length - 1 - index];

      if (!teamASeed || !teamBSeed) {
        continue;
      }

      const teamA: [EnginePlayer, EnginePlayer] = [
        this.enginePlayerFromMap(teamASeed.player1Id, playerMap, registeredPlayerIds),
        this.enginePlayerFromMap(teamASeed.player2Id, playerMap, registeredPlayerIds),
      ];
      const teamB: [EnginePlayer, EnginePlayer] = [
        this.enginePlayerFromMap(teamBSeed.player1Id, playerMap, registeredPlayerIds),
        this.enginePlayerFromMap(teamBSeed.player2Id, playerMap, registeredPlayerIds),
      ];

      const teamAIsBye = this.teamContainsBye(teamA);
      const teamBIsBye = this.teamContainsBye(teamB);

      if (teamAIsBye && teamBIsBye) {
        continue;
      }

      const autoWinnerSide =
        teamAIsBye && !teamBIsBye
          ? TeamSide.B
          : teamBIsBye && !teamAIsBye
            ? TeamSide.A
            : undefined;

      await this.createTournamentMatch({
        tournamentId: params.tournamentId,
        roundId: round.id,
        roundLabel,
        teamA,
        teamB,
        createdByUserId: params.actorUserId,
        bracketStage,
        autoWinnerSide,
      });

      createdMatches += 1;
    }

    return {
      createdRounds: 1,
      createdMatches,
    };
  }

  private async createTournamentMatch(params: {
    tournamentId: string;
    roundId: string;
    groupId?: string;
    roundLabel: string;
    teamA: [EnginePlayer, EnginePlayer];
    teamB: [EnginePlayer, EnginePlayer];
    createdByUserId: string;
    bracketStage?: BracketStage;
    autoWinnerSide?: TeamSide;
  }) {
    const teamAHasBye = this.teamContainsBye(params.teamA);
    const teamBHasBye = this.teamContainsBye(params.teamB);
    const isRated = !teamAHasBye && !teamBHasBye;

    const autoWinnerSide = params.autoWinnerSide;
    const status = autoWinnerSide ? MatchStatus.COMPLETED : MatchStatus.SCHEDULED;

    return this.prisma.match.create({
      data: {
        tournamentId: params.tournamentId,
        roundId: params.roundId,
        groupId: params.groupId,
        status,
        resultSource: MatchResultSource.MANUAL,
        scheduledAt: new Date(),
        playedAt: autoWinnerSide ? new Date() : null,
        roundLabel: params.roundLabel,
        bracketStage: params.bracketStage,
        isRated,
        winnerTeamSide: autoWinnerSide,
        createdByUserId: params.createdByUserId,
        teams: {
          create: [
            {
              side: TeamSide.A,
              player1Id: params.teamA[0].id,
              player2Id: params.teamA[1].id,
              teamAverageElo: this.calculateTeamAverage(
                params.teamA[0].currentElo,
                params.teamA[1].currentElo,
              ),
            },
            {
              side: TeamSide.B,
              player1Id: params.teamB[0].id,
              player2Id: params.teamB[1].id,
              teamAverageElo: this.calculateTeamAverage(
                params.teamB[0].currentElo,
                params.teamB[1].currentElo,
              ),
            },
          ],
        },
      },
    });
  }

  private async tryPromoteGroupStageToPlayoff(tournamentId: string, actorUserId: string) {
    const tournament = await this.prisma.tournament.findUnique({
      where: { id: tournamentId },
      select: {
        type: true,
      },
    });

    if (!tournament || tournament.type !== TournamentType.GROUP_STAGE) {
      return;
    }

    const playoffRoundsCount = await this.prisma.tournamentRound.count({
      where: {
        tournamentId,
        type: TournamentRoundType.PLAYOFF,
      },
    });

    if (playoffRoundsCount > 0) {
      return;
    }

    const groups = await this.prisma.tournamentGroup.findMany({
      where: {
        tournamentId,
      },
      orderBy: [{ order: 'asc' }],
      include: {
        players: {
          select: {
            playerId: true,
          },
        },
        matches: {
          include: {
            teams: true,
            setScores: true,
          },
        },
      },
    });

    if (groups.length === 0) {
      return;
    }

    if (
      groups.some((group) =>
        group.matches.some((match) => match.status !== MatchStatus.COMPLETED),
      )
    ) {
      return;
    }

    const qualifiers: string[] = [];

    for (const group of groups) {
      const groupPlayerIds = new Set(group.players.map((item) => item.playerId));
      if (groupPlayerIds.size === 0) {
        continue;
      }

      const ordered = this.computeOrderedStandingsFromMatches(group.matches, groupPlayerIds);
      qualifiers.push(...ordered.slice(0, 2).map((entry) => entry.playerId));
    }

    const uniqueQualifierIds = Array.from(new Set(qualifiers));
    if (uniqueQualifierIds.length < 2) {
      return;
    }

    const playerProfiles = await this.prisma.playerProfile.findMany({
      where: {
        id: {
          in: uniqueQualifierIds,
        },
      },
      select: {
        id: true,
        currentElo: true,
        fullName: true,
      },
    });

    if (playerProfiles.length < 2) {
      return;
    }

    const participants: EnginePlayer[] = playerProfiles.map((profile) => ({
      id: profile.id,
      currentElo: profile.currentElo,
      isBye: false,
      label: profile.fullName,
    }));

    const nextRoundMeta = await this.getNextRoundMeta(tournamentId);

    await this.createInitialPlayoffFromParticipants({
      tournamentId,
      participants,
      actorUserId,
      roundNumber: nextRoundMeta.roundNumber,
      order: nextRoundMeta.order,
    });
  }

  private async tryAdvancePlayoffRounds(tournamentId: string, actorUserId: string) {
    while (true) {
      const playoffRounds = await this.prisma.tournamentRound.findMany({
        where: {
          tournamentId,
          type: TournamentRoundType.PLAYOFF,
        },
        orderBy: [{ order: 'asc' }],
        include: {
          matches: {
            include: {
              teams: true,
            },
          },
        },
      });

      if (playoffRounds.length === 0) {
        return;
      }

      const lastRound = playoffRounds[playoffRounds.length - 1];

      if (lastRound.matches.length === 0) {
        return;
      }

      const allCompleted = lastRound.matches.every(
        (match) => match.status === MatchStatus.COMPLETED,
      );

      if (!allCompleted) {
        return;
      }

      const winners = this.extractWinnerTeams(lastRound.matches);
      if (winners.length <= 1) {
        if (winners.length === 1) {
          await this.prisma.tournament.update({
            where: { id: tournamentId },
            data: {
              status: TournamentStatus.FINISHED,
            },
          });
        }
        return;
      }

      const created = await this.createPlayoffRoundFromTeams({
        tournamentId,
        teamSeeds: winners,
        actorUserId,
        roundNumber: lastRound.roundNumber + 1,
        order: lastRound.order + 1,
      });

      if (created.createdMatches === 0) {
        await this.prisma.tournament.update({
          where: { id: tournamentId },
          data: {
            status: TournamentStatus.FINISHED,
          },
        });
        return;
      }
    }
  }

  private async recomputeTournamentStandings(tournamentId: string) {
    const participants = await this.getRegisteredPlayers(tournamentId);
    const participantIdSet = new Set(participants.map((player) => player.id));

    if (participantIdSet.size === 0) {
      await this.prisma.tournamentStanding.deleteMany({
        where: { tournamentId },
      });
      return;
    }

    const standings = new Map<string, StandingAccumulator>();
    for (const participant of participants) {
      standings.set(participant.id, {
        playerId: participant.id,
        points: 0,
        wins: 0,
        losses: 0,
        gamesWon: 0,
        gamesLost: 0,
        gameDifference: 0,
      });
    }

    const completedMatches = await this.prisma.match.findMany({
      where: {
        tournamentId,
        status: MatchStatus.COMPLETED,
      },
      include: {
        teams: true,
        setScores: true,
      },
    });

    for (const match of completedMatches) {
      const teamA = match.teams.find((team) => team.side === TeamSide.A);
      const teamB = match.teams.find((team) => team.side === TeamSide.B);

      if (!teamA || !teamB) {
        continue;
      }

      const teamAPlayerIds = [teamA.player1Id, teamA.player2Id];
      const teamBPlayerIds = [teamB.player1Id, teamB.player2Id];

      if (
        teamAPlayerIds.some((playerId) => !participantIdSet.has(playerId)) ||
        teamBPlayerIds.some((playerId) => !participantIdSet.has(playerId))
      ) {
        continue;
      }

      const gamesA = match.setScores.reduce((sum, setScore) => sum + setScore.teamAScore, 0);
      const gamesB = match.setScores.reduce((sum, setScore) => sum + setScore.teamBScore, 0);

      for (const playerId of teamAPlayerIds) {
        const item = standings.get(playerId)!;
        item.gamesWon += gamesA;
        item.gamesLost += gamesB;
      }

      for (const playerId of teamBPlayerIds) {
        const item = standings.get(playerId)!;
        item.gamesWon += gamesB;
        item.gamesLost += gamesA;
      }

      if (match.winnerTeamSide === TeamSide.A) {
        for (const playerId of teamAPlayerIds) {
          const item = standings.get(playerId)!;
          item.points += 3;
          item.wins += 1;
        }

        for (const playerId of teamBPlayerIds) {
          const item = standings.get(playerId)!;
          item.losses += 1;
        }
      } else if (match.winnerTeamSide === TeamSide.B) {
        for (const playerId of teamBPlayerIds) {
          const item = standings.get(playerId)!;
          item.points += 3;
          item.wins += 1;
        }

        for (const playerId of teamAPlayerIds) {
          const item = standings.get(playerId)!;
          item.losses += 1;
        }
      }
    }

    for (const item of standings.values()) {
      item.gameDifference = item.gamesWon - item.gamesLost;
    }

    const participantIds = Array.from(participantIdSet);

    await this.prisma.$transaction(async (tx) => {
      await tx.tournamentStanding.deleteMany({
        where: {
          tournamentId,
          playerId: {
            notIn: participantIds,
          },
        },
      });

      for (const item of standings.values()) {
        await tx.tournamentStanding.upsert({
          where: {
            tournamentId_playerId: {
              tournamentId,
              playerId: item.playerId,
            },
          },
          create: {
            tournamentId,
            playerId: item.playerId,
            points: item.points,
            wins: item.wins,
            losses: item.losses,
            gamesWon: item.gamesWon,
            gamesLost: item.gamesLost,
            gameDifference: item.gameDifference,
          },
          update: {
            points: item.points,
            wins: item.wins,
            losses: item.losses,
            gamesWon: item.gamesWon,
            gamesLost: item.gamesLost,
            gameDifference: item.gameDifference,
          },
        });
      }
    });
  }

  private async readOrderedStandings(tournamentId: string) {
    return this.prisma.tournamentStanding.findMany({
      where: {
        tournamentId,
      },
      orderBy: [{ points: 'desc' }, { gameDifference: 'desc' }, { gamesWon: 'desc' }],
      include: {
        player: {
          select: {
            id: true,
            fullName: true,
            displayName: true,
            nickname: true,
            currentElo: true,
          },
        },
      },
    });
  }

  private async refreshTournamentCompletionStatus(tournamentId: string) {
    const tournament = await this.prisma.tournament.findUnique({
      where: {
        id: tournamentId,
      },
      select: {
        status: true,
      },
    });

    if (!tournament) {
      return;
    }

    if (
      tournament.status === TournamentStatus.CANCELLED ||
      tournament.status === TournamentStatus.COMPLETED
    ) {
      return;
    }

    const [roundsCount, pendingMatches] = await Promise.all([
      this.prisma.tournamentRound.count({
        where: { tournamentId },
      }),
      this.prisma.match.count({
        where: {
          tournamentId,
          status: MatchStatus.SCHEDULED,
        },
      }),
    ]);

    if (roundsCount === 0) {
      return;
    }

    if (pendingMatches === 0) {
      await this.prisma.tournament.update({
        where: { id: tournamentId },
        data: {
          status: TournamentStatus.FINISHED,
          registrationStatus: 'CLOSED',
        },
      });
      return;
    }

    await this.prisma.tournament.update({
      where: { id: tournamentId },
      data: {
        status: TournamentStatus.IN_PROGRESS,
      },
    });
  }

  private computeOrderedStandingsFromMatches(
    matches: Array<{
      winnerTeamSide: TeamSide | null;
      teams: Array<{
        side: TeamSide;
        player1Id: string;
        player2Id: string;
      }>;
      setScores: Array<{
        teamAScore: number;
        teamBScore: number;
      }>;
    }>,
    registeredPlayerIds: Set<string>,
  ): StandingAccumulator[] {
    const standings = new Map<string, StandingAccumulator>();

    const ensure = (playerId: string) => {
      const existing = standings.get(playerId);
      if (existing) {
        return existing;
      }

      const next: StandingAccumulator = {
        playerId,
        points: 0,
        wins: 0,
        losses: 0,
        gamesWon: 0,
        gamesLost: 0,
        gameDifference: 0,
      };

      standings.set(playerId, next);
      return next;
    };

    for (const match of matches) {
      const teamA = match.teams.find((team) => team.side === TeamSide.A);
      const teamB = match.teams.find((team) => team.side === TeamSide.B);

      if (!teamA || !teamB) {
        continue;
      }

      const teamAPlayers = [teamA.player1Id, teamA.player2Id];
      const teamBPlayers = [teamB.player1Id, teamB.player2Id];

      if (
        teamAPlayers.some((id) => !registeredPlayerIds.has(id)) ||
        teamBPlayers.some((id) => !registeredPlayerIds.has(id))
      ) {
        continue;
      }

      const gamesA = match.setScores.reduce((sum, setScore) => sum + setScore.teamAScore, 0);
      const gamesB = match.setScores.reduce((sum, setScore) => sum + setScore.teamBScore, 0);

      for (const playerId of teamAPlayers) {
        const row = ensure(playerId);
        row.gamesWon += gamesA;
        row.gamesLost += gamesB;
      }

      for (const playerId of teamBPlayers) {
        const row = ensure(playerId);
        row.gamesWon += gamesB;
        row.gamesLost += gamesA;
      }

      if (match.winnerTeamSide === TeamSide.A) {
        for (const playerId of teamAPlayers) {
          const row = ensure(playerId);
          row.points += 3;
          row.wins += 1;
        }

        for (const playerId of teamBPlayers) {
          const row = ensure(playerId);
          row.losses += 1;
        }
      } else if (match.winnerTeamSide === TeamSide.B) {
        for (const playerId of teamBPlayers) {
          const row = ensure(playerId);
          row.points += 3;
          row.wins += 1;
        }

        for (const playerId of teamAPlayers) {
          const row = ensure(playerId);
          row.losses += 1;
        }
      }
    }

    const ordered = Array.from(standings.values());
    for (const row of ordered) {
      row.gameDifference = row.gamesWon - row.gamesLost;
    }

    ordered.sort((a, b) =>
      b.points - a.points || b.gameDifference - a.gameDifference || b.gamesWon - a.gamesWon,
    );

    return ordered;
  }

  private extractWinnerTeams(
    matches: Array<{
      winnerTeamSide: TeamSide | null;
      teams: Array<{
        side: TeamSide;
        player1Id: string;
        player2Id: string;
      }>;
    }>,
  ): TeamSeed[] {
    const winners: TeamSeed[] = [];

    for (const match of matches) {
      if (!match.winnerTeamSide) {
        continue;
      }

      const winner = match.teams.find((team) => team.side === match.winnerTeamSide);
      if (!winner) {
        continue;
      }

      winners.push({
        player1Id: winner.player1Id,
        player2Id: winner.player2Id,
      });
    }

    return winners;
  }

  private teamContainsBye(team: [EnginePlayer, EnginePlayer]): boolean {
    return team[0].isBye || team[1].isBye;
  }

  private selectBestAmericanoPairing(
    group: EnginePlayer[],
    partnerHistory: Map<string, number>,
    opponentHistory: Map<string, number>,
  ) {
    let bestVariant = AMERICANO_PAIRING_VARIANTS[0];
    let bestScore = Number.POSITIVE_INFINITY;

    for (const variant of AMERICANO_PAIRING_VARIANTS) {
      const teamA: [EnginePlayer, EnginePlayer] = [
        group[variant.teamA[0]],
        group[variant.teamA[1]],
      ];
      const teamB: [EnginePlayer, EnginePlayer] = [
        group[variant.teamB[0]],
        group[variant.teamB[1]],
      ];

      let score = 0;
      score += this.partnerPenalty(partnerHistory, teamA[0], teamA[1]);
      score += this.partnerPenalty(partnerHistory, teamB[0], teamB[1]);
      score += this.opponentPenalty(opponentHistory, teamA, teamB);

      const byeDifference =
        Math.abs(Number(teamA[0].isBye) + Number(teamA[1].isBye) - Number(teamB[0].isBye) - Number(teamB[1].isBye));
      score += byeDifference * 25;

      if (score < bestScore) {
        bestScore = score;
        bestVariant = variant;
      }
    }

    return bestVariant;
  }

  private bumpPartnerHistory(
    partnerHistory: Map<string, number>,
    playerA: EnginePlayer,
    playerB: EnginePlayer,
  ) {
    if (playerA.isBye || playerB.isBye) {
      return;
    }

    const key = this.pairKey(playerA.id, playerB.id);
    partnerHistory.set(key, (partnerHistory.get(key) ?? 0) + 1);
  }

  private bumpOpponentHistory(
    opponentHistory: Map<string, number>,
    teamA: [EnginePlayer, EnginePlayer],
    teamB: [EnginePlayer, EnginePlayer],
  ) {
    for (const a of teamA) {
      for (const b of teamB) {
        if (a.isBye || b.isBye) {
          continue;
        }

        const key = this.pairKey(a.id, b.id);
        opponentHistory.set(key, (opponentHistory.get(key) ?? 0) + 1);
      }
    }
  }

  private partnerPenalty(
    partnerHistory: Map<string, number>,
    playerA: EnginePlayer,
    playerB: EnginePlayer,
  ) {
    if (playerA.isBye || playerB.isBye) {
      return 0;
    }

    return (partnerHistory.get(this.pairKey(playerA.id, playerB.id)) ?? 0) * 100;
  }

  private opponentPenalty(
    opponentHistory: Map<string, number>,
    teamA: [EnginePlayer, EnginePlayer],
    teamB: [EnginePlayer, EnginePlayer],
  ) {
    let penalty = 0;

    for (const a of teamA) {
      for (const b of teamB) {
        if (a.isBye || b.isBye) {
          continue;
        }

        penalty += (opponentHistory.get(this.pairKey(a.id, b.id)) ?? 0) * 10;
      }
    }

    return penalty;
  }

  private pairKey(a: string, b: string): string {
    return a < b ? `${a}|${b}` : `${b}|${a}`;
  }

  private rotateParticipants(players: EnginePlayer[], offset: number): EnginePlayer[] {
    if (players.length <= 1) {
      return [...players];
    }

    const fixed = players[0];
    const rest = players.slice(1);
    const normalizedOffset = offset % rest.length;
    const rotated = [
      ...rest.slice(normalizedOffset),
      ...rest.slice(0, normalizedOffset),
    ];

    return [fixed, ...rotated];
  }

  private chunkPlayers(players: EnginePlayer[], size: number): EnginePlayer[][] {
    const chunks: EnginePlayer[][] = [];
    for (let index = 0; index < players.length; index += size) {
      chunks.push(players.slice(index, index + size));
    }
    return chunks;
  }

  private async padParticipantsToMultipleOfFour(
    tournamentId: string,
    participants: EnginePlayer[],
  ): Promise<EnginePlayer[]> {
    const remainder = participants.length % 4;
    const neededByes = remainder === 0 ? 0 : 4 - remainder;

    if (neededByes === 0) {
      return [...participants];
    }

    const byePlayers = await this.getOrCreateByePlayers(
      tournamentId,
      neededByes,
      new Set(participants.map((player) => player.id)),
    );

    return [...participants, ...byePlayers];
  }

  private async getRegisteredPlayers(tournamentId: string): Promise<EnginePlayer[]> {
    const registrations = await this.prisma.tournamentRegistration.findMany({
      where: {
        tournamentId,
        playerId: {
          not: null,
        },
        status: {
          in: [RegistrationStatus.CONFIRMED],
        },
      },
      include: {
        player: {
          select: {
            id: true,
            currentElo: true,
            fullName: true,
            displayName: true,
          },
        },
      },
      orderBy: [{ createdAt: 'asc' }],
    });

    const unique = new Map<string, EnginePlayer>();

    for (const registration of registrations) {
      if (!registration.player) {
        continue;
      }

      if (unique.has(registration.player.id)) {
        continue;
      }

      unique.set(registration.player.id, {
        id: registration.player.id,
        currentElo: registration.player.currentElo,
        isBye: false,
        label: registration.player.displayName ?? registration.player.fullName,
      });
    }

    return Array.from(unique.values());
  }

  private async getRegisteredPlayerIdSet(tournamentId: string): Promise<Set<string>> {
    const players = await this.prisma.tournamentRegistration.findMany({
      where: {
        tournamentId,
        playerId: {
          not: null,
        },
        status: {
          in: [RegistrationStatus.CONFIRMED],
        },
      },
      select: {
        playerId: true,
      },
    });

    return new Set(players.map((item) => item.playerId!).filter(Boolean));
  }

  private async getOrCreateByePlayers(
    tournamentId: string,
    count: number,
    excludeIds: Set<string>,
  ): Promise<EnginePlayer[]> {
    if (count <= 0) {
      return [];
    }

    const existing = await this.fetchByePlayers(tournamentId);
    let available = existing.filter((player) => !excludeIds.has(player.id));

    if (available.length < count) {
      const missing = count - available.length;
      const created = await this.createByePlayers(tournamentId, missing, existing.length);
      available = [...available, ...created];
    }

    return available.slice(0, count);
  }

  private async fetchByePlayers(tournamentId: string): Promise<EnginePlayer[]> {
    const profiles = await this.prisma.playerProfile.findMany({
      where: {
        user: {
          email: {
            startsWith: `bye+${tournamentId}+`,
          },
        },
      },
      select: {
        id: true,
        currentElo: true,
        fullName: true,
      },
      orderBy: [{ fullName: 'asc' }],
    });

    return profiles.map((profile) => ({
      id: profile.id,
      currentElo: profile.currentElo,
      isBye: true,
      label: profile.fullName,
    }));
  }

  private async createByePlayers(
    tournamentId: string,
    count: number,
    existingCount: number,
  ): Promise<EnginePlayer[]> {
    const created: EnginePlayer[] = [];

    for (let offset = 1; offset <= count; offset += 1) {
      const index = existingCount + offset;
      const email = `bye+${tournamentId}+${index}@padelelo.local`;

      const user = await this.prisma.user.upsert({
        where: { email },
        update: {
          isActive: false,
        },
        create: {
          email,
          passwordHash: '!bye-placeholder!',
          role: UserRole.PLAYER,
          isActive: false,
          playerProfile: {
            create: {
              fullName: `BYE ${index}`,
              displayName: `BYE ${index}`,
              nickname: `bye-${tournamentId.slice(0, 8)}-${index}`,
              currentElo: 0,
            },
          },
        },
        include: {
          playerProfile: true,
        },
      });

      if (!user.playerProfile) {
        continue;
      }

      created.push({
        id: user.playerProfile.id,
        currentElo: user.playerProfile.currentElo,
        isBye: true,
        label: user.playerProfile.fullName,
      });
    }

    return created;
  }

  private async getPlayerMap(playerIds: string[]) {
    const uniqueIds = Array.from(new Set(playerIds));

    const players = await this.prisma.playerProfile.findMany({
      where: {
        id: {
          in: uniqueIds,
        },
      },
      select: {
        id: true,
        currentElo: true,
        fullName: true,
      },
    });

    return new Map(players.map((player) => [player.id, player]));
  }

  private enginePlayerFromMap(
    playerId: string,
    playerMap: Map<string, { id: string; currentElo: number; fullName: string }>,
    registeredPlayerIds: Set<string>,
  ): EnginePlayer {
    const player = playerMap.get(playerId);
    if (!player) {
      throw new NotFoundException(`Player ${playerId} not found while generating tournament`);
    }

    return {
      id: player.id,
      currentElo: player.currentElo,
      isBye: !registeredPlayerIds.has(player.id),
      label: player.fullName,
    };
  }

  private teamSeedRating(
    seed: TeamSeed,
    playerMap: Map<string, { id: string; currentElo: number; fullName: string }>,
  ) {
    const first = playerMap.get(seed.player1Id)?.currentElo ?? 0;
    const second = playerMap.get(seed.player2Id)?.currentElo ?? 0;
    return this.calculateTeamAverage(first, second);
  }

  private calculateTeamAverage(ratingOne: number, ratingTwo: number): number {
    return Math.round((ratingOne + ratingTwo) / 2);
  }

  private resolvePlayoffBracketStage(teamCount: number): BracketStage {
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

  private resolvePlayoffRoundLabel(teamCount: number): string {
    if (teamCount >= 8) {
      return 'Quarterfinal';
    }

    if (teamCount >= 4) {
      return 'Semifinal';
    }

    return 'Final';
  }

  private nextPowerOfTwo(value: number): number {
    let candidate = 1;
    while (candidate < value) {
      candidate *= 2;
    }
    return candidate;
  }

  private groupNameByOrder(order: number): string {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let index = Math.max(1, Math.floor(order));
    let letters = '';

    while (index > 0) {
      index -= 1;
      letters = alphabet[index % 26] + letters;
      index = Math.floor(index / 26);
    }

    return `Group ${letters}`;
  }

  private async getNextRoundMeta(tournamentId: string) {
    const aggregate = await this.prisma.tournamentRound.aggregate({
      where: { tournamentId },
      _max: {
        order: true,
        roundNumber: true,
      },
    });

    return {
      order: (aggregate._max.order ?? 0) + 1,
      roundNumber: (aggregate._max.roundNumber ?? 0) + 1,
    };
  }

  private resolveScoringConfig(input: {
    type: TournamentType;
    scoringMode?: TournamentScoringMode;
    pointsToWin?: number;
    setsToWin?: number;
  }): ResolvedScoringConfig {
    const scoringMode =
      input.scoringMode ??
      (input.type === TournamentType.AMERICANO
        ? TournamentScoringMode.POINTS_SINGLE
        : TournamentScoringMode.SETS);

    if (input.type === TournamentType.AMERICANO && scoringMode !== TournamentScoringMode.POINTS_SINGLE) {
      throw new BadRequestException('AMERICANO supports only single-score match mode');
    }

    const pointsToWin = input.pointsToWin ?? (scoringMode === TournamentScoringMode.SETS ? 6 : 21);
    if (!Number.isInteger(pointsToWin) || pointsToWin < 1 || pointsToWin > 99) {
      throw new BadRequestException('pointsToWin must be an integer between 1 and 99');
    }

    const setsToWin = scoringMode === TournamentScoringMode.SETS ? (input.setsToWin ?? 2) : 1;
    if (!Number.isInteger(setsToWin) || setsToWin < 1 || setsToWin > 5) {
      throw new BadRequestException('setsToWin must be an integer between 1 and 5');
    }

    return {
      scoringMode,
      pointsToWin,
      setsToWin,
    };
  }

  private normalizeTournamentSetScores(
    setScores: Array<{
      setNumber: number;
      teamAScore: number;
      teamBScore: number;
      tieBreakAScore?: number;
      tieBreakBScore?: number;
    }>,
    config: {
      type: TournamentType;
      scoringMode: TournamentScoringMode;
      pointsToWin: number;
      setsToWin: number;
    },
  ) {
    if (setScores.length === 0) {
      throw new BadRequestException('At least one set score is required');
    }

    const normalized = [...setScores]
      .map((set, index) => {
        if (!Number.isInteger(set.teamAScore) || !Number.isInteger(set.teamBScore)) {
          throw new BadRequestException('Set scores must be integers');
        }

        if (set.teamAScore < 0 || set.teamBScore < 0 || set.teamAScore > 99 || set.teamBScore > 99) {
          throw new BadRequestException('Set scores must be in range 0..99');
        }

        if (set.teamAScore === set.teamBScore) {
          throw new BadRequestException('A set cannot end with a tie');
        }

        return {
          setNumber: index + 1,
          teamAScore: set.teamAScore,
          teamBScore: set.teamBScore,
          tieBreakAScore: set.tieBreakAScore,
          tieBreakBScore: set.tieBreakBScore,
        };
      })
      .sort((a, b) => a.setNumber - b.setNumber);

    const singleScoreMode =
      config.type === TournamentType.AMERICANO ||
      config.scoringMode === TournamentScoringMode.POINTS_SINGLE;

    if (singleScoreMode) {
      if (normalized.length !== 1) {
        throw new BadRequestException('Single-score mode requires exactly one score row');
      }

      const winnerScore = Math.max(normalized[0].teamAScore, normalized[0].teamBScore);
      if (winnerScore < config.pointsToWin) {
        throw new BadRequestException(
          `Winner score must be at least ${config.pointsToWin} points in current format`,
        );
      }

      return normalized;
    }

    const maxSets = config.setsToWin * 2 - 1;
    if (normalized.length > maxSets) {
      throw new BadRequestException(`Too many sets for current format (max ${maxSets})`);
    }

    let teamAWins = 0;
    let teamBWins = 0;

    for (const set of normalized) {
      const winnerScore = Math.max(set.teamAScore, set.teamBScore);
      if (winnerScore < config.pointsToWin) {
        throw new BadRequestException(
          `Each set winner must reach at least ${config.pointsToWin} points`,
        );
      }

      if (set.teamAScore > set.teamBScore) {
        teamAWins += 1;
      } else {
        teamBWins += 1;
      }
    }

    if (teamAWins < config.setsToWin && teamBWins < config.setsToWin) {
      throw new BadRequestException(
        `One team must win at least ${config.setsToWin} set(s) in current format`,
      );
    }

    if (teamAWins >= config.setsToWin && teamBWins >= config.setsToWin) {
      throw new BadRequestException('Result is invalid: both teams reached winning sets threshold');
    }

    return normalized;
  }

  private resolveWinnerFromSetScores(
    setScores: Array<{
      teamAScore: number;
      teamBScore: number;
    }>,
  ): TeamSide | null {
    if (setScores.length === 0) {
      return null;
    }

    let teamAWins = 0;
    let teamBWins = 0;

    for (const set of setScores) {
      if (set.teamAScore > set.teamBScore) {
        teamAWins += 1;
      } else if (set.teamBScore > set.teamAScore) {
        teamBWins += 1;
      }
    }

    if (teamAWins === teamBWins) {
      return null;
    }

    return teamAWins > teamBWins ? TeamSide.A : TeamSide.B;
  }

  private normalizeTournamentType(type: ApiTournamentType): TournamentType {
    if (type === 'DIRECT_PLAYOFF') {
      return TournamentType.PLAYOFF;
    }

    if (type === 'PLAYOFF') {
      return TournamentType.PLAYOFF;
    }

    if (type === 'GROUP_STAGE') {
      return TournamentType.GROUP_STAGE;
    }

    return TournamentType.AMERICANO;
  }

  private composeTournamentLocationFromClub(
    club: {
      name: string;
      city: string | null;
      address: string | null;
    } | null,
  ): string | null {
    if (!club) {
      return null;
    }

    const parts = [club.name, club.city, club.address]
      .map((part) => part?.trim())
      .filter((part): part is string => Boolean(part));

    if (parts.length === 0) {
      return null;
    }

    return parts.join(', ');
  }

  private async requireTournamentState(id: string) {
    const tournament = await this.prisma.tournament.findUnique({
      where: { id },
      select: {
        id: true,
        type: true,
        startDate: true,
        status: true,
        registrationStatus: true,
        registrationCloseAt: true,
        scoringMode: true,
        pointsToWin: true,
        setsToWin: true,
      },
    });

    if (!tournament) {
      throw new NotFoundException('Tournament not found');
    }

    return tournament;
  }

  private async ensureTournamentExists(id: string) {
    const tournament = await this.prisma.tournament.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!tournament) {
      throw new NotFoundException('Tournament not found');
    }
  }
}
