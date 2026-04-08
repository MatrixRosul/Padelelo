import { existsSync, readFileSync } from 'fs';
import { basename, resolve } from 'path';

import { UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';

import { ImportCsvDto } from '../src/imports/dto/import-csv.dto';
import { ImportsService } from '../src/imports/imports.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { RatingsService } from '../src/ratings/ratings.service';

async function resolveAdminUserId(prisma: PrismaService): Promise<string> {
  const existingAdmin = await prisma.user.findFirst({
    where: { role: UserRole.ADMIN },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });

  if (existingAdmin) {
    return existingAdmin.id;
  }

  const passwordHash = await bcrypt.hash('Admin1234', 10);
  const createdAdmin = await prisma.user.create({
    data: {
      email: 'import-admin@padelelo.local',
      passwordHash,
      role: UserRole.ADMIN,
    },
    select: { id: true },
  });

  return createdAdmin.id;
}

async function main() {
  const csvPath = process.argv[2]
    ? resolve(process.cwd(), process.argv[2])
    : resolve(process.cwd(), '..', 'matches.csv');

  if (!existsSync(csvPath)) {
    throw new Error(`CSV file not found: ${csvPath}`);
  }

  const csvContent = readFileSync(csvPath, 'utf8');

  const prisma = new PrismaService();
  await prisma.$connect();

  try {
    const adminUserId = await resolveAdminUserId(prisma);
    const ratingsService = new RatingsService(prisma);
    const importsService = new ImportsService(prisma, ratingsService);

    const dto: ImportCsvDto = {
      fileName: basename(csvPath),
      csvContent,
    };

    const result = await importsService.importCsv(dto, adminUserId);
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
