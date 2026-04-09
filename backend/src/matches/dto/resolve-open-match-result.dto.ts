import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean } from 'class-validator';

export class ResolveOpenMatchResultDto {
  @ApiProperty({ default: true })
  @Type(() => Boolean)
  @IsBoolean()
  approve!: boolean;
}
