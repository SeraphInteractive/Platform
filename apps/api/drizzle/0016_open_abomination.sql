CREATE TABLE "discord_settings" (
	"guild_id" varchar(20) PRIMARY KEY NOT NULL,
	"channels" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"roles" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"forum_tags" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"notification_cursor" varchar(64),
	"rules_message_id" varchar(20),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
