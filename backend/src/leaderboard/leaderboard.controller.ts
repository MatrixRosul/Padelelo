import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { TournamentDiscipline, UserRole } from '@prisma/client';

import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { LeaderboardQueryDto } from './dto/leaderboard-query.dto';
import { LeaderboardService } from './leaderboard.service';

@ApiTags('leaderboard')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.PLAYER, UserRole.ADMIN)
@Controller('leaderboard')
export class LeaderboardController {
  constructor(private readonly leaderboardService: LeaderboardService) {}

  @Get()
  getGlobalLeaderboard(@Query() query: LeaderboardQueryDto) {
    return this.leaderboardService.getGlobalLeaderboard(query);
  }

  @Get(':category')
  getCategoryLeaderboard(
    @Param('category') category: TournamentDiscipline,
    @Query() query: LeaderboardQueryDto,
  ) {
    return this.leaderboardService.getCategoryLeaderboard(category, query);
  }
}
