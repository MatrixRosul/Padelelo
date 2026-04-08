import { PrismaClient, TeamSide, UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const DEFAULT_ELO = 1400;
const DEFAULT_K = 32;

function expectedScore(teamRating: number, opponentRating: number): number {
  return 1 / (1 + Math.pow(10, (opponentRating - teamRating) / 400));
}

function calculateDelta(teamRating: number, opponentRating: number, score: 0 | 1): number {
  const expected = expectedScore(teamRating, opponentRating);
  return Math.round(DEFAULT_K * (score - expected));
}

async function applyCompletedMatch(params: {
  matchId: string;
  teamA: [string, string];
  teamB: [string, string];
  winner: TeamSide;
}) {
  const players = await prisma.playerProfile.findMany({
    where: {
      id: {
        in: [...params.teamA, ...params.teamB],
      },
    },
  });

  const playerMap = new Map(players.map((player) => [player.id, player]));
  const teamARating = Math.round(
    (playerMap.get(params.teamA[0])!.currentElo + playerMap.get(params.teamA[1])!.currentElo) / 2,
  );
  const teamBRating = Math.round(
    (playerMap.get(params.teamB[0])!.currentElo + playerMap.get(params.teamB[1])!.currentElo) / 2,
  );

  const scoreA: 0 | 1 = params.winner === TeamSide.A ? 1 : 0;
  const scoreB: 0 | 1 = scoreA === 1 ? 0 : 1;

  const deltaA = calculateDelta(teamARating, teamBRating, scoreA);
  const deltaB = -deltaA;

  const expectedA = expectedScore(teamARating, teamBRating);
  const expectedB = 1 - expectedA;

  await prisma.$transaction(async (tx) => {
    await tx.match.update({
      where: { id: params.matchId },
      data: {
        status: 'COMPLETED',
        winnerTeamSide: params.winner,
        playedAt: new Date(),
      },
    });

    await tx.matchTeam.update({
      where: { matchId_side: { matchId: params.matchId, side: TeamSide.A } },
      data: {
        teamAverageElo: teamARating,
        expectedScore: expectedA,
        actualScore: scoreA,
        ratingDelta: deltaA,
        isWinner: scoreA === 1,
      },
    });

    await tx.matchTeam.update({
      where: { matchId_side: { matchId: params.matchId, side: TeamSide.B } },
      data: {
        teamAverageElo: teamBRating,
        expectedScore: expectedB,
        actualScore: scoreB,
        ratingDelta: deltaB,
        isWinner: scoreB === 1,
      },
    });

    for (const playerId of params.teamA) {
      const before = playerMap.get(playerId)!.currentElo;
      const after = before + deltaA;

      await tx.playerProfile.update({
        where: { id: playerId },
        data: {
          currentElo: after,
          matchesPlayed: { increment: 1 },
          wins: scoreA === 1 ? { increment: 1 } : undefined,
          losses: scoreA === 0 ? { increment: 1 } : undefined,
        },
      });

      await tx.ratingHistory.create({
        data: {
          playerId,
          matchId: params.matchId,
          reason: 'MATCH_RESULT',
          beforeRating: before,
          afterRating: after,
          delta: deltaA,
          kFactor: DEFAULT_K,
          expectedScore: expectedA,
          actualScore: scoreA,
        },
      });
    }

    for (const playerId of params.teamB) {
      const before = playerMap.get(playerId)!.currentElo;
      const after = before + deltaB;

      await tx.playerProfile.update({
        where: { id: playerId },
        data: {
          currentElo: after,
          matchesPlayed: { increment: 1 },
          wins: scoreB === 1 ? { increment: 1 } : undefined,
          losses: scoreB === 0 ? { increment: 1 } : undefined,
        },
      });

      await tx.ratingHistory.create({
        data: {
          playerId,
          matchId: params.matchId,
          reason: 'MATCH_RESULT',
          beforeRating: before,
          afterRating: after,
          delta: deltaB,
          kFactor: DEFAULT_K,
          expectedScore: expectedB,
          actualScore: scoreB,
        },
      });
    }
  });
}

async function main() {
  await prisma.auditLog.deleteMany();
  await prisma.ratingHistory.deleteMany();
  await prisma.matchSetScore.deleteMany();
  await prisma.matchTeam.deleteMany();
  await prisma.match.deleteMany();
  await prisma.tournamentRegistration.deleteMany();
  await prisma.tournamentTeam.deleteMany();
  await prisma.tournamentCategory.deleteMany();
  await prisma.tournament.deleteMany();
  await prisma.cSVImportJob.deleteMany();
  await prisma.playerProfile.deleteMany();
  await prisma.eloConfig.deleteMany();
  await prisma.user.deleteMany();

  const adminPasswordHash = await bcrypt.hash('Admin1234', 10);
  const playerPasswordHash = await bcrypt.hash('Player1234', 10);

  const admin = await prisma.user.create({
    data: {
      email: 'admin@padelelo.app',
      passwordHash: adminPasswordHash,
      role: UserRole.ADMIN,
    },
  });

  await prisma.user.create({
    data: {
      email: 'import-admin@padelelo.local',
      passwordHash: adminPasswordHash,
      role: UserRole.ADMIN,
    },
  });

  await prisma.eloConfig.create({
    data: {
      name: 'default',
      isActive: true,
      defaultRating: DEFAULT_ELO,
      kFactor: DEFAULT_K,
      minKFactor: 16,
      maxKFactor: 64,
      provisionalGames: 20,
      provisionalKFactor: 40,
      homeAdvantage: 0,
      updatedByUserId: admin.id,
    },
  });

  const playerData = [
    { email: 'alex@padelelo.app', fullName: 'Alex Romanov', displayName: 'Alex R.', gender: 'MALE' as const },
    { email: 'marco@padelelo.app', fullName: 'Marco Varela', displayName: 'Marco V.', gender: 'MALE' as const },
    { email: 'elena@padelelo.app', fullName: 'Elena Garcia', displayName: 'Elena G.', gender: 'FEMALE' as const },
    { email: 'sandra@padelelo.app', fullName: 'Sandra Kovac', displayName: 'Sandra K.', gender: 'FEMALE' as const },
    { email: 'daniel@padelelo.app', fullName: 'Daniel Smith', displayName: 'Daniel S.', gender: 'MALE' as const },
    { email: 'sofia@padelelo.app', fullName: 'Sofia Mendez', displayName: 'Sofia M.', gender: 'FEMALE' as const },
    { email: 'liam@padelelo.app', fullName: 'Liam Walker', displayName: 'Liam W.', gender: 'MALE' as const },
    { email: 'clara@padelelo.app', fullName: 'Clara Jimenez', displayName: 'Clara J.', gender: 'FEMALE' as const },
  ];

  const players = [] as Array<{ userId: string; profileId: string }>;

  for (const data of playerData) {
    const user = await prisma.user.create({
      data: {
        email: data.email,
        passwordHash: playerPasswordHash,
        role: UserRole.PLAYER,
        playerProfile: {
          create: {
            fullName: data.fullName,
            displayName: data.displayName,
            currentElo: DEFAULT_ELO,
            country: 'Spain',
            city: 'Madrid',
            gender: data.gender,
          },
        },
      },
      include: { playerProfile: true },
    });

    players.push({ userId: user.id, profileId: user.playerProfile!.id });
  }

  const tournament = await prisma.tournament.create({
    data: {
      name: 'Madrid Spring Open',
      slug: 'madrid-spring-open',
      description: 'Seed tournament with mixed and open categories',
      location: 'Madrid Padel Arena',
      startDate: new Date('2026-05-01T09:00:00.000Z'),
      endDate: new Date('2026-05-05T20:00:00.000Z'),
      status: 'PUBLISHED',
      registrationStatus: 'OPEN',
      registrationOpenAt: new Date('2026-04-01T09:00:00.000Z'),
      createdByUserId: admin.id,
      categories: {
        create: [
          {
            name: 'Open Elite',
            discipline: 'OPEN',
            maxParticipants: 16,
            format: 'SINGLE_ELIMINATION',
            seededEntriesCount: 4,
          },
          {
            name: 'Mixed Masters',
            discipline: 'MIXED',
            genderEligibility: 'MIXED_ONLY',
            maxParticipants: 12,
            format: 'ROUND_ROBIN',
          },
        ],
      },
    },
    include: { categories: true },
  });

  const openCategory = tournament.categories.find((category) => category.discipline === 'OPEN')!;

  const teamOne = await prisma.tournamentTeam.create({
    data: {
      tournamentCategoryId: openCategory.id,
      player1Id: players[0].profileId,
      player2Id: players[1].profileId,
      seedNumber: 1,
    },
  });

  const teamTwo = await prisma.tournamentTeam.create({
    data: {
      tournamentCategoryId: openCategory.id,
      player1Id: players[2].profileId,
      player2Id: players[3].profileId,
      seedNumber: 2,
    },
  });

  const teamThree = await prisma.tournamentTeam.create({
    data: {
      tournamentCategoryId: openCategory.id,
      player1Id: players[4].profileId,
      player2Id: players[5].profileId,
      seedNumber: 3,
    },
  });

  for (const team of [teamOne, teamTwo, teamThree]) {
    await prisma.tournamentRegistration.create({
      data: {
        tournamentId: tournament.id,
        tournamentCategoryId: openCategory.id,
        teamId: team.id,
        status: 'CONFIRMED',
      },
    });
  }

  const matchOne = await prisma.match.create({
    data: {
      tournamentId: tournament.id,
      tournamentCategoryId: openCategory.id,
      status: 'SCHEDULED',
      createdByUserId: admin.id,
      roundLabel: 'Quarterfinal',
      bracketStage: 'QUARTERFINAL',
      teams: {
        create: [
          {
            side: TeamSide.A,
            player1Id: players[0].profileId,
            player2Id: players[1].profileId,
            teamAverageElo: DEFAULT_ELO,
          },
          {
            side: TeamSide.B,
            player1Id: players[2].profileId,
            player2Id: players[3].profileId,
            teamAverageElo: DEFAULT_ELO,
          },
        ],
      },
      setScores: {
        create: [
          { setNumber: 1, teamAScore: 6, teamBScore: 4 },
          { setNumber: 2, teamAScore: 6, teamBScore: 3 },
        ],
      },
    },
  });

  await applyCompletedMatch({
    matchId: matchOne.id,
    teamA: [players[0].profileId, players[1].profileId],
    teamB: [players[2].profileId, players[3].profileId],
    winner: TeamSide.A,
  });

  const matchTwo = await prisma.match.create({
    data: {
      tournamentId: tournament.id,
      tournamentCategoryId: openCategory.id,
      status: 'SCHEDULED',
      createdByUserId: admin.id,
      roundLabel: 'Semifinal',
      bracketStage: 'SEMIFINAL',
      teams: {
        create: [
          {
            side: TeamSide.A,
            player1Id: players[0].profileId,
            player2Id: players[1].profileId,
            teamAverageElo: DEFAULT_ELO,
          },
          {
            side: TeamSide.B,
            player1Id: players[4].profileId,
            player2Id: players[5].profileId,
            teamAverageElo: DEFAULT_ELO,
          },
        ],
      },
      setScores: {
        create: [
          { setNumber: 1, teamAScore: 4, teamBScore: 6 },
          { setNumber: 2, teamAScore: 5, teamBScore: 7 },
        ],
      },
    },
  });

  await applyCompletedMatch({
    matchId: matchTwo.id,
    teamA: [players[0].profileId, players[1].profileId],
    teamB: [players[4].profileId, players[5].profileId],
    winner: TeamSide.B,
  });

  await prisma.cSVImportJob.create({
    data: {
      type: 'MATCHES_CSV',
      status: 'COMPLETED',
      fileName: 'historical_matches_seed.csv',
      metadata: { source: 'seed' },
      totalRows: 2,
      processedRows: 2,
      successfulRows: 2,
      failedRows: 0,
      requestedByUserId: admin.id,
      startedAt: new Date(),
      finishedAt: new Date(),
    },
  });

  await prisma.auditLog.create({
    data: {
      actorUserId: admin.id,
      action: 'seed.completed',
      entityType: 'System',
      entityId: 'seed',
      context: {
        players: players.length,
        tournamentId: tournament.id,
      },
    },
  });

  console.log('Seed completed successfully');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
