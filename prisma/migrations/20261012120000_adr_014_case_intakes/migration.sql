-- ADR-014 — Copiloto guiado: a conversa antes do primeiro plano.
--
-- Quando o primeiro relato chega incompleto, o Copiloto lê o caso e pergunta,
-- uma coisa por vez (no máximo 3), só o que muda a conduta. A conversa fica
-- no servidor para o médico interrompido continuar de qualquer aparelho.
--
-- Texto do caso e respostas entram JÁ REDIGIDOS (PII + patientRef), como em
-- ai_interactions.input_redacted. ON DELETE CASCADE a partir do encontro:
-- apagar o encontro (LGPD Art. 18) leva a conversa junto. A análise que nasce
-- da conversa é uma ai_interaction; apagá-la só desfaz o vínculo.
--
-- Permissões: GRANT explícito para copiloto_app (ver
-- 20261010120000_f0d_recommendation_decisions).
--
-- Reversível via:
--   DROP TABLE "case_intakes";
--   DROP TYPE "CaseIntakeCloseReason"; DROP TYPE "CaseIntakeStatus"; DROP TYPE "CaseIntakePath";

CREATE TYPE "CaseIntakePath" AS ENUM ('ask', 'unstable', 'complete', 'reading_failed', 'disabled');

CREATE TYPE "CaseIntakeStatus" AS ENUM ('asking', 'closed');

CREATE TYPE "CaseIntakeCloseReason" AS ENUM ('all_answered', 'skipped', 'urgent_answer', 'not_needed');

CREATE TABLE "case_intakes" (
    "id" UUID NOT NULL,
    "encounter_id" UUID NOT NULL,
    "physician_id" UUID NOT NULL,
    "case_text_redacted" TEXT NOT NULL,
    "context" JSONB NOT NULL,
    "red_flags" JSONB NOT NULL,
    "demo_case" VARCHAR(64),
    "pii_detected" BOOLEAN NOT NULL DEFAULT false,
    "path" "CaseIntakePath" NOT NULL,
    "status" "CaseIntakeStatus" NOT NULL,
    "close_reason" "CaseIntakeCloseReason",
    "reading" JSONB,
    "reading_model" TEXT,
    "questions" JSONB NOT NULL,
    "answers" JSONB NOT NULL,
    "cost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "latency_ms" INTEGER NOT NULL DEFAULT 0,
    "analysis_started_at" TIMESTAMP(3),
    "analysis_interaction_id" UUID,
    "closed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "case_intakes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "case_intakes_analysis_interaction_id_key" ON "case_intakes"("analysis_interaction_id");

CREATE INDEX "case_intakes_encounter_id_created_at_idx" ON "case_intakes"("encounter_id", "created_at");

ALTER TABLE "case_intakes" ADD CONSTRAINT "case_intakes_encounter_id_fkey" FOREIGN KEY ("encounter_id") REFERENCES "encounters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "case_intakes" ADD CONSTRAINT "case_intakes_analysis_interaction_id_fkey" FOREIGN KEY ("analysis_interaction_id") REFERENCES "ai_interactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- DML mínimo para a API: abrir a conversa (INSERT), mostrar (SELECT),
-- responder (UPDATE) e apagamento LGPD (DELETE). Sem TRUNCATE.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "case_intakes" TO copiloto_app;

-- Smoke check da própria migration, um privilégio por chamada.
DO $$
DECLARE
  privilege TEXT;
BEGIN
  FOREACH privilege IN ARRAY ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE'] LOOP
    IF NOT has_table_privilege('copiloto_app', 'case_intakes', privilege) THEN
      RAISE EXCEPTION 'Migration ADR-014: copiloto_app sem % em case_intakes', privilege;
    END IF;
  END LOOP;

  IF has_table_privilege('copiloto_app', 'case_intakes', 'TRUNCATE') THEN
    RAISE EXCEPTION 'Migration ADR-014: copiloto_app não deveria ter TRUNCATE em case_intakes';
  END IF;
END;
$$;
