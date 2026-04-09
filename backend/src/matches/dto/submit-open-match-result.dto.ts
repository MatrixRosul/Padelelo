import { ApiPropertyOptional } from '@nestjs/swagger';
import { TeamSide } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsDate, IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';

export class SubmitOpenMatchResultDto {
  @ApiPropertyOptional({ enum: TeamSide })
  @IsOptional()
  @IsEnum(TeamSide)
  winnerSide?: TeamSide;

  @ApiPropertyOptional({ minimum: 0, maximum: 999 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(999)
  teamAPoints?: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 999 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(999)
  teamBPoints?: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 9 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(9)
  teamASetsWon?: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 9 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(9)
  teamBSetsWon?: number;

  @ApiPropertyOptional({ type: String, format: 'date-time' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  playedAt?: Date;
}
