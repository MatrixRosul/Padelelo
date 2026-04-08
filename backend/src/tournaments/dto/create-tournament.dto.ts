import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { GenderEligibility, TournamentDiscipline, TournamentFormat } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsDate,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

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

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(160)
  location?: string;

  @ApiProperty({ type: String, format: 'date-time' })
  @Type(() => Date)
  @IsDate()
  startDate!: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  @Type(() => Date)
  @IsDate()
  endDate!: Date;

  @ApiProperty({ type: [CreateTournamentCategoryDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateTournamentCategoryDto)
  categories!: CreateTournamentCategoryDto[];
}
