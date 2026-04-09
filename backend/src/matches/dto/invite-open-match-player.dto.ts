import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class InviteOpenMatchPlayerDto {
  @ApiProperty()
  @IsString()
  playerId!: string;
}
