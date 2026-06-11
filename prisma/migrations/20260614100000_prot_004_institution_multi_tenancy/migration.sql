-- PROT-004: protocolos e diretrizes institucionais (multi-tenant por hospital)
--
-- Cria o modelo `Institution` (hospital/rede) e o vínculo N:N
-- `physician_institutions` entre médico e instituição — um médico pode
-- pertencer a N instituições (plantonista é multivínculo por natureza).
--
-- Adiciona `institution_id` (nullable) em `guideline_chunks` e `encounters`,
-- e adiciona a foreign key para `institutions` em `protocols.institution_id`
-- (coluna já existia desde PROT-001, sem constraint, e ficava sempre NULL).
--
-- `institution_id IS NULL` representa conteúdo/atendimento global, visível a
-- todas as instituições. O isolamento "hard" (instituição A nunca vê
-- conteúdo da instituição B) é aplicado na camada de aplicação via
-- `WHERE (institution_id IS NULL OR institution_id = $encounterInstitutionId)`
-- em RetrievalService e ProtocolsService — esta migration apenas viabiliza
-- o modelo de dados.
--
-- Reversível via:
--   ALTER TABLE "protocols" DROP CONSTRAINT "protocols_institution_id_fkey";
--   ALTER TABLE "guideline_chunks" DROP CONSTRAINT "guideline_chunks_institution_id_fkey";
--   ALTER TABLE "guideline_chunks" DROP COLUMN "institution_id";
--   ALTER TABLE "encounters" DROP CONSTRAINT "encounters_institution_id_fkey";
--   ALTER TABLE "encounters" DROP COLUMN "institution_id";
--   DROP TABLE "physician_institutions";
--   DROP TABLE "institutions";
--   DROP TYPE "InstitutionStatus";

CREATE TYPE "InstitutionStatus" AS ENUM ('active', 'inactive');

CREATE TABLE "institutions" (
    "id"         UUID NOT NULL DEFAULT gen_random_uuid(),
    "name"       TEXT NOT NULL,
    "cnes"       VARCHAR(20),
    "status"     "InstitutionStatus" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "institutions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "physician_institutions" (
    "id"             UUID NOT NULL DEFAULT gen_random_uuid(),
    "physician_id"   UUID NOT NULL,
    "institution_id" UUID NOT NULL,
    "created_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "physician_institutions_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "physician_institutions"
    ADD CONSTRAINT "physician_institutions_physician_id_fkey"
    FOREIGN KEY ("physician_id") REFERENCES "physicians"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "physician_institutions"
    ADD CONSTRAINT "physician_institutions_institution_id_fkey"
    FOREIGN KEY ("institution_id") REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "physician_institutions_physician_id_institution_id_key"
    ON "physician_institutions"("physician_id", "institution_id");

CREATE INDEX "physician_institutions_institution_id_idx" ON "physician_institutions"("institution_id");

ALTER TABLE "guideline_chunks" ADD COLUMN "institution_id" UUID;

ALTER TABLE "guideline_chunks"
    ADD CONSTRAINT "guideline_chunks_institution_id_fkey"
    FOREIGN KEY ("institution_id") REFERENCES "institutions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "guideline_chunks_institution_id_idx" ON "guideline_chunks"("institution_id");

ALTER TABLE "encounters" ADD COLUMN "institution_id" UUID;

ALTER TABLE "encounters"
    ADD CONSTRAINT "encounters_institution_id_fkey"
    FOREIGN KEY ("institution_id") REFERENCES "institutions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "encounters_institution_id_idx" ON "encounters"("institution_id");

ALTER TABLE "protocols"
    ADD CONSTRAINT "protocols_institution_id_fkey"
    FOREIGN KEY ("institution_id") REFERENCES "institutions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
