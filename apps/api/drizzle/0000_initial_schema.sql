CREATE TYPE "public"."difficulty_tier" AS ENUM('easy', 'medium', 'hard', 'complex');--> statement-breakpoint
CREATE TYPE "public"."entry_status" AS ENUM('pending_review', 'approved', 'rejected', 'flagged');--> statement-breakpoint
CREATE TYPE "public"."poll_type" AS ENUM('ranked_choice', 'binary');--> statement-breakpoint
CREATE TYPE "public"."raid_severity" AS ENUM('NORMAL', 'SUSPICIOUS', 'CRITICAL_RAID');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('voter', 'contributor', 'senior_contributor', 'moderator', 'supervisor', 'admin');--> statement-breakpoint
CREATE TYPE "public"."round_status" AS ENUM('draft', 'open', 'closed', 'finalized');--> statement-breakpoint
CREATE TYPE "public"."shot_status" AS ENUM('available', 'claimed', 'submitted', 'approved');--> statement-breakpoint
CREATE TYPE "public"."user_specialty" AS ENUM('animator', 'layout_artist', '3d_modeler', 'rigger', 'surface_texture_artist', 'lighting_artist', 'vfx_artist', 'concept_artist', 'screenwriter', 'voice_actor', 'sound_designer', 'video_editor');--> statement-breakpoint
CREATE TYPE "public"."submission_status" AS ENUM('pending_review', 'revision_requested', 'approved');--> statement-breakpoint
CREATE TABLE "access_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "access_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "ballots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"round_id" uuid NOT NULL,
	"voter_id" uuid NOT NULL,
	"rank1_entry_id" uuid NOT NULL,
	"rank2_entry_id" uuid,
	"rank3_entry_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ballots_round_voter_unique" UNIQUE("round_id","voter_id"),
	CONSTRAINT "ballots_distinct_picks" CHECK ("ballots"."rank1_entry_id" IS DISTINCT FROM "ballots"."rank2_entry_id" AND "ballots"."rank1_entry_id" IS DISTINCT FROM "ballots"."rank3_entry_id" AND ("ballots"."rank2_entry_id" IS NULL OR "ballots"."rank2_entry_id" IS DISTINCT FROM "ballots"."rank3_entry_id")),
	CONSTRAINT "ballots_pick_shape" CHECK (("ballots"."rank2_entry_id" IS NULL) = ("ballots"."rank3_entry_id" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"round_id" uuid NOT NULL,
	"title" varchar(255) NOT NULL,
	"description" varchar(1500),
	"submitted_by" uuid,
	"status" "entry_status" DEFAULT 'pending_review' NOT NULL,
	"media_key" varchar(255),
	"is_quarantined" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "raid_telemetry" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entry_id" uuid NOT NULL,
	"round_id" uuid NOT NULL,
	"composite_score" double precision NOT NULL,
	"severity" "raid_severity" NOT NULL,
	"skew_ratio" double precision NOT NULL,
	"rank_entropy" double precision NOT NULL,
	"velocity_z_score" double precision NOT NULL,
	"flags" text[] DEFAULT '{}' NOT NULL,
	"breakdown" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "round_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"round_id" uuid NOT NULL,
	"total_ballots" integer NOT NULL,
	"total_points" integer NOT NULL,
	"is_conserved" boolean NOT NULL,
	"leaderboard" jsonb NOT NULL,
	"separation_results" jsonb NOT NULL,
	"finalized_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finalized_by" uuid NOT NULL,
	CONSTRAINT "round_results_round_id_unique" UNIQUE("round_id")
);
--> statement-breakpoint
CREATE TABLE "shot_thread_maps" (
	"shot_id" uuid PRIMARY KEY NOT NULL,
	"discord_thread_id" varchar(20) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shot_thread_maps_discord_thread_id_unique" UNIQUE("discord_thread_id")
);
--> statement-breakpoint
CREATE TABLE "shots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"round_id" uuid,
	"scene_number" integer NOT NULL,
	"shot_code" varchar(50) NOT NULL,
	"title" varchar(255) NOT NULL,
	"description" varchar(5000),
	"difficulty_tier" "difficulty_tier" NOT NULL,
	"status" "shot_status" DEFAULT 'available' NOT NULL,
	"claimed_by" uuid,
	"claimed_at" timestamp with time zone,
	"deadline_at" timestamp with time zone,
	"senior_priority_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shots_shot_code_unique" UNIQUE("shot_code"),
	CONSTRAINT "shots_scene_number_positive" CHECK ("shots"."scene_number" > 0),
	CONSTRAINT "shots_active_claim_consistency" CHECK ("shots"."status" NOT IN ('claimed', 'submitted') OR ("shots"."claimed_by" IS NOT NULL AND "shots"."claimed_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shot_id" uuid NOT NULL,
	"contributor_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"video_key" varchar(512) NOT NULL,
	"blend_key" varchar(512),
	"notes" varchar(2000),
	"status" "submission_status" DEFAULT 'pending_review' NOT NULL,
	"supervisor_notes" varchar(2000),
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "submissions_shot_version_unique" UNIQUE("shot_id","version")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"discord_id" varchar(20) NOT NULL,
	"discord_username" varchar(64) NOT NULL,
	"discord_avatar" varchar(64),
	"role" "user_role" DEFAULT 'voter' NOT NULL,
	"specialties" "user_specialty"[] DEFAULT '{}' NOT NULL,
	"is_blacklisted" boolean DEFAULT false NOT NULL,
	"blacklist_reason" varchar(500),
	"blacklisted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_discord_id_unique" UNIQUE("discord_id"),
	CONSTRAINT "users_specialties_limit" CHECK (cardinality("users"."specialties") <= 2)
);
--> statement-breakpoint
CREATE TABLE "voting_rounds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" varchar(255) NOT NULL,
	"status" "round_status" DEFAULT 'draft' NOT NULL,
	"poll_type" "poll_type" DEFAULT 'ranked_choice' NOT NULL,
	"opens_at" timestamp with time zone,
	"closes_at" timestamp with time zone,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "voting_rounds_window" CHECK ("voting_rounds"."opens_at" IS NULL OR "voting_rounds"."closes_at" IS NULL OR "voting_rounds"."closes_at" > "voting_rounds"."opens_at")
);
--> statement-breakpoint
ALTER TABLE "access_tokens" ADD CONSTRAINT "access_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ballots" ADD CONSTRAINT "ballots_round_id_voting_rounds_id_fk" FOREIGN KEY ("round_id") REFERENCES "public"."voting_rounds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ballots" ADD CONSTRAINT "ballots_voter_id_users_id_fk" FOREIGN KEY ("voter_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ballots" ADD CONSTRAINT "ballots_rank1_entry_id_entries_id_fk" FOREIGN KEY ("rank1_entry_id") REFERENCES "public"."entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ballots" ADD CONSTRAINT "ballots_rank2_entry_id_entries_id_fk" FOREIGN KEY ("rank2_entry_id") REFERENCES "public"."entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ballots" ADD CONSTRAINT "ballots_rank3_entry_id_entries_id_fk" FOREIGN KEY ("rank3_entry_id") REFERENCES "public"."entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entries" ADD CONSTRAINT "entries_round_id_voting_rounds_id_fk" FOREIGN KEY ("round_id") REFERENCES "public"."voting_rounds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entries" ADD CONSTRAINT "entries_submitted_by_users_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raid_telemetry" ADD CONSTRAINT "raid_telemetry_entry_id_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raid_telemetry" ADD CONSTRAINT "raid_telemetry_round_id_voting_rounds_id_fk" FOREIGN KEY ("round_id") REFERENCES "public"."voting_rounds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "round_results" ADD CONSTRAINT "round_results_round_id_voting_rounds_id_fk" FOREIGN KEY ("round_id") REFERENCES "public"."voting_rounds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "round_results" ADD CONSTRAINT "round_results_finalized_by_users_id_fk" FOREIGN KEY ("finalized_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shot_thread_maps" ADD CONSTRAINT "shot_thread_maps_shot_id_shots_id_fk" FOREIGN KEY ("shot_id") REFERENCES "public"."shots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shots" ADD CONSTRAINT "shots_round_id_voting_rounds_id_fk" FOREIGN KEY ("round_id") REFERENCES "public"."voting_rounds"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shots" ADD CONSTRAINT "shots_claimed_by_users_id_fk" FOREIGN KEY ("claimed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_shot_id_shots_id_fk" FOREIGN KEY ("shot_id") REFERENCES "public"."shots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_contributor_id_users_id_fk" FOREIGN KEY ("contributor_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voting_rounds" ADD CONSTRAINT "voting_rounds_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "access_tokens_user_id_idx" ON "access_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "access_tokens_expires_at_idx" ON "access_tokens" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "ballots_round_created_at_idx" ON "ballots" USING btree ("round_id","created_at");--> statement-breakpoint
CREATE INDEX "ballots_rank1_idx" ON "ballots" USING btree ("rank1_entry_id");--> statement-breakpoint
CREATE INDEX "ballots_rank2_idx" ON "ballots" USING btree ("rank2_entry_id");--> statement-breakpoint
CREATE INDEX "ballots_rank3_idx" ON "ballots" USING btree ("rank3_entry_id");--> statement-breakpoint
CREATE INDEX "entries_round_status_idx" ON "entries" USING btree ("round_id","status","created_at");--> statement-breakpoint
CREATE INDEX "raid_telemetry_round_entry_created_idx" ON "raid_telemetry" USING btree ("round_id","entry_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "shots_listing_idx" ON "shots" USING btree ("scene_number","shot_code");--> statement-breakpoint
CREATE INDEX "shots_status_idx" ON "shots" USING btree ("status");--> statement-breakpoint
CREATE INDEX "shots_deadline_idx" ON "shots" USING btree ("deadline_at") WHERE "shots"."status" = 'claimed';--> statement-breakpoint
CREATE UNIQUE INDEX "shots_one_active_claim_per_user" ON "shots" USING btree ("claimed_by") WHERE "shots"."status" IN ('claimed', 'submitted');--> statement-breakpoint
CREATE INDEX "submissions_status_created_idx" ON "submissions" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "submissions_contributor_idx" ON "submissions" USING btree ("contributor_id");--> statement-breakpoint
CREATE INDEX "users_created_at_idx" ON "users" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "voting_rounds_status_created_at_idx" ON "voting_rounds" USING btree ("status","created_at");