-- CreateEnum
CREATE TYPE "TournamentType" AS ENUM ('AMERICANO', 'GROUP_STAGE', 'PLAYOFF');

-- CreateEnum
CREATE TYPE "TournamentRoundType" AS ENUM ('GROUP', 'AMERICANO', 'PLAYOFF');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "TournamentStatus" ADD VALUE 'CREATED';
ALTER TYPE "TournamentStatus" ADD VALUE 'REGISTRATION_OPEN';
ALTER TYPE "TournamentStatus" ADD VALUE 'REGISTRATION_CLOSED';
ALTER TYPE "TournamentStatus" ADD VALUE 'FINISHED';

-- AlterTable
ALTER TABLE "Match" ADD COLUMN     "roundId" TEXT;

-- AlterTable
ALTER TABLE "Tournament" ADD COLUMN     "courtsCount" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "date" TIMESTAMP(3),
ADD COLUMN     "maxPlayers" INTEGER NOT NULL DEFAULT 16,
ADD COLUMN     "type" "TournamentType" NOT NULL DEFAULT 'AMERICANO';

-- AlterTable
ALTER TABLE "TournamentRegistration" ADD COLUMN     "playerId" TEXT,
ALTER COLUMN "tournamentCategoryId" DROP NOT NULL,
ALTER COLUMN "teamId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "TournamentRound" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "roundNumber" INTEGER NOT NULL,
    "type" "TournamentRoundType" NOT NULL,
    "order" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TournamentRound_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TournamentStanding" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "points" INTEGER NOT NULL DEFAULT 0,
    "wins" INTEGER NOT NULL DEFAULT 0,
    "losses" INTEGER NOT NULL DEFAULT 0,
    "gamesWon" INTEGER NOT NULL DEFAULT 0,
    "gamesLost" INTEGER NOT NULL DEFAULT 0,
    "gameDifference" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TournamentStanding_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TournamentRound_tournamentId_order_idx" ON "TournamentRound"("tournamentId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "TournamentRound_tournamentId_type_roundNumber_key" ON "TournamentRound"("tournamentId", "type", "roundNumber");

-- CreateIndex
CREATE INDEX "TournamentStanding_tournamentId_points_gameDifference_games_idx" ON "TournamentStanding"("tournamentId", "points", "gameDifference", "gamesWon");

-- CreateIndex
CREATE UNIQUE INDEX "TournamentStanding_tournamentId_playerId_key" ON "TournamentStanding"("tournamentId", "playerId");

-- CreateIndex
CREATE INDEX "Match_roundId_idx" ON "Match"("roundId");

-- CreateIndex
CREATE INDEX "Tournament_type_date_idx" ON "Tournament"("type", "date");

-- CreateIndex
CREATE INDEX "TournamentRegistration_playerId_idx" ON "TournamentRegistration"("playerId");

-- CreateIndex
CREATE UNIQUE INDEX "TournamentRegistration_tournamentId_playerId_key" ON "TournamentRegistration"("tournamentId", "playerId");

-- AddForeignKey
ALTER TABLE "TournamentRegistration" ADD CONSTRAINT "TournamentRegistration_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "PlayerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "TournamentRound"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentRound" ADD CONSTRAINT "TournamentRound_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentStanding" ADD CONSTRAINT "TournamentStanding_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentStanding" ADD CONSTRAINT "TournamentStanding_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "PlayerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

