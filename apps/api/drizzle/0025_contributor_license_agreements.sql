CREATE TYPE "public"."cla_actor_kind" AS ENUM('contributor', 'guardian', 'staff', 'system');--> statement-breakpoint
CREATE TYPE "public"."cla_event_type" AS ENUM('signed', 'guardian_requested', 'guardian_email_resent', 'guardian_approved', 'guardian_rejected', 'guardian_expired', 'activated', 'superseded', 'revoked', 'receipt_sent', 'pii_purged');--> statement-breakpoint
CREATE TYPE "public"."cla_status" AS ENUM('pending_guardian', 'active', 'guardian_rejected', 'guardian_expired', 'superseded', 'revoked');--> statement-breakpoint
CREATE TABLE "cla_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"signature_id" uuid NOT NULL,
	"sequence" integer NOT NULL,
	"type" "cla_event_type" NOT NULL,
	"actor_kind" "cla_actor_kind" NOT NULL,
	"actor_user_id" uuid,
	"details" jsonb NOT NULL,
	"previous_hash" varchar(64),
	"hash" varchar(64) NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	CONSTRAINT "cla_events_sequence_positive" CHECK ("cla_events"."sequence" > 0)
);
--> statement-breakpoint
CREATE TABLE "cla_pii_access_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"signature_id" uuid NOT NULL,
	"accessor_kind" "cla_actor_kind" NOT NULL,
	"accessor_user_id" uuid,
	"purpose" varchar(300) NOT NULL,
	"fields" text[] NOT NULL,
	"accessed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cla_signatures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"status" "cla_status" NOT NULL,
	"document_revision" integer NOT NULL,
	"document_hash" varchar(64) NOT NULL,
	"country" varchar(2) NOT NULL,
	"region" varchar(8),
	"age_of_majority" integer NOT NULL,
	"is_minor" boolean NOT NULL,
	"contributor_pii" text,
	"signed_at" timestamp with time zone NOT NULL,
	"guardian_pii" text,
	"guardian_token_hash" varchar(64),
	"guardian_requested_at" timestamp with time zone,
	"guardian_expires_at" timestamp with time zone,
	"guardian_decided_at" timestamp with time zone,
	"guardian_decision_pii" text,
	"activated_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"revoked_by" uuid,
	"revocation_reason" varchar(300),
	"purge_after" timestamp with time zone,
	"pii_purged_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cla_signatures_guardian_token_hash_unique" UNIQUE("guardian_token_hash"),
	CONSTRAINT "cla_signatures_active_has_activation" CHECK ("cla_signatures"."status" <> 'active' OR "cla_signatures"."activated_at" IS NOT NULL),
	CONSTRAINT "cla_signatures_revoked_has_time" CHECK ("cla_signatures"."status" <> 'revoked' OR "cla_signatures"."revoked_at" IS NOT NULL),
	CONSTRAINT "cla_signatures_pending_is_minor" CHECK ("cla_signatures"."status" <> 'pending_guardian' OR "cla_signatures"."is_minor"),
	CONSTRAINT "cla_signatures_country_code" CHECK ("cla_signatures"."country" ~ '^[A-Z]{2}$')
);
--> statement-breakpoint
ALTER TABLE "cla_events" ADD CONSTRAINT "cla_events_signature_id_cla_signatures_id_fk" FOREIGN KEY ("signature_id") REFERENCES "public"."cla_signatures"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cla_events" ADD CONSTRAINT "cla_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cla_pii_access_log" ADD CONSTRAINT "cla_pii_access_log_signature_id_cla_signatures_id_fk" FOREIGN KEY ("signature_id") REFERENCES "public"."cla_signatures"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cla_pii_access_log" ADD CONSTRAINT "cla_pii_access_log_accessor_user_id_users_id_fk" FOREIGN KEY ("accessor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cla_signatures" ADD CONSTRAINT "cla_signatures_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cla_signatures" ADD CONSTRAINT "cla_signatures_revoked_by_users_id_fk" FOREIGN KEY ("revoked_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "cla_events_signature_sequence" ON "cla_events" USING btree ("signature_id","sequence");--> statement-breakpoint
CREATE INDEX "cla_pii_access_log_signature_idx" ON "cla_pii_access_log" USING btree ("signature_id","accessed_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "cla_pii_access_log_accessed_idx" ON "cla_pii_access_log" USING btree ("accessed_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "cla_signatures_user_signed_idx" ON "cla_signatures" USING btree ("user_id","signed_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "cla_signatures_status_signed_idx" ON "cla_signatures" USING btree ("status","signed_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "cla_signatures_one_open_per_user" ON "cla_signatures" USING btree ("user_id") WHERE "cla_signatures"."status" IN ('pending_guardian', 'active');--> statement-breakpoint
CREATE INDEX "cla_signatures_guardian_expiry_idx" ON "cla_signatures" USING btree ("guardian_expires_at") WHERE "cla_signatures"."status" = 'pending_guardian';--> statement-breakpoint
CREATE INDEX "cla_signatures_purge_idx" ON "cla_signatures" USING btree ("purge_after") WHERE "cla_signatures"."pii_purged_at" IS NULL;--> statement-breakpoint
CREATE FUNCTION "public"."cla_reject_mutation"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION '% is append-only', TG_TABLE_NAME USING ERRCODE = 'restrict_violation';
END;
$$;--> statement-breakpoint
CREATE FUNCTION "public"."cla_guard_signature"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'cla_signatures rows cannot be deleted' USING ERRCODE = 'restrict_violation';
    END IF;
    IF NEW.id IS DISTINCT FROM OLD.id
        OR NEW.user_id IS DISTINCT FROM OLD.user_id
        OR NEW.document_revision IS DISTINCT FROM OLD.document_revision
        OR NEW.document_hash IS DISTINCT FROM OLD.document_hash
        OR NEW.country IS DISTINCT FROM OLD.country
        OR NEW.region IS DISTINCT FROM OLD.region
        OR NEW.age_of_majority IS DISTINCT FROM OLD.age_of_majority
        OR NEW.is_minor IS DISTINCT FROM OLD.is_minor
        OR NEW.signed_at IS DISTINCT FROM OLD.signed_at
        OR NEW.created_at IS DISTINCT FROM OLD.created_at
        OR NEW.guardian_requested_at IS DISTINCT FROM OLD.guardian_requested_at
        OR (OLD.guardian_decided_at IS NOT NULL AND NEW.guardian_decided_at IS DISTINCT FROM OLD.guardian_decided_at)
        OR (OLD.activated_at IS NOT NULL AND NEW.activated_at IS DISTINCT FROM OLD.activated_at)
        OR (OLD.revoked_at IS NOT NULL AND NEW.revoked_at IS DISTINCT FROM OLD.revoked_at)
        OR (OLD.pii_purged_at IS NOT NULL AND NEW.pii_purged_at IS DISTINCT FROM OLD.pii_purged_at) THEN
        RAISE EXCEPTION 'signed agreement evidence is immutable' USING ERRCODE = 'restrict_violation';
    END IF;
    IF (OLD.contributor_pii IS DISTINCT FROM NEW.contributor_pii AND NEW.contributor_pii IS NOT NULL)
        OR (OLD.guardian_pii IS DISTINCT FROM NEW.guardian_pii AND NEW.guardian_pii IS NOT NULL)
        OR (OLD.guardian_decision_pii IS NOT NULL AND NEW.guardian_decision_pii IS DISTINCT FROM OLD.guardian_decision_pii AND NEW.guardian_decision_pii IS NOT NULL) THEN
        RAISE EXCEPTION 'encrypted agreement data can only be purged' USING ERRCODE = 'restrict_violation';
    END IF;
    IF OLD.status IN ('guardian_rejected', 'guardian_expired', 'superseded', 'revoked') AND NEW.status IS DISTINCT FROM OLD.status THEN
        RAISE EXCEPTION 'agreement status % is final', OLD.status USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "cla_events_append_only" BEFORE UPDATE OR DELETE ON "cla_events" FOR EACH ROW EXECUTE FUNCTION "public"."cla_reject_mutation"();--> statement-breakpoint
CREATE TRIGGER "cla_events_no_truncate" BEFORE TRUNCATE ON "cla_events" FOR EACH STATEMENT EXECUTE FUNCTION "public"."cla_reject_mutation"();--> statement-breakpoint
CREATE TRIGGER "cla_pii_access_log_append_only" BEFORE UPDATE OR DELETE ON "cla_pii_access_log" FOR EACH ROW EXECUTE FUNCTION "public"."cla_reject_mutation"();--> statement-breakpoint
CREATE TRIGGER "cla_pii_access_log_no_truncate" BEFORE TRUNCATE ON "cla_pii_access_log" FOR EACH STATEMENT EXECUTE FUNCTION "public"."cla_reject_mutation"();--> statement-breakpoint
CREATE TRIGGER "cla_signatures_guard" BEFORE UPDATE OR DELETE ON "cla_signatures" FOR EACH ROW EXECUTE FUNCTION "public"."cla_guard_signature"();--> statement-breakpoint
CREATE TRIGGER "cla_signatures_no_truncate" BEFORE TRUNCATE ON "cla_signatures" FOR EACH STATEMENT EXECUTE FUNCTION "public"."cla_reject_mutation"();
