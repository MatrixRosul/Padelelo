import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class PaginationQueryDto {
  @ApiPropertyOptional({ default: 1 })
  @Type(() => Number)
  @IsInt()
  @IsOptional()
  @Min(1)
  page = 1;

  @ApiPropertyOptional({ default: 20, maximum: 200 })
  @Type(() => Number)
  @IsInt()
  @IsOptional()
  @Min(1)
  @Max(200)
  limit = 20;
}
