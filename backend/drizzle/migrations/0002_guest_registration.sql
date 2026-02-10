ALTER TYPE "registration_status" ADD VALUE IF NOT EXISTS 'registered';

DO $$ BEGIN
 CREATE TYPE "public"."verification_purpose" AS ENUM('account', 'event_registration');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

ALTER TABLE "registrations" ADD COLUMN IF NOT EXISTS "email_verified" boolean DEFAULT false NOT NULL;
ALTER TABLE "registrations" ADD COLUMN IF NOT EXISTS "email_verified_at" timestamp with time zone;

ALTER TABLE "email_verifications" ADD COLUMN IF NOT EXISTS "purpose" "verification_purpose" DEFAULT 'account' NOT NULL;
ALTER TABLE "email_verifications" ADD COLUMN IF NOT EXISTS "event_id" uuid;
ALTER TABLE "email_verifications" ADD COLUMN IF NOT EXISTS "registration_id" uuid;

DO $$ BEGIN
 ALTER TABLE "email_verifications" ADD CONSTRAINT "email_verifications_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "email_verifications" ADD CONSTRAINT "email_verifications_registration_id_registrations_id_fk" FOREIGN KEY ("registration_id") REFERENCES "public"."registrations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS "idx_email_verifications_context" ON "email_verifications" USING btree ("email","purpose","event_id");
