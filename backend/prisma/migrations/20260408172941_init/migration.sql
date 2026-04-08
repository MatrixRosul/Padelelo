-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('PLAYER', 'ADMIN');

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE', 'OTHER', 'UNDISCLOSED');

-- CreateEnum
CREATE TYPE "AgeGroup" AS ENUM ('U14', 'U16', 'U18', 'ADULT', 'SENIOR', 'OPEN');

-- CreateEnum
CREATE TYPE "TournamentStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "RegistrationWindowStatus" AS ENUM ('CLOSED', 'OPEN');

-- CreateEnum
CREATE TYPE "TournamentDiscipline" AS ENUM ('MEN', 'WOMEN', 'MIXED', 'JUNIOR_U14', 'JUNIOR_U16', 'JUNIOR_U18', 'OPEN', 'AMATEUR', 'SENIOR', 'CUSTOM');

-- CreateEnum
CREATE TYPE "TournamentFormat" AS ENUM ('SINGLE_ELIMINATION', 'DOUBLE_ELIMINATION', 'ROUND_ROBIN', 'GROUPS_PLAYOFFS', 'QUALIFICATION_MAIN_DRAW');

-- CreateEnum
CREATE TYPE "RegistrationStatus" AS ENUM ('PENDING', 'CONFIRMED', 'WAITLISTED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "GenderEligibility" AS ENUM ('ANY', 'MALE', 'FEMALE', 'MIXED_ONLY');

-- CreateEnum
CREATE TYPE "MatchStatus" AS ENUM ('SCHEDULED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "MatchResultSource" AS ENUM ('MANUAL', 'SIMULATED', 'IMPORTED');

-- CreateEnum
CREATE TYPE "TeamSide" AS ENUM ('A', 'B');

-- CreateEnum
CREATE TYPE "BracketStage" AS ENUM ('QUALIFICATION', 'GROUP_STAGE', 'ROUND_OF_32', 'ROUND_OF_16', 'QUARTERFINAL', 'SEMIFINAL', 'FINAL', 'THIRD_PLACE');

-- CreateEnum
CREATE TYPE "RatingHistoryReason" AS ENUM ('MATCH_RESULT', 'RECOMPUTE', 'ADMIN_ADJUSTMENT', 'CSV_IMPORT');

-- CreateEnum
CREATE TYPE "ImportJobType" AS ENUM ('MATCHES_CSV', 'PLAYERS_CSV', 'RECALCULATE_RATINGS');

-- CreateEnum
CREATE TYPE "ImportJobStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'PLAYER',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlayerProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "displayName" TEXT,
    "nickname" TEXT,
    "avatarUrl" TEXT,
    "country" TEXT,
    "city" TEXT,
    "birthDate" TIMESTAMP(3),
    "ageGroup" "AgeGroup",
    "gender" "Gender",
    "currentElo" INTEGER NOT NULL DEFAULT 1400,
    "wins" INTEGER NOT NULL DEFAULT 0,
    "losses" INTEGER NOT NULL DEFAULT 0,
    "matchesPlayed" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlayerProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tournament" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "location" TEXT,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "status" "TournamentStatus" NOT NULL DEFAULT 'DRAFT',
    "registrationStatus" "RegistrationWindowStatus" NOT NULL DEFAULT 'CLOSED',
    "registrationOpenAt" TIMESTAMP(3),
    "registrationCloseAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tournament_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TournamentCategory" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "discipline" "TournamentDiscipline" NOT NULL,
    "customDisciplineLabel" TEXT,
    "genderEligibility" "GenderEligibility" NOT NULL DEFAULT 'ANY',
    "ageMin" INTEGER,
    "ageMax" INTEGER,
    "rankingMin" INTEGER,
    "rankingMax" INTEGER,
    "maxParticipants" INTEGER NOT NULL,
    "format" "TournamentFormat" NOT NULL,
    "allowsWildCards" BOOLEAN NOT NULL DEFAULT false,
    "seededEntriesCount" INTEGER NOT NULL DEFAULT 0,
    "qualificationSpots" INTEGER NOT NULL DEFAULT 0,
    "groupCount" INTEGER,
    "playoffSize" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TournamentCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TournamentTeam" (
    "id" TEXT NOT NULL,
    "tournamentCategoryId" TEXT NOT NULL,
    "player1Id" TEXT NOT NULL,
    "player2Id" TEXT NOT NULL,
    "seedNumber" INTEGER,
    "isWildCard" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TournamentTeam_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TournamentRegistration" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "tournamentCategoryId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "status" "RegistrationStatus" NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TournamentRegistration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Match" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT,
    "tournamentCategoryId" TEXT,
    "status" "MatchStatus" NOT NULL DEFAULT 'SCHEDULED',
    "resultSource" "MatchResultSource" NOT NULL DEFAULT 'MANUAL',
    "scheduledAt" TIMESTAMP(3),
    "playedAt" TIMESTAMP(3),
    "roundLabel" TEXT,
    "bracketStage" "BracketStage",
    "isRated" BOOLEAN NOT NULL DEFAULT true,
    "winnerTeamSide" "TeamSide",
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Match_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatchTeam" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "side" "TeamSide" NOT NULL,
    "player1Id" TEXT NOT NULL,
    "player2Id" TEXT NOT NULL,
    "teamAverageElo" INTEGER NOT NULL,
    "expectedScore" DOUBLE PRECISION,
    "actualScore" DOUBLE PRECISION,
    "ratingDelta" INTEGER,
    "isWinner" BOOLEAN,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MatchTeam_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatchSetScore" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "setNumber" INTEGER NOT NULL,
    "teamAScore" INTEGER NOT NULL,
    "teamBScore" INTEGER NOT NULL,
    "tieBreakAScore" INTEGER,
    "tieBreakBScore" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MatchSetScore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RatingHistory" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "reason" "RatingHistoryReason" NOT NULL DEFAULT 'MATCH_RESULT',
    "beforeRating" INTEGER NOT NULL,
    "afterRating" INTEGER NOT NULL,
    "delta" INTEGER NOT NULL,
    "kFactor" INTEGER NOT NULL,
    "expectedScore" DOUBLE PRECISION NOT NULL,
    "actualScore" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RatingHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EloConfig" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'default',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "defaultRating" INTEGER NOT NULL DEFAULT 1400,
    "kFactor" INTEGER NOT NULL DEFAULT 32,
    "minKFactor" INTEGER NOT NULL DEFAULT 16,
    "maxKFactor" INTEGER NOT NULL DEFAULT 64,
    "provisionalGames" INTEGER NOT NULL DEFAULT 20,
    "provisionalKFactor" INTEGER NOT NULL DEFAULT 40,
    "homeAdvantage" INTEGER NOT NULL DEFAULT 0,
    "updatedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EloConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CSVImportJob" (
    "id" TEXT NOT NULL,
    "type" "ImportJobType" NOT NULL,
    "status" "ImportJobStatus" NOT NULL DEFAULT 'PENDING',
    "fileName" TEXT NOT NULL,
    "storagePath" TEXT,
    "metadata" JSONB,
    "totalRows" INTEGER,
    "processedRows" INTEGER NOT NULL DEFAULT 0,
    "successfulRows" INTEGER NOT NULL DEFAULT 0,
    "failedRows" INTEGER NOT NULL DEFAULT 0,
    "errorReport" JSONB,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "requestedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CSVImportJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorUserId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "context" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_role_isActive_idx" ON "User"("role", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "PlayerProfile_userId_key" ON "PlayerProfile"("userId");

-- CreateIndex
CREATE INDEX "PlayerProfile_currentElo_idx" ON "PlayerProfile"("currentElo" DESC);

-- CreateIndex
CREATE INDEX "PlayerProfile_country_city_idx" ON "PlayerProfile"("country", "city");

-- CreateIndex
CREATE UNIQUE INDEX "Tournament_slug_key" ON "Tournament"("slug");

-- CreateIndex
CREATE INDEX "Tournament_status_startDate_idx" ON "Tournament"("status", "startDate");

-- CreateIndex
CREATE INDEX "Tournament_registrationStatus_registrationCloseAt_idx" ON "Tournament"("registrationStatus", "registrationCloseAt");

-- CreateIndex
CREATE INDEX "TournamentCategory_tournamentId_discipline_idx" ON "TournamentCategory"("tournamentId", "discipline");

-- CreateIndex
CREATE UNIQUE INDEX "TournamentCategory_tournamentId_name_key" ON "TournamentCategory"("tournamentId", "name");

-- CreateIndex
CREATE INDEX "TournamentTeam_tournamentCategoryId_idx" ON "TournamentTeam"("tournamentCategoryId");

-- CreateIndex
CREATE INDEX "TournamentTeam_player1Id_idx" ON "TournamentTeam"("player1Id");

-- CreateIndex
CREATE INDEX "TournamentTeam_player2Id_idx" ON "TournamentTeam"("player2Id");

-- CreateIndex
CREATE UNIQUE INDEX "TournamentTeam_tournamentCategoryId_player1Id_player2Id_key" ON "TournamentTeam"("tournamentCategoryId", "player1Id", "player2Id");

-- CreateIndex
CREATE INDEX "TournamentRegistration_tournamentId_status_idx" ON "TournamentRegistration"("tournamentId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "TournamentRegistration_tournamentCategoryId_teamId_key" ON "TournamentRegistration"("tournamentCategoryId", "teamId");

-- CreateIndex
CREATE INDEX "Match_status_scheduledAt_idx" ON "Match"("status", "scheduledAt");

-- CreateIndex
CREATE INDEX "Match_playedAt_idx" ON "Match"("playedAt");

-- CreateIndex
CREATE INDEX "Match_tournamentCategoryId_bracketStage_idx" ON "Match"("tournamentCategoryId", "bracketStage");

-- CreateIndex
CREATE INDEX "MatchTeam_player1Id_idx" ON "MatchTeam"("player1Id");

-- CreateIndex
CREATE INDEX "MatchTeam_player2Id_idx" ON "MatchTeam"("player2Id");

-- CreateIndex
CREATE UNIQUE INDEX "MatchTeam_matchId_side_key" ON "MatchTeam"("matchId", "side");

-- CreateIndex
CREATE UNIQUE INDEX "MatchSetScore_matchId_setNumber_key" ON "MatchSetScore"("matchId", "setNumber");

-- CreateIndex
CREATE INDEX "RatingHistory_playerId_createdAt_idx" ON "RatingHistory"("playerId", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "RatingHistory_matchId_playerId_key" ON "RatingHistory"("matchId", "playerId");

-- CreateIndex
CREATE INDEX "EloConfig_isActive_idx" ON "EloConfig"("isActive");

-- CreateIndex
CREATE INDEX "CSVImportJob_type_status_idx" ON "CSVImportJob"("type", "status");

-- CreateIndex
CREATE INDEX "CSVImportJob_createdAt_idx" ON "CSVImportJob"("createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_actorUserId_createdAt_idx" ON "AuditLog"("actorUserId", "createdAt");

-- AddForeignKey
ALTER TABLE "PlayerProfile" ADD CONSTRAINT "PlayerProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tournament" ADD CONSTRAINT "Tournament_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentCategory" ADD CONSTRAINT "TournamentCategory_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentTeam" ADD CONSTRAINT "TournamentTeam_tournamentCategoryId_fkey" FOREIGN KEY ("tournamentCategoryId") REFERENCES "TournamentCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentTeam" ADD CONSTRAINT "TournamentTeam_player1Id_fkey" FOREIGN KEY ("player1Id") REFERENCES "PlayerProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentTeam" ADD CONSTRAINT "TournamentTeam_player2Id_fkey" FOREIGN KEY ("player2Id") REFERENCES "PlayerProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentRegistration" ADD CONSTRAINT "TournamentRegistration_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentRegistration" ADD CONSTRAINT "TournamentRegistration_tournamentCategoryId_fkey" FOREIGN KEY ("tournamentCategoryId") REFERENCES "TournamentCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentRegistration" ADD CONSTRAINT "TournamentRegistration_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "TournamentTeam"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_tournamentCategoryId_fkey" FOREIGN KEY ("tournamentCategoryId") REFERENCES "TournamentCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchTeam" ADD CONSTRAINT "MatchTeam_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchTeam" ADD CONSTRAINT "MatchTeam_player1Id_fkey" FOREIGN KEY ("player1Id") REFERENCES "PlayerProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchTeam" ADD CONSTRAINT "MatchTeam_player2Id_fkey" FOREIGN KEY ("player2Id") REFERENCES "PlayerProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchSetScore" ADD CONSTRAINT "MatchSetScore_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RatingHistory" ADD CONSTRAINT "RatingHistory_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "PlayerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RatingHistory" ADD CONSTRAINT "RatingHistory_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EloConfig" ADD CONSTRAINT "EloConfig_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CSVImportJob" ADD CONSTRAINT "CSVImportJob_requestedByUserId_fkey" FOREIGN KEY ("requestedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
