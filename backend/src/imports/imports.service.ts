import { createHash } from 'crypto';

import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  ImportJobStatus,
  ImportJobType,
  MatchResultSource,
  MatchStatus,
  Prisma,
  TeamSide,
  UserRole,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';

import { PrismaService } from '../prisma/prisma.service';
import { RatingsService } from '../ratings/ratings.service';
import { ImportCsvDto } from './dto/import-csv.dto';

type ParsedSetScore = {
  setNumber: number;
  teamAScore: number;
  teamBScore: number;
};

type ParsedMatchRow = {
  rowNumber: number;
  date: Date;
  emails: [string, string, string, string];
  setScores: ParsedSetScore[];
  winnerSide: TeamSide | null;
  isRated: boolean;
  tournamentName: string;
  tournamentType: 'AMERICANO' | 'GROUP_STAGE' | 'PLAYOFF';
  leagueName: string;
  roundLabel?: string;
};

type ValidationIssue = {
  row: number;
  message: string;
};

type CsvParseResult = {
  mode: 'email' | 'legacy' | 'tournament-results';
  rows: ParsedMatchRow[];
  playerNameByEmail: Map<string, string>;
  issues: ValidationIssue[];
};

type ImportedPlayerSummary = {
  id: string;
  email: string;
  username: string;
  fullName: string;
  createdAt: Date;
};

type ImportedMatchSummary = {
  id: string;
  date: string;
  players: [string, string, string, string];
  winnerSide: TeamSide | null;
  isRated: boolean;
  leagueName: string;
};

type UpdatedRatingSummary = {
  id: string;
  email: string;
  username: string;
  fullName: string;
  currentElo: number;
  wins: number;
  losses: number;
  matchesPlayed: number;
};

type ExistingImportPlayer = {
  id: string;
  email: string;
  createdAt: Date;
  playerProfile: {
    fullName: string;
    displayName: string | null;
    nickname: string | null;
    matchesPlayed: number;
    wins: number;
    losses: number;
  } | null;
};

@Injectable()
export class ImportsService {
  private readonly emailHeaders = [
    'player1_email',
    'player2_email',
    'player3_email',
    'player4_email',
    'score_set1',
    'score_set2',
    'score_set3',
    'date',
  ] as const;

  private readonly legacyHeaders = ['league', 'team_a', 'team_b', 'score_a', 'score_b'] as const;

  private readonly tournamentResultsHeaders = [
    'назва_турніру',
    'формат_турніру',
    'пара1',
    'пара2',
    'результат1',
    'результат2',
  ] as const;

  private readonly defaultLeague = 'Вища ліга';
  private readonly emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;
  private readonly isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;
  private readonly isoDateTimePattern =
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?$/;

  constructor(
    private readonly prisma: PrismaService,
    private readonly ratingsService: RatingsService,
  ) {}

  async importCsv(dto: ImportCsvDto, requestedByUserId: string) {
    const actor = await this.prisma.user.findUnique({
      where: { id: requestedByUserId },
      select: { id: true, role: true },
    });

    if (!actor) {
      throw new NotFoundException('Actor user was not found');
    }

    if (actor.role !== UserRole.ADMIN) {
      throw new BadRequestException('Only admins can import CSV');
    }

    const importJob = await this.prisma.cSVImportJob.create({
      data: {
        type: ImportJobType.MATCHES_CSV,
        status: ImportJobStatus.PENDING,
        fileName: dto.fileName ?? 'matches.csv',
        metadata: { mode: 'sync' },
        requestedByUserId,
      },
    });

    try {
      const parseResult = this.validateAndParseCsv(dto.csvContent);
      const csvEmails = this.collectCsvEmails(parseResult.rows);
      const activeConfig = await this.ratingsService.getActiveConfig();
      const defaultPasswordHash = await bcrypt.hash('CsvImport123!', 10);

      const importResult = await this.cleanupAndImportRows({
        rows: parseResult.rows,
        csvEmails,
        playerNameByEmail: parseResult.playerNameByEmail,
        actorUserId: requestedByUserId,
        defaultRating: activeConfig.defaultRating,
        defaultPasswordHash,
      });

      const ratingRecompute = await this.ratingsService.recomputeRatingsFromScratch();
      const updatedRatings = await this.fetchUpdatedRatings(importResult.resolvedCsvEmails);

      const response = {
        mode: parseResult.mode,
        addedPlayers: importResult.addedPlayers,
        createdMatches: importResult.createdMatches,
        updatedRatings,
        importWarnings: parseResult.issues,
      };

      const totalRows = parseResult.rows.length + parseResult.issues.length;

      await this.prisma.cSVImportJob.update({
        where: { id: importJob.id },
        data: {
          status: ImportJobStatus.COMPLETED,
          totalRows,
          processedRows: parseResult.rows.length,
          successfulRows: parseResult.rows.length,
          failedRows: parseResult.issues.length,
          metadata: {
            mode: parseResult.mode,
            addedPlayers: importResult.addedPlayers.length,
            createdMatches: importResult.createdMatches.length,
            updatedRatings: updatedRatings.length,
            warnings: parseResult.issues.length,
            ratingRecompute,
          } as Prisma.InputJsonValue,
          finishedAt: new Date(),
        },
      });

      await this.prisma.auditLog.create({
        data: {
          actorUserId: requestedByUserId,
          action: 'csv.import.completed',
          entityType: 'CSVImportJob',
          entityId: importJob.id,
          context: {
            mode: parseResult.mode,
            totalRows,
            warnings: parseResult.issues.length,
            addedPlayers: importResult.addedPlayers.length,
            createdMatches: importResult.createdMatches.length,
            updatedRatings: updatedRatings.length,
          },
        },
      });

      return response;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown CSV import error';

      await this.prisma.cSVImportJob.update({
        where: { id: importJob.id },
        data: {
          status: ImportJobStatus.FAILED,
          finishedAt: new Date(),
          errorReport: {
            message,
          },
        },
      });

      await this.prisma.auditLog.create({
        data: {
          actorUserId: requestedByUserId,
          action: 'csv.import.failed',
          entityType: 'CSVImportJob',
          entityId: importJob.id,
          context: {
            message,
          },
        },
      });

      throw error;
    }
  }

  private validateAndParseCsv(csvContent: string): CsvParseResult {
    const records = this.tokenizeCsv(csvContent);
    if (records.length < 2) {
      throw new BadRequestException('CSV must contain headers and at least one data row');
    }

    const headers = records[0].map((header, index) =>
      index === 0 ? header.replace(/^\uFEFF/, '').trim().toLowerCase() : header.trim().toLowerCase(),
    );

    const headerIndex = new Map<string, number>();
    headers.forEach((header, index) => {
      headerIndex.set(header, index);
    });

    const hasEmailSchema = this.emailHeaders.every((header) => headerIndex.has(header));
    if (hasEmailSchema) {
      return this.parseEmailSchemaRows(records, headerIndex);
    }

    const hasTournamentResultsSchema = this.tournamentResultsHeaders.every((header) => headerIndex.has(header));
    if (hasTournamentResultsSchema) {
      return this.parseTournamentResultsSchemaRows(records, headerIndex);
    }

    const hasLegacySchema = this.legacyHeaders.every((header) => headerIndex.has(header));
    if (hasLegacySchema) {
      return this.parseLegacySchemaRows(records, headerIndex);
    }

    throw new BadRequestException({
      message: 'CSV headers are invalid',
      expectedEmailSchema: this.emailHeaders,
      expectedTournamentResultsSchema: this.tournamentResultsHeaders,
      expectedLegacySchema: this.legacyHeaders,
      receivedHeaders: headers,
    });
  }

  private parseEmailSchemaRows(records: string[][], headerIndex: Map<string, number>): CsvParseResult {
    const rows: ParsedMatchRow[] = [];
    const issues: ValidationIssue[] = [];
    const playerNameByEmail = new Map<string, string>();

    const readValue = (values: string[], header: (typeof this.emailHeaders)[number]) => {
      const index = headerIndex.get(header)!;
      return (values[index] ?? '').trim();
    };

    for (let rowIndex = 1; rowIndex < records.length; rowIndex += 1) {
      const values = records[rowIndex];
      const rowNumber = rowIndex + 1;

      try {
        const emails = [
          this.normalizeEmail(readValue(values, 'player1_email')),
          this.normalizeEmail(readValue(values, 'player2_email')),
          this.normalizeEmail(readValue(values, 'player3_email')),
          this.normalizeEmail(readValue(values, 'player4_email')),
        ] as [string, string, string, string];

        if (emails.some((email) => !email)) {
          throw new Error('Each row must provide exactly 4 player emails');
        }

        emails.forEach((email) => {
          if (!this.emailPattern.test(email)) {
            throw new Error(`Invalid player email: ${email}`);
          }
        });

        if (new Set(emails).size !== 4) {
          throw new Error('Each match must have 4 distinct player emails');
        }

        const rawSetScores = [
          readValue(values, 'score_set1'),
          readValue(values, 'score_set2'),
          readValue(values, 'score_set3'),
        ];

        const setScores: ParsedSetScore[] = [];
        for (let setIndex = 0; setIndex < rawSetScores.length; setIndex += 1) {
          const parsedSet = this.parseSetScore(rawSetScores[setIndex], setIndex + 1);
          if (parsedSet) {
            setScores.push(parsedSet);
          }
        }

        if (setScores.length === 0) {
          throw new Error('At least one set score is required in each row');
        }

        let setsWonByA = 0;
        let setsWonByB = 0;
        for (const setScore of setScores) {
          if (setScore.teamAScore > setScore.teamBScore) {
            setsWonByA += 1;
          } else if (setScore.teamBScore > setScore.teamAScore) {
            setsWonByB += 1;
          } else {
            throw new Error('Set score cannot be a draw');
          }
        }

        if (setsWonByA === setsWonByB) {
          throw new Error('Unable to determine winner from set scores');
        }

        emails.forEach((email) => {
          if (!playerNameByEmail.has(email)) {
            playerNameByEmail.set(email, this.humanizeUsername(this.usernameFromEmail(email)));
          }
        });

        rows.push({
          rowNumber,
          date: this.parseIsoDate(readValue(values, 'date')),
          emails,
          setScores,
          winnerSide: setsWonByA > setsWonByB ? TeamSide.A : TeamSide.B,
          isRated: true,
          tournamentName: `CSV Email Import ${new Date().toISOString().slice(0, 10)}`,
          tournamentType: 'AMERICANO',
          leagueName: this.normalizeLeagueName((values[headerIndex.get('league') ?? -1] ?? '').trim()),
        });
      } catch (error) {
        issues.push({
          row: rowNumber,
          message: error instanceof Error ? error.message : 'Row validation failed',
        });
      }
    }

    if (issues.length > 0) {
      throw new BadRequestException({
        message: 'CSV validation failed',
        totalIssues: issues.length,
        issues: issues.slice(0, 50),
      });
    }

    return {
      mode: 'email',
      rows,
      playerNameByEmail,
      issues: [],
    };
  }

  private parseTournamentResultsSchemaRows(records: string[][], headerIndex: Map<string, number>): CsvParseResult {
    const rows: ParsedMatchRow[] = [];
    const issues: ValidationIssue[] = [];
    const playerNameByEmail = new Map<string, string>();

    const readValue = (values: string[], header: (typeof this.tournamentResultsHeaders)[number] | 'матч' | 'дата_матчу') => {
      const index = headerIndex.get(header);
      if (index === undefined) {
        return '';
      }

      return (values[index] ?? '').trim();
    };

    for (let rowIndex = 1; rowIndex < records.length; rowIndex += 1) {
      const values = records[rowIndex];
      const rowNumber = rowIndex + 1;

      try {
        const tournamentName = this.normalizeTournamentName(readValue(values, 'назва_турніру'));
        const tournamentType = this.parseTournamentType(readValue(values, 'формат_турніру'));

        const teamA = this.parseLegacyTeam([readValue(values, 'пара1')]);
        const teamB = this.parseLegacyTeam([readValue(values, 'пара2')]);

        const scoreA = this.parseLegacyScore(readValue(values, 'результат1'), 'результат1');
        const scoreB = this.parseLegacyScore(readValue(values, 'результат2'), 'результат2');

        const p1Email = this.emailFromPlayerName(teamA[0]);
        const p2Email = this.emailFromPlayerName(teamA[1]);
        const p3Email = this.emailFromPlayerName(teamB[0]);
        const p4Email = this.emailFromPlayerName(teamB[1]);

        playerNameByEmail.set(p1Email, teamA[0]);
        playerNameByEmail.set(p2Email, teamA[1]);
        playerNameByEmail.set(p3Email, teamB[0]);
        playerNameByEmail.set(p4Email, teamB[1]);

        const winnerSide = scoreA === scoreB ? null : scoreA > scoreB ? TeamSide.A : TeamSide.B;

        const dateRaw = readValue(values, 'дата_матчу');
        const date = dateRaw
          ? this.parseFlexibleDate(dateRaw, rowNumber)
          : this.parseLegacyDate({
              dateValue: '',
              tourValue: String(rowIndex),
              rowNumber,
            });

        rows.push({
          rowNumber,
          date,
          emails: [p1Email, p2Email, p3Email, p4Email],
          setScores: [
            {
              setNumber: 1,
              teamAScore: scoreA,
              teamBScore: scoreB,
            },
          ],
          winnerSide,
          isRated: winnerSide !== null,
          tournamentName,
          tournamentType,
          leagueName: this.defaultLeague,
          roundLabel: readValue(values, 'матч') || undefined,
        });
      } catch (error) {
        issues.push({
          row: rowNumber,
          message: error instanceof Error ? error.message : 'Row validation failed',
        });
      }
    }

    if (rows.length === 0) {
      throw new BadRequestException({
        message: 'CSV validation failed for tournament results schema',
        totalIssues: issues.length,
        issues: issues.slice(0, 50),
      });
    }

    return {
      mode: 'tournament-results',
      rows,
      playerNameByEmail,
      issues,
    };
  }

  private parseLegacySchemaRows(records: string[][], headerIndex: Map<string, number>): CsvParseResult {
    const rows: ParsedMatchRow[] = [];
    const issues: ValidationIssue[] = [];
    const playerNameByEmail = new Map<string, string>();

    const readValue = (values: string[], header: string) => {
      const index = headerIndex.get(header);
      if (index === undefined) {
        return '';
      }

      return (values[index] ?? '').trim();
    };

    for (let rowIndex = 1; rowIndex < records.length; rowIndex += 1) {
      const values = records[rowIndex];
      const rowNumber = rowIndex + 1;

      try {
        const teamA = this.parseLegacyTeam([
          readValue(values, 'team_a'),
          readValue(values, 'team_a_raw'),
        ]);
        const teamB = this.parseLegacyTeam([
          readValue(values, 'team_b'),
          readValue(values, 'team_b_raw'),
        ]);

        const scoreA = this.parseLegacyScore(readValue(values, 'score_a'), 'score_a');
        const scoreB = this.parseLegacyScore(readValue(values, 'score_b'), 'score_b');

        const p1Email = this.emailFromPlayerName(teamA[0]);
        const p2Email = this.emailFromPlayerName(teamA[1]);
        const p3Email = this.emailFromPlayerName(teamB[0]);
        const p4Email = this.emailFromPlayerName(teamB[1]);

        playerNameByEmail.set(p1Email, teamA[0]);
        playerNameByEmail.set(p2Email, teamA[1]);
        playerNameByEmail.set(p3Email, teamB[0]);
        playerNameByEmail.set(p4Email, teamB[1]);

        const winnerSide = scoreA === scoreB ? null : scoreA > scoreB ? TeamSide.A : TeamSide.B;

        rows.push({
          rowNumber,
          date: this.parseLegacyDate({
            dateValue: readValue(values, 'date'),
            tourValue: readValue(values, 'tour'),
            rowNumber,
          }),
          emails: [p1Email, p2Email, p3Email, p4Email],
          setScores: [
            {
              setNumber: 1,
              teamAScore: scoreA,
              teamBScore: scoreB,
            },
          ],
          winnerSide,
          isRated: winnerSide !== null,
          tournamentName: 'CSV Legacy Import',
          tournamentType: 'AMERICANO',
          leagueName: this.normalizeLeagueName(readValue(values, 'league')),
          roundLabel: readValue(values, 'match') || undefined,
        });
      } catch (error) {
        issues.push({
          row: rowNumber,
          message: error instanceof Error ? error.message : 'Row validation failed',
        });
      }
    }

    if (rows.length === 0) {
      throw new BadRequestException({
        message: 'CSV validation failed for legacy schema',
        totalIssues: issues.length,
        issues: issues.slice(0, 50),
      });
    }

    return {
      mode: 'legacy',
      rows,
      playerNameByEmail,
      issues,
    };
  }

  private parseLegacyTeam(candidates: string[]): [string, string] {
    for (const candidate of candidates) {
      const raw = candidate.replace(/\u00A0/g, ' ').trim();
      if (!raw) {
        continue;
      }

      const slashSplit = raw.split('/').map((part) => part.trim()).filter(Boolean);
      if (slashSplit.length === 2) {
        return [slashSplit[0], slashSplit[1]];
      }

      const dashSplit = raw
        .split(/\s+[—–:\-]\s+/)
        .map((part) => part.trim())
        .filter(Boolean);

      if (dashSplit.length === 2) {
        return [dashSplit[0], dashSplit[1]];
      }

      if (dashSplit.length > 2) {
        return [dashSplit[0], dashSplit[1]];
      }

      if (slashSplit.length > 2) {
        return [slashSplit[0], slashSplit[1]];
      }

      const words = raw.split(/\s+/).filter(Boolean);
      if (words.length === 2) {
        return [words[0], words[1]];
      }

      if (words.length === 4) {
        return [`${words[0]} ${words[1]}`, `${words[2]} ${words[3]}`];
      }
    }

    throw new Error('Cannot parse team players. Expected two players in team_a/team_b columns');
  }

  private parseLegacyScore(rawValue: string, fieldName: string): number {
    const value = rawValue.trim().replace(',', '.');
    if (!value) {
      throw new Error(`${fieldName} is required`);
    }

    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) {
      throw new Error(`${fieldName} must be a non-negative number`);
    }

    return Math.round(parsed);
  }

  private parseLegacyDate(params: { dateValue: string; tourValue: string; rowNumber: number }): Date {
    if (params.dateValue) {
      return this.parseIsoDate(params.dateValue);
    }

    const tourNumber = Number(params.tourValue);
    const dayOffset = Number.isFinite(tourNumber) && tourNumber > 0 ? Math.round(tourNumber) - 1 : params.rowNumber - 1;

    const base = new Date(Date.UTC(2026, 0, 1, 12, 0, 0));
    base.setUTCDate(base.getUTCDate() + Math.max(dayOffset, 0));
    return base;
  }

  private normalizeLeagueName(value: string): string {
    const normalized = value.trim().toLowerCase();

    if (!normalized) {
      return this.defaultLeague;
    }

    if (normalized.includes('друга') || normalized.includes('second')) {
      return 'Друга ліга';
    }

    if (normalized.includes('перша') || normalized.includes('first')) {
      return 'Перша ліга';
    }

    return this.defaultLeague;
  }

  private parseSetScore(rawValue: string, setNumber: number): ParsedSetScore | null {
    const value = rawValue.trim();
    if (!value) {
      return null;
    }

    const match = value.match(/^(\d{1,2})\s*[-:]\s*(\d{1,2})$/);
    if (!match) {
      throw new Error(`Invalid score_set${setNumber} format: ${value}`);
    }

    const teamAScore = Number(match[1]);
    const teamBScore = Number(match[2]);

    if (teamAScore < 0 || teamBScore < 0 || teamAScore > 20 || teamBScore > 20) {
      throw new Error(`score_set${setNumber} values must be between 0 and 20`);
    }

    return {
      setNumber,
      teamAScore,
      teamBScore,
    };
  }

  private parseIsoDate(rawValue: string): Date {
    const value = rawValue.trim();
    if (!value) {
      throw new Error('Date is required');
    }

    if (!this.isoDatePattern.test(value) && !this.isoDateTimePattern.test(value)) {
      throw new Error(`Date must be ISO format YYYY-MM-DD or YYYY-MM-DDTHH:MM:SS: ${value}`);
    }

    const normalized = this.isoDatePattern.test(value) ? `${value}T00:00:00.000Z` : value;
    const parsed = new Date(normalized);

    if (Number.isNaN(parsed.getTime())) {
      throw new Error(`Invalid date value: ${value}`);
    }

    return parsed;
  }

  private parseFlexibleDate(rawValue: string, rowNumber: number): Date {
    const value = rawValue.trim();
    if (!value) {
      throw new Error('Date is required');
    }

    if (this.isoDatePattern.test(value) || this.isoDateTimePattern.test(value)) {
      return this.parseIsoDate(value);
    }

    const localDateMatch = value.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
    if (localDateMatch) {
      const day = Number(localDateMatch[1]);
      const month = Number(localDateMatch[2]);
      const year = Number(localDateMatch[3]);

      const parsed = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
      if (
        parsed.getUTCFullYear() !== year ||
        parsed.getUTCMonth() !== month - 1 ||
        parsed.getUTCDate() !== day
      ) {
        throw new Error(`Invalid date value at row ${rowNumber}: ${value}`);
      }

      return parsed;
    }

    throw new Error(`Date must be ISO or DD-MM-YYYY format: ${value}`);
  }

  private tokenizeCsv(csvContent: string): string[][] {
    const content = csvContent.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    const rows: string[][] = [];
    let currentRow: string[] = [];
    let currentField = '';
    let insideQuotes = false;

    for (let index = 0; index < content.length; index += 1) {
      const char = content[index];

      if (char === '"') {
        const nextChar = content[index + 1];
        if (insideQuotes && nextChar === '"') {
          currentField += '"';
          index += 1;
        } else {
          insideQuotes = !insideQuotes;
        }
        continue;
      }

      if (char === ',' && !insideQuotes) {
        currentRow.push(currentField);
        currentField = '';
        continue;
      }

      if (char === '\n' && !insideQuotes) {
        currentRow.push(currentField);
        if (currentRow.some((field) => field.trim() !== '')) {
          rows.push(currentRow);
        }
        currentRow = [];
        currentField = '';
        continue;
      }

      currentField += char;
    }

    if (currentField.length > 0 || currentRow.length > 0) {
      currentRow.push(currentField);
      if (currentRow.some((field) => field.trim() !== '')) {
        rows.push(currentRow);
      }
    }

    return rows;
  }

  private collectCsvEmails(rows: ParsedMatchRow[]): string[] {
    const emails = new Set<string>();
    rows.forEach((row) => row.emails.forEach((email) => emails.add(email)));
    return Array.from(emails).sort((a, b) => a.localeCompare(b));
  }

  private async cleanupAndImportRows(params: {
    rows: ParsedMatchRow[];
    csvEmails: string[];
    playerNameByEmail: Map<string, string>;
    actorUserId: string;
    defaultRating: number;
    defaultPasswordHash: string;
  }): Promise<{
    addedPlayers: ImportedPlayerSummary[];
    createdMatches: ImportedMatchSummary[];
    resolvedCsvEmails: string[];
  }> {
    return this.prisma.$transaction(async (tx) => {
      const addedPlayers: ImportedPlayerSummary[] = [];
      const createdMatches: ImportedMatchSummary[] = [];
      const playerIdByEmail = new Map<string, string>();

      await tx.ratingHistory.deleteMany({});
      await tx.matchSetScore.deleteMany({});
      await tx.matchTeam.deleteMany({});
      await tx.match.deleteMany({});
      await tx.tournamentRegistration.deleteMany({});
      await tx.tournamentTeam.deleteMany({});
      await tx.tournamentCategory.deleteMany({});
      await tx.tournament.deleteMany({});

      const canonicalEmailBySourceEmail = await this.resolveCanonicalEmailsForImportedPlayers(
        tx,
        params.csvEmails,
        params.playerNameByEmail,
      );

      const remappedRows = params.rows.map((row) => ({
        ...row,
        emails: row.emails.map((email) => {
          const sourceEmail = this.normalizeEmail(email);
          return canonicalEmailBySourceEmail.get(sourceEmail) ?? sourceEmail;
        }) as [string, string, string, string],
      }));

      const remappedCsvEmails = this.collectCsvEmails(remappedRows);
      const remappedPlayerNameByEmail = this.remapPlayerNameByEmail(
        params.playerNameByEmail,
        canonicalEmailBySourceEmail,
      );

      await tx.user.deleteMany({
        where: {
          role: UserRole.PLAYER,
          email: { notIn: remappedCsvEmails },
        },
      });

      const existingUsers = await tx.user.findMany({
        where: {
          email: { in: remappedCsvEmails },
        },
        include: {
          playerProfile: true,
        },
      });
      const userByEmail = new Map(existingUsers.map((user) => [user.email.toLowerCase(), user]));

      const existingNicknames = await tx.playerProfile.findMany({
        where: {
          nickname: { not: null },
        },
        select: {
          nickname: true,
        },
      });

      const usedUsernames = new Set(
        existingNicknames
          .map((entry) => (entry.nickname ? this.normalizeUsername(entry.nickname) : ''))
          .filter(Boolean),
      );

      for (const email of remappedCsvEmails) {
        const existingUser = userByEmail.get(email);
        const csvName = remappedPlayerNameByEmail.get(email)?.trim() || null;

        if (!existingUser) {
          const username = this.createUniqueUsername(this.usernameFromEmail(email), usedUsernames);
          const fullName = csvName ?? this.humanizeUsername(username);

          const createdUser = await tx.user.create({
            data: {
              email,
              passwordHash: params.defaultPasswordHash,
              role: UserRole.PLAYER,
              playerProfile: {
                create: {
                  fullName,
                  displayName: fullName,
                  nickname: username,
                  currentElo: params.defaultRating,
                },
              },
            },
            include: {
              playerProfile: true,
            },
          });

          playerIdByEmail.set(email, createdUser.playerProfile!.id);
          addedPlayers.push({
            id: createdUser.playerProfile!.id,
            email,
            username,
            fullName,
            createdAt: createdUser.playerProfile!.createdAt,
          });

          continue;
        }

        if (existingUser.role !== UserRole.PLAYER) {
          throw new BadRequestException(
            `CSV email belongs to a non-player account and cannot be imported: ${email}`,
          );
        }

        if (!existingUser.playerProfile) {
          const username = this.createUniqueUsername(this.usernameFromEmail(email), usedUsernames);
          const fullName = csvName ?? this.humanizeUsername(username);

          const profile = await tx.playerProfile.create({
            data: {
              userId: existingUser.id,
              fullName,
              displayName: fullName,
              nickname: username,
              currentElo: params.defaultRating,
            },
          });

          playerIdByEmail.set(email, profile.id);
          addedPlayers.push({
            id: profile.id,
            email,
            username,
            fullName,
            createdAt: profile.createdAt,
          });
          continue;
        }

        const existingNickname = existingUser.playerProfile.nickname
          ? this.normalizeUsername(existingUser.playerProfile.nickname)
          : '';

        const normalizedNickname =
          existingNickname || this.createUniqueUsername(this.usernameFromEmail(email), usedUsernames);
        if (existingNickname) {
          usedUsernames.add(existingNickname);
        }

        const profileName = csvName ?? existingUser.playerProfile.fullName ?? this.humanizeUsername(normalizedNickname);

        await tx.playerProfile.update({
          where: { id: existingUser.playerProfile.id },
          data: {
            nickname: existingUser.playerProfile.nickname ?? normalizedNickname,
            displayName: existingUser.playerProfile.displayName ?? profileName,
            fullName: profileName,
          },
        });

        playerIdByEmail.set(email, existingUser.playerProfile.id);
      }

      const rowsByTournamentName = new Map<string, ParsedMatchRow[]>();
      for (const row of remappedRows) {
        const list = rowsByTournamentName.get(row.tournamentName) ?? [];
        list.push(row);
        rowsByTournamentName.set(row.tournamentName, list);
      }

      const tournamentMetaByName = new Map<
        string,
        {
          id: string;
          fallbackCategoryId: string;
          categoryIdByLeague: Map<string, string>;
        }
      >();

      let tournamentIndex = 0;
      for (const [tournamentName, tournamentRows] of rowsByTournamentName.entries()) {
        tournamentIndex += 1;

        const rowDates = tournamentRows.map((row) => row.date.getTime());
        const tournamentStartDate = new Date(Math.min(...rowDates));
        const tournamentEndDate = new Date(Math.max(...rowDates));

        const leagueNames = Array.from(
          new Set(tournamentRows.map((row) => this.normalizeLeagueName(row.leagueName))),
        ).sort((a, b) => a.localeCompare(b));

        const maxParticipants = new Set(tournamentRows.flatMap((row) => row.emails)).size;
        const type = tournamentRows[0]?.tournamentType ?? 'AMERICANO';

        const tournamentSlugBase = this.normalizeUsername(tournamentName.replace(/\s+/g, '-')) || 'csv-import';
        const tournamentSlug = `${tournamentSlugBase}-${Date.now()}-${tournamentIndex}`;

        const createdTournament = await tx.tournament.create({
          data: {
            name: tournamentName,
            type,
            slug: tournamentSlug,
            description: 'Auto-generated tournament from CSV import',
            location: 'Imported',
            date: tournamentStartDate,
            courtsCount: 2,
            maxPlayers: Math.max(maxParticipants, 4),
            startDate: tournamentStartDate,
            endDate: tournamentEndDate,
            status: 'FINISHED',
            registrationStatus: 'CLOSED',
            registrationOpenAt: tournamentStartDate,
            registrationCloseAt: tournamentEndDate,
            publishedAt: new Date(),
            startedAt: tournamentStartDate,
            finishedAt: tournamentEndDate,
            createdByUserId: params.actorUserId,
            categories: {
              create: leagueNames.map((leagueName) => ({
                name: leagueName,
                discipline: 'OPEN',
                maxParticipants: Math.max(maxParticipants, 4),
                format: 'ROUND_ROBIN',
              })),
            },
          },
          include: {
            categories: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        });

        const categoryIdByLeague = new Map(
          createdTournament.categories.map((category) => [
            this.normalizeLeagueName(category.name),
            category.id,
          ]),
        );

        const fallbackCategoryId = createdTournament.categories[0]?.id;
        if (!fallbackCategoryId) {
          throw new BadRequestException('Failed to create import tournament category');
        }

        tournamentMetaByName.set(tournamentName, {
          id: createdTournament.id,
          fallbackCategoryId,
          categoryIdByLeague,
        });
      }

      for (const row of remappedRows) {
        const [p1Email, p2Email, p3Email, p4Email] = row.emails;
        const p1 = playerIdByEmail.get(p1Email);
        const p2 = playerIdByEmail.get(p2Email);
        const p3 = playerIdByEmail.get(p3Email);
        const p4 = playerIdByEmail.get(p4Email);

        if (!p1 || !p2 || !p3 || !p4) {
          throw new BadRequestException(`Unable to resolve all players for CSV row ${row.rowNumber}`);
        }

        const tournamentMeta = tournamentMetaByName.get(row.tournamentName);
        if (!tournamentMeta) {
          throw new BadRequestException(`Unable to resolve tournament for CSV row ${row.rowNumber}`);
        }

        const normalizedLeagueName = this.normalizeLeagueName(row.leagueName);
        const categoryId =
          tournamentMeta.categoryIdByLeague.get(normalizedLeagueName) ?? tournamentMeta.fallbackCategoryId;

        const createdMatch = await tx.match.create({
          data: {
            tournamentId: tournamentMeta.id,
            tournamentCategoryId: categoryId,
            status: MatchStatus.COMPLETED,
            resultSource: MatchResultSource.IMPORTED,
            scheduledAt: row.date,
            playedAt: row.date,
            isRated: row.isRated,
            winnerTeamSide: row.winnerSide,
            createdByUserId: params.actorUserId,
            roundLabel: row.roundLabel || `${normalizedLeagueName} | CSV Row ${row.rowNumber}`,
            teams: {
              create: [
                {
                  side: TeamSide.A,
                  player1Id: p1,
                  player2Id: p2,
                  teamAverageElo: params.defaultRating,
                },
                {
                  side: TeamSide.B,
                  player1Id: p3,
                  player2Id: p4,
                  teamAverageElo: params.defaultRating,
                },
              ],
            },
            setScores: {
              create: row.setScores.map((setScore) => ({
                setNumber: setScore.setNumber,
                teamAScore: setScore.teamAScore,
                teamBScore: setScore.teamBScore,
              })),
            },
          },
          select: {
            id: true,
            playedAt: true,
          },
        });

        createdMatches.push({
          id: createdMatch.id,
          date: (createdMatch.playedAt ?? row.date).toISOString(),
          players: row.emails,
          winnerSide: row.winnerSide,
          isRated: row.isRated,
          leagueName: normalizedLeagueName,
        });
      }

      return {
        addedPlayers,
        createdMatches,
        resolvedCsvEmails: remappedCsvEmails,
      };
    });
  }

  private async resolveCanonicalEmailsForImportedPlayers(
    tx: Prisma.TransactionClient,
    csvEmails: string[],
    playerNameByEmail: Map<string, string>,
  ): Promise<Map<string, string>> {
    const existingPlayers = (await tx.user.findMany({
      where: {
        role: UserRole.PLAYER,
        playerProfile: {
          isNot: null,
        },
      },
      select: {
        id: true,
        email: true,
        createdAt: true,
        playerProfile: {
          select: {
            fullName: true,
            displayName: true,
            nickname: true,
            matchesPlayed: true,
            wins: true,
            losses: true,
          },
        },
      },
    })) as ExistingImportPlayer[];

    const canonicalBySource = new Map<string, string>();
    const assignedCanonicalByName = new Map<string, string>();

    for (const sourceEmailRaw of csvEmails) {
      const sourceEmail = this.normalizeEmail(sourceEmailRaw);
      const sourceName =
        playerNameByEmail.get(sourceEmail)?.trim() || playerNameByEmail.get(sourceEmailRaw)?.trim() || '';

      let resolvedEmail = sourceEmail;

      if (sourceName && sourceEmail.endsWith('@padelelo.local')) {
        const candidateEmail = this.findBestExistingEmailForImportedName(sourceName, existingPlayers);

        if (candidateEmail) {
          const normalizedName = this.normalizePersonName(sourceName) || sourceName.toLowerCase();
          const alreadyAssignedName = assignedCanonicalByName.get(candidateEmail);

          if (!alreadyAssignedName || alreadyAssignedName === normalizedName) {
            assignedCanonicalByName.set(candidateEmail, normalizedName);
            resolvedEmail = candidateEmail;
          }
        }
      }

      canonicalBySource.set(sourceEmail, resolvedEmail);
    }

    return canonicalBySource;
  }

  private findBestExistingEmailForImportedName(name: string, candidates: ExistingImportPlayer[]): string | null {
    const normalizedName = this.normalizePersonName(name);
    if (!normalizedName) {
      return null;
    }

    const normalizedLogin = this.normalizeUsername(this.transliterateToLatin(name).replace(/\s+/g, '_'));

    const scored = candidates
      .map((candidate) => {
        const fullName = candidate.playerProfile?.fullName ?? '';
        const displayName = candidate.playerProfile?.displayName ?? '';

        const normalizedFullName = this.normalizePersonName(fullName);
        const normalizedDisplayName = this.normalizePersonName(displayName);

        const localPart = this.normalizeUsername(candidate.email.split('@')[0] ?? '');
        const nickname = this.normalizeUsername(candidate.playerProfile?.nickname ?? '');

        const transliteratedFullName = this.normalizeUsername(
          this.transliterateToLatin(fullName).replace(/\s+/g, '_'),
        );
        const transliteratedDisplayName = this.normalizeUsername(
          this.transliterateToLatin(displayName).replace(/\s+/g, '_'),
        );

        const nameExact =
          normalizedFullName === normalizedName ||
          (normalizedDisplayName.length > 0 && normalizedDisplayName === normalizedName);
        const loginExact = Boolean(normalizedLogin) && (nickname === normalizedLogin || localPart === normalizedLogin);
        const translitExact =
          Boolean(normalizedLogin) &&
          (transliteratedFullName === normalizedLogin || transliteratedDisplayName === normalizedLogin);

        let score = 0;
        if (nameExact) {
          score += 700;
        }

        if (loginExact) {
          score += 520;
        }

        if (translitExact) {
          score += 320;
        }

        if (!candidate.email.toLowerCase().endsWith('@padelelo.local')) {
          score += 80;
        }

        const activity =
          (candidate.playerProfile?.matchesPlayed ?? 0) +
          (candidate.playerProfile?.wins ?? 0) +
          (candidate.playerProfile?.losses ?? 0);

        score += Math.min(activity * 12, 180);

        return {
          email: this.normalizeEmail(candidate.email),
          createdAt: candidate.createdAt,
          score,
          activity,
          nameExact,
          loginExact,
          translitExact,
        };
      })
      .filter((entry) => entry.nameExact || entry.loginExact || entry.translitExact);

    if (scored.length === 0) {
      return null;
    }

    scored.sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }

      if (b.activity !== a.activity) {
        return b.activity - a.activity;
      }

      return a.createdAt.getTime() - b.createdAt.getTime();
    });

    const best = scored[0];
    const second = scored[1];

    if (second && second.score === best.score && second.activity === best.activity) {
      return null;
    }

    return best.email;
  }

  private remapPlayerNameByEmail(
    sourceMap: Map<string, string>,
    canonicalBySource: Map<string, string>,
  ): Map<string, string> {
    const remapped = new Map<string, string>();

    for (const [sourceEmailRaw, nameRaw] of sourceMap.entries()) {
      const sourceEmail = this.normalizeEmail(sourceEmailRaw);
      const targetEmail = canonicalBySource.get(sourceEmail) ?? sourceEmail;
      const nextName = nameRaw.trim();
      const currentName = remapped.get(targetEmail) ?? '';

      if (!currentName || nextName.length > currentName.length) {
        remapped.set(targetEmail, nextName);
      }
    }

    return remapped;
  }

  private normalizePersonName(value: string): string {
    return value
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9а-яіїєґё]+/gi, ' ')
      .trim()
      .replace(/\s+/g, ' ');
  }

  private transliterateToLatin(value: string): string {
    const mapping: Record<string, string> = {
      а: 'a',
      б: 'b',
      в: 'v',
      г: 'h',
      ґ: 'g',
      д: 'd',
      е: 'e',
      є: 'ye',
      ж: 'zh',
      з: 'z',
      и: 'y',
      і: 'i',
      ї: 'yi',
      й: 'y',
      к: 'k',
      л: 'l',
      м: 'm',
      н: 'n',
      о: 'o',
      п: 'p',
      р: 'r',
      с: 's',
      т: 't',
      у: 'u',
      ф: 'f',
      х: 'kh',
      ц: 'ts',
      ч: 'ch',
      ш: 'sh',
      щ: 'shch',
      ь: '',
      ю: 'yu',
      я: 'ya',
      ё: 'yo',
      ъ: '',
      "'": '',
      '’': '',
      'ʼ': '',
    };

    return value
      .toLowerCase()
      .split('')
      .map((char) => mapping[char] ?? char)
      .join('')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
      .replace(/\s+/g, ' ');
  }

  private async fetchUpdatedRatings(csvEmails: string[]): Promise<UpdatedRatingSummary[]> {
    const players = await this.prisma.playerProfile.findMany({
      where: {
        user: {
          email: {
            in: csvEmails,
          },
        },
      },
      select: {
        id: true,
        fullName: true,
        nickname: true,
        currentElo: true,
        wins: true,
        losses: true,
        matchesPlayed: true,
        user: {
          select: {
            email: true,
          },
        },
      },
      orderBy: [{ currentElo: 'desc' }, { matchesPlayed: 'desc' }],
    });

    return players.map((player) => ({
      id: player.id,
      email: player.user.email,
      username: player.nickname ?? this.usernameFromEmail(player.user.email),
      fullName: player.fullName,
      currentElo: player.currentElo,
      wins: player.wins,
      losses: player.losses,
      matchesPlayed: player.matchesPlayed,
    }));
  }

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  private normalizeTournamentName(value: string): string {
    const normalized = value.trim().replace(/\s+/g, ' ');
    if (!normalized) {
      return 'CSV Tournament';
    }

    return normalized;
  }

  private parseTournamentType(value: string): 'AMERICANO' | 'GROUP_STAGE' | 'PLAYOFF' {
    const normalized = value.trim().toLowerCase();
    if (!normalized) {
      return 'AMERICANO';
    }

    if (
      normalized.includes('group') ||
      normalized.includes('груп') ||
      normalized.includes('round robin')
    ) {
      return 'GROUP_STAGE';
    }

    if (
      normalized.includes('playoff') ||
      normalized.includes('плей') ||
      normalized.includes('elimination')
    ) {
      return 'PLAYOFF';
    }

    return 'AMERICANO';
  }

  private emailFromPlayerName(name: string): string {
    const normalized = name.trim().replace(/\s+/g, ' ');
    const slugBase = this.normalizeUsername(
      normalized
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '_'),
    );

    if (slugBase) {
      return `${slugBase}@padelelo.local`;
    }

    const digest = createHash('sha1').update(normalized.toLowerCase()).digest('hex').slice(0, 20);
    return `csv-${digest}@padelelo.local`;
  }

  private usernameFromEmail(email: string): string {
    const localPart = email.split('@')[0] ?? 'player';
    const normalized = this.normalizeUsername(localPart);
    return normalized || 'player';
  }

  private normalizeUsername(value: string): string {
    return value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, '-')
      .replace(/[-_.]{2,}/g, '-')
      .replace(/^[-_.]+|[-_.]+$/g, '');
  }

  private createUniqueUsername(base: string, used: Set<string>): string {
    const normalizedBase = this.normalizeUsername(base) || 'player';
    let candidate = normalizedBase;
    let suffix = 1;

    while (used.has(candidate)) {
      candidate = `${normalizedBase}-${suffix}`;
      suffix += 1;
    }

    used.add(candidate);
    return candidate;
  }

  private humanizeUsername(username: string): string {
    const words = username
      .replace(/[-_.]+/g, ' ')
      .split(' ')
      .filter(Boolean)
      .map((word) => `${word[0]?.toUpperCase() ?? ''}${word.slice(1)}`);

    return words.length > 0 ? words.join(' ') : 'CSV Player';
  }
}
