ALTER TYPE "public"."user_specialty" ADD VALUE 'media_team';--> statement-breakpoint
ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_specialties_limit";--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_specialties_limit" CHECK (cardinality("users"."specialties") <= 3);
