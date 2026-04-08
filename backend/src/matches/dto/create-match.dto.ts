import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BracketStage } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsBoolean, IsDate, IsEnum, IsOptional, IsString, ValidateNested } from 'class-validator';

class MatchTeamInputDto {
  @ApiProperty()
  @IsString()
  player1Id!: string;

  @ApiProperty()
  @IsString()
  player2Id!: string;
}

export class CreateMatchDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  tournamentId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  tournamentCategoryId?: string;

  @ApiPropertyOptional({ type: String, format: 'date-time' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  scheduledAt?: Date;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isRated?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  roundLabel?: string;

  @ApiPropertyOptional({ enum: BracketStage })
  @IsOptional()
  @IsEnum(BracketStage)
  bracketStage?: BracketStage;

  @ApiProperty({ type: MatchTeamInputDto })
  @ValidateNested()
  @Type(() => MatchTeamInputDto)
  teamA!: MatchTeamInputDto;

  @ApiProperty({ type: MatchTeamInputDto })
  @ValidateNested()
  @Type(() => MatchTeamInputDto)
  teamB!: MatchTeamInputDto;
}
