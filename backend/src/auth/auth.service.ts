import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { User } from '@prisma/client';
import * as bcrypt from 'bcrypt';

import { JwtPayload } from '../common/types/jwt-payload.type';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async register(dto: RegisterDto) {
    const existing = await this.usersService.findByEmail(dto.email);
    if (existing) {
      throw new UnauthorizedException('Email is already registered');
    }

    const activeEloConfig = await this.prisma.eloConfig.findFirst({ where: { isActive: true } });
    const defaultRating = activeEloConfig?.defaultRating ?? this.configService.get<number>('ELO_DEFAULT_RATING', 1400);
    const passwordHash = await bcrypt.hash(dto.password, 10);

    const user = await this.usersService.createPlayerUser({
      email: dto.email,
      passwordHash,
      fullName: dto.fullName,
      username: dto.username,
      displayName: dto.displayName,
      nickname: dto.nickname,
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

  async login(dto: LoginDto) {
    const user = await this.usersService.findByEmail(dto.email);
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isPasswordValid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return this.createAuthResponse(user);
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
