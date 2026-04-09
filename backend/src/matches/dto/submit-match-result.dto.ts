import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MatchResultSource, TeamSide } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsEnum, IsInt, IsOptional, Max, Min, ValidateNested } from 'class-validator';

class SetScoreDto {
  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  setNumber!: number;

  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(99)
  teamAScore!: number;

  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(99)
  teamBScore!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(20)
  tieBreakAScore?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(20)
  tieBreakBScore?: number;
}

export class SubmitMatchResultDto {
  @ApiPropertyOptional({ enum: TeamSide })
  @IsOptional()
  @IsEnum(TeamSide)
  winnerSide?: TeamSide;

  @ApiPropertyOptional({ enum: MatchResultSource, default: MatchResultSource.MANUAL })
  @IsOptional()
  @IsEnum(MatchResultSource)
  resultSource?: MatchResultSource;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  simulate?: boolean;

  @ApiPropertyOptional({ type: [SetScoreDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SetScoreDto)
  setScores?: SetScoreDto[];
}
