ALTER TYPE "public"."user_specialty" ADD VALUE 'general_contributor';--> statement-breakpoint
ALTER TYPE "public"."user_specialty" ADD VALUE 'producer';--> statement-breakpoint
ALTER TYPE "public"."user_specialty" ADD VALUE 'creative_director';--> statement-breakpoint
ALTER TYPE "public"."user_specialty" ADD VALUE 'production_manager';--> statement-breakpoint
ALTER TYPE "public"."user_specialty" ADD VALUE 'technical_director';--> statement-breakpoint
ALTER TYPE "public"."user_specialty" ADD VALUE 'art_director';--> statement-breakpoint
ALTER TYPE "public"."user_specialty" ADD VALUE 'editorial_supervisor';--> statement-breakpoint
ALTER TYPE "public"."user_specialty" ADD VALUE 'layout_previs_lead';--> statement-breakpoint
ALTER TYPE "public"."user_specialty" ADD VALUE 'modelling_supervisor';--> statement-breakpoint
ALTER TYPE "public"."user_specialty" ADD VALUE 'rigging_supervisor';--> statement-breakpoint
ALTER TYPE "public"."user_specialty" ADD VALUE 'surfacing_lookdev_lead';--> statement-breakpoint
ALTER TYPE "public"."user_specialty" ADD VALUE 'animation_supervisor';--> statement-breakpoint
ALTER TYPE "public"."user_specialty" ADD VALUE 'cfx_vfx_supervisor';--> statement-breakpoint
ALTER TYPE "public"."user_specialty" ADD VALUE 'lighting_compositing_supervisor';--> statement-breakpoint
ALTER TYPE "public"."user_specialty" ADD VALUE 'sound_director';--> statement-breakpoint
ALTER TYPE "public"."user_specialty" ADD VALUE 'voter';--> statement-breakpoint
CREATE TABLE "pipeline_progress" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"step_index" integer NOT NULL,
	"step_id" varchar(32) NOT NULL,
	"step_title" varchar(128) NOT NULL,
	"phase_number" integer NOT NULL,
	"phase_title" varchar(128) NOT NULL,
	"progress_percent" double precision NOT NULL,
	"is_phase_transition" boolean NOT NULL,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pipeline_progress_singleton" CHECK ("pipeline_progress"."id" = 1),
	CONSTRAINT "pipeline_progress_percent_range" CHECK ("pipeline_progress"."progress_percent" BETWEEN 0 AND 100)
);
--> statement-breakpoint
ALTER TABLE "pipeline_progress" ADD CONSTRAINT "pipeline_progress_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;