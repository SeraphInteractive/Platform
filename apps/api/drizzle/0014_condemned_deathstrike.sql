ALTER TYPE "public"."user_specialty" ADD VALUE 'modeling_and_surfacing_lead';--> statement-breakpoint
ALTER TYPE "public"."user_specialty" ADD VALUE 'lighting_and_vfx_lead';--> statement-breakpoint
UPDATE "users"
SET "specialties" = ARRAY(
    SELECT DISTINCT CASE
        WHEN s = 'modelling_supervisor' THEN 'modeling_and_surfacing_lead'::"public"."user_specialty"
        WHEN s = 'surfacing_lookdev_lead' THEN 'modeling_and_surfacing_lead'::"public"."user_specialty"
        WHEN s = 'cfx_vfx_supervisor' THEN 'lighting_and_vfx_lead'::"public"."user_specialty"
        WHEN s = 'lighting_compositing_supervisor' THEN 'lighting_and_vfx_lead'::"public"."user_specialty"
        ELSE s
    END
    FROM unnest("specialties") AS s
)
WHERE "specialties" && ARRAY['modelling_supervisor', 'surfacing_lookdev_lead', 'cfx_vfx_supervisor', 'lighting_compositing_supervisor']::"public"."user_specialty"[];