ALTER TYPE "round_status" ADD VALUE IF NOT EXISTS 'voting' AFTER 'open';--> statement-breakpoint
UPDATE "voting_rounds" SET "status" = 'voting' WHERE "status" = 'closed';
