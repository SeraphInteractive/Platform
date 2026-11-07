CREATE TYPE "public"."shot_type" AS ENUM('3d_modelling', 'rigging', 'animation', 'vfx', 'surface_texture_art', 'lighting', 'concept_art');--> statement-breakpoint
CREATE TABLE "departments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(64) NOT NULL,
	"slug" varchar(32) NOT NULL,
	"supervisor_specialties" "user_specialty"[] DEFAULT '{}'::user_specialty[] NOT NULL,
	"contributor_specialties" "user_specialty"[] DEFAULT '{}'::user_specialty[] NOT NULL,
	"shot_types" "shot_type"[] DEFAULT '{}'::shot_type[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "departments_name_unique" UNIQUE("name"),
	CONSTRAINT "departments_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "department_discord_maps" (
	"department_id" uuid PRIMARY KEY NOT NULL,
	"discord_category_id" varchar(20) NOT NULL,
	"discord_forum_id" varchar(20) NOT NULL,
	"discord_chat_channel_id" varchar(20),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "department_discord_maps_discord_category_id_unique" UNIQUE("discord_category_id"),
	CONSTRAINT "department_discord_maps_discord_forum_id_unique" UNIQUE("discord_forum_id"),
	CONSTRAINT "department_discord_maps_discord_chat_channel_id_unique" UNIQUE("discord_chat_channel_id")
);
--> statement-breakpoint
ALTER TABLE "shots" ADD COLUMN "shot_type" "shot_type" DEFAULT 'animation' NOT NULL;--> statement-breakpoint
ALTER TABLE "shots" ADD COLUMN "department_id" uuid;--> statement-breakpoint
ALTER TABLE "department_discord_maps" ADD CONSTRAINT "department_discord_maps_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shots" ADD CONSTRAINT "shots_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
INSERT INTO "departments" ("name", "slug", "supervisor_specialties", "contributor_specialties", "shot_types")
VALUES
    ('Art and Writing', 'art-and-writing', ARRAY['art_director']::user_specialty[], ARRAY['concept_artist', 'screenwriter']::user_specialty[], ARRAY['concept_art']::shot_type[]),
    ('Assets', 'assets', ARRAY['modeling_and_surfacing_lead', 'modelling_supervisor', 'rigging_supervisor', 'surfacing_lookdev_lead']::user_specialty[], ARRAY['3d_modeler', 'surface_texture_artist', 'rigger']::user_specialty[], ARRAY['3d_modelling', 'rigging', 'surface_texture_art']::shot_type[]),
    ('Animation', 'animation', ARRAY['layout_previs_lead', 'animation_supervisor']::user_specialty[], ARRAY['layout_artist', 'animator']::user_specialty[], ARRAY['animation']::shot_type[]),
    ('Lighting and VFX', 'lighting-and-vfx', ARRAY['lighting_and_vfx_lead', 'cfx_vfx_supervisor', 'lighting_compositing_supervisor']::user_specialty[], ARRAY['lighting_artist', 'vfx_artist']::user_specialty[], ARRAY['lighting', 'vfx']::shot_type[]),
    ('Post-Production', 'post-production', ARRAY['editorial_supervisor', 'sound_director']::user_specialty[], ARRAY['video_editor', 'sound_designer', 'voice_actor']::user_specialty[], '{}'::shot_type[])
ON CONFLICT ("slug") DO UPDATE SET
    "name" = EXCLUDED."name",
    "supervisor_specialties" = EXCLUDED."supervisor_specialties",
    "contributor_specialties" = EXCLUDED."contributor_specialties",
    "shot_types" = EXCLUDED."shot_types",
    "updated_at" = now();--> statement-breakpoint
UPDATE "shots"
SET "department_id" = (SELECT "id" FROM "departments" WHERE "slug" = 'animation' LIMIT 1)
WHERE "department_id" IS NULL;
