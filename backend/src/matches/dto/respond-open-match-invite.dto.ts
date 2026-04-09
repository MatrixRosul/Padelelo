import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean } from 'class-validator';

export class RespondOpenMatchInviteDto {
  @ApiProperty({ default: true })
  @Type(() => Boolean)
  @IsBoolean()
  accept!: boolean;
}
