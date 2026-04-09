import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';

import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { JwtPayload } from '../common/types/jwt-payload.type';
import { SubmitMatchResultDto } from '../matches/dto/submit-match-result.dto';
import { CreateTournamentDto } from './dto/create-tournament.dto';
import { StartTournamentDto } from './dto/start-tournament.dto';
import { UpdateTournamentDto } from './dto/update-tournament.dto';
import { TournamentsService } from './tournaments.service';

@ApiTags('tournaments')
@Controller('tournaments')
export class TournamentsController {
  constructor(private readonly tournamentsService: TournamentsService) {}

  @Post()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  createTournament(@Body() dto: CreateTournamentDto, @CurrentUser() actor: JwtPayload) {
    return this.tournamentsService.createTournament(dto, actor.sub);
  }

  @Get()
  getTournaments() {
    return this.tournamentsService.listTournaments();
  }

  @Get(':id')
  getTournament(@Param('id') id: string) {
    return this.tournamentsService.getTournamentById(id);
  }

  @Patch(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  updateTournament(@Param('id') id: string, @Body() dto: UpdateTournamentDto, @CurrentUser() actor: JwtPayload) {
    return this.tournamentsService.updateTournament(id, dto, actor.sub);
  }

  @Post(':id/publish')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  publishTournament(@Param('id') id: string, @CurrentUser() actor: JwtPayload) {
    return this.tournamentsService.publishTournament(id, actor.sub);
  }

  @Post(':id/open-registration')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  openRegistration(@Param('id') id: string, @CurrentUser() actor: JwtPayload) {
    return this.tournamentsService.openRegistration(id, actor.sub);
  }

  @Post(':id/close-registration')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  closeRegistration(@Param('id') id: string, @CurrentUser() actor: JwtPayload) {
    return this.tournamentsService.closeRegistration(id, actor.sub);
  }

  @Post(':id/generate-draw')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  generateDraw(@Param('id') id: string, @CurrentUser() actor: JwtPayload) {
    return this.tournamentsService.startTournament(id, actor.sub);
  }

  @Post(':id/generate')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  generateTournament(@Param('id') id: string, @CurrentUser() actor: JwtPayload) {
    return this.tournamentsService.startTournament(id, actor.sub);
  }

  @Post(':id/start')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  startTournament(
    @Param('id') id: string,
    @Body() dto: StartTournamentDto,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.tournamentsService.startTournament(id, actor.sub, dto);
  }

  @Post(':id/restart')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  restartTournament(@Param('id') id: string, @CurrentUser() actor: JwtPayload) {
    return this.tournamentsService.restartTournament(id, actor.sub);
  }

  @Post(':id/complete')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  completeTournament(@Param('id') id: string, @CurrentUser() actor: JwtPayload) {
    return this.tournamentsService.completeTournament(id, actor.sub);
  }

  @Post(':id/cancel')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  cancelTournament(@Param('id') id: string, @CurrentUser() actor: JwtPayload) {
    return this.tournamentsService.cancelTournament(id, actor.sub);
  }

  @Get(':id/standings')
  getStandings(@Param('id') id: string) {
    return this.tournamentsService.getTournamentStandings(id);
  }

  @Get(':id/rounds')
  getRounds(@Param('id') id: string) {
    return this.tournamentsService.getTournamentRounds(id);
  }

  @Get(':id/matches')
  getMatches(@Param('id') id: string) {
    return this.tournamentsService.getTournamentMatches(id);
  }

  @Get(':id/rating-changes')
  getRatingChanges(@Param('id') id: string) {
    return this.tournamentsService.getTournamentRatingChanges(id);
  }

  @Post('match/:id/result')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  submitTournamentMatchResult(
    @Param('id') matchId: string,
    @Body() dto: SubmitMatchResultDto,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.tournamentsService.submitTournamentMatchResult(matchId, dto, actor.sub);
  }
}
