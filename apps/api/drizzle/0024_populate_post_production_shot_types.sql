UPDATE "departments"
SET "shot_types" = ARRAY['video_editing', 'sound_design', 'voice_acting']::shot_type[],
    "updated_at" = now()
WHERE "slug" = 'post-production';
