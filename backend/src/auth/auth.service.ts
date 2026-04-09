import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { User, UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';

import { JwtPayload } from '../common/types/jwt-payload.type';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

type ClaimableUser = User & {
  playerProfile: {
    id: string;
    nickname: string | null;
    fullName: string;
    displayName: string | null;
    matchesPlayed: number;
    wins: number;
    losses: number;
  } | null;
};

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async register(dto: RegisterDto) {
    const normalizedLogin = this.normalizeLogin(dto.login);
    if (!normalizedLogin) {
      throw new UnauthorizedException('Login is required');
    }

    const fullName = dto.fullName.trim();
    const resolvedEmail = (dto.email?.trim().toLowerCase() || `${normalizedLogin}@padelelo.local`);

    const activeEloConfig = await this.prisma.eloConfig.findFirst({ where: { isActive: true } });
    const defaultRating = activeEloConfig?.defaultRating ?? this.configService.get<number>('ELO_DEFAULT_RATING', 1400);
    const passwordHash = await bcrypt.hash(dto.password, 10);

    const claimableUser = await this.resolveClaimableUser({
      normalizedLogin,
      fullName,
      resolvedEmail,
    });

    if (claimableUser) {
      const claimed = await this.claimExistingPlayerAccount({
        userId: claimableUser.id,
        normalizedLogin,
        fullName,
        resolvedEmail,
        passwordHash,
        dto,
      });

      return this.createAuthResponse(claimed);
    }

    const user = await this.usersService.createPlayerUser({
      email: resolvedEmail,
      passwordHash,
      fullName,
      username: normalizedLogin,
      displayName: dto.displayName,
      nickname: normalizedLogin,
      avatarUrl: dto.avatarUrl,
      country: dto.country,
      city: dto.city,
      birthDate: dto.birthDate,
      gender: dto.gender,
      ageGroup: dto.ageGroup,
      defaultRating,
    });

    return this.createAuthResponse(user);
  }

  private async resolveClaimableUser(params: {
    normalizedLogin: string;
    fullName: string;
    resolvedEmail: string;
  }) {
    const candidatesById = new Map<string, ClaimableUser>();

    const byEmail = await this.usersService.findByEmail(params.resolvedEmail);
    if (byEmail) {
      if (!this.isClaimablePlayerAccount(byEmail)) {
        throw new UnauthorizedException('Email is already registered');
      }

      candidatesById.set(byEmail.id, byEmail as ClaimableUser);
    }

    const byLogin = await this.usersService.findByAuthIdentifier(params.normalizedLogin);
    if (byLogin && this.isExactLoginMatch(byLogin, params.normalizedLogin)) {
      if (!this.isClaimablePlayerAccount(byLogin)) {
        throw new UnauthorizedException('Login is already registered');
      }

      candidatesById.set(byLogin.id, byLogin as ClaimableUser);
    }

    const discovered = await this.prisma.user.findMany({
      where: {
        role: UserRole.PLAYER,
        email: {
          endsWith: '@padelelo.local',
          mode: 'insensitive',
        },
        playerProfile: {
          isNot: null,
        },
        OR: [
          {
            email: {
              startsWith: `${params.normalizedLogin}@`,
              mode: 'insensitive',
            },
          },
          {
            playerProfile: {
              nickname: {
                equals: params.normalizedLogin,
                mode: 'insensitive',
              },
            },
          },
          {
            playerProfile: {
              fullName: {
                equals: params.fullName,
                mode: 'insensitive',
              },
            },
          },
          {
            playerProfile: {
              displayName: {
                equals: params.fullName,
                mode: 'insensitive',
              },
            },
          },
          {
            playerProfile: {
              fullName: {
                equals: this.humanizeLogin(params.normalizedLogin),
                mode: 'insensitive',
              },
            },
          },
          {
            playerProfile: {
              displayName: {
                equals: this.humanizeLogin(params.normalizedLogin),
                mode: 'insensitive',
              },
            },
          },
        ],
      },
      include: {
        playerProfile: {
          select: {
            id: true,
            nickname: true,
            fullName: true,
            displayName: true,
            matchesPlayed: true,
            wins: true,
            losses: true,
          },
        },
      },
      take: 50,
    });

    for (const candidate of discovered) {
      candidatesById.set(candidate.id, candidate as ClaimableUser);
    }

    const candidates = Array.from(candidatesById.values());
    if (candidates.length === 0) {
      return null;
    }

    return this.selectBestClaimableCandidate(candidates, params);
  }

  private selectBestClaimableCandidate(
    candidates: ClaimableUser[],
    params: {
      normalizedLogin: string;
      fullName: string;
      resolvedEmail: string;
    },
  ): ClaimableUser {
    const normalizedLoginHuman = this.normalizePersonName(this.humanizeLogin(params.normalizedLogin));
    const normalizedRequestedName = this.normalizePersonName(params.fullName);

    const scored = candidates.map((candidate) => {
      const localPart = candidate.email.split('@')[0]?.toLowerCase() ?? '';
      const nickname = candidate.playerProfile?.nickname?.toLowerCase() ?? '';

      const normalizedFullName = this.normalizePersonName(candidate.playerProfile?.fullName ?? '');
      const normalizedDisplayName = this.normalizePersonName(candidate.playerProfile?.displayName ?? '');

      let score = 0;

      if (candidate.email.toLowerCase() === params.resolvedEmail.toLowerCase()) {
        score += 250;
      }

      if (localPart === params.normalizedLogin || nickname === params.normalizedLogin) {
        score += 250;
      }

      if (normalizedRequestedName && normalizedFullName === normalizedRequestedName) {
        score += 220;
      }

      if (normalizedRequestedName && normalizedDisplayName === normalizedRequestedName) {
        score += 180;
      }

      if (normalizedLoginHuman && normalizedFullName === normalizedLoginHuman) {
        score += 140;
      }

      if (normalizedLoginHuman && normalizedDisplayName === normalizedLoginHuman) {
        score += 120;
      }

      const activity = candidate.playerProfile?.matchesPlayed ?? 0;
      score += Math.min(activity * 20, 400);

      return {
        candidate,
        score,
        activity,
      };
    });

    scored.sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }

      if (b.activity !== a.activity) {
        return b.activity - a.activity;
      }

      return a.candidate.createdAt.getTime() - b.candidate.createdAt.getTime();
    });

    return scored[0].candidate;
  }

  private async claimExistingPlayerAccount(params: {
    userId: string;
    normalizedLogin: string;
    fullName: string;
    resolvedEmail: string;
    passwordHash: string;
    dto: RegisterDto;
  }) {
    const emailOwner = await this.prisma.user.findUnique({
      where: { email: params.resolvedEmail },
      select: { id: true },
    });

    if (emailOwner && emailOwner.id !== params.userId) {
      const released = await this.tryReleaseStalePlayerAccount(emailOwner.id);
      if (!released) {
        throw new UnauthorizedException('Email is already registered');
      }
    }

    return this.prisma.user.update({
      where: { id: params.userId },
      data: {
        email: params.resolvedEmail,
        passwordHash: params.passwordHash,
        isActive: true,
        playerProfile: {
          update: {
            fullName: params.fullName,
            displayName: params.dto.displayName?.trim() || params.fullName,
            nickname: params.normalizedLogin,
            avatarUrl: params.dto.avatarUrl,
            country: params.dto.country,
            city: params.dto.city,
            birthDate: params.dto.birthDate,
            gender: params.dto.gender,
            ageGroup: params.dto.ageGroup,
          },
        },
      },
      include: { playerProfile: true },
    });
  }

  private async tryReleaseStalePlayerAccount(userId: string): Promise<boolean> {
    const stale = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        role: true,
        playerProfile: {
          select: {
            id: true,
            matchesPlayed: true,
            wins: true,
            losses: true,
            _count: {
              select: {
                ratingHistory: true,
                tournamentRegistrations: true,
                tournamentStandings: true,
                tournamentGroupEntries: true,
                matchTeamOneEntries: true,
                matchTeamTwoEntries: true,
              },
            },
          },
        },
      },
    });

    if (!stale) {
      return true;
    }

    if (stale.role !== UserRole.PLAYER || !stale.email.toLowerCase().endsWith('@padelelo.local')) {
      return false;
    }

    if (!stale.playerProfile) {
      await this.prisma.user.delete({ where: { id: stale.id } });
      return true;
    }

    const hasActivity =
      stale.playerProfile.matchesPlayed > 0 ||
      stale.playerProfile.wins > 0 ||
      stale.playerProfile.losses > 0 ||
      stale.playerProfile._count.ratingHistory > 0 ||
      stale.playerProfile._count.tournamentRegistrations > 0 ||
      stale.playerProfile._count.tournamentStandings > 0 ||
      stale.playerProfile._count.tournamentGroupEntries > 0 ||
      stale.playerProfile._count.matchTeamOneEntries > 0 ||
      stale.playerProfile._count.matchTeamTwoEntries > 0;

    if (hasActivity) {
      return false;
    }

    await this.prisma.user.delete({ where: { id: stale.id } });
    return true;
  }

  private isClaimablePlayerAccount(user: User & { playerProfile?: unknown | null }) {
    return (
      user.role === UserRole.PLAYER &&
      Boolean(user.playerProfile) &&
      user.email.toLowerCase().endsWith('@padelelo.local')
    );
  }

  private isExactLoginMatch(
    user: User & {
      playerProfile?: {
        nickname?: string | null;
      } | null;
    },
    normalizedLogin: string,
  ) {
    const localPart = user.email.split('@')[0]?.toLowerCase() ?? '';
    const nickname = user.playerProfile?.nickname?.toLowerCase() ?? '';

    return localPart === normalizedLogin || nickname === normalizedLogin;
  }

  async login(dto: LoginDto) {
    const identifier = (dto.identifier ?? dto.email ?? '').trim();
    if (!identifier) {
      throw new UnauthorizedException('Login is required');
    }

    const user = await this.usersService.findByAuthIdentifier(identifier);
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isPasswordValid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return this.createAuthResponse(user);
  }

  private normalizeLogin(value: string): string {
    return value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, '_')
      .replace(/_{2,}/g, '_')
      .replace(/^_+|_+$/g, '');
  }

  private humanizeLogin(value: string): string {
    return value
      .split('_')
      .filter(Boolean)
      .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
      .join(' ')
      .trim();
  }

  private normalizePersonName(value: string): string {
    return value
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
      .replace(/\s+/g, ' ');
  }

  async me(userId: string) {
    const user = await this.usersService.getUserOrThrow(userId);
    return this.sanitizeUser(user);
  }

  private createAuthResponse(user: User & { playerProfile: unknown }) {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };

    return {
      accessToken: this.jwtService.sign(payload),
      user: this.sanitizeUser(user),
    };
  }

  private sanitizeUser(user: User & { playerProfile?: unknown }) {
    return {
      id: user.id,
      email: user.email,
      role: user.role,
      isActive: user.isActive,
      createdAt: user.createdAt,
      playerProfile: user.playerProfile,
    };
  }
}
