import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TeamSide } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';

export class ResolveOpenMatchRequestDto {
  @ApiProperty({ default: true })
  @Type(() => Boolean)
  @IsBoolean()
  approve!: boolean;

  @ApiPropertyOptional({ enum: TeamSide })
  @IsOptional()
  @IsEnum(TeamSide)
  teamSide?: TeamSide;

  @ApiPropertyOptional({ minimum: 1, maximum: 2 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2)
  teamPosition?: number;
}
