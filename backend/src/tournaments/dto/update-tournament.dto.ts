import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  RegistrationWindowStatus,
  TournamentScoringMode,
  TournamentStatus,
} from '@prisma/client';
import { Type } from 'class-transformer';
import { IsDate, IsEnum, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

import { ApiTournamentType, SUPPORTED_TOURNAMENT_TYPES } from './create-tournament.dto';

export class UpdateTournamentDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(160)
  name?: string;

  @ApiPropertyOptional({ enum: SUPPORTED_TOURNAMENT_TYPES })
  @IsOptional()
  @IsIn(SUPPORTED_TOURNAMENT_TYPES)
  type?: ApiTournamentType;

  @ApiPropertyOptional({ type: String, format: 'date-time' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  date?: Date;

  @ApiPropertyOptional({ minimum: 1, maximum: 64 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(64)
  courtsCount?: number;

  @ApiPropertyOptional({ minimum: 4, maximum: 512 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(4)
  @Max(512)
  maxPlayers?: number;

  @ApiPropertyOptional({ enum: TournamentScoringMode })
  @IsOptional()
  @IsEnum(TournamentScoringMode)
  scoringMode?: TournamentScoringMode;

  @ApiPropertyOptional({ minimum: 1, maximum: 99 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(99)
  pointsToWin?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 5 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  setsToWin?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(160)
  location?: string;

  @ApiPropertyOptional({ description: 'Club id where tournament is hosted' })
  @IsOptional()
  @IsString()
  clubId?: string;

  @ApiPropertyOptional({ type: String, format: 'date-time' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  startDate?: Date;

  @ApiPropertyOptional({ type: String, format: 'date-time' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  endDate?: Date;

  @ApiPropertyOptional({ type: String, format: 'date-time' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  registrationCloseAt?: Date;

  @ApiPropertyOptional({ enum: TournamentStatus })
  @IsOptional()
  @IsEnum(TournamentStatus)
  status?: TournamentStatus;

  @ApiPropertyOptional({ enum: RegistrationWindowStatus })
  @IsOptional()
  @IsEnum(RegistrationWindowStatus)
  registrationStatus?: RegistrationWindowStatus;
}
