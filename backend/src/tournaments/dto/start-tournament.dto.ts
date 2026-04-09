import { ApiPropertyOptional } from '@nestjs/swagger';
import { TournamentScoringMode } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';

export class StartTournamentDto {
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
}
