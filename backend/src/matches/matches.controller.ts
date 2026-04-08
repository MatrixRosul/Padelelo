import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';

import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { JwtPayload } from '../common/types/jwt-payload.type';
import { CreateMatchDto } from './dto/create-match.dto';
import { SubmitMatchResultDto } from './dto/submit-match-result.dto';
import { MatchesService } from './matches.service';

@ApiTags('matches')
@Controller('matches')
export class MatchesController {
  constructor(private readonly matchesService: MatchesService) {}

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
