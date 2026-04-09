import { Injectable, NotFoundException } from '@nestjs/common';
import { AgeGroup, Gender, UserRole } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  listUsers(limit = 100) {
    return this.prisma.user.findMany({
      include: { playerProfile: true },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 500),
    });
  }

  findById(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      include: { playerProfile: true },
    });
  }

  findByEmail(email: string) {
    return this.prisma.user.findUnique({
      where: { email },
      include: { playerProfile: true },
    });
  }

  findByAuthIdentifier(identifier: string) {
    const normalized = identifier.trim().toLowerCase();
    if (!normalized) {
      return Promise.resolve(null);
    }

    return this.prisma.user
      .findFirst({
        where: {
          OR: [
            {
              email: {
                equals: normalized,
                mode: 'insensitive',
              },
            },
            {
              playerProfile: {
                nickname: {
                  equals: normalized,
                  mode: 'insensitive',
                },
              },
            },
          ],
        },
        include: { playerProfile: true },
      })
      .then((exact) => {
        if (exact) {
          return exact;
        }

        return this.prisma.user.findFirst({
          where: {
            email: {
              startsWith: `${normalized}@`,
              mode: 'insensitive',
            },
          },
          include: { playerProfile: true },
        });
      });
  }

  findClaimablePlayerByFullName(fullName: string) {
    const normalized = fullName.trim().replace(/\s+/g, ' ');
    if (!normalized) {
      return Promise.resolve(null);
    }

    return this.prisma.user.findFirst({
      where: {
        role: UserRole.PLAYER,
        email: {
          endsWith: '@padelelo.local',
          mode: 'insensitive',
        },
        playerProfile: {
          OR: [
            {
              fullName: {
                equals: normalized,
                mode: 'insensitive',
              },
            },
            {
              displayName: {
                equals: normalized,
                mode: 'insensitive',
              },
            },
          ],
        },
      },
      include: { playerProfile: true },
    });
  }

  async createPlayerUser(input: {
    email: string;
    passwordHash: string;
    fullName: string;
    username?: string;
    displayName?: string;
    nickname?: string;
    avatarUrl?: string;
    country?: string;
    city?: string;
    birthDate?: Date;
    gender?: Gender;
    ageGroup?: AgeGroup;
    defaultRating: number;
  }) {
    const fallbackUsername = input.email.split('@')[0] ?? 'player';
    const normalizedUsername = (input.username ?? input.nickname ?? fallbackUsername)
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, '-')
      .replace(/[-_.]{2,}/g, '-')
      .replace(/^[-_.]+|[-_.]+$/g, '');

    return this.prisma.user.create({
      data: {
        email: input.email,
        passwordHash: input.passwordHash,
        role: UserRole.PLAYER,
        playerProfile: {
          create: {
            fullName: input.fullName,
            displayName: input.displayName,
            nickname: normalizedUsername || 'player',
            avatarUrl: input.avatarUrl,
            country: input.country,
            city: input.city,
            birthDate: input.birthDate,
            gender: input.gender,
            ageGroup: input.ageGroup,
            currentElo: input.defaultRating,
          },
        },
      },
      include: { playerProfile: true },
    });
  }

  async getUserOrThrow(userId: string) {
    const user = await this.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }
}
