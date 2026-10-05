ALTER TABLE "users" ADD COLUMN "onboarded_at" timestamp with time zone;--> statement-breakpoint
UPDATE "users" SET "onboarded_at" = now() WHERE cardinality("specialties") > 0;
