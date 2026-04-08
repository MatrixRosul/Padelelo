import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export class LeaderboardQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Filter by tournament id' })
  @IsOptional()
  @IsString()
  tournamentId?: string;

  @ApiPropertyOptional({ description: 'Filter by tournament category id' })
  @IsOptional()
  @IsString()
  categoryId?: string;
}
