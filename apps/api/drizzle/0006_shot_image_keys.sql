ALTER TABLE "shots" ADD COLUMN "image_keys" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "shots" ADD CONSTRAINT "shots_image_keys_limit" CHECK (cardinality("image_keys") <= 4);
