CREATE TABLE "discord_moderation_records" (
	"discord_user_id" varchar(20) PRIMARY KEY NOT NULL,
	"offence_level" integer DEFAULT 0 NOT NULL,
	"stage_warnings" integer DEFAULT 0 NOT NULL,
	"infractions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"timeouts" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"apology_status" varchar(20) DEFAULT 'none' NOT NULL,
	"apology_text" text,
	"apology_submitted_at" timestamp with time zone,
	"apology_reviewed_by" varchar(20),
	"apology_reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "discord_moderation_records_offence_level_idx" ON "discord_moderation_records" USING btree ("offence_level");--> statement-breakpoint
CREATE INDEX "discord_moderation_records_apology_status_idx" ON "discord_moderation_records" USING btree ("apology_status");