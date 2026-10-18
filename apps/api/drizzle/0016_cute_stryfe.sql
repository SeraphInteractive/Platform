CREATE TYPE "public"."shot_type" AS ENUM('3d_modelling', 'rigging', 'animation', 'vfx', 'surface_texture_art', 'lighting', 'concept_art');--> statement-breakpoint
CREATE TABLE "department_discord_maps" (
	"department_id" uuid PRIMARY KEY NOT NULL,
	"discord_category_id" varchar(20) NOT NULL,
	"discord_forum_id" varchar(20) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "department_discord_maps_discord_category_id_unique" UNIQUE("discord_category_id"),
	CONSTRAINT "department_discord_maps_discord_forum_id_unique" UNIQUE("discord_forum_id")
);
--> statement-breakpoint
CREATE TABLE "departments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(64) NOT NULL,
	"specialties" "user_specialty"[] DEFAULT '{}'::user_specialty[] NOT NULL,
	"shot_types" "shot_type"[] DEFAULT '{}'::shot_type[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "departments_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "shot_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" "shot_type" NOT NULL,
	"specialties" "user_specialty"[] DEFAULT '{}'::user_specialty[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shot_types_type_unique" UNIQUE("type")
);
--> statement-breakpoint
ALTER TABLE "shots" ADD COLUMN "shot_type" "shot_type" DEFAULT 'animation' NOT NULL;--> statement-breakpoint
ALTER TABLE "department_discord_maps" ADD CONSTRAINT "department_discord_maps_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE cascade ON UPDATE no action;