import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsString } from 'class-validator';

export class RegisterTournamentDto {
  @ApiPropertyOptional({ description: 'Player profile id for individual registration. Defaults to current user profile.' })
  @IsOptional()
  @IsString()
  playerId?: string;

  @ApiPropertyOptional({ description: 'Legacy doubles flow field' })
  @IsOptional()
  @IsString()
  categoryId?: string;

  @ApiPropertyOptional({ description: 'Legacy doubles flow field' })
  @IsOptional()
  @IsString()
  player1Id?: string;

  @ApiPropertyOptional({ description: 'Legacy doubles flow field' })
  @IsOptional()
  @IsString()
  player2Id?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isWildCard?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  seedNumber?: number;
}
