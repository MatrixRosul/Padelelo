import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { JwtPayload } from '../common/types/jwt-payload.type';
import { buildPagination } from '../common/utils/pagination.util';
import { PrismaService } from '../prisma/prisma.service';
import { UpdatePlayerDto } from './dto/update-player.dto';

@Injectable()
export class PlayersService {
  constructor(private readonly prisma: PrismaService) {}

  async listPlayers(page = 1, limit = 20, search?: string) {
    const { skip, take, page: safePage, limit: safeLimit } = buildPagination(page, limit);
    const normalizedSearch = search?.trim();

    const where: Prisma.PlayerProfileWhereInput = normalizedSearch
      ? {
          OR: [
            {
              fullName: {
                contains: normalizedSearch,
                mode: 'insensitive',
              },
            },
            {
              displayName: {
                contains: normalizedSearch,
                mode: 'insensitive',
              },
            },
            {
              nickname: {
                contains: normalizedSearch,
                mode: 'insensitive',
              },
            },
            {
              user: {
                email: {
                  contains: normalizedSearch,
                  mode: 'insensitive',
                },
              },
            },
          ],
        }
      : {};

    const [total, items] = await Promise.all([
      this.prisma.playerProfile.count({ where }),
      this.prisma.playerProfile.findMany({
        skip,
        take,
        where,
        orderBy: { currentElo: 'desc' },
        select: {
          id: true,
          fullName: true,
          displayName: true,
          nickname: true,
          avatarUrl: true,
          currentElo: true,
          wins: true,
          losses: true,
          matchesPlayed: true,
          createdAt: true,
          user: {
            select: {
              id: true,
              role: true,
              email: true,
            },
          },
        },
      }),
    ]);

    const totalPages = Math.max(1, Math.ceil(total / safeLimit));

    return {
      items,
      page: safePage,
      limit: safeLimit,
      total,
      totalPages,
      hasMore: safePage < totalPages,
    };
  }

  async getPlayerProfile(identifier: string) {
    const player = await this.resolvePlayerByIdentifier(identifier);
    const matches = await this.fetchMatchesByPlayerId(player.id);

    const eloHistory = await this.prisma.ratingHistory.findMany({
      where: { playerId: player.id },
      include: {
        match: {
          select: {
            id: true,
            playedAt: true,
            status: true,
            winnerTeamSide: true,
            tournamentId: true,
            tournamentCategoryId: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const tournamentsMap = new Map<string, {
      id: string;
      name: string;
      slug: string;
      startDate: Date;
      endDate: Date;
    }>();

    for (const match of matches) {
      if (!match.tournament) {
        continue;
      }

      tournamentsMap.set(match.tournament.id, {
        id: match.tournament.id,
        name: match.tournament.name,
        slug: match.tournament.slug,
        startDate: match.tournament.startDate,
        endDate: match.tournament.endDate,
      });
    }

    const username = this.resolveUsername(player.nickname, player.user.email);

    return {
      id: player.id,
      email: player.user.email,
      username,
      fullName: player.fullName,
      displayName: player.displayName,
      avatarUrl: player.avatarUrl,
      country: player.country,
      city: player.city,
      currentElo: player.currentElo,
      wins: player.wins,
      losses: player.losses,
      matchesPlayed: player.matchesPlayed,
      createdAt: player.createdAt,
      tournaments: Array.from(tournamentsMap.values()),
      matchHistory: matches,
      eloHistory: eloHistory.map((entry) => ({
        id: entry.id,
        matchId: entry.matchId,
        beforeRating: entry.beforeRating,
        afterRating: entry.afterRating,
        delta: entry.delta,
        kFactor: entry.kFactor,
        expectedScore: entry.expectedScore,
        actualScore: entry.actualScore,
        createdAt: entry.createdAt,
        match: entry.match,
      })),
    };
  }

  async updatePlayer(identifier: string, dto: UpdatePlayerDto, actor: JwtPayload) {
    const player = await this.resolvePlayerByIdentifier(identifier);

    if (actor.role !== 'ADMIN' && actor.sub !== player.userId) {
      throw new ForbiddenException('You can only edit your own profile');
    }

    if (dto.nickname !== undefined && !this.normalizeUsername(dto.nickname)) {
      throw new BadRequestException('Nickname must contain at least one valid username character');
    }

    const updateData: Prisma.PlayerProfileUpdateInput = {
      fullName: dto.fullName,
      displayName: dto.displayName,
      nickname: dto.nickname !== undefined ? this.normalizeUsername(dto.nickname) : undefined,
      avatarUrl: dto.avatarUrl,
      country: dto.country,
      city: dto.city,
      birthDate: dto.birthDate,
      gender: dto.gender,
      ageGroup: dto.ageGroup,
    };

    return this.prisma.playerProfile.update({
      where: { id: player.id },
      data: updateData,
      include: { user: { select: { id: true, role: true, email: true } } },
    });
  }

  async getPlayerMatches(identifier: string) {
    const player = await this.resolvePlayerByIdentifier(identifier);
    const matches = await this.fetchMatchesByPlayerId(player.id);

    return {
      playerId: player.id,
      username: this.resolveUsername(player.nickname, player.user.email),
      matches,
    };
  }

  private async fetchMatchesByPlayerId(playerId: string) {
    return this.prisma.match.findMany({
      where: {
        teams: {
          some: {
            OR: [{ player1Id: playerId }, { player2Id: playerId }],
          },
        },
      },
      include: {
        teams: {
          include: {
            player1: {
              select: {
                id: true,
                fullName: true,
                nickname: true,
              },
            },
            player2: {
              select: {
                id: true,
                fullName: true,
                nickname: true,
              },
            },
          },
        },
        setScores: {
          orderBy: { setNumber: 'asc' },
        },
        tournament: {
          select: {
            id: true,
            name: true,
            slug: true,
            startDate: true,
            endDate: true,
          },
        },
        tournamentCategory: {
          select: {
            id: true,
            name: true,
            discipline: true,
          },
        },
      },
      orderBy: [{ playedAt: 'desc' }, { createdAt: 'desc' }],
    });
  }

  private async resolvePlayerByIdentifier(identifier: string) {
    const trimmed = identifier.trim();

    const byId = await this.prisma.playerProfile.findUnique({
      where: { id: trimmed },
      include: {
        user: {
          select: {
            id: true,
            role: true,
            email: true,
          },
        },
      },
    });

    if (byId) {
      return byId;
    }

    const lowered = trimmed.toLowerCase();
    const player = await this.prisma.playerProfile.findFirst({
      where: {
        OR: [
          {
            nickname: {
              equals: lowered,
              mode: 'insensitive',
            },
          },
          {
            user: {
              email: trimmed.includes('@')
                ? {
                    equals: lowered,
                    mode: 'insensitive',
                  }
                : {
                    startsWith: `${lowered}@`,
                    mode: 'insensitive',
                  },
            },
          },
        ],
      },
      include: {
        user: {
          select: {
            id: true,
            role: true,
            email: true,
          },
        },
      },
    });

    if (!player) {
      throw new NotFoundException('Player not found');
    }

    return player;
  }

  private resolveUsername(nickname: string | null, email: string): string {
    if (nickname) {
      return nickname;
    }

    return this.usernameFromEmail(email);
  }

  private usernameFromEmail(email: string): string {
    return this.normalizeUsername(email.split('@')[0] ?? '') || 'player';
  }

  private normalizeUsername(value: string): string {
    return value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, '-')
      .replace(/[-_.]{2,}/g, '-')
      .replace(/^[-_.]+|[-_.]+$/g, '');
  }
}
