import { PrismaClient, UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const TEST_PASSWORD = 'player123';
const DEFAULT_RATING_FALLBACK = 1400;

const TEST_PLAYERS = [
  { login: 'andrii_samsonov', fullName: 'Andrii Samsonov' },
  { login: 'mykola_savula', fullName: 'Mykola Savula' },
  { login: 'valeriia_varodi', fullName: 'Valeriia Varodi' },
  { login: 'orest_sarakhman', fullName: 'Orest Sarakhman' },
  { login: 'yurii_ploskina', fullName: 'Yurii Ploskina' },
  { login: 'vasyl_prodan', fullName: 'Vasyl Prodan' },
  { login: 'elina_holub', fullName: 'Elina Holub' },
  { login: 'vladyslav_trompak', fullName: 'Vladyslav Trompak' },
  { login: 'denys_petrovtsi', fullName: 'Denys Petrovtsi' },
  { login: 'maksym_rosul', fullName: 'Maksym Rosul' },
  { login: 'oleksandr_hrin', fullName: 'Oleksandr Hrin' },
  { login: 'mykyta_omelchenko', fullName: 'Mykyta Omelchenko' },
];

const TEST_ADMINS = [
  { login: 'admin', fullName: 'Padelelo Admin' },
];

function loginToEmail(login: string): string {
  return `${login}@padelelo.local`;
}

async function upsertPlayer(params: {
  login: string;
  fullName: string;
  passwordHash: string;
  defaultRating: number;
}) {
  const email = loginToEmail(params.login);

  await prisma.user.upsert({
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
  });
}

async function upsertAdmin(params: {
  login: string;
  fullName: string;
  passwordHash: string;
  defaultRating: number;
}) {
  const email = loginToEmail(params.login);

  await prisma.user.upsert({
    where: { email },
    update: {
      passwordHash: params.passwordHash,
      role: UserRole.ADMIN,
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
      role: UserRole.ADMIN,
      playerProfile: {
        create: {
          fullName: params.fullName,
          displayName: params.fullName,
          nickname: params.login,
          currentElo: params.defaultRating,
        },
      },
    },
  });
}

async function main() {
  const activeEloConfig = await prisma.eloConfig.findFirst({
    where: { isActive: true },
    select: { defaultRating: true },
  });

  const defaultRating = activeEloConfig?.defaultRating ?? DEFAULT_RATING_FALLBACK;
  const passwordHash = await bcrypt.hash(TEST_PASSWORD, 10);

  for (const player of TEST_PLAYERS) {
    await upsertPlayer({
      ...player,
      passwordHash,
      defaultRating,
    });
  }

  for (const admin of TEST_ADMINS) {
    await upsertAdmin({
      ...admin,
      passwordHash,
      defaultRating,
    });
  }

  console.log(
    JSON.stringify(
      {
        createdOrUpdatedPlayers: TEST_PLAYERS.length,
        createdOrUpdatedAdmins: TEST_ADMINS.length,
        password: TEST_PASSWORD,
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
