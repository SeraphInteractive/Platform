CREATE TYPE "public"."application_stage" AS ENUM('submitted', 'interview', 'accepted', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."feedback_outcome" AS ENUM('no_action', 'acknowledged', 'mitigation');--> statement-breakpoint
CREATE TYPE "public"."feedback_survey_status" AS ENUM('open', 'closed');--> statement-breakpoint
CREATE TYPE "public"."position_status" AS ENUM('open', 'closed', 'filled');--> statement-breakpoint
CREATE TYPE "public"."ticket_event_kind" AS ENUM('opened', 'stage_changed', 'closed', 'reopened', 'assigned', 'member_added', 'note', 'reply');--> statement-breakpoint
CREATE TYPE "public"."ticket_hub_style" AS ENUM('buttons', 'menu');--> statement-breakpoint
CREATE TYPE "public"."ticket_kind" AS ENUM('support', 'application');--> statement-breakpoint
CREATE TYPE "public"."ticket_message_source" AS ENUM('discord', 'web');--> statement-breakpoint
CREATE TYPE "public"."ticket_status" AS ENUM('open', 'closed');--> statement-breakpoint
CREATE TABLE "discord_directory" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"guild_id" varchar(20) NOT NULL,
	"channels" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"roles" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"members" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "discord_directory_singleton" CHECK ("discord_directory"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE "feedback_responses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"survey_id" uuid NOT NULL,
	"respondent_hash" varchar(64) NOT NULL,
	"answers" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "feedback_responses_survey_respondent_unique" UNIQUE("survey_id","respondent_hash")
);
--> statement-breakpoint
CREATE TABLE "feedback_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"questions" jsonb NOT NULL,
	"first_after_days" integer DEFAULT 30 NOT NULL,
	"interval_days" integer DEFAULT 90 NOT NULL,
	"open_days" integer DEFAULT 14 NOT NULL,
	"intro" varchar(1000) DEFAULT '' NOT NULL,
	"ping_crew" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "feedback_settings_singleton" CHECK ("feedback_settings"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE "feedback_subjects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"supervisor_discord_id" varchar(20) NOT NULL,
	"supervisor_username" varchar(64) NOT NULL,
	"title" varchar(80) NOT NULL,
	"channel_id" varchar(20),
	"crew_role_ids" text[] DEFAULT '{}' NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"first_after_days" integer NOT NULL,
	"interval_days" integer NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"ended_at" timestamp with time zone,
	"next_survey_at" timestamp with time zone,
	"source_ticket_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "feedback_subjects_days_positive" CHECK ("feedback_subjects"."first_after_days" > 0 AND "feedback_subjects"."interval_days" > 0)
);
--> statement-breakpoint
CREATE TABLE "feedback_surveys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subject_id" uuid NOT NULL,
	"sequence" integer NOT NULL,
	"status" "feedback_survey_status" DEFAULT 'open' NOT NULL,
	"opens_at" timestamp with time zone NOT NULL,
	"closes_at" timestamp with time zone NOT NULL,
	"closed_at" timestamp with time zone,
	"questions" jsonb NOT NULL,
	"intro" varchar(1000) DEFAULT '' NOT NULL,
	"channel_id" varchar(20),
	"message_id" varchar(20),
	"outcome" "feedback_outcome",
	"outcome_message" text,
	"internal_note" text,
	"outcome_by_discord_id" varchar(20),
	"outcome_by_username" varchar(64),
	"outcome_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "feedback_surveys_subject_sequence_unique" UNIQUE("subject_id","sequence")
);
--> statement-breakpoint
CREATE TABLE "ticket_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(80) NOT NULL,
	"description" varchar(300),
	"emoji" varchar(64),
	"position" integer DEFAULT 0 NOT NULL,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"thread_channel_id" varchar(20),
	"notification_channel_id" varchar(20),
	"log_channel_id" varchar(20),
	"staff_role_ids" text[] DEFAULT '{}' NOT NULL,
	"mention_staff" boolean DEFAULT true NOT NULL,
	"department_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ticket_categories_department_id_unique" UNIQUE("department_id")
);
--> statement-breakpoint
CREATE TABLE "ticket_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ticket_id" uuid NOT NULL,
	"kind" "ticket_event_kind" NOT NULL,
	"actor_discord_id" varchar(20),
	"actor_username" varchar(64),
	"stage" "application_stage",
	"target_discord_id" varchar(20),
	"target_username" varchar(64),
	"note" varchar(2000),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ticket_hubs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(80) NOT NULL,
	"channel_id" varchar(20),
	"message_id" varchar(20),
	"title" varchar(100) NOT NULL,
	"description" varchar(2000) DEFAULT '' NOT NULL,
	"color" integer,
	"style" "ticket_hub_style" DEFAULT 'buttons' NOT NULL,
	"category_ids" uuid[] DEFAULT '{}' NOT NULL,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"department_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ticket_hubs_department_id_unique" UNIQUE("department_id"),
	CONSTRAINT "ticket_hubs_color_range" CHECK ("ticket_hubs"."color" IS NULL OR "ticket_hubs"."color" BETWEEN 0 AND 16777215)
);
--> statement-breakpoint
CREATE TABLE "ticket_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ticket_id" uuid NOT NULL,
	"discord_message_id" varchar(20),
	"source" "ticket_message_source" NOT NULL,
	"author_discord_id" varchar(20) NOT NULL,
	"author_username" varchar(64) NOT NULL,
	"author_avatar_url" varchar(512),
	"content" text DEFAULT '' NOT NULL,
	"attachments" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"edited_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ticket_messages_discord_message_id_unique" UNIQUE("discord_message_id")
);
--> statement-breakpoint
CREATE TABLE "ticket_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"guild_id" varchar(20),
	"log_channel_id" varchar(20),
	"log_events" text[] DEFAULT '{opened,stage_changed,closed,reopened}' NOT NULL,
	"transcript_on_close" boolean DEFAULT true NOT NULL,
	"dm_applicants" boolean DEFAULT true NOT NULL,
	"max_open_per_user" integer DEFAULT 3 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ticket_settings_singleton" CHECK ("ticket_settings"."id" = 1),
	CONSTRAINT "ticket_settings_max_open_range" CHECK ("ticket_settings"."max_open_per_user" BETWEEN 1 AND 25)
);
--> statement-breakpoint
CREATE TABLE "ticket_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"category_id" uuid NOT NULL,
	"name" varchar(80) NOT NULL,
	"description" varchar(100),
	"emoji" varchar(64),
	"kind" "ticket_kind" NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"staff_role_ids" text[] DEFAULT '{}' NOT NULL,
	"thread_channel_id" varchar(20),
	"mention_staff" boolean DEFAULT true NOT NULL,
	"questions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"position_status" "position_status" DEFAULT 'open' NOT NULL,
	"openings" integer,
	"filled_count" integer DEFAULT 0 NOT NULL,
	"opens_at" timestamp with time zone,
	"closes_at" timestamp with time zone,
	"listing" jsonb,
	"messages" jsonb DEFAULT '{"interview":null,"accepted":null,"rejected":null}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ticket_types_openings_positive" CHECK ("ticket_types"."openings" IS NULL OR "ticket_types"."openings" > 0),
	CONSTRAINT "ticket_types_filled_count_non_negative" CHECK ("ticket_types"."filled_count" >= 0),
	CONSTRAINT "ticket_types_window" CHECK ("ticket_types"."opens_at" IS NULL OR "ticket_types"."closes_at" IS NULL OR "ticket_types"."closes_at" > "ticket_types"."opens_at")
);
--> statement-breakpoint
CREATE TABLE "tickets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" integer GENERATED ALWAYS AS IDENTITY (sequence name "tickets_number_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"type_id" uuid,
	"category_id" uuid,
	"type_name" varchar(80) NOT NULL,
	"category_name" varchar(80) NOT NULL,
	"kind" "ticket_kind" NOT NULL,
	"status" "ticket_status" DEFAULT 'open' NOT NULL,
	"stage" "application_stage",
	"opener_discord_id" varchar(20) NOT NULL,
	"opener_username" varchar(64) NOT NULL,
	"assignee_discord_id" varchar(20),
	"assignee_username" varchar(64),
	"thread_id" varchar(20),
	"intro_message_id" varchar(20),
	"notification_channel_id" varchar(20),
	"notification_message_id" varchar(20),
	"answers" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"decided_by_discord_id" varchar(20),
	"decided_by_username" varchar(64),
	"decided_at" timestamp with time zone,
	"decision_note" varchar(1000),
	"closed_by_discord_id" varchar(20),
	"closed_by_username" varchar(64),
	"closed_at" timestamp with time zone,
	"close_reason" varchar(1000),
	"last_activity_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tickets_number_unique" UNIQUE("number"),
	CONSTRAINT "tickets_thread_id_unique" UNIQUE("thread_id"),
	CONSTRAINT "tickets_stage_matches_kind" CHECK (("tickets"."kind" = 'application') = ("tickets"."stage" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "feedback_responses" ADD CONSTRAINT "feedback_responses_survey_id_feedback_surveys_id_fk" FOREIGN KEY ("survey_id") REFERENCES "public"."feedback_surveys"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback_subjects" ADD CONSTRAINT "feedback_subjects_source_ticket_id_tickets_id_fk" FOREIGN KEY ("source_ticket_id") REFERENCES "public"."tickets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback_surveys" ADD CONSTRAINT "feedback_surveys_subject_id_feedback_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."feedback_subjects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_categories" ADD CONSTRAINT "ticket_categories_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_events" ADD CONSTRAINT "ticket_events_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_hubs" ADD CONSTRAINT "ticket_hubs_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_messages" ADD CONSTRAINT "ticket_messages_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_types" ADD CONSTRAINT "ticket_types_category_id_ticket_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."ticket_categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_type_id_ticket_types_id_fk" FOREIGN KEY ("type_id") REFERENCES "public"."ticket_types"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_category_id_ticket_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."ticket_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "feedback_subjects_due_idx" ON "feedback_subjects" USING btree ("is_active","next_survey_at");--> statement-breakpoint
CREATE UNIQUE INDEX "feedback_surveys_one_open_per_subject" ON "feedback_surveys" USING btree ("subject_id") WHERE "feedback_surveys"."status" = 'open';--> statement-breakpoint
CREATE INDEX "feedback_surveys_status_closes_idx" ON "feedback_surveys" USING btree ("status","closes_at");--> statement-breakpoint
CREATE INDEX "ticket_categories_position_idx" ON "ticket_categories" USING btree ("position","created_at");--> statement-breakpoint
CREATE INDEX "ticket_events_ticket_created_idx" ON "ticket_events" USING btree ("ticket_id","created_at");--> statement-breakpoint
CREATE INDEX "ticket_hubs_created_idx" ON "ticket_hubs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "ticket_messages_ticket_created_idx" ON "ticket_messages" USING btree ("ticket_id","created_at");--> statement-breakpoint
CREATE INDEX "ticket_types_category_position_idx" ON "ticket_types" USING btree ("category_id","position","created_at");--> statement-breakpoint
CREATE INDEX "tickets_status_activity_idx" ON "tickets" USING btree ("status","last_activity_at");--> statement-breakpoint
CREATE INDEX "tickets_type_status_idx" ON "tickets" USING btree ("type_id","status");--> statement-breakpoint
CREATE INDEX "tickets_category_created_idx" ON "tickets" USING btree ("category_id","created_at");--> statement-breakpoint
CREATE INDEX "tickets_opener_idx" ON "tickets" USING btree ("opener_discord_id","status");--> statement-breakpoint
CREATE INDEX "tickets_assignee_idx" ON "tickets" USING btree ("assignee_discord_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "tickets_one_open_per_opener_type" ON "tickets" USING btree ("type_id","opener_discord_id") WHERE "tickets"."status" = 'open';