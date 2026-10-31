CREATE TYPE "public"."screenplay_role" AS ENUM('editor', 'viewer');--> statement-breakpoint
CREATE TABLE "screenplay_collaborators" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"screenplay_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "screenplay_role" DEFAULT 'editor' NOT NULL,
	"invited_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "screenplay_shelves" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" varchar(100) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "screenplay_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"screenplay_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"name" varchar(150) NOT NULL,
	"content" jsonb NOT NULL,
	"word_count" integer DEFAULT 0 NOT NULL,
	"scene_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "screenplays" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"title" varchar(200) DEFAULT 'Untitled Screenplay' NOT NULL,
	"content" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"title_page" jsonb,
	"shelf_id" uuid,
	"category" varchar(100),
	"word_count" integer DEFAULT 0 NOT NULL,
	"scene_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "screenplay_collaborators" ADD CONSTRAINT "screenplay_collaborators_screenplay_id_screenplays_id_fk" FOREIGN KEY ("screenplay_id") REFERENCES "public"."screenplays"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "screenplay_collaborators" ADD CONSTRAINT "screenplay_collaborators_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "screenplay_collaborators" ADD CONSTRAINT "screenplay_collaborators_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "screenplay_shelves" ADD CONSTRAINT "screenplay_shelves_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "screenplay_versions" ADD CONSTRAINT "screenplay_versions_screenplay_id_screenplays_id_fk" FOREIGN KEY ("screenplay_id") REFERENCES "public"."screenplays"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "screenplay_versions" ADD CONSTRAINT "screenplay_versions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "screenplays" ADD CONSTRAINT "screenplays_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "screenplays" ADD CONSTRAINT "screenplays_shelf_id_screenplay_shelves_id_fk" FOREIGN KEY ("shelf_id") REFERENCES "public"."screenplay_shelves"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "screenplay_collaborators_script_user_idx" ON "screenplay_collaborators" USING btree ("screenplay_id","user_id");--> statement-breakpoint
CREATE INDEX "screenplay_collaborators_user_id_idx" ON "screenplay_collaborators" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "screenplay_shelves_user_id_idx" ON "screenplay_shelves" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "screenplay_versions_script_id_created_at_idx" ON "screenplay_versions" USING btree ("screenplay_id","created_at");--> statement-breakpoint
CREATE INDEX "screenplay_versions_user_id_idx" ON "screenplay_versions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "screenplays_owner_id_idx" ON "screenplays" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "screenplays_shelf_id_idx" ON "screenplays" USING btree ("shelf_id");--> statement-breakpoint
CREATE INDEX "screenplays_updated_at_idx" ON "screenplays" USING btree ("updated_at");