ALTER TYPE "public"."user_specialty" ADD VALUE IF NOT EXISTS 'media_team';--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "deleted_storage_objects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bucket" varchar(32) NOT NULL,
	"object_key" varchar(512) NOT NULL,
	"scheduled_delete_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_specialties_limit";--> statement-breakpoint
ALTER TABLE "entries" ADD COLUMN IF NOT EXISTS "ai_flags" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "shots" ADD COLUMN IF NOT EXISTS "image_keys" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "submissions" ADD COLUMN IF NOT EXISTS "ai_flags" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "deleted_storage_objects_scheduled_idx" ON "deleted_storage_objects" USING btree ("scheduled_delete_at");--> statement-breakpoint
ALTER TABLE "shots" DROP CONSTRAINT IF EXISTS "shots_image_keys_limit";--> statement-breakpoint
ALTER TABLE "shots" ADD CONSTRAINT "shots_image_keys_limit" CHECK (cardinality("shots"."image_keys") <= 4);--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_specialties_limit" CHECK (cardinality("users"."specialties") <= 3);