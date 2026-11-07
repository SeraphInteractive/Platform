ALTER TABLE "department_discord_maps" ADD COLUMN "discord_info_channel_id" varchar(20);--> statement-breakpoint
ALTER TABLE "department_discord_maps" ADD COLUMN "discord_info_webhook_url" text;--> statement-breakpoint
ALTER TABLE "department_discord_maps" ADD COLUMN "discord_logs_channel_id" varchar(20);--> statement-breakpoint
ALTER TABLE "department_discord_maps" ADD COLUMN "discord_logs_webhook_url" text;--> statement-breakpoint
ALTER TABLE "department_discord_maps" ADD COLUMN "discord_apply_channel_id" varchar(20);--> statement-breakpoint
ALTER TABLE "discord_settings" ADD COLUMN IF NOT EXISTS "webhooks" jsonb DEFAULT '{}'::jsonb NOT NULL;