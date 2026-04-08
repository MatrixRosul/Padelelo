import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';

import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { JwtPayload } from '../common/types/jwt-payload.type';
import { CreateTournamentDto } from './dto/create-tournament.dto';
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
    return this.tournamentsService.generateDraw(id, actor.sub);
  }
}
