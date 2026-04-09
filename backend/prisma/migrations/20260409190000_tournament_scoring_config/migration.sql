-- CreateEnum
CREATE TYPE "TournamentScoringMode" AS ENUM ('POINTS_SINGLE', 'SETS');

-- AlterTable
ALTER TABLE "Tournament"
ADD COLUMN     "scoringMode" "TournamentScoringMode" NOT NULL DEFAULT 'POINTS_SINGLE',
ADD COLUMN     "pointsToWin" INTEGER NOT NULL DEFAULT 21,
ADD COLUMN     "setsToWin" INTEGER NOT NULL DEFAULT 1;

-- Preserve previous set-based behavior for existing non-Americano tournaments
UPDATE "Tournament"
SET
	"scoringMode" = 'SETS',
	"pointsToWin" = 6,
	"setsToWin" = 2
WHERE "type" IN ('GROUP_STAGE', 'PLAYOFF');
