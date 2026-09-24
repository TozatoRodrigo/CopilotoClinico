-- ADR-010 — Base oficial do MS (PCDT/DDT/DB/PU) como fonte "oficial, não revisada".
--
-- `official_unreviewed` é um status NOVO, não um apelido de `approved`: o SQL
-- de retrieval da base curada filtra `status = 'approved'` e continua sem
-- enxergar estes chunks. A fonte oficial só entra no retrieval pelo caminho
-- próprio (ADR-010, flag OFFICIAL_GUIDELINES_ENABLED).
--
-- `official_guideline_documents` guarda uma linha por VERSÃO de documento
-- (SHA-256 do PDF). O índice parcial abaixo garante uma única versão `active`
-- por documento — a troca de versão acontece numa transação só.
--
-- Permissões: a tabela nova herda os DEFAULT PRIVILEGES de
-- 20260605030000_aud_002_db_least_privilege.
--
-- Reversível via (depois de apagar os chunks com document_id):
--   ALTER TABLE "guideline_chunks" DROP CONSTRAINT "guideline_chunks_document_id_fkey";
--   DROP INDEX "guideline_chunks_document_id_idx";
--   ALTER TABLE "guideline_chunks" DROP COLUMN "document_id";
--   DROP TABLE "official_guideline_documents";
--   DROP TYPE "OfficialGuidelineKind"; DROP TYPE "OfficialDocumentStatus"; DROP TYPE "CareSetting";
--   (valor de enum não se remove com ALTER TYPE: `official_unreviewed` fica sem uso)

CREATE TYPE "OfficialGuidelineKind" AS ENUM ('pcdt', 'ddt', 'diretriz_brasileira', 'protocolo_uso');

CREATE TYPE "OfficialDocumentStatus" AS ENUM ('active', 'superseded');

CREATE TYPE "CareSetting" AS ENUM ('agudo', 'cronico', 'misto', 'indefinido');

ALTER TYPE "GuidelineChunkStatus" ADD VALUE 'official_unreviewed';

ALTER TABLE "guideline_chunks" ADD COLUMN "document_id" UUID;

CREATE TABLE "official_guideline_documents" (
    "id" UUID NOT NULL,
    "kind" "OfficialGuidelineKind" NOT NULL,
    "document_key" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "normative_act" TEXT,
    "published_at" DATE,
    "annex_updated_at" DATE,
    "document_url" TEXT NOT NULL,
    "normative_act_url" TEXT,
    "summary_url" TEXT,
    "pdf_sha256" TEXT NOT NULL,
    "page_count" INTEGER,
    "cid10" TEXT[],
    "sections" JSONB NOT NULL,
    "sectioning" TEXT NOT NULL,
    "care_setting" "CareSetting" NOT NULL DEFAULT 'indefinido',
    "population" TEXT,
    "specialty" TEXT NOT NULL,
    "cenarios" TEXT[],
    "classification" JSONB,
    "status" "OfficialDocumentStatus" NOT NULL DEFAULT 'active',
    "chunk_count" INTEGER NOT NULL,
    "fetched_at" TIMESTAMP(3) NOT NULL,
    "superseded_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "official_guideline_documents_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "official_guideline_documents_status_idx" ON "official_guideline_documents"("status");

CREATE INDEX "official_guideline_documents_kind_idx" ON "official_guideline_documents"("kind");

CREATE UNIQUE INDEX "official_guideline_documents_document_key_pdf_sha256_key" ON "official_guideline_documents"("document_key", "pdf_sha256");

-- Uma única versão ativa por documento (Prisma não expressa índice parcial).
CREATE UNIQUE INDEX "official_guideline_documents_one_active_per_key"
    ON "official_guideline_documents"("document_key")
    WHERE "status" = 'active';

CREATE INDEX "guideline_chunks_document_id_idx" ON "guideline_chunks"("document_id");

ALTER TABLE "guideline_chunks" ADD CONSTRAINT "guideline_chunks_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "official_guideline_documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
