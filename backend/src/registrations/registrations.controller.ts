import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { JwtPayload } from '../common/types/jwt-payload.type';
import { RegisterTournamentDto } from './dto/register-tournament.dto';
import { RegistrationsService } from './registrations.service';

@ApiTags('registrations')
@Controller('tournaments/:id')
export class RegistrationsController {
  constructor(private readonly registrationsService: RegistrationsService) {}

  @Post('register')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  registerTeam(@Param('id') tournamentId: string, @Body() dto: RegisterTournamentDto, @CurrentUser() actor: JwtPayload) {
    return this.registrationsService.registerTeam(tournamentId, dto, actor);
  }

  @Get('registrations')
  listRegistrations(@Param('id') tournamentId: string) {
    return this.registrationsService.listTournamentRegistrations(tournamentId);
  }
}
