import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ required: false, description: 'Player login or email' })
  @IsOptional()
  @IsString()
  @MinLength(3)
  identifier?: string;

  @ApiProperty({ required: false, description: 'Backward-compatible email field' })
  @IsOptional()
  @IsString()
  @MinLength(3)
  email?: string;

  @ApiProperty()
  @IsString()
  @MinLength(8)
  password!: string;
}
