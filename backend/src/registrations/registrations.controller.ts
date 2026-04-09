import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';

import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { JwtPayload } from '../common/types/jwt-payload.type';
import { ManageTournamentPlayerDto } from './dto/manage-tournament-player.dto';
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

  @Delete('unregister')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  unregister(@Param('id') tournamentId: string, @CurrentUser() actor: JwtPayload) {
    return this.registrationsService.unregisterPlayer(tournamentId, actor);
  }

  @Post('players')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  addPlayer(
    @Param('id') tournamentId: string,
    @Body() dto: ManageTournamentPlayerDto,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.registrationsService.adminAddPlayer(tournamentId, dto.playerId, actor);
  }

  @Delete('players/:playerId')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  removePlayer(
    @Param('id') tournamentId: string,
    @Param('playerId') playerId: string,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.registrationsService.adminRemovePlayer(tournamentId, playerId, actor);
  }

  @Patch('players/:playerId/confirm')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  confirmPlayer(
    @Param('id') tournamentId: string,
    @Param('playerId') playerId: string,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.registrationsService.adminConfirmPlayer(tournamentId, playerId, actor);
  }

  @Get('registrations')
  listRegistrations(@Param('id') tournamentId: string) {
    return this.registrationsService.listTournamentRegistrations(tournamentId);
  }
}
