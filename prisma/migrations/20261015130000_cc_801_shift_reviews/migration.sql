-- CC-801 — "Revise seu plantão": perguntas sobre os próprios casos com grau
-- de certeza.
--
-- Depois do plantão, o médico responde até 3 perguntas geradas das análises
-- dos seus casos da semana, marca se sabia, tinha dúvida ou chutou, e vê a
-- explicação com a fonte que a análise citou.
--
-- shift_reviews: uma revisão por médico por semana (segunda-feira no horário
-- de Brasília). O índice único é o cache da geração e segura o job semanal e
-- o pedido do médico chegando juntos.
--
-- shift_review_questions: a pergunta, a resposta, a certeza e o acerto. Tema
-- e síndrome ficam na própria linha para o mapa de calibração (CC-802) ler
-- sem abrir a revisão. `card_id` fica sem FK até os cartões revisados
-- (CC-402) entrarem na base.
--
-- Texto já mascarado (PII + patientRef) e sem dado do paciente. ON DELETE
-- CASCADE a partir do encontro e da análise: apagar o encontro (LGPD Art. 18)
-- leva as perguntas que nasceram dele. A eliminação do médico apaga as
-- revisões explicitamente (LgpdService.requestErasure).
--
-- Permissões: GRANT explícito para copiloto_app (ver
-- 20261010120000_f0d_recommendation_decisions).
--
-- Reversível via:
--   DROP TABLE "shift_review_questions"; DROP TABLE "shift_reviews";
--   DROP TYPE "ShiftReviewConfidence"; DROP TYPE "ShiftReviewQuestionFormat";
--   DROP TYPE "ShiftReviewTrigger"; DROP TYPE "ShiftReviewStatus";

CREATE TYPE "ShiftReviewStatus" AS ENUM ('generating', 'ready', 'failed');

CREATE TYPE "ShiftReviewTrigger" AS ENUM ('on_demand', 'weekly_job');

CREATE TYPE "ShiftReviewQuestionFormat" AS ENUM ('multiple_choice', 'true_false');

CREATE TYPE "ShiftReviewConfidence" AS ENUM ('know', 'unsure', 'guessed');

CREATE TABLE "shift_reviews" (
    "id" UUID NOT NULL,
    "physician_id" UUID NOT NULL,
    "period_start" DATE NOT NULL,
    "status" "ShiftReviewStatus" NOT NULL,
    "trigger" "ShiftReviewTrigger" NOT NULL,
    "window_start" TIMESTAMP(3) NOT NULL,
    "window_end" TIMESTAMP(3) NOT NULL,
    "analysis_count" INTEGER NOT NULL DEFAULT 0,
    "attempts" INTEGER NOT NULL DEFAULT 1,
    "model" VARCHAR(128),
    "cost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "latency_ms" INTEGER NOT NULL DEFAULT 0,
    "failure_reason" VARCHAR(64),
    "generated_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shift_reviews_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "shift_review_questions" (
    "id" UUID NOT NULL,
    "review_id" UUID NOT NULL,
    "physician_id" UUID NOT NULL,
    "encounter_id" UUID NOT NULL,
    "interaction_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "format" "ShiftReviewQuestionFormat" NOT NULL,
    "stem" TEXT NOT NULL,
    "options" JSONB NOT NULL,
    "correct_option" INTEGER NOT NULL,
    "explanation" TEXT NOT NULL,
    "topic" VARCHAR(80) NOT NULL,
    "syndrome" VARCHAR(40),
    "source" JSONB NOT NULL,
    "card_id" UUID,
    "chosen_option" INTEGER,
    "confidence" "ShiftReviewConfidence",
    "correct" BOOLEAN,
    "answered_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shift_review_questions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "shift_reviews_physician_id_period_start_key" ON "shift_reviews"("physician_id", "period_start");

CREATE INDEX "shift_review_questions_physician_id_answered_at_idx" ON "shift_review_questions"("physician_id", "answered_at");

CREATE INDEX "shift_review_questions_encounter_id_idx" ON "shift_review_questions"("encounter_id");

CREATE INDEX "shift_review_questions_interaction_id_idx" ON "shift_review_questions"("interaction_id");

CREATE UNIQUE INDEX "shift_review_questions_review_id_position_key" ON "shift_review_questions"("review_id", "position");

ALTER TABLE "shift_reviews" ADD CONSTRAINT "shift_reviews_physician_id_fkey" FOREIGN KEY ("physician_id") REFERENCES "physicians"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "shift_review_questions" ADD CONSTRAINT "shift_review_questions_review_id_fkey" FOREIGN KEY ("review_id") REFERENCES "shift_reviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "shift_review_questions" ADD CONSTRAINT "shift_review_questions_physician_id_fkey" FOREIGN KEY ("physician_id") REFERENCES "physicians"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "shift_review_questions" ADD CONSTRAINT "shift_review_questions_encounter_id_fkey" FOREIGN KEY ("encounter_id") REFERENCES "encounters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "shift_review_questions" ADD CONSTRAINT "shift_review_questions_interaction_id_fkey" FOREIGN KEY ("interaction_id") REFERENCES "ai_interactions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- DML mínimo para a API: gerar (INSERT), mostrar (SELECT), responder e
-- marcar a geração (UPDATE) e apagamento LGPD (DELETE). Sem TRUNCATE.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "shift_reviews" TO copiloto_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "shift_review_questions" TO copiloto_app;

-- Smoke check da própria migration, um privilégio por chamada.
DO $$
DECLARE
  target TEXT;
  privilege TEXT;
BEGIN
  FOREACH target IN ARRAY ARRAY['shift_reviews', 'shift_review_questions'] LOOP
    FOREACH privilege IN ARRAY ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE'] LOOP
      IF NOT has_table_privilege('copiloto_app', target, privilege) THEN
        RAISE EXCEPTION 'Migration CC-801: copiloto_app sem % em %', privilege, target;
      END IF;
    END LOOP;

    IF has_table_privilege('copiloto_app', target, 'TRUNCATE') THEN
      RAISE EXCEPTION 'Migration CC-801: copiloto_app não deveria ter TRUNCATE em %', target;
    END IF;
  END LOOP;
END;
$$;
