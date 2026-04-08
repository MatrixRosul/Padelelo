import { RegistrationStatus } from '@prisma/client';

import { RegistrationsService } from './registrations.service';

describe('RegistrationsService', () => {
  const prismaMock = {
    tournament: { findUnique: jest.fn() },
    playerProfile: { findMany: jest.fn() },
    tournamentTeam: { findUnique: jest.fn() },
    tournamentRegistration: { count: jest.fn(), create: jest.fn(), findMany: jest.fn() },
    auditLog: { create: jest.fn() },
    $transaction: jest.fn(),
  } as any;

  const service = new RegistrationsService(prismaMock);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects registration when tournament registration is closed', async () => {
    prismaMock.tournament.findUnique.mockResolvedValue({
      id: 't1',
      registrationStatus: 'CLOSED',
      categories: [{ id: 'c1' }],
    });

    await expect(
      service.registerTeam(
        't1',
        {
          categoryId: 'c1',
          player1Id: 'p1',
          player2Id: 'p2',
        },
        { sub: 'u1', email: 'player@test.com', role: 'PLAYER' },
      ),
    ).rejects.toThrow('Tournament registration is closed');
  });

  it('creates confirmed registration when slots are available', async () => {
    prismaMock.tournament.findUnique.mockResolvedValue({
      id: 't1',
      registrationStatus: 'OPEN',
      categories: [
        {
          id: 'c1',
          maxParticipants: 16,
          rankingMin: null,
          rankingMax: null,
          ageMin: null,
          ageMax: null,
          genderEligibility: 'ANY',
        },
      ],
    });

    prismaMock.playerProfile.findMany.mockResolvedValue([
      { id: 'p1', userId: 'u1', currentElo: 1400, gender: 'MALE', birthDate: null },
      { id: 'p2', userId: 'u2', currentElo: 1400, gender: 'FEMALE', birthDate: null },
    ]);

    prismaMock.tournamentTeam.findUnique.mockResolvedValue(null);
    prismaMock.tournamentRegistration.count.mockResolvedValue(2);

    prismaMock.$transaction.mockImplementation(async (callback: any) => {
      const tx = {
        tournamentTeam: {
          create: jest.fn().mockResolvedValue({ id: 'team-1' }),
        },
        tournamentRegistration: {
          create: jest.fn().mockResolvedValue({ id: 'reg-1', status: RegistrationStatus.CONFIRMED }),
        },
        auditLog: {
          create: jest.fn().mockResolvedValue({ id: 'audit-1' }),
        },
      };

      return callback(tx);
    });

    const result = await service.registerTeam(
      't1',
      {
        categoryId: 'c1',
        player1Id: 'p1',
        player2Id: 'p2',
      },
      { sub: 'u1', email: 'player@test.com', role: 'PLAYER' },
    );

    expect(result.status).toBe(RegistrationStatus.CONFIRMED);
  });
});
