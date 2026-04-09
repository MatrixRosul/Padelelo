import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  MatchResultSource,
  MatchStatus,
  OpenMatchApprovalDecision,
  OpenMatchParticipantStatus,
  OpenMatchScoringMode,
  OpenMatchStatus,
  Prisma,
  TeamSide,
} from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { RatingsService } from '../ratings/ratings.service';
import { CreateOpenMatchDto } from './dto/create-open-match.dto';
import { InviteOpenMatchPlayerDto } from './dto/invite-open-match-player.dto';
import { ListOpenMatchesQueryDto } from './dto/list-open-matches-query.dto';
import { ResolveOpenMatchRequestDto } from './dto/resolve-open-match-request.dto';
import { ResolveOpenMatchResultDto } from './dto/resolve-open-match-result.dto';
import { RespondOpenMatchInviteDto } from './dto/respond-open-match-invite.dto';
import { SubmitOpenMatchResultDto } from './dto/submit-open-match-result.dto';

type Slot = {
  teamSide: TeamSide;
  teamPosition: number;
};

const PLAYER_SUMMARY_SELECT = Prisma.validator<Prisma.PlayerProfileSelect>()({
  id: true,
  fullName: true,
  nickname: true,
  currentElo: true,
});

const OPEN_MATCH_INCLUDE = Prisma.validator<Prisma.OpenMatchInclude>()({
  creator: {
    select: PLAYER_SUMMARY_SELECT,
  },
  resultSubmittedBy: {
    select: PLAYER_SUMMARY_SELECT,
  },
  participants: {
    include: {
      player: {
        select: PLAYER_SUMMARY_SELECT,
      },
    },
    orderBy: { createdAt: 'asc' },
  },
  resultApprovals: {
    include: {
      player: {
        select: PLAYER_SUMMARY_SELECT,
      },
    },
    orderBy: { createdAt: 'asc' },
  },
});

type OpenMatchWithRelations = Prisma.OpenMatchGetPayload<{
  include: typeof OPEN_MATCH_INCLUDE;
}>;

@Injectable()
export class OpenMatchesService {
  private readonly maxSlots = 4;

  constructor(
    private readonly prisma: PrismaService,
    private readonly ratingsService: RatingsService,
  ) {}

  async listOpenMatches(query: ListOpenMatchesQueryDto, actorUserId: string) {
    const actorPlayer = await this.resolvePlayerProfileByUserId(actorUserId);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where = this.buildListFilter(query, actorPlayer.id);

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.openMatch.count({ where }),
      this.prisma.openMatch.findMany({
        where,
        include: OPEN_MATCH_INCLUDE,
        orderBy: [{ createdAt: 'desc' }],
        skip,
        take: limit,
      }),
    ]);

    return {
      items: rows.map((item) => this.toOpenMatchView(item, actorPlayer.id)),
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  async getOpenMatchById(openMatchId: string, actorUserId: string) {
    const actorPlayer = await this.resolvePlayerProfileByUserId(actorUserId);

    const openMatch = await this.prisma.openMatch.findUnique({
      where: { id: openMatchId },
      include: OPEN_MATCH_INCLUDE,
    });

    if (!openMatch) {
      throw new NotFoundException('Open match not found');
    }

    return this.toOpenMatchView(openMatch, actorPlayer.id);
  }

  async createOpenMatch(dto: CreateOpenMatchDto, actorUserId: string) {
    const actorPlayer = await this.resolvePlayerProfileByUserId(actorUserId);

    const scoringMode = dto.scoringMode ?? OpenMatchScoringMode.POINTS;
    const pointsToWin = dto.pointsToWin ?? 21;
    const setsToWin = dto.setsToWin ?? 2;

    this.validateScoringConfig(scoringMode, pointsToWin, setsToWin);

    const openMatch = await this.prisma.openMatch.create({
      data: {
        creatorPlayerId: actorPlayer.id,
        isRated: dto.isRated ?? true,
        scoringMode,
        pointsToWin,
        setsToWin,
        scheduledAt: dto.scheduledAt,
        location: this.normalizeOptionalString(dto.location),
        notes: this.normalizeOptionalString(dto.notes),
        participants: {
          create: {
            playerId: actorPlayer.id,
            status: OpenMatchParticipantStatus.JOINED,
            teamSide: TeamSide.A,
            teamPosition: 1,
            joinedAt: new Date(),
          },
        },
      },
      include: OPEN_MATCH_INCLUDE,
    });

    await this.prisma.auditLog.create({
      data: {
        actorUserId,
        action: 'open-match.create',
        entityType: 'OpenMatch',
        entityId: openMatch.id,
      },
    });

    return this.toOpenMatchView(openMatch, actorPlayer.id);
  }

  async requestToJoin(openMatchId: string, actorUserId: string) {
    const actorPlayer = await this.resolvePlayerProfileByUserId(actorUserId);

    await this.prisma.$transaction(async (tx) => {
      const openMatch = await this.loadOpenMatchForMutation(tx, openMatchId);
      this.ensureJoinableStatus(openMatch.status);

      if (openMatch.creatorPlayerId === actorPlayer.id) {
        throw new BadRequestException('Creator is already part of the match');
      }

      const joinedCount = this.countJoinedParticipants(openMatch.participants);
      if (joinedCount >= this.maxSlots) {
        throw new ConflictException('No free slots left in this open match');
      }

      const existing = openMatch.participants.find((item) => item.playerId === actorPlayer.id);
      if (existing) {
        if (existing.status === OpenMatchParticipantStatus.JOINED) {
          throw new ConflictException('You are already part of this match');
        }

        if (existing.status === OpenMatchParticipantStatus.REQUESTED) {
          throw new ConflictException('Join request already pending');
        }

        if (existing.status === OpenMatchParticipantStatus.INVITED) {
          throw new ConflictException('You already have an invitation for this match');
        }

        await tx.openMatchParticipant.update({
          where: { id: existing.id },
          data: {
            status: OpenMatchParticipantStatus.REQUESTED,
            teamSide: null,
            teamPosition: null,
            invitedByPlayerId: null,
            respondedAt: null,
            joinedAt: null,
          },
        });
      } else {
        await tx.openMatchParticipant.create({
          data: {
            openMatchId,
            playerId: actorPlayer.id,
            status: OpenMatchParticipantStatus.REQUESTED,
          },
        });
      }

      await this.syncOpenMatchReadyStatus(tx, openMatchId);
    });

    const refreshed = await this.fetchOpenMatchWithRelations(openMatchId);
    return this.toOpenMatchView(refreshed, actorPlayer.id);
  }

  async invitePlayer(openMatchId: string, dto: InviteOpenMatchPlayerDto, actorUserId: string) {
    const actorPlayer = await this.resolvePlayerProfileByUserId(actorUserId);

    await this.prisma.$transaction(async (tx) => {
      const openMatch = await this.loadOpenMatchForMutation(tx, openMatchId);
      this.ensureCaptain(openMatch, actorPlayer.id);
      this.ensureJoinableStatus(openMatch.status);

      const targetPlayer = await tx.playerProfile.findUnique({
        where: { id: dto.playerId },
        select: { id: true },
      });

      if (!targetPlayer) {
        throw new NotFoundException('Player not found');
      }

      if (targetPlayer.id === actorPlayer.id) {
        throw new BadRequestException('Cannot invite yourself');
      }

      const joinedCount = this.countJoinedParticipants(openMatch.participants);
      if (joinedCount >= this.maxSlots) {
        throw new ConflictException('No free slots left in this open match');
      }

      const existing = openMatch.participants.find((item) => item.playerId === targetPlayer.id);
      if (existing) {
        if (existing.status === OpenMatchParticipantStatus.JOINED) {
          throw new ConflictException('Player is already part of this match');
        }

        if (existing.status === OpenMatchParticipantStatus.INVITED) {
          throw new ConflictException('Invitation already sent');
        }

        if (existing.status === OpenMatchParticipantStatus.REQUESTED) {
          throw new ConflictException('Player already requested to join, approve the request instead');
        }

        await tx.openMatchParticipant.update({
          where: { id: existing.id },
          data: {
            status: OpenMatchParticipantStatus.INVITED,
            invitedByPlayerId: actorPlayer.id,
            respondedAt: null,
            joinedAt: null,
            teamSide: null,
            teamPosition: null,
          },
        });
      } else {
        await tx.openMatchParticipant.create({
          data: {
            openMatchId,
            playerId: targetPlayer.id,
            status: OpenMatchParticipantStatus.INVITED,
            invitedByPlayerId: actorPlayer.id,
          },
        });
      }

      await this.syncOpenMatchReadyStatus(tx, openMatchId);
    });

    const refreshed = await this.fetchOpenMatchWithRelations(openMatchId);
    return this.toOpenMatchView(refreshed, actorPlayer.id);
  }

  async resolveJoinRequest(
    openMatchId: string,
    requestPlayerId: string,
    dto: ResolveOpenMatchRequestDto,
    actorUserId: string,
  ) {
    const actorPlayer = await this.resolvePlayerProfileByUserId(actorUserId);

    await this.prisma.$transaction(async (tx) => {
      const openMatch = await this.loadOpenMatchForMutation(tx, openMatchId);
      this.ensureCaptain(openMatch, actorPlayer.id);
      this.ensureJoinableStatus(openMatch.status);

      const target = openMatch.participants.find(
        (item) => item.playerId === requestPlayerId && item.status === OpenMatchParticipantStatus.REQUESTED,
      );

      if (!target) {
        throw new NotFoundException('Join request not found');
      }

      if (!dto.approve) {
        await tx.openMatchParticipant.update({
          where: { id: target.id },
          data: {
            status: OpenMatchParticipantStatus.REJECTED,
            respondedAt: new Date(),
            teamSide: null,
            teamPosition: null,
            joinedAt: null,
          },
        });

        await this.syncOpenMatchReadyStatus(tx, openMatchId);
        return;
      }

      const slot = this.resolveNextSlot(openMatch.participants, {
        preferredSide: dto.teamSide,
        preferredPosition: dto.teamPosition,
      });

      if (!slot) {
        throw new ConflictException('No free slot available for approval');
      }

      await tx.openMatchParticipant.update({
        where: { id: target.id },
        data: {
          status: OpenMatchParticipantStatus.JOINED,
          teamSide: slot.teamSide,
          teamPosition: slot.teamPosition,
          joinedAt: new Date(),
          respondedAt: new Date(),
        },
      });

      await this.syncOpenMatchReadyStatus(tx, openMatchId);
    });

    const refreshed = await this.fetchOpenMatchWithRelations(openMatchId);
    return this.toOpenMatchView(refreshed, actorPlayer.id);
  }

  async respondToInvite(openMatchId: string, dto: RespondOpenMatchInviteDto, actorUserId: string) {
    const actorPlayer = await this.resolvePlayerProfileByUserId(actorUserId);

    await this.prisma.$transaction(async (tx) => {
      const openMatch = await this.loadOpenMatchForMutation(tx, openMatchId);
      this.ensureJoinableStatus(openMatch.status);

      const invitation = openMatch.participants.find(
        (item) => item.playerId === actorPlayer.id && item.status === OpenMatchParticipantStatus.INVITED,
      );

      if (!invitation) {
        throw new NotFoundException('Active invitation not found');
      }

      if (!dto.accept) {
        await tx.openMatchParticipant.update({
          where: { id: invitation.id },
          data: {
            status: OpenMatchParticipantStatus.DECLINED,
            respondedAt: new Date(),
            teamSide: null,
            teamPosition: null,
            joinedAt: null,
          },
        });

        await this.syncOpenMatchReadyStatus(tx, openMatchId);
        return;
      }

      const slot = this.resolveNextSlot(openMatch.participants);
      if (!slot) {
        throw new ConflictException('No free slot available in this match');
      }

      await tx.openMatchParticipant.update({
        where: { id: invitation.id },
        data: {
          status: OpenMatchParticipantStatus.JOINED,
          teamSide: slot.teamSide,
          teamPosition: slot.teamPosition,
          respondedAt: new Date(),
          joinedAt: new Date(),
        },
      });

      await this.syncOpenMatchReadyStatus(tx, openMatchId);
    });

    const refreshed = await this.fetchOpenMatchWithRelations(openMatchId);
    return this.toOpenMatchView(refreshed, actorPlayer.id);
  }

  async cancelOpenMatch(openMatchId: string, actorUserId: string) {
    const actorPlayer = await this.resolvePlayerProfileByUserId(actorUserId);

    const openMatch = await this.prisma.openMatch.findUnique({
      where: { id: openMatchId },
      include: OPEN_MATCH_INCLUDE,
    });

    if (!openMatch) {
      throw new NotFoundException('Open match not found');
    }

    this.ensureCaptain(openMatch, actorPlayer.id);

    if (openMatch.status === OpenMatchStatus.COMPLETED) {
      throw new ConflictException('Completed match cannot be cancelled');
    }

    const updated = await this.prisma.openMatch.update({
      where: { id: openMatchId },
      data: {
        status: OpenMatchStatus.CANCELLED,
      },
      include: OPEN_MATCH_INCLUDE,
    });

    return this.toOpenMatchView(updated, actorPlayer.id);
  }

  async submitResult(openMatchId: string, dto: SubmitOpenMatchResultDto, actorUserId: string) {
    const actorPlayer = await this.resolvePlayerProfileByUserId(actorUserId);

    await this.prisma.$transaction(async (tx) => {
      const openMatch = await this.loadOpenMatchForMutation(tx, openMatchId);

      if (openMatch.status !== OpenMatchStatus.READY) {
        throw new ConflictException('Result can be submitted only when match is ready');
      }

      const joinedParticipants = this.extractJoinedParticipants(openMatch.participants);
      const actorParticipation = joinedParticipants.find((item) => item.playerId === actorPlayer.id);

      if (!actorParticipation) {
        throw new ConflictException('Only joined players can submit the result');
      }

      if (joinedParticipants.length !== this.maxSlots) {
        throw new BadRequestException('All four participants must join before result submission');
      }

      const payload = this.resolveResultPayload(openMatch, dto);
      const now = new Date();

      await tx.openMatch.update({
        where: { id: openMatchId },
        data: {
          status: OpenMatchStatus.RESULT_PENDING,
          playedAt: dto.playedAt ?? now,
          resultSubmittedAt: now,
          resultSubmittedByPlayerId: actorPlayer.id,
          proposedWinnerSide: payload.winnerSide,
          proposedTeamAPoints: payload.teamAPoints,
          proposedTeamBPoints: payload.teamBPoints,
          proposedTeamASetsWon: payload.teamASetsWon,
          proposedTeamBSetsWon: payload.teamBSetsWon,
        },
      });

      for (const participant of joinedParticipants) {
        await tx.openMatchResultApproval.upsert({
          where: {
            openMatchId_playerId: {
              openMatchId,
              playerId: participant.playerId,
            },
          },
          update: {
            decision: OpenMatchApprovalDecision.PENDING,
            decidedAt: null,
          },
          create: {
            openMatchId,
            playerId: participant.playerId,
            decision: OpenMatchApprovalDecision.PENDING,
          },
        });
      }

      await tx.openMatchResultApproval.update({
        where: {
          openMatchId_playerId: {
            openMatchId,
            playerId: actorPlayer.id,
          },
        },
        data: {
          decision: OpenMatchApprovalDecision.APPROVED,
          decidedAt: now,
        },
      });
    });

    await this.attemptFinalizeOpenMatch(openMatchId);

    const refreshed = await this.fetchOpenMatchWithRelations(openMatchId);
    return this.toOpenMatchView(refreshed, actorPlayer.id);
  }

  async resolveResult(openMatchId: string, dto: ResolveOpenMatchResultDto, actorUserId: string) {
    const actorPlayer = await this.resolvePlayerProfileByUserId(actorUserId);

    await this.prisma.$transaction(async (tx) => {
      const openMatch = await this.loadOpenMatchForMutation(tx, openMatchId);

      if (openMatch.status !== OpenMatchStatus.RESULT_PENDING) {
        throw new ConflictException('No pending result to approve');
      }

      const joinedParticipants = this.extractJoinedParticipants(openMatch.participants);
      const actorParticipation = joinedParticipants.find((item) => item.playerId === actorPlayer.id);

      if (!actorParticipation) {
        throw new ConflictException('Only joined players can approve this result');
      }

      const approval = await tx.openMatchResultApproval.findUnique({
        where: {
          openMatchId_playerId: {
            openMatchId,
            playerId: actorPlayer.id,
          },
        },
      });

      if (!approval) {
        throw new NotFoundException('Result approval record not found');
      }

      if (dto.approve) {
        await tx.openMatchResultApproval.update({
          where: { id: approval.id },
          data: {
            decision: OpenMatchApprovalDecision.APPROVED,
            decidedAt: new Date(),
          },
        });
        return;
      }

      await tx.openMatchResultApproval.deleteMany({
        where: { openMatchId },
      });

      await tx.openMatch.update({
        where: { id: openMatchId },
        data: {
          status: OpenMatchStatus.READY,
          resultSubmittedAt: null,
          resultSubmittedByPlayerId: null,
          proposedWinnerSide: null,
          proposedTeamAPoints: null,
          proposedTeamBPoints: null,
          proposedTeamASetsWon: null,
          proposedTeamBSetsWon: null,
          playedAt: null,
        },
      });
    });

    if (dto.approve) {
      await this.attemptFinalizeOpenMatch(openMatchId);
    }

    const refreshed = await this.fetchOpenMatchWithRelations(openMatchId);
    return this.toOpenMatchView(refreshed, actorPlayer.id);
  }

  private async attemptFinalizeOpenMatch(openMatchId: string): Promise<void> {
    const snapshot = await this.prisma.openMatch.findUnique({
      where: { id: openMatchId },
      include: {
        participants: {
          include: {
            player: {
              select: {
                id: true,
                currentElo: true,
                userId: true,
              },
            },
          },
        },
        resultApprovals: true,
        creator: {
          select: {
            userId: true,
          },
        },
      },
    });

    if (!snapshot || snapshot.status !== OpenMatchStatus.RESULT_PENDING) {
      return;
    }

    const joinedParticipants = snapshot.participants.filter(
      (item) =>
        item.status === OpenMatchParticipantStatus.JOINED &&
        item.teamSide !== null &&
        item.teamPosition !== null,
    );

    if (joinedParticipants.length !== this.maxSlots) {
      return;
    }

    const approvalByPlayerId = new Map(snapshot.resultApprovals.map((item) => [item.playerId, item.decision]));
    const approvalsComplete = joinedParticipants.every(
      (participant) => approvalByPlayerId.get(participant.playerId) === OpenMatchApprovalDecision.APPROVED,
    );

    if (!approvalsComplete) {
      return;
    }

    const finalized = await this.prisma.$transaction(async (tx) => {
      const claim = await tx.openMatch.updateMany({
        where: {
          id: openMatchId,
          status: OpenMatchStatus.RESULT_PENDING,
          finalMatchId: null,
        },
        data: {
          status: OpenMatchStatus.COMPLETED,
        },
      });

      if (claim.count === 0) {
        return null;
      }

      const openMatch = await tx.openMatch.findUnique({
        where: { id: openMatchId },
        include: {
          participants: {
            include: {
              player: {
                select: {
                  id: true,
                  currentElo: true,
                  userId: true,
                },
              },
            },
          },
          resultApprovals: true,
          creator: {
            select: {
              userId: true,
            },
          },
        },
      });

      if (!openMatch) {
        throw new NotFoundException('Open match not found during finalization');
      }

      const joined = openMatch.participants.filter(
        (item) =>
          item.status === OpenMatchParticipantStatus.JOINED &&
          item.teamSide !== null &&
          item.teamPosition !== null,
      );

      if (joined.length !== this.maxSlots) {
        throw new BadRequestException('Open match is missing joined participants');
      }

      const approvals = new Map(openMatch.resultApprovals.map((item) => [item.playerId, item.decision]));
      const allApproved = joined.every(
        (participant) => approvals.get(participant.playerId) === OpenMatchApprovalDecision.APPROVED,
      );

      if (!allApproved) {
        throw new BadRequestException('Open match result is not fully approved');
      }

      const teamA = joined
        .filter((item) => item.teamSide === TeamSide.A)
        .sort((left, right) => (left.teamPosition ?? 0) - (right.teamPosition ?? 0));
      const teamB = joined
        .filter((item) => item.teamSide === TeamSide.B)
        .sort((left, right) => (left.teamPosition ?? 0) - (right.teamPosition ?? 0));

      if (teamA.length !== 2 || teamB.length !== 2) {
        throw new BadRequestException('Open match must contain two complete teams');
      }

      if (!openMatch.proposedWinnerSide) {
        throw new BadRequestException('Winner side is required for finalization');
      }

      const teamAAverage = Math.round((teamA[0].player.currentElo + teamA[1].player.currentElo) / 2);
      const teamBAverage = Math.round((teamB[0].player.currentElo + teamB[1].player.currentElo) / 2);

      const setScore = this.resolveFinalSetScore(openMatch);

      const match = await tx.match.create({
        data: {
          status: MatchStatus.COMPLETED,
          resultSource: MatchResultSource.MANUAL,
          playedAt: openMatch.playedAt ?? new Date(),
          winnerTeamSide: openMatch.proposedWinnerSide,
          isRated: openMatch.isRated,
          createdByUserId: openMatch.creator.userId,
          teams: {
            create: [
              {
                side: TeamSide.A,
                player1Id: teamA[0].playerId,
                player2Id: teamA[1].playerId,
                teamAverageElo: teamAAverage,
              },
              {
                side: TeamSide.B,
                player1Id: teamB[0].playerId,
                player2Id: teamB[1].playerId,
                teamAverageElo: teamBAverage,
              },
            ],
          },
          setScores: {
            create: [
              {
                setNumber: 1,
                teamAScore: setScore.teamAScore,
                teamBScore: setScore.teamBScore,
              },
            ],
          },
        },
      });

      await tx.openMatch.update({
        where: { id: openMatch.id },
        data: {
          finalMatchId: match.id,
        },
      });

      await tx.auditLog.create({
        data: {
          actorUserId: openMatch.creator.userId,
          action: 'open-match.finalized',
          entityType: 'OpenMatch',
          entityId: openMatch.id,
          context: {
            finalMatchId: match.id,
            scoringMode: openMatch.scoringMode,
            isRated: openMatch.isRated,
          },
        },
      });

      return {
        openMatchId: openMatch.id,
        finalMatchId: match.id,
        isRated: openMatch.isRated,
      };
    });

    if (!finalized) {
      return;
    }

    if (finalized.isRated) {
      try {
        await this.ratingsService.applyRatingsForMatch(finalized.finalMatchId);
      } catch (error) {
        if (!(error instanceof ConflictException)) {
          throw error;
        }
      }

      await this.prisma.openMatch.update({
        where: { id: finalized.openMatchId },
        data: {
          ratingAppliedAt: new Date(),
        },
      });
    }
  }

  private resolveFinalSetScore(openMatch: {
    scoringMode: OpenMatchScoringMode;
    proposedTeamAPoints: number | null;
    proposedTeamBPoints: number | null;
    proposedTeamASetsWon: number | null;
    proposedTeamBSetsWon: number | null;
  }): { teamAScore: number; teamBScore: number } {
    if (openMatch.scoringMode === OpenMatchScoringMode.POINTS) {
      if (openMatch.proposedTeamAPoints === null || openMatch.proposedTeamBPoints === null) {
        throw new BadRequestException('Points result is missing');
      }

      return {
        teamAScore: openMatch.proposedTeamAPoints,
        teamBScore: openMatch.proposedTeamBPoints,
      };
    }

    if (openMatch.proposedTeamASetsWon === null || openMatch.proposedTeamBSetsWon === null) {
      throw new BadRequestException('Sets result is missing');
    }

    return {
      teamAScore: openMatch.proposedTeamASetsWon,
      teamBScore: openMatch.proposedTeamBSetsWon,
    };
  }

  private resolveResultPayload(
    openMatch: {
      scoringMode: OpenMatchScoringMode;
      pointsToWin: number;
      setsToWin: number;
    },
    dto: SubmitOpenMatchResultDto,
  ): {
    winnerSide: TeamSide;
    teamAPoints: number | null;
    teamBPoints: number | null;
    teamASetsWon: number | null;
    teamBSetsWon: number | null;
  } {
    if (openMatch.scoringMode === OpenMatchScoringMode.POINTS) {
      if (dto.teamAPoints === undefined || dto.teamBPoints === undefined) {
        throw new BadRequestException('teamAPoints and teamBPoints are required for points mode');
      }

      if (dto.teamAPoints === dto.teamBPoints) {
        throw new BadRequestException('Points result cannot end in a draw');
      }

      const winnerSide = dto.teamAPoints > dto.teamBPoints ? TeamSide.A : TeamSide.B;
      if (dto.winnerSide && dto.winnerSide !== winnerSide) {
        throw new BadRequestException('winnerSide does not match points score');
      }

      const maxPoints = Math.max(dto.teamAPoints, dto.teamBPoints);
      if (maxPoints < openMatch.pointsToWin) {
        throw new BadRequestException('Winning side must reach pointsToWin threshold');
      }

      return {
        winnerSide,
        teamAPoints: dto.teamAPoints,
        teamBPoints: dto.teamBPoints,
        teamASetsWon: null,
        teamBSetsWon: null,
      };
    }

    if (dto.teamASetsWon === undefined || dto.teamBSetsWon === undefined) {
      throw new BadRequestException('teamASetsWon and teamBSetsWon are required for sets mode');
    }

    if (dto.teamASetsWon === dto.teamBSetsWon) {
      throw new BadRequestException('Sets result cannot end in a draw');
    }

    const winnerSide = dto.teamASetsWon > dto.teamBSetsWon ? TeamSide.A : TeamSide.B;
    if (dto.winnerSide && dto.winnerSide !== winnerSide) {
      throw new BadRequestException('winnerSide does not match sets score');
    }

    const winnerSets = Math.max(dto.teamASetsWon, dto.teamBSetsWon);
    if (winnerSets < openMatch.setsToWin) {
      throw new BadRequestException('Winning side must reach setsToWin threshold');
    }

    return {
      winnerSide,
      teamAPoints: null,
      teamBPoints: null,
      teamASetsWon: dto.teamASetsWon,
      teamBSetsWon: dto.teamBSetsWon,
    };
  }

  private validateScoringConfig(
    scoringMode: OpenMatchScoringMode,
    pointsToWin: number,
    setsToWin: number,
  ): void {
    if (scoringMode === OpenMatchScoringMode.POINTS && pointsToWin < 1) {
      throw new BadRequestException('pointsToWin must be greater than 0');
    }

    if (scoringMode === OpenMatchScoringMode.SETS && setsToWin < 1) {
      throw new BadRequestException('setsToWin must be greater than 0');
    }
  }

  private normalizeOptionalString(value: string | undefined): string | null {
    if (!value) {
      return null;
    }

    const normalized = value.trim();
    return normalized.length > 0 ? normalized : null;
  }

  private async fetchOpenMatchWithRelations(openMatchId: string): Promise<OpenMatchWithRelations> {
    const openMatch = await this.prisma.openMatch.findUnique({
      where: { id: openMatchId },
      include: OPEN_MATCH_INCLUDE,
    });

    if (!openMatch) {
      throw new NotFoundException('Open match not found');
    }

    return openMatch;
  }

  private async loadOpenMatchForMutation(
    tx: Prisma.TransactionClient,
    openMatchId: string,
  ): Promise<
    Prisma.OpenMatchGetPayload<{
      include: {
        participants: true;
      };
    }>
  > {
    const openMatch = await tx.openMatch.findUnique({
      where: { id: openMatchId },
      include: {
        participants: true,
      },
    });

    if (!openMatch) {
      throw new NotFoundException('Open match not found');
    }

    return openMatch;
  }

  private ensureCaptain(openMatch: { creatorPlayerId: string }, actorPlayerId: string): void {
    if (openMatch.creatorPlayerId !== actorPlayerId) {
      throw new ConflictException('Only match creator can perform this action');
    }
  }

  private ensureJoinableStatus(status: OpenMatchStatus): void {
    if (status !== OpenMatchStatus.OPEN) {
      throw new ConflictException('This open match is no longer accepting participants');
    }
  }

  private countJoinedParticipants(
    participants: Array<{ status: OpenMatchParticipantStatus }>,
  ): number {
    return participants.filter((item) => item.status === OpenMatchParticipantStatus.JOINED).length;
  }

  private extractJoinedParticipants<T extends { status: OpenMatchParticipantStatus }>(participants: T[]): T[] {
    return participants.filter((item) => item.status === OpenMatchParticipantStatus.JOINED);
  }

  private resolveNextSlot(
    participants: Array<{
      status: OpenMatchParticipantStatus;
      teamSide: TeamSide | null;
      teamPosition: number | null;
    }>,
    options?: {
      preferredSide?: TeamSide;
      preferredPosition?: number;
    },
  ): Slot | null {
    const joined = participants.filter((item) => item.status === OpenMatchParticipantStatus.JOINED);
    const taken = new Set(
      joined
        .filter((item) => item.teamSide && item.teamPosition)
        .map((item) => `${item.teamSide}:${item.teamPosition}`),
    );

    const candidateQueue: Slot[] = [];

    if (options?.preferredSide && options?.preferredPosition) {
      candidateQueue.push({
        teamSide: options.preferredSide,
        teamPosition: options.preferredPosition,
      });
    } else if (options?.preferredSide) {
      candidateQueue.push({ teamSide: options.preferredSide, teamPosition: 1 });
      candidateQueue.push({ teamSide: options.preferredSide, teamPosition: 2 });
    } else if (options?.preferredPosition) {
      candidateQueue.push({ teamSide: TeamSide.A, teamPosition: options.preferredPosition });
      candidateQueue.push({ teamSide: TeamSide.B, teamPosition: options.preferredPosition });
    }

    candidateQueue.push({ teamSide: TeamSide.A, teamPosition: 1 });
    candidateQueue.push({ teamSide: TeamSide.A, teamPosition: 2 });
    candidateQueue.push({ teamSide: TeamSide.B, teamPosition: 1 });
    candidateQueue.push({ teamSide: TeamSide.B, teamPosition: 2 });

    for (const candidate of candidateQueue) {
      if (!taken.has(`${candidate.teamSide}:${candidate.teamPosition}`)) {
        return candidate;
      }
    }

    return null;
  }

  private async syncOpenMatchReadyStatus(tx: Prisma.TransactionClient, openMatchId: string): Promise<void> {
    const openMatch = await tx.openMatch.findUnique({
      where: { id: openMatchId },
      select: {
        id: true,
        status: true,
        participants: {
          select: {
            status: true,
          },
        },
      },
    });

    if (!openMatch) {
      throw new NotFoundException('Open match not found');
    }

    if (
      openMatch.status === OpenMatchStatus.CANCELLED ||
      openMatch.status === OpenMatchStatus.COMPLETED ||
      openMatch.status === OpenMatchStatus.RESULT_PENDING
    ) {
      return;
    }

    const joinedCount = openMatch.participants.filter(
      (participant) => participant.status === OpenMatchParticipantStatus.JOINED,
    ).length;

    const nextStatus = joinedCount >= this.maxSlots ? OpenMatchStatus.READY : OpenMatchStatus.OPEN;

    if (nextStatus !== openMatch.status) {
      await tx.openMatch.update({
        where: { id: openMatch.id },
        data: { status: nextStatus },
      });
    }
  }

  private async resolvePlayerProfileByUserId(userId: string): Promise<{
    id: string;
  }> {
    const playerProfile = await this.prisma.playerProfile.findUnique({
      where: { userId },
      select: { id: true },
    });

    if (!playerProfile) {
      throw new BadRequestException('This account does not have a player profile');
    }

    return playerProfile;
  }

  private buildListFilter(query: ListOpenMatchesQueryDto, actorPlayerId: string): Prisma.OpenMatchWhereInput {
    if (query.mine) {
      if (query.status) {
        return {
          status: query.status,
          OR: [
            { creatorPlayerId: actorPlayerId },
            {
              participants: {
                some: {
                  playerId: actorPlayerId,
                },
              },
            },
          ],
        };
      }

      return {
        status: {
          in: [
            OpenMatchStatus.OPEN,
            OpenMatchStatus.READY,
            OpenMatchStatus.RESULT_PENDING,
            OpenMatchStatus.COMPLETED,
          ],
        },
        OR: [
          { creatorPlayerId: actorPlayerId },
          {
            participants: {
              some: {
                playerId: actorPlayerId,
              },
            },
          },
        ],
      };
    }

    return {
      status: query.status ?? OpenMatchStatus.OPEN,
    };
  }

  private toOpenMatchView(openMatch: OpenMatchWithRelations, viewerPlayerId: string) {
    const joinedParticipants = openMatch.participants
      .filter((item) => item.status === OpenMatchParticipantStatus.JOINED)
      .sort((left, right) => {
        const sideDelta = (left.teamSide ?? TeamSide.B).localeCompare(right.teamSide ?? TeamSide.B);
        if (sideDelta !== 0) {
          return sideDelta;
        }

        return (left.teamPosition ?? 99) - (right.teamPosition ?? 99);
      });

    const approvalByPlayerId = new Map(openMatch.resultApprovals.map((item) => [item.playerId, item.decision]));
    const requiredApprovals = joinedParticipants.length;
    const approved = joinedParticipants.filter(
      (participant) => approvalByPlayerId.get(participant.playerId) === OpenMatchApprovalDecision.APPROVED,
    ).length;
    const rejected = joinedParticipants.filter(
      (participant) => approvalByPlayerId.get(participant.playerId) === OpenMatchApprovalDecision.REJECTED,
    ).length;

    const viewerParticipation = openMatch.participants.find((item) => item.playerId === viewerPlayerId);

    return {
      id: openMatch.id,
      status: openMatch.status,
      scoringMode: openMatch.scoringMode,
      isRated: openMatch.isRated,
      pointsToWin: openMatch.pointsToWin,
      setsToWin: openMatch.setsToWin,
      scheduledAt: openMatch.scheduledAt,
      location: openMatch.location,
      notes: openMatch.notes,
      createdAt: openMatch.createdAt,
      updatedAt: openMatch.updatedAt,
      playedAt: openMatch.playedAt,
      finalMatchId: openMatch.finalMatchId,
      ratingAppliedAt: openMatch.ratingAppliedAt,
      creator: openMatch.creator,
      availableSlots: Math.max(0, this.maxSlots - joinedParticipants.length),
      joinedCount: joinedParticipants.length,
      pendingRequestsCount: openMatch.participants.filter(
        (item) => item.status === OpenMatchParticipantStatus.REQUESTED,
      ).length,
      participants: openMatch.participants.map((participant) => ({
        id: participant.id,
        playerId: participant.playerId,
        status: participant.status,
        teamSide: participant.teamSide,
        teamPosition: participant.teamPosition,
        joinedAt: participant.joinedAt,
        respondedAt: participant.respondedAt,
        invitedByPlayerId: participant.invitedByPlayerId,
        player: participant.player,
      })),
      resultProposal:
        openMatch.status === OpenMatchStatus.RESULT_PENDING || openMatch.status === OpenMatchStatus.COMPLETED
          ? {
              winnerSide: openMatch.proposedWinnerSide,
              teamAPoints: openMatch.proposedTeamAPoints,
              teamBPoints: openMatch.proposedTeamBPoints,
              teamASetsWon: openMatch.proposedTeamASetsWon,
              teamBSetsWon: openMatch.proposedTeamBSetsWon,
              submittedAt: openMatch.resultSubmittedAt,
              submittedBy: openMatch.resultSubmittedBy,
            }
          : null,
      approvals: openMatch.resultApprovals.map((approval) => ({
        id: approval.id,
        playerId: approval.playerId,
        decision: approval.decision,
        decidedAt: approval.decidedAt,
        player: approval.player,
      })),
      approvalSummary: {
        required: requiredApprovals,
        approved,
        rejected,
        pending: Math.max(0, requiredApprovals - approved - rejected),
      },
      viewer: {
        playerId: viewerPlayerId,
        isCaptain: openMatch.creatorPlayerId === viewerPlayerId,
        participationStatus: viewerParticipation?.status ?? null,
        isJoined: viewerParticipation?.status === OpenMatchParticipantStatus.JOINED,
      },
    };
  }
}
