-- CC-707 — Mentoria em modo concierge: "Discutir este caso com um médico da
-- equipe" (teleinterconsulta, Res. CFM 2.314/2022; termo em CC-708).
--
-- Assíncrona, não serve para urgência: mede a demanda antes de virar produto
-- pago. Cada linha é um pedido: o caso MASCARADO com o plano da IA
-- (`case_snapshot`), a versão do termo aceita pelo médico e pelo mentor, a
-- resposta e a nota de satisfação (1 a 5). Pergunta e resposta são gravadas
-- já mascaradas.
--
-- `physicians.is_mentor` marca os médicos da equipe que respondem, como
-- `is_curator` (KB-002): ligado por SQL, ver docs/runbook.md.
--
-- `institution_id` copia a instituição do caso (ADR-009): o mentor só vê
-- pedidos sem instituição ou de uma instituição a que pertence.
--
-- ON DELETE CASCADE a partir do encontro e do médico que pediu: apagar o
-- encontro (direito de eliminação, LGPD Art. 18) leva o pedido junto. Mentor,
-- instituição e análise ficam SET NULL: a resposta pertence ao caso de quem
-- pediu.
--
-- O índice parcial garante no máximo um pedido em aberto por caso, mesmo com
-- dois cliques simultâneos.
--
-- Permissões: GRANT explícito para copiloto_app (ver
-- 20261010120000_f0d_recommendation_decisions).
--
-- Reversível via:
--   DROP TABLE "mentoring_requests";
--   DROP TYPE "MentoringRequestStatus";
--   ALTER TABLE "physicians" DROP COLUMN "is_mentor";

CREATE TYPE "MentoringRequestStatus" AS ENUM ('pending', 'claimed', 'answered', 'cancelled');

ALTER TABLE "physicians" ADD COLUMN "is_mentor" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "mentoring_requests" (
    "id" UUID NOT NULL,
    "encounter_id" UUID NOT NULL,
    "requester_id" UUID NOT NULL,
    "institution_id" UUID,
    "interaction_id" UUID,
    "status" "MentoringRequestStatus" NOT NULL DEFAULT 'pending',
    "case_snapshot" JSONB NOT NULL,
    "question" TEXT,
    "terms_version" VARCHAR(64) NOT NULL,
    "terms_accepted_at" TIMESTAMP(3) NOT NULL,
    "mentor_id" UUID,
    "claimed_at" TIMESTAMP(3),
    "answer" TEXT,
    "answered_at" TIMESTAMP(3),
    "mentor_terms_version" VARCHAR(64),
    "mentor_terms_accepted_at" TIMESTAMP(3),
    "answer_seen_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "satisfaction" SMALLINT,
    "rated_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mentoring_requests_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "mentoring_requests_satisfaction_range"
        CHECK ("satisfaction" IS NULL OR "satisfaction" BETWEEN 1 AND 5)
);

CREATE INDEX "mentoring_requests_status_created_at_idx" ON "mentoring_requests"("status", "created_at");

CREATE INDEX "mentoring_requests_encounter_id_idx" ON "mentoring_requests"("encounter_id");

CREATE INDEX "mentoring_requests_requester_id_idx" ON "mentoring_requests"("requester_id");

CREATE INDEX "mentoring_requests_mentor_id_idx" ON "mentoring_requests"("mentor_id");

CREATE INDEX "mentoring_requests_institution_id_idx" ON "mentoring_requests"("institution_id");

CREATE INDEX "mentoring_requests_created_at_idx" ON "mentoring_requests"("created_at");

CREATE UNIQUE INDEX "mentoring_requests_one_open_per_encounter"
    ON "mentoring_requests"("encounter_id")
    WHERE "status" IN ('pending', 'claimed');

ALTER TABLE "mentoring_requests" ADD CONSTRAINT "mentoring_requests_encounter_id_fkey" FOREIGN KEY ("encounter_id") REFERENCES "encounters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "mentoring_requests" ADD CONSTRAINT "mentoring_requests_requester_id_fkey" FOREIGN KEY ("requester_id") REFERENCES "physicians"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "mentoring_requests" ADD CONSTRAINT "mentoring_requests_mentor_id_fkey" FOREIGN KEY ("mentor_id") REFERENCES "physicians"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "mentoring_requests" ADD CONSTRAINT "mentoring_requests_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "institutions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "mentoring_requests" ADD CONSTRAINT "mentoring_requests_interaction_id_fkey" FOREIGN KEY ("interaction_id") REFERENCES "ai_interactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- DML mínimo para a API: pedir (INSERT), listar (SELECT), assumir/responder/
-- avaliar (UPDATE) e apagamento LGPD (DELETE). Sem TRUNCATE, sem REFERENCES,
-- sem TRIGGER.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "mentoring_requests" TO copiloto_app;

-- Smoke check da própria migration, um privilégio por chamada.
DO $$
DECLARE
  privilege TEXT;
BEGIN
  FOREACH privilege IN ARRAY ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE'] LOOP
    IF NOT has_table_privilege('copiloto_app', 'mentoring_requests', privilege) THEN
      RAISE EXCEPTION 'Migration CC-707: copiloto_app sem % em mentoring_requests', privilege;
    END IF;
  END LOOP;

  IF has_table_privilege('copiloto_app', 'mentoring_requests', 'TRUNCATE') THEN
    RAISE EXCEPTION 'Migration CC-707: copiloto_app não deveria ter TRUNCATE em mentoring_requests';
  END IF;
END;
$$;
