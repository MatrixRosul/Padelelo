import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  async getDashboard() {
    const [users, players, tournaments, openTournaments, scheduledMatches, completedMatches, pendingImports] =
      await Promise.all([
        this.prisma.user.count(),
        this.prisma.playerProfile.count(),
        this.prisma.tournament.count(),
        this.prisma.tournament.count({ where: { registrationStatus: 'OPEN' } }),
        this.prisma.match.count({ where: { status: 'SCHEDULED' } }),
        this.prisma.match.count({ where: { status: 'COMPLETED' } }),
        this.prisma.cSVImportJob.count({ where: { status: { in: ['PENDING', 'PROCESSING'] } } }),
      ]);

    return {
      users,
      players,
      tournaments,
      openTournaments,
      scheduledMatches,
      completedMatches,
      pendingImports,
    };
  }

  async getAuditLog(limit = 100) {
    return this.prisma.auditLog.findMany({
      include: {
        actor: {
          select: {
            id: true,
            email: true,
            role: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 500),
    });
  }
}
