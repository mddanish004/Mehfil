ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "ticket_amount" numeric(10, 2) DEFAULT '0' NOT NULL;
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "platform_fee" numeric(10, 2) DEFAULT '0' NOT NULL;
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "processing_fee" numeric(10, 2) DEFAULT '0' NOT NULL;
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "checkout_session_id" varchar(255);
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "refund_gateway_id" varchar(255);
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "receipt_sent_at" timestamp with time zone;

CREATE INDEX IF NOT EXISTS "idx_payments_gateway" ON "payments" USING btree ("payment_gateway_id");
CREATE INDEX IF NOT EXISTS "idx_payments_checkout_session" ON "payments" USING btree ("checkout_session_id");
