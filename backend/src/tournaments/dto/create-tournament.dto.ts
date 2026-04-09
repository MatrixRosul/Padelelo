import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  GenderEligibility,
  TournamentDiscipline,
  TournamentFormat,
  TournamentScoringMode,
} from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsArray,
  IsDate,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export const SUPPORTED_TOURNAMENT_TYPES = [
  'AMERICANO',
  'GROUP_STAGE',
  'PLAYOFF',
  'DIRECT_PLAYOFF',
] as const;

export type ApiTournamentType = (typeof SUPPORTED_TOURNAMENT_TYPES)[number];

export class CreateTournamentCategoryDto {
  @ApiProperty()
  @IsString()
  @MaxLength(100)
  name!: string;

  @ApiProperty({ enum: TournamentDiscipline })
  @IsEnum(TournamentDiscipline)
  discipline!: TournamentDiscipline;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  customDisciplineLabel?: string;

  @ApiProperty({ enum: GenderEligibility, required: false, default: GenderEligibility.ANY })
  @IsOptional()
  @IsEnum(GenderEligibility)
  genderEligibility?: GenderEligibility;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(6)
  @Max(100)
  ageMin?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(6)
  @Max(100)
  ageMax?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  rankingMin?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  rankingMax?: number;

  @ApiProperty()
  @IsInt()
  @Min(2)
  @Max(512)
  maxParticipants!: number;

  @ApiProperty({ enum: TournamentFormat })
  @IsEnum(TournamentFormat)
  format!: TournamentFormat;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  allowsWildCards?: boolean;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  seededEntriesCount?: number;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  qualificationSpots?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  groupCount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  playoffSize?: number;
}

export class CreateTournamentDto {
  @ApiProperty()
  @IsString()
  @MaxLength(160)
  name!: string;

  @ApiProperty({ enum: SUPPORTED_TOURNAMENT_TYPES })
  @IsIn(SUPPORTED_TOURNAMENT_TYPES)
  type!: ApiTournamentType;

  @ApiProperty({ type: String, format: 'date-time' })
  @Type(() => Date)
  @IsDate()
  date!: Date;

  @ApiPropertyOptional({ minimum: 1, maximum: 64 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(64)
  courtsCount?: number;

  @ApiProperty({ minimum: 4, maximum: 512 })
  @Type(() => Number)
  @IsInt()
  @Min(4)
  @Max(512)
  maxPlayers!: number;

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

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  openRegistration?: boolean;

  @ApiPropertyOptional({ type: [CreateTournamentCategoryDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateTournamentCategoryDto)
  categories?: CreateTournamentCategoryDto[];
}
