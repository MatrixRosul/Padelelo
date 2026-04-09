import {
  MatchResultSource,
  MatchStatus,
  PrismaClient,
  RegistrationStatus,
  RegistrationWindowStatus,
  TeamSide,
  TournamentDiscipline,
  TournamentFormat,
  TournamentRoundType,
  TournamentStatus,
  TournamentType,
  UserRole,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';

import { RatingsService } from '../src/ratings/ratings.service';

const prisma = new PrismaClient();

const DEMO_TOURNAMENT_NAME = 'Americano Demo 8x2';
const DEMO_TOURNAMENT_SLUG = 'americano-demo-8x2';
const DEMO_CATEGORY_NAME = 'Americano Open';
const DEMO_PLAYER_PASSWORD = 'player123';

const DEMO_PLAYERS = [
  { number: 1, login: 'maksym_rosul', fullName: 'Maksym Rosul' },
  { number: 2, login: 'andrii_samsonov', fullName: 'Andrii Samsonov' },
  { number: 3, login: 'mykyta_omelchenko', fullName: 'Mykyta Omelchenko' },
  { number: 4, login: 'oleksandr_hrin', fullName: 'Oleksandr Hrin' },
  { number: 5, login: 'yurii_ploskina', fullName: 'Yurii Ploskina' },
  { number: 6, login: 'mykola_savula', fullName: 'Mykola Savula' },
  { number: 7, login: 'vasyl_prodan', fullName: 'Vasyl Prodan' },
  { number: 8, login: 'vladyslav_trompak', fullName: 'Vladyslav Trompak' },
] as const;

type Fixture = {
  teamA: [number, number];
  teamB: [number, number];
};

const ROUND_FIXTURES: Fixture[] = [
  { teamA: [5, 7], teamB: [6, 3] },
  { teamA: [4, 2], teamB: [8, 1] },
  { teamA: [5, 1], teamB: [8, 7] },
  { teamA: [6, 4], teamB: [3, 2] },
  { teamA: [2, 8], teamB: [7, 3] },
  { teamA: [4, 1], teamB: [6, 5] },
  { teamA: [3, 1], teamB: [5, 2] },
  { teamA: [8, 6], teamB: [7, 4] },
  { teamA: [6, 7], teamB: [2, 1] },
  { teamA: [3, 5], teamB: [8, 4] },
  { teamA: [7, 2], teamB: [5, 4] },
  { teamA: [8, 3], teamB: [6, 1] },
  { teamA: [4, 3], teamB: [1, 7] },
  { teamA: [8, 5], teamB: [6, 2] },
];

const SCORE_PLAN: Array<[number, number]> = [
  [21, 17],
  [16, 21],
  [20, 18],
  [17, 21],
  [21, 15],
  [18, 21],
  [22, 14],
  [17, 21],
  [19, 21],
  [21, 16],
  [16, 21],
  [22, 18],
  [21, 17],
  [18, 21],
];

function loginToEmail(login: string): string {
  return `${login}@padelelo.local`;
}

async function ensureAdminUser(passwordHash: string, defaultRating: number): Promise<string> {
  const existing = await prisma.user.findFirst({
    where: { role: UserRole.ADMIN },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });

  if (existing) {
    return existing.id;
  }

  const adminEmail = 'admin@padelelo.local';
  const adminLogin = 'admin';

  const created = await prisma.user.create({
    data: {
      email: adminEmail,
      passwordHash,
      role: UserRole.ADMIN,
      playerProfile: {
        create: {
          fullName: 'Padelelo Admin',
          displayName: 'Padelelo Admin',
          nickname: adminLogin,
          currentElo: defaultRating,
        },
      },
    },
    select: { id: true },
  });

  return created.id;
}

async function ensurePlayerProfile(params: {
  login: string;
  fullName: string;
  passwordHash: string;
  defaultRating: number;
}): Promise<string> {
  const email = loginToEmail(params.login);

  const user = await prisma.user.upsert({
    where: { email },
    update: {
      passwordHash: params.passwordHash,
      role: UserRole.PLAYER,
      isActive: true,
      playerProfile: {
        upsert: {
          update: {
            fullName: params.fullName,
            displayName: params.fullName,
            nickname: params.login,
          },
          create: {
            fullName: params.fullName,
            displayName: params.fullName,
            nickname: params.login,
            currentElo: params.defaultRating,
          },
        },
      },
    },
    create: {
      email,
      passwordHash: params.passwordHash,
      role: UserRole.PLAYER,
      playerProfile: {
        create: {
          fullName: params.fullName,
          displayName: params.fullName,
          nickname: params.login,
          currentElo: params.defaultRating,
        },
      },
    },
    include: {
      playerProfile: {
        select: { id: true },
      },
    },
  });

  if (!user.playerProfile) {
    throw new Error(`Failed to ensure player profile for ${params.fullName}`);
  }

  return user.playerProfile.id;
}

function fixtureToLabel(fixture: Fixture): string {
  const left = `${fixture.teamA[0]}/${fixture.teamA[1]}`;
  const right = `${fixture.teamB[0]}/${fixture.teamB[1]}`;
  return `${left} : ${right}`;
}

async function main() {
  const activeConfig = await prisma.eloConfig.findFirst({
    where: { isActive: true },
    select: { defaultRating: true },
  });

  const defaultRating = activeConfig?.defaultRating ?? 1400;
  const passwordHash = await bcrypt.hash(DEMO_PLAYER_PASSWORD, 10);

  const adminUserId = await ensureAdminUser(passwordHash, defaultRating);

  const playerIdByNumber = new Map<number, string>();
  for (const player of DEMO_PLAYERS) {
    const playerId = await ensurePlayerProfile({
      login: player.login,
      fullName: player.fullName,
      passwordHash,
      defaultRating,
    });

    playerIdByNumber.set(player.number, playerId);
  }

  const existingTournament = await prisma.tournament.findUnique({
    where: { slug: DEMO_TOURNAMENT_SLUG },
    select: { id: true },
  });

  if (existingTournament) {
    await prisma.tournament.delete({
      where: { id: existingTournament.id },
    });
  }

  const now = new Date();
  const startDate = new Date(now);
  startDate.setMinutes(0, 0, 0);
  startDate.setHours(startDate.getHours() - 1);

  const endDate = new Date(startDate);
  endDate.setHours(startDate.getHours() + 7);

  const tournament = await prisma.tournament.create({
    data: {
      name: DEMO_TOURNAMENT_NAME,
      slug: DEMO_TOURNAMENT_SLUG,
      type: TournamentType.AMERICANO,
      description: 'Seeded Americano demo with 8 players and 2 courts',
      location: 'PadelElo Demo Club',
      courtsCount: 2,
      maxPlayers: 8,
      date: startDate,
      startDate,
      endDate,
      status: TournamentStatus.FINISHED,
      registrationStatus: RegistrationWindowStatus.CLOSED,
      registrationOpenAt: new Date(startDate.getTime() - 24 * 60 * 60 * 1000),
      registrationCloseAt: startDate,
      publishedAt: new Date(startDate.getTime() - 20 * 60 * 60 * 1000),
      startedAt: startDate,
      finishedAt: endDate,
      createdByUserId: adminUserId,
      categories: {
        create: [
          {
            name: DEMO_CATEGORY_NAME,
            discipline: TournamentDiscipline.OPEN,
            maxParticipants: 8,
            format: TournamentFormat.ROUND_ROBIN,
          },
        ],
      },
    },
    include: {
      categories: {
        select: {
          id: true,
        },
      },
    },
  });

  const categoryId = tournament.categories[0]?.id;
  if (!categoryId) {
    throw new Error('Tournament category was not created');
  }

  await prisma.tournamentRegistration.createMany({
    data: DEMO_PLAYERS.map((player) => ({
      tournamentId: tournament.id,
      tournamentCategoryId: categoryId,
      playerId: playerIdByNumber.get(player.number)!,
      status: RegistrationStatus.CONFIRMED,
    })),
  });

  const ratingsService = new RatingsService(prisma);
  const createdMatchIds: string[] = [];

  for (let roundIndex = 0; roundIndex < 7; roundIndex += 1) {
    const roundNumber = roundIndex + 1;

    const round = await prisma.tournamentRound.create({
      data: {
        tournamentId: tournament.id,
        roundNumber,
        type: TournamentRoundType.AMERICANO,
        order: roundNumber,
      },
      select: { id: true },
    });

    for (let courtIndex = 0; courtIndex < 2; courtIndex += 1) {
      const fixtureIndex = roundIndex * 2 + courtIndex;
      const fixture = ROUND_FIXTURES[fixtureIndex];
      const score = SCORE_PLAN[fixtureIndex];

      if (!fixture || !score) {
        continue;
      }

      const [a1, a2] = fixture.teamA;
      const [b1, b2] = fixture.teamB;

      const playerA1 = playerIdByNumber.get(a1);
      const playerA2 = playerIdByNumber.get(a2);
      const playerB1 = playerIdByNumber.get(b1);
      const playerB2 = playerIdByNumber.get(b2);

      if (!playerA1 || !playerA2 || !playerB1 || !playerB2) {
        throw new Error(`Invalid fixture mapping at round ${roundNumber}, court ${courtIndex + 1}`);
      }

      const playedAt = new Date(startDate);
      playedAt.setHours(startDate.getHours() + roundIndex);
      playedAt.setMinutes(courtIndex * 5, 0, 0);

      const [teamAScore, teamBScore] = score;
      const winnerTeamSide = teamAScore > teamBScore ? TeamSide.A : TeamSide.B;

      const createdMatch = await prisma.match.create({
        data: {
          tournamentId: tournament.id,
          tournamentCategoryId: categoryId,
          roundId: round.id,
          status: MatchStatus.COMPLETED,
          resultSource: MatchResultSource.MANUAL,
          scheduledAt: playedAt,
          playedAt,
          isRated: true,
          winnerTeamSide,
          createdByUserId: adminUserId,
          roundLabel: `R${roundNumber} C${courtIndex + 1} · ${fixtureToLabel(fixture)}`,
          teams: {
            create: [
              {
                side: TeamSide.A,
                player1Id: playerA1,
                player2Id: playerA2,
                teamAverageElo: defaultRating,
              },
              {
                side: TeamSide.B,
                player1Id: playerB1,
                player2Id: playerB2,
                teamAverageElo: defaultRating,
              },
            ],
          },
          setScores: {
            create: [
              {
                setNumber: 1,
                teamAScore,
                teamBScore,
              },
            ],
          },
        },
        select: { id: true },
      });

      createdMatchIds.push(createdMatch.id);
      await ratingsService.applyRatingsForMatch(createdMatch.id);
    }
  }

  const playersWithRatings = await prisma.playerProfile.findMany({
    where: {
      id: {
        in: Array.from(playerIdByNumber.values()),
      },
    },
    select: {
      fullName: true,
      currentElo: true,
      wins: true,
      losses: true,
      matchesPlayed: true,
    },
    orderBy: [{ currentElo: 'desc' }, { fullName: 'asc' }],
  });

  console.log(
    JSON.stringify(
      {
        tournament: {
          id: tournament.id,
          name: tournament.name,
          slug: tournament.slug,
          rounds: 7,
          matches: createdMatchIds.length,
          courts: 2,
        },
        playerMapping: DEMO_PLAYERS,
        leaderboard: playersWithRatings,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
