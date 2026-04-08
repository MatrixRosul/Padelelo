import { Controller, Get, Param, Patch, Query, UseGuards, Body } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';

import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { JwtPayload } from '../common/types/jwt-payload.type';
import { ListPlayersQueryDto } from './dto/list-players-query.dto';
import { UpdatePlayerDto } from './dto/update-player.dto';
import { PlayersService } from './players.service';

@ApiTags('players')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.PLAYER, UserRole.ADMIN)
@Controller('players')
export class PlayersController {
  constructor(private readonly playersService: PlayersService) {}

  @Get()
  getPlayers(@Query() query: ListPlayersQueryDto) {
    return this.playersService.listPlayers(query.page, query.limit, query.search);
  }

  @Get(':identifier/matches')
  getPlayerMatches(@Param('identifier') identifier: string) {
    return this.playersService.getPlayerMatches(identifier);
  }

  @Get(':identifier')
  getPlayer(@Param('identifier') identifier: string) {
    return this.playersService.getPlayerProfile(identifier);
  }

  @Patch(':identifier')
  updatePlayer(
    @Param('identifier') identifier: string,
    @Body() dto: UpdatePlayerDto,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.playersService.updatePlayer(identifier, dto, actor);
  }
}
