import { BadRequestException, Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { CreateClubDto } from './dto/create-club.dto';
import { ListClubsQueryDto } from './dto/list-clubs-query.dto';

type ClubDelegate = {
  findMany: (args: unknown) => Promise<unknown[]>;
  findFirst: (args: unknown) => Promise<{ id: string } | null>;
  create: (args: unknown) => Promise<unknown>;
  findUnique: (args: unknown) => Promise<{ id: string } | null>;
};

@Injectable()
export class ClubsService {
  constructor(private readonly prisma: PrismaService) {}

  private get club(): ClubDelegate {
    return (this.prisma as unknown as { club: ClubDelegate }).club;
  }

  listClubs(query: ListClubsQueryDto) {
    const normalizedSearch = query.search?.trim();

    const where = {
      isActive: query.includeInactive ? undefined : true,
      ...(normalizedSearch
        ? {
            OR: [
              {
                name: {
                  contains: normalizedSearch,
                  mode: 'insensitive',
                },
              },
              {
                city: {
                  contains: normalizedSearch,
                  mode: 'insensitive',
                },
              },
              {
                address: {
                  contains: normalizedSearch,
                  mode: 'insensitive',
                },
              },
            ],
          }
        : {}),
    };

    return this.club.findMany({
      where,
      orderBy: [{ name: 'asc' }, { city: 'asc' }],
    });
  }

  async createClub(dto: CreateClubDto, actorUserId: string) {
    const name = dto.name.trim();
    if (!name) {
      throw new BadRequestException('Club name is required');
    }

    const city = dto.city?.trim() || null;
    const address = dto.address?.trim() || null;
    const courtsCount = dto.courtsCount ?? 2;

    const existingClub = await this.club.findFirst({
      where: {
        name: {
          equals: name,
          mode: 'insensitive',
        },
        city: city
          ? {
              equals: city,
              mode: 'insensitive',
            }
          : null,
        isActive: true,
      },
      select: {
        id: true,
      },
    });

    if (existingClub) {
      throw new BadRequestException('Club with this name already exists');
    }

    const slug = await this.createUniqueSlug(`${name} ${city ?? ''}`);

    return this.club.create({
      data: {
        name,
        city,
        address,
        courtsCount,
        slug,
        createdByUserId: actorUserId,
      },
    });
  }

  private async createUniqueSlug(source: string): Promise<string> {
    const base = this.slugify(source) || 'club';

    let slug = base;
    let suffix = 2;

    while (await this.club.findUnique({ where: { slug }, select: { id: true } })) {
      slug = `${base}-${suffix}`;
      suffix += 1;
    }

    return slug;
  }

  private slugify(input: string): string {
    return input
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/-{2,}/g, '-')
      .replace(/(^-|-$)/g, '');
  }
}
