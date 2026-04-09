-- CreateEnum
CREATE TYPE "OpenMatchStatus" AS ENUM ('OPEN', 'READY', 'RESULT_PENDING', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "OpenMatchScoringMode" AS ENUM ('POINTS', 'SETS');

-- CreateEnum
CREATE TYPE "OpenMatchParticipantStatus" AS ENUM ('JOINED', 'INVITED', 'REQUESTED', 'DECLINED', 'REJECTED', 'REMOVED');

-- CreateEnum
CREATE TYPE "OpenMatchApprovalDecision" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "OpenMatch" (
    "id" TEXT NOT NULL,
    "creatorPlayerId" TEXT NOT NULL,
    "status" "OpenMatchStatus" NOT NULL DEFAULT 'OPEN',
    "scoringMode" "OpenMatchScoringMode" NOT NULL DEFAULT 'POINTS',
    "isRated" BOOLEAN NOT NULL DEFAULT true,
    "pointsToWin" INTEGER NOT NULL DEFAULT 21,
    "setsToWin" INTEGER NOT NULL DEFAULT 2,
    "scheduledAt" TIMESTAMP(3),
    "location" TEXT,
    "notes" TEXT,
    "resultSubmittedByPlayerId" TEXT,
    "resultSubmittedAt" TIMESTAMP(3),
    "proposedWinnerSide" "TeamSide",
    "proposedTeamAPoints" INTEGER,
    "proposedTeamBPoints" INTEGER,
    "proposedTeamASetsWon" INTEGER,
    "proposedTeamBSetsWon" INTEGER,
    "playedAt" TIMESTAMP(3),
    "finalMatchId" TEXT,
    "ratingAppliedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OpenMatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpenMatchParticipant" (
    "id" TEXT NOT NULL,
    "openMatchId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "status" "OpenMatchParticipantStatus" NOT NULL,
    "teamSide" "TeamSide",
    "teamPosition" INTEGER,
    "invitedByPlayerId" TEXT,
    "respondedAt" TIMESTAMP(3),
    "joinedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OpenMatchParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpenMatchResultApproval" (
    "id" TEXT NOT NULL,
    "openMatchId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "decision" "OpenMatchApprovalDecision" NOT NULL DEFAULT 'PENDING',
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OpenMatchResultApproval_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OpenMatch_finalMatchId_key" ON "OpenMatch"("finalMatchId");

-- CreateIndex
CREATE INDEX "OpenMatch_creatorPlayerId_status_idx" ON "OpenMatch"("creatorPlayerId", "status");

-- CreateIndex
CREATE INDEX "OpenMatch_status_scheduledAt_idx" ON "OpenMatch"("status", "scheduledAt");

-- CreateIndex
CREATE UNIQUE INDEX "OpenMatchParticipant_openMatchId_playerId_key" ON "OpenMatchParticipant"("openMatchId", "playerId");

-- CreateIndex
CREATE UNIQUE INDEX "OpenMatchParticipant_openMatchId_teamSide_teamPosition_key" ON "OpenMatchParticipant"("openMatchId", "teamSide", "teamPosition");

-- CreateIndex
CREATE INDEX "OpenMatchParticipant_openMatchId_status_idx" ON "OpenMatchParticipant"("openMatchId", "status");

-- CreateIndex
CREATE INDEX "OpenMatchParticipant_playerId_status_idx" ON "OpenMatchParticipant"("playerId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "OpenMatchResultApproval_openMatchId_playerId_key" ON "OpenMatchResultApproval"("openMatchId", "playerId");

-- CreateIndex
CREATE INDEX "OpenMatchResultApproval_openMatchId_decision_idx" ON "OpenMatchResultApproval"("openMatchId", "decision");

-- CreateIndex
CREATE INDEX "OpenMatchResultApproval_playerId_decision_idx" ON "OpenMatchResultApproval"("playerId", "decision");

-- AddForeignKey
ALTER TABLE "OpenMatch" ADD CONSTRAINT "OpenMatch_creatorPlayerId_fkey" FOREIGN KEY ("creatorPlayerId") REFERENCES "PlayerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpenMatch" ADD CONSTRAINT "OpenMatch_resultSubmittedByPlayerId_fkey" FOREIGN KEY ("resultSubmittedByPlayerId") REFERENCES "PlayerProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpenMatch" ADD CONSTRAINT "OpenMatch_finalMatchId_fkey" FOREIGN KEY ("finalMatchId") REFERENCES "Match"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpenMatchParticipant" ADD CONSTRAINT "OpenMatchParticipant_openMatchId_fkey" FOREIGN KEY ("openMatchId") REFERENCES "OpenMatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpenMatchParticipant" ADD CONSTRAINT "OpenMatchParticipant_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "PlayerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpenMatchParticipant" ADD CONSTRAINT "OpenMatchParticipant_invitedByPlayerId_fkey" FOREIGN KEY ("invitedByPlayerId") REFERENCES "PlayerProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpenMatchResultApproval" ADD CONSTRAINT "OpenMatchResultApproval_openMatchId_fkey" FOREIGN KEY ("openMatchId") REFERENCES "OpenMatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpenMatchResultApproval" ADD CONSTRAINT "OpenMatchResultApproval_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "PlayerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
