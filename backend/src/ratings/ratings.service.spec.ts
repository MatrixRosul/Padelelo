import { Test } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';
import { RatingsService } from './ratings.service';

describe('RatingsService', () => {
  let service: RatingsService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        RatingsService,
        {
          provide: PrismaService,
          useValue: {},
        },
      ],
    }).compile();

    service = module.get(RatingsService);
  });

  it('calculates team average from two players', () => {
    expect(service.calculateTeamAverage(1400, 1600)).toBe(1500);
  });

  it('returns expected score near 0.5 for equal teams', () => {
    const expected = service.calculateExpectedScore(1400, 1400);
    expect(expected).toBeCloseTo(0.5, 5);
  });

  it('produces positive delta for winner and opposite for loser', () => {
    const winnerDelta = service.calculateDelta({
      teamRating: 1450,
      opponentRating: 1500,
      score: 1,
      kFactor: 32,
    });

    const loserDelta = service.calculateDelta({
      teamRating: 1500,
      opponentRating: 1450,
      score: 0,
      kFactor: 32,
    });

    expect(winnerDelta).toBeGreaterThan(0);
    expect(winnerDelta + loserDelta).toBe(0);
  });
});
