-- F0-D — Fila de triagem do feedback do médico sobre uma análise.
--
-- O F7 gravava o reporte ("cenário errado", "faltou diretriz", "conduta
-- incorreta", "foi útil") só como entrada COPILOT_FEEDBACK em audit_log: sem
-- fila e sem estado, ninguém triava, e erros clínicos conhecidos continuaram
-- chegando por WhatsApp. A entrada na trilha continua (registro médico-legal);
-- esta tabela é a fila de trabalho da curadoria.
--
-- `audit_log_id` (único) liga cada linha à entrada da trilha e torna
-- idempotente o backfill das entradas antigas
-- (scripts/backfill-copilot-feedback.ts). Sem FK para audit_log: a trilha é
-- append-only e não participa de cascata.
--
-- ON DELETE CASCADE a partir do encontro/análise: apagar o encontro (direito
-- de eliminação, LGPD Art. 18) leva o feedback junto.
--
-- Permissões: GRANT explícito para copiloto_app (ver
-- 20261010120000_f0d_recommendation_decisions).
--
-- Reversível via:
--   DROP TABLE "copilot_feedback";
--   DROP TYPE "CopilotFeedbackStatus"; DROP TYPE "CopilotFeedbackKind";

CREATE TYPE "CopilotFeedbackKind" AS ENUM ('wrong_scenario', 'missing_coverage', 'wrong_recommendation', 'helpful');

CREATE TYPE "CopilotFeedbackStatus" AS ENUM ('new', 'triaged', 'converted_to_eval_case', 'dismissed');

CREATE TABLE "copilot_feedback" (
    "id" UUID NOT NULL,
    "interaction_id" UUID NOT NULL,
    "encounter_id" UUID NOT NULL,
    "physician_id" UUID NOT NULL,
    "kind" "CopilotFeedbackKind" NOT NULL,
    "comment" TEXT,
    "status" "CopilotFeedbackStatus" NOT NULL DEFAULT 'new',
    "triage_note" TEXT,
    "triaged_by" UUID,
    "triaged_at" TIMESTAMP(3),
    "audit_log_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "copilot_feedback_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "copilot_feedback_audit_log_id_key" ON "copilot_feedback"("audit_log_id");

CREATE INDEX "copilot_feedback_status_created_at_idx" ON "copilot_feedback"("status", "created_at");

CREATE INDEX "copilot_feedback_encounter_id_idx" ON "copilot_feedback"("encounter_id");

CREATE INDEX "copilot_feedback_physician_id_idx" ON "copilot_feedback"("physician_id");

ALTER TABLE "copilot_feedback" ADD CONSTRAINT "copilot_feedback_encounter_id_fkey" FOREIGN KEY ("encounter_id") REFERENCES "encounters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "copilot_feedback" ADD CONSTRAINT "copilot_feedback_interaction_id_fkey" FOREIGN KEY ("interaction_id") REFERENCES "ai_interactions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "copilot_feedback" ADD CONSTRAINT "copilot_feedback_physician_id_fkey" FOREIGN KEY ("physician_id") REFERENCES "physicians"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- DML mínimo para a API: registrar (INSERT), listar (SELECT), triar (UPDATE)
-- e apagamento LGPD (DELETE). Sem TRUNCATE, sem REFERENCES, sem TRIGGER.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "copilot_feedback" TO copiloto_app;

-- Smoke check da própria migration, um privilégio por chamada.
DO $$
DECLARE
  privilege TEXT;
BEGIN
  FOREACH privilege IN ARRAY ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE'] LOOP
    IF NOT has_table_privilege('copiloto_app', 'copilot_feedback', privilege) THEN
      RAISE EXCEPTION 'Migration F0-D: copiloto_app sem % em copilot_feedback', privilege;
    END IF;
  END LOOP;

  IF has_table_privilege('copiloto_app', 'copilot_feedback', 'TRUNCATE') THEN
    RAISE EXCEPTION 'Migration F0-D: copiloto_app não deveria ter TRUNCATE em copilot_feedback';
  END IF;
END;
$$;
