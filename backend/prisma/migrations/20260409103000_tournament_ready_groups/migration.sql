-- AlterEnum
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_enum e ON t.oid = e.enumtypid
    WHERE t.typname = 'TournamentStatus' AND e.enumlabel = 'REGISTRATION'
  ) THEN
    ALTER TYPE "TournamentStatus" ADD VALUE 'REGISTRATION';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_enum e ON t.oid = e.enumtypid
    WHERE t.typname = 'TournamentStatus' AND e.enumlabel = 'READY'
  ) THEN
    ALTER TYPE "TournamentStatus" ADD VALUE 'READY';
  END IF;
END $$;

-- AlterTable
ALTER TABLE "Tournament"
ADD COLUMN "startedAt" TIMESTAMP(3),
ADD COLUMN "finishedAt" TIMESTAMP(3),
ADD COLUMN "cancelledAt" TIMESTAMP(3);

ALTER TABLE "Tournament"
ALTER COLUMN "status" SET DEFAULT 'DRAFT';

-- AlterTable
ALTER TABLE "Match"
ADD COLUMN "groupId" TEXT;

-- CreateTable
CREATE TABLE "TournamentGroup" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TournamentGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TournamentGroupPlayer" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "seed" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TournamentGroupPlayer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Match_groupId_idx" ON "Match"("groupId");

-- CreateIndex
CREATE INDEX "TournamentGroup_tournamentId_order_idx" ON "TournamentGroup"("tournamentId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "TournamentGroup_tournamentId_order_key" ON "TournamentGroup"("tournamentId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "TournamentGroup_tournamentId_name_key" ON "TournamentGroup"("tournamentId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "TournamentGroupPlayer_groupId_playerId_key" ON "TournamentGroupPlayer"("groupId", "playerId");

-- CreateIndex
CREATE UNIQUE INDEX "TournamentGroupPlayer_tournamentId_playerId_key" ON "TournamentGroupPlayer"("tournamentId", "playerId");

-- CreateIndex
CREATE INDEX "TournamentGroupPlayer_groupId_idx" ON "TournamentGroupPlayer"("groupId");

-- CreateIndex
CREATE INDEX "TournamentGroupPlayer_playerId_idx" ON "TournamentGroupPlayer"("playerId");

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "TournamentGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentGroup" ADD CONSTRAINT "TournamentGroup_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentGroupPlayer" ADD CONSTRAINT "TournamentGroupPlayer_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentGroupPlayer" ADD CONSTRAINT "TournamentGroupPlayer_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "TournamentGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentGroupPlayer" ADD CONSTRAINT "TournamentGroupPlayer_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "PlayerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
