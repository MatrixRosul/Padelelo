import { Module } from '@nestjs/common';

import { MatchesModule } from '../matches/matches.module';
import { RatingsModule } from '../ratings/ratings.module';
import { TournamentsController } from './tournaments.controller';
import { TournamentsService } from './tournaments.service';

@Module({
  imports: [MatchesModule, RatingsModule],
  controllers: [TournamentsController],
  providers: [TournamentsService],
  exports: [TournamentsService],
})
export class TournamentsModule {}
