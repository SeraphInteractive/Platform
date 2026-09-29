ALTER TABLE "entries" ADD COLUMN "ai_flags" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "submissions" ADD COLUMN "ai_flags" jsonb DEFAULT '[]'::jsonb NOT NULL;
