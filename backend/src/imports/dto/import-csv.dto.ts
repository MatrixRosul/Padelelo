import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class ImportCsvDto {
  @ApiPropertyOptional({
    description: 'Optional source file name for audit and import logs',
    default: 'matches.csv',
  })
  @IsOptional()
  @IsString()
  fileName?: string;

  @ApiProperty({
    description:
      'Raw CSV content. Supported schemas: (1) strict email: player1_email,player2_email,player3_email,player4_email,score_set1,score_set2,score_set3,date[,league]; (2) legacy league: league,team_a,team_b,score_a,score_b[,date,tour].',
  })
  @IsString()
  @IsNotEmpty()
  csvContent!: string;
}
