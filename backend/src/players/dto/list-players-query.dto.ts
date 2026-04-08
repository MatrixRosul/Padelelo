import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export class ListPlayersQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Search by player name, nickname, or email' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;
}