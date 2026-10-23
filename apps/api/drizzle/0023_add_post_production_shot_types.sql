ALTER TYPE "public"."shot_type" ADD VALUE IF NOT EXISTS 'video_editing';--> statement-breakpoint
ALTER TYPE "public"."shot_type" ADD VALUE IF NOT EXISTS 'sound_design';--> statement-breakpoint
ALTER TYPE "public"."shot_type" ADD VALUE IF NOT EXISTS 'voice_acting';--> statement-breakpoint
UPDATE "departments"
SET "shot_types" = ARRAY['video_editing', 'sound_design', 'voice_acting']::shot_type[],
    "updated_at" = now()
WHERE "slug" = 'post-production';
