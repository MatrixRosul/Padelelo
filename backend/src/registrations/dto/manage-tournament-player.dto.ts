import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class ManageTournamentPlayerDto {
  @ApiProperty({ description: 'Player profile id' })
  @IsString()
  playerId!: string;
}
