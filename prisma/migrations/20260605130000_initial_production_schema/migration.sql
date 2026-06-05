CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE "EncounterStatus" AS ENUM ('draft', 'in_review', 'finalized', 'cancelled');
CREATE TYPE "DocumentType" AS ENUM ('soap', 'sbar', 'prescricao', 'alta', 'atestado');
CREATE TYPE "SubscriptionStatus" AS ENUM ('active', 'inactive', 'trial');

CREATE TABLE "physicians" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "crm_uf" CHAR(2) NOT NULL,
    "crm_number" TEXT NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "password_hash" TEXT NOT NULL,
    "name" VARCHAR(255),
    "mfa_enabled" BOOLEAN NOT NULL DEFAULT false,
    "mfa_secret" TEXT,
    "subscription_status" "SubscriptionStatus" NOT NULL DEFAULT 'trial',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "physicians_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "encounters" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "physician_id" UUID NOT NULL,
    "vertical" TEXT NOT NULL DEFAULT 'trauma',
    "context" JSONB,
    "patient_ref" VARCHAR(50) NOT NULL,
    "status" "EncounterStatus" NOT NULL DEFAULT 'draft',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "encounters_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ai_interactions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "encounter_id" UUID NOT NULL,
    "input_redacted" TEXT,
    "retrieved_chunk_ids" TEXT[],
    "model" TEXT NOT NULL,
    "params" JSONB,
    "raw_output" JSONB NOT NULL,
    "citations" JSONB,
    "uncertainty" BOOLEAN NOT NULL DEFAULT false,
    "uncertainty_reason" TEXT,
    "latency_ms" INTEGER NOT NULL,
    "cost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ai_interactions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "documents" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "encounter_id" UUID NOT NULL,
    "physician_id" UUID NOT NULL,
    "type" "DocumentType" NOT NULL,
    "content" JSONB NOT NULL,
    "physician_edits" JSONB,
    "confirmed_by" UUID,
    "confirmed_at" TIMESTAMP(3),
    "pdf_object_key" TEXT,
    "content_hash" CHAR(64),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "guideline_chunks" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "source" TEXT NOT NULL,
    "source_version" TEXT NOT NULL,
    "specialty" TEXT NOT NULL,
    "evidence_level" TEXT,
    "text" TEXT NOT NULL,
    "text_tsv" tsvector,
    "embedding" vector(1536),
    "metadata" JSONB,
    "valid_from" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "valid_to" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "guideline_chunks_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "audit_log" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "actor_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "before_hash" CHAR(64),
    "after_hash" CHAR(64),
    "payload" JSONB,
    "ip" VARCHAR(45),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "consents" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "physician_id" UUID NOT NULL,
    "scope" TEXT NOT NULL,
    "granted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMP(3),
    CONSTRAINT "consents_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "refresh_tokens" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "physician_id" UUID NOT NULL,
    "token_hash" VARCHAR(64) NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "physicians_email_key" ON "physicians"("email");
CREATE UNIQUE INDEX "physicians_crm_key" ON "physicians"("crm_uf", "crm_number");
CREATE INDEX "encounters_physician_id_idx" ON "encounters"("physician_id");
CREATE INDEX "ai_interactions_encounter_id_idx" ON "ai_interactions"("encounter_id");
CREATE INDEX "documents_encounter_id_idx" ON "documents"("encounter_id");
CREATE INDEX "documents_physician_id_idx" ON "documents"("physician_id");
CREATE INDEX "guideline_chunks_source_source_version_idx" ON "guideline_chunks"("source", "source_version");
CREATE INDEX "guideline_chunks_specialty_idx" ON "guideline_chunks"("specialty");
CREATE INDEX "guideline_chunks_text_tsv_idx" ON "guideline_chunks" USING GIN ("text_tsv");
CREATE INDEX "guideline_chunks_embedding_idx" ON "guideline_chunks" USING ivfflat ("embedding" vector_cosine_ops) WITH (lists = 100);
CREATE INDEX "audit_log_entity_entity_id_idx" ON "audit_log"("entity", "entity_id");
CREATE INDEX "audit_log_actor_id_idx" ON "audit_log"("actor_id");
CREATE INDEX "audit_log_created_at_idx" ON "audit_log"("created_at");
CREATE INDEX "consents_physician_id_idx" ON "consents"("physician_id");
CREATE INDEX "refresh_tokens_token_hash_idx" ON "refresh_tokens"("token_hash");
CREATE INDEX "refresh_tokens_physician_id_idx" ON "refresh_tokens"("physician_id");

ALTER TABLE "encounters" ADD CONSTRAINT "encounters_physician_id_fkey" FOREIGN KEY ("physician_id") REFERENCES "physicians"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ai_interactions" ADD CONSTRAINT "ai_interactions_encounter_id_fkey" FOREIGN KEY ("encounter_id") REFERENCES "encounters"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "documents" ADD CONSTRAINT "documents_encounter_id_fkey" FOREIGN KEY ("encounter_id") REFERENCES "encounters"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "documents" ADD CONSTRAINT "documents_physician_id_fkey" FOREIGN KEY ("physician_id") REFERENCES "physicians"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "consents" ADD CONSTRAINT "consents_physician_id_fkey" FOREIGN KEY ("physician_id") REFERENCES "physicians"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_physician_id_fkey" FOREIGN KEY ("physician_id") REFERENCES "physicians"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE FUNCTION guideline_chunks_text_tsv_update() RETURNS trigger AS $$
BEGIN
  NEW.text_tsv := to_tsvector('portuguese', coalesce(NEW.text, ''));
  RETURN NEW;
END
$$ LANGUAGE plpgsql;

CREATE TRIGGER guideline_chunks_text_tsv_before_write
BEFORE INSERT OR UPDATE OF text ON guideline_chunks
FOR EACH ROW EXECUTE FUNCTION guideline_chunks_text_tsv_update();

CREATE FUNCTION audit_log_prevent_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only';
END
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_log_no_update
BEFORE UPDATE ON audit_log
FOR EACH ROW EXECUTE FUNCTION audit_log_prevent_mutation();

CREATE TRIGGER audit_log_no_delete
BEFORE DELETE ON audit_log
FOR EACH ROW EXECUTE FUNCTION audit_log_prevent_mutation();
