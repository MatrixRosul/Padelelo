-- Set default tournament status to CREATED in a separate migration,
-- after enum values are committed by prior migration.
ALTER TABLE "Tournament"
ALTER COLUMN "status" SET DEFAULT 'CREATED';
