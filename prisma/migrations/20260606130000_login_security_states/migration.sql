CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE "login_security_states" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "identifier_hash" CHAR(64) NOT NULL,
  "physician_id" UUID,
  "failed_count" INTEGER NOT NULL DEFAULT 0,
  "locked_until" TIMESTAMP(3),
  "last_failed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "login_security_states_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "login_security_states_identifier_hash_key"
  ON "login_security_states"("identifier_hash");

CREATE INDEX "login_security_states_locked_until_idx"
  ON "login_security_states"("locked_until");
