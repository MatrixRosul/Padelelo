import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';

import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { JwtPayload } from '../common/types/jwt-payload.type';
import { UpdateEloConfigDto } from './dto/update-elo-config.dto';
import { RatingsService } from './ratings.service';

@ApiTags('ratings')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('ratings')
export class RatingsController {
  constructor(private readonly ratingsService: RatingsService) {}

  @Get('config')
  getActiveConfig() {
    return this.ratingsService.getActiveConfig();
  }

  @Patch('config')
  @Roles(UserRole.ADMIN)
  updateConfig(@Body() dto: UpdateEloConfigDto, @CurrentUser() actor: JwtPayload) {
    return this.ratingsService.updateActiveConfig(dto, actor.sub);
  }
}
