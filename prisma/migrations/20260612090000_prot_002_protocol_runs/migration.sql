-- PROT-002: Engine de execução de protocolo (modo guiado determinístico)
-- Adiciona protocol_runs: rastreia a execução pergunta-a-pergunta de um
-- Protocol publicado durante um encounter. protocol_id + protocol_version
-- fixam a versão executada (publicar uma v2 não altera runs em andamento).
-- Cada transição é registrada também em audit_log (ação PROTOCOL_STEP) para
-- permitir reconstrução completa do caminho percorrido.
--
-- Reversível via: DROP TABLE "protocol_runs"; DROP TYPE "ProtocolRunStatus";

CREATE TYPE "ProtocolRunStatus" AS ENUM ('in_progress', 'completed', 'abandoned');

CREATE TABLE "protocol_runs" (
    "id"               UUID                NOT NULL DEFAULT gen_random_uuid(),
    "encounter_id"     UUID                NOT NULL,
    "protocol_id"      UUID                NOT NULL,
    "protocol_version" INTEGER             NOT NULL,
    "current_node_id"  UUID                NOT NULL,
    "status"           "ProtocolRunStatus" NOT NULL DEFAULT 'in_progress',
    "answers"          JSONB,
    "abandon_reason"   TEXT,
    "started_by"       UUID                NOT NULL,
    "created_at"       TIMESTAMP(3)        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"       TIMESTAMP(3)        NOT NULL,

    CONSTRAINT "protocol_runs_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "protocol_runs"
    ADD CONSTRAINT "protocol_runs_encounter_id_fkey"
    FOREIGN KEY ("encounter_id") REFERENCES "encounters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "protocol_runs"
    ADD CONSTRAINT "protocol_runs_protocol_id_fkey"
    FOREIGN KEY ("protocol_id") REFERENCES "protocols"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "protocol_runs_encounter_id_idx" ON "protocol_runs"("encounter_id");
CREATE INDEX "protocol_runs_protocol_id_idx" ON "protocol_runs"("protocol_id");
