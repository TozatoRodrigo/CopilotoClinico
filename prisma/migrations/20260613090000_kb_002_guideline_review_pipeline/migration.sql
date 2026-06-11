-- KB-002: pipeline de ingestão em lote com aprovação de curador
--
-- Adiciona estado de revisão (pending_review/approved/rejected/superseded) aos
-- chunks de diretrizes (`guideline_chunks`) e a flag `is_curator` em
-- `physicians` (solução provisória até existir RBAC completo).
--
-- Chunks já existentes (ingeridos pelo fluxo anterior, sem revisão formal)
-- são marcados como `approved` para preservar o comportamento atual de
-- retrieval — apenas chunks `approved` são retornados em buscas.
--
-- Reversível via:
--   ALTER TABLE "guideline_chunks" DROP COLUMN "status", DROP COLUMN "reviewed_by", DROP COLUMN "reviewed_at";
--   DROP TYPE "GuidelineChunkStatus";
--   ALTER TABLE "physicians" DROP COLUMN "is_curator";

CREATE TYPE "GuidelineChunkStatus" AS ENUM ('pending_review', 'approved', 'rejected', 'superseded');

ALTER TABLE "guideline_chunks" ADD COLUMN "status" "GuidelineChunkStatus" NOT NULL DEFAULT 'pending_review';
ALTER TABLE "guideline_chunks" ADD COLUMN "reviewed_by" UUID;
ALTER TABLE "guideline_chunks" ADD COLUMN "reviewed_at" TIMESTAMP(3);

UPDATE "guideline_chunks" SET "status" = 'approved';

CREATE INDEX "guideline_chunks_status_idx" ON "guideline_chunks"("status");

ALTER TABLE "physicians" ADD COLUMN "is_curator" BOOLEAN NOT NULL DEFAULT false;
