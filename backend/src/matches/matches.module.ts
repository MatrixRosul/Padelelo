import { Module } from '@nestjs/common';

import { RatingsModule } from '../ratings/ratings.module';

import { MatchesController } from './matches.controller';
import { MatchesService } from './matches.service';
import { OpenMatchesService } from './open-matches.service';

@Module({
  imports: [RatingsModule],
  controllers: [MatchesController],
  providers: [MatchesService, OpenMatchesService],
  exports: [MatchesService],
})
export class MatchesModule {}
