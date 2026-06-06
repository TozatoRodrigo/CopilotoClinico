-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- EnableExtension
CREATE EXTENSION IF NOT EXISTS vector;

-- CreateEnum
CREATE TYPE "EncounterStatus" AS ENUM ('draft', 'in_review', 'finalized', 'cancelled');

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('soap', 'sbar', 'prescricao', 'alta', 'atestado');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('active', 'inactive', 'trial');

-- CreateTable
CREATE TABLE "physicians" (
    "id" UUID NOT NULL,
    "crm_uf" CHAR(2) NOT NULL,
    "crm_number" TEXT NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "password_hash" TEXT NOT NULL,
    "name" VARCHAR(255),
    "crm_verified" BOOLEAN NOT NULL DEFAULT false,
    "subscription_status" "SubscriptionStatus" NOT NULL DEFAULT 'trial',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "physicians_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "encounters" (
    "id" UUID NOT NULL,
    "physician_id" UUID NOT NULL,
    "vertical" TEXT NOT NULL DEFAULT 'trauma',
    "context" JSONB,
    "patient_ref" VARCHAR(50) NOT NULL,
    "status" "EncounterStatus" NOT NULL DEFAULT 'draft',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "encounters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_interactions" (
    "id" UUID NOT NULL,
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

-- CreateTable
CREATE TABLE "documents" (
    "id" UUID NOT NULL,
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
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guideline_chunks" (
    "id" UUID NOT NULL,
    "source" TEXT NOT NULL,
    "source_version" TEXT NOT NULL,
    "specialty" TEXT NOT NULL,
    "evidence_level" TEXT,
    "text" TEXT NOT NULL,
    "textTsv" tsvector,
    "embedding" vector(1536),
    "metadata" JSONB,
    "valid_from" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "valid_to" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "guideline_chunks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" UUID NOT NULL,
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

-- CreateTable
CREATE TABLE "consents" (
    "id" UUID NOT NULL,
    "physician_id" UUID NOT NULL,
    "scope" TEXT NOT NULL,
    "granted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMP(3),

    CONSTRAINT "consents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" UUID NOT NULL,
    "physician_id" UUID NOT NULL,
    "token_hash" VARCHAR(64) NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "physicians_email_key" ON "physicians"("email");

-- CreateIndex
CREATE INDEX "encounters_physician_id_idx" ON "encounters"("physician_id");

-- CreateIndex
CREATE INDEX "ai_interactions_encounter_id_idx" ON "ai_interactions"("encounter_id");

-- CreateIndex
CREATE INDEX "documents_encounter_id_idx" ON "documents"("encounter_id");

-- CreateIndex
CREATE INDEX "documents_physician_id_idx" ON "documents"("physician_id");

-- CreateIndex
CREATE INDEX "guideline_chunks_source_source_version_idx" ON "guideline_chunks"("source", "source_version");

-- CreateIndex
CREATE INDEX "guideline_chunks_specialty_idx" ON "guideline_chunks"("specialty");

-- CreateIndex
CREATE INDEX "audit_log_entity_entity_id_idx" ON "audit_log"("entity", "entity_id");

-- CreateIndex
CREATE INDEX "audit_log_actor_id_idx" ON "audit_log"("actor_id");

-- CreateIndex
CREATE INDEX "audit_log_created_at_idx" ON "audit_log"("created_at");

-- CreateIndex
CREATE INDEX "consents_physician_id_idx" ON "consents"("physician_id");

-- CreateIndex
CREATE INDEX "refresh_tokens_token_hash_idx" ON "refresh_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "refresh_tokens_physician_id_idx" ON "refresh_tokens"("physician_id");

-- AddForeignKey
ALTER TABLE "encounters" ADD CONSTRAINT "encounters_physician_id_fkey" FOREIGN KEY ("physician_id") REFERENCES "physicians"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_interactions" ADD CONSTRAINT "ai_interactions_encounter_id_fkey" FOREIGN KEY ("encounter_id") REFERENCES "encounters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_encounter_id_fkey" FOREIGN KEY ("encounter_id") REFERENCES "encounters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_physician_id_fkey" FOREIGN KEY ("physician_id") REFERENCES "physicians"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consents" ADD CONSTRAINT "consents_physician_id_fkey" FOREIGN KEY ("physician_id") REFERENCES "physicians"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_physician_id_fkey" FOREIGN KEY ("physician_id") REFERENCES "physicians"("id") ON DELETE CASCADE ON UPDATE CASCADE;
