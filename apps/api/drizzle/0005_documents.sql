CREATE TABLE "document_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" varchar(32) NOT NULL,
	"revision" integer NOT NULL,
	"title" varchar(200) NOT NULL,
	"sections" jsonb NOT NULL,
	"requires_reacceptance" boolean DEFAULT false NOT NULL,
	"note" varchar(500),
	"author_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"slug" varchar(32) PRIMARY KEY NOT NULL,
	"title" varchar(200) NOT NULL,
	"sections" jsonb NOT NULL,
	"revision" integer NOT NULL,
	"acceptance_version" varchar(32),
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "document_revisions" ADD CONSTRAINT "document_revisions_slug_documents_slug_fk" FOREIGN KEY ("slug") REFERENCES "public"."documents"("slug") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_revisions" ADD CONSTRAINT "document_revisions_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "document_revisions_slug_revision" ON "document_revisions" USING btree ("slug","revision");