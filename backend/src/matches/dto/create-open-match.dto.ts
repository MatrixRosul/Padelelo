import { ApiPropertyOptional } from '@nestjs/swagger';
import { OpenMatchScoringMode } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsBoolean, IsDate, IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class CreateOpenMatchDto {
  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isRated?: boolean;

  @ApiPropertyOptional({ enum: OpenMatchScoringMode, default: OpenMatchScoringMode.POINTS })
  @IsOptional()
  @IsEnum(OpenMatchScoringMode)
  scoringMode?: OpenMatchScoringMode;

  @ApiPropertyOptional({ default: 21, minimum: 1, maximum: 99 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(99)
  pointsToWin?: number;

  @ApiPropertyOptional({ default: 2, minimum: 1, maximum: 5 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  setsToWin?: number;

  @ApiPropertyOptional({ type: String, format: 'date-time' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  scheduledAt?: Date;

  @ApiPropertyOptional({ maxLength: 120 })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  location?: string;

  @ApiPropertyOptional({ maxLength: 400 })
  @IsOptional()
  @IsString()
  @MaxLength(400)
  notes?: string;
}
