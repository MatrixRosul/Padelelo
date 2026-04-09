import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';

import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { JwtPayload } from '../common/types/jwt-payload.type';
import { CreateMatchDto } from './dto/create-match.dto';
import { CreateOpenMatchDto } from './dto/create-open-match.dto';
import { InviteOpenMatchPlayerDto } from './dto/invite-open-match-player.dto';
import { ListOpenMatchesQueryDto } from './dto/list-open-matches-query.dto';
import { ResolveOpenMatchRequestDto } from './dto/resolve-open-match-request.dto';
import { ResolveOpenMatchResultDto } from './dto/resolve-open-match-result.dto';
import { RespondOpenMatchInviteDto } from './dto/respond-open-match-invite.dto';
import { SubmitMatchResultDto } from './dto/submit-match-result.dto';
import { SubmitOpenMatchResultDto } from './dto/submit-open-match-result.dto';
import { MatchesService } from './matches.service';
import { OpenMatchesService } from './open-matches.service';

@ApiTags('matches')
@Controller('matches')
export class MatchesController {
  constructor(
    private readonly matchesService: MatchesService,
    private readonly openMatchesService: OpenMatchesService,
  ) {}

  @Post('open')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.PLAYER, UserRole.ADMIN)
  createOpenMatch(@Body() dto: CreateOpenMatchDto, @CurrentUser() actor: JwtPayload) {
    return this.openMatchesService.createOpenMatch(dto, actor.sub);
  }

  @Get('open')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.PLAYER, UserRole.ADMIN)
  listOpenMatches(@Query() query: ListOpenMatchesQueryDto, @CurrentUser() actor: JwtPayload) {
    return this.openMatchesService.listOpenMatches(query, actor.sub);
  }

  @Get('open/:id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.PLAYER, UserRole.ADMIN)
  getOpenMatchById(@Param('id') id: string, @CurrentUser() actor: JwtPayload) {
    return this.openMatchesService.getOpenMatchById(id, actor.sub);
  }

  @Post('open/:id/request')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.PLAYER, UserRole.ADMIN)
  requestToJoinOpenMatch(@Param('id') id: string, @CurrentUser() actor: JwtPayload) {
    return this.openMatchesService.requestToJoin(id, actor.sub);
  }

  @Post('open/:id/invite')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.PLAYER, UserRole.ADMIN)
  invitePlayerToOpenMatch(
    @Param('id') id: string,
    @Body() dto: InviteOpenMatchPlayerDto,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.openMatchesService.invitePlayer(id, dto, actor.sub);
  }

  @Post('open/:id/requests/:playerId/resolve')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.PLAYER, UserRole.ADMIN)
  resolveJoinRequest(
    @Param('id') id: string,
    @Param('playerId') playerId: string,
    @Body() dto: ResolveOpenMatchRequestDto,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.openMatchesService.resolveJoinRequest(id, playerId, dto, actor.sub);
  }

  @Post('open/:id/invite/respond')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.PLAYER, UserRole.ADMIN)
  respondToInvitation(
    @Param('id') id: string,
    @Body() dto: RespondOpenMatchInviteDto,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.openMatchesService.respondToInvite(id, dto, actor.sub);
  }

  @Post('open/:id/result')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.PLAYER, UserRole.ADMIN)
  submitOpenMatchResult(
    @Param('id') id: string,
    @Body() dto: SubmitOpenMatchResultDto,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.openMatchesService.submitResult(id, dto, actor.sub);
  }

  @Post('open/:id/result/resolve')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.PLAYER, UserRole.ADMIN)
  resolveOpenMatchResult(
    @Param('id') id: string,
    @Body() dto: ResolveOpenMatchResultDto,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.openMatchesService.resolveResult(id, dto, actor.sub);
  }

  @Post('open/:id/cancel')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.PLAYER, UserRole.ADMIN)
  cancelOpenMatch(@Param('id') id: string, @CurrentUser() actor: JwtPayload) {
    return this.openMatchesService.cancelOpenMatch(id, actor.sub);
  }

  @Post()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  createMatch(@Body() dto: CreateMatchDto, @CurrentUser() actor: JwtPayload) {
    return this.matchesService.createMatch(dto, actor.sub);
  }

  @Post(':id/result')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  submitResult(@Param('id') id: string, @Body() dto: SubmitMatchResultDto, @CurrentUser() actor: JwtPayload) {
    return this.matchesService.submitResult(id, dto, actor.sub);
  }

  @Post(':id/score')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  submitScore(@Param('id') id: string, @Body() dto: SubmitMatchResultDto, @CurrentUser() actor: JwtPayload) {
    return this.matchesService.submitResult(id, dto, actor.sub);
  }

  @Post(':id/simulate')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  simulateResult(@Param('id') id: string, @CurrentUser() actor: JwtPayload) {
    return this.matchesService.simulateResult(id, actor.sub);
  }

  @Get(':id')
  getMatchById(@Param('id') id: string) {
    return this.matchesService.getMatchById(id);
  }
}
