import { Injectable } from '@nestjs/common';
import { Prisma, TournamentDiscipline } from '@prisma/client';

import { buildPagination } from '../common/utils/pagination.util';
import { PrismaService } from '../prisma/prisma.service';
import { LeaderboardQueryDto } from './dto/leaderboard-query.dto';

@Injectable()
export class LeaderboardService {
  constructor(private readonly prisma: PrismaService) {}

  getGlobalLeaderboard(query: LeaderboardQueryDto) {
    const { skip, take } = buildPagination(query.page, query.limit);
    const where = this.buildPlayerFilter(query);

    return this.prisma.playerProfile.findMany({
      skip,
      take,
      where,
      orderBy: [{ currentElo: 'desc' }, { matchesPlayed: 'desc' }],
      select: {
        id: true,
        fullName: true,
        displayName: true,
        nickname: true,
        country: true,
        city: true,
        currentElo: true,
        wins: true,
        losses: true,
        matchesPlayed: true,
      },
    });
  }

  async getCategoryLeaderboard(category: TournamentDiscipline, query: LeaderboardQueryDto) {
    const { skip, take } = buildPagination(query.page, query.limit);
    const baseFilter = this.buildPlayerFilter(query);

    const entries = await this.prisma.playerProfile.findMany({
      where: {
        AND: [
          baseFilter,
          {
            OR: [
              {
                teamOneEntries: {
                  some: {
                    tournamentCategory: {
                      discipline: category,
                    },
                  },
                },
              },
              {
                teamTwoEntries: {
                  some: {
                    tournamentCategory: {
                      discipline: category,
                    },
                  },
                },
              },
            ],
          },
        ],
      },
      skip,
      take,
      orderBy: [{ currentElo: 'desc' }, { matchesPlayed: 'desc' }],
      select: {
        id: true,
        fullName: true,
        displayName: true,
        currentElo: true,
        country: true,
        matchesPlayed: true,
        wins: true,
        losses: true,
      },
    });

    return {
      category,
      entries,
    };
  }

  private buildPlayerFilter(query: LeaderboardQueryDto): Prisma.PlayerProfileWhereInput {
    const matchFilter: Prisma.MatchWhereInput = {
      status: 'COMPLETED',
    };

    if (query.tournamentId) {
      matchFilter.tournamentId = query.tournamentId;
    }

    if (query.categoryId) {
      matchFilter.tournamentCategoryId = query.categoryId;
    }

    if (!query.tournamentId && !query.categoryId) {
      return {};
    }

    return {
      OR: [
        {
          matchTeamOneEntries: {
            some: {
              match: matchFilter,
            },
          },
        },
        {
          matchTeamTwoEntries: {
            some: {
              match: matchFilter,
            },
          },
        },
      ],
    };
  }
}
