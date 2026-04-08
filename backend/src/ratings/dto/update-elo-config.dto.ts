import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsOptional, Max, Min } from 'class-validator';

export class UpdateEloConfigDto {
  @ApiPropertyOptional()
  @IsOptional()
  name?: string;

  @ApiPropertyOptional({ minimum: 800, maximum: 3000 })
  @IsOptional()
  @IsInt()
  @Min(800)
  @Max(3000)
  defaultRating?: number;

  @ApiPropertyOptional({ minimum: 8, maximum: 128 })
  @IsOptional()
  @IsInt()
  @Min(8)
  @Max(128)
  kFactor?: number;

  @ApiPropertyOptional({ minimum: 8, maximum: 128 })
  @IsOptional()
  @IsInt()
  @Min(8)
  @Max(128)
  minKFactor?: number;

  @ApiPropertyOptional({ minimum: 8, maximum: 128 })
  @IsOptional()
  @IsInt()
  @Min(8)
  @Max(128)
  maxKFactor?: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 100 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  provisionalGames?: number;

  @ApiPropertyOptional({ minimum: 8, maximum: 128 })
  @IsOptional()
  @IsInt()
  @Min(8)
  @Max(128)
  provisionalKFactor?: number;

  @ApiPropertyOptional({ minimum: -200, maximum: 200 })
  @IsOptional()
  @IsInt()
  @Min(-200)
  @Max(200)
  homeAdvantage?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
