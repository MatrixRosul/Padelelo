import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';

import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { JwtPayload } from '../common/types/jwt-payload.type';
import { CreateClubDto } from './dto/create-club.dto';
import { ListClubsQueryDto } from './dto/list-clubs-query.dto';
import { ClubsService } from './clubs.service';

@ApiTags('clubs')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.PLAYER, UserRole.ADMIN)
@Controller('clubs')
export class ClubsController {
  constructor(private readonly clubsService: ClubsService) {}

  @Get()
  listClubs(@Query() query: ListClubsQueryDto) {
    return this.clubsService.listClubs(query);
  }

  @Post()
  @Roles(UserRole.ADMIN)
  createClub(@Body() dto: CreateClubDto, @CurrentUser() actor: JwtPayload) {
    return this.clubsService.createClub(dto, actor.sub);
  }
}
