-- F0-D — Decisões do médico por recomendação (adotar / rejeitar / adotar com ajuste).
--
-- Até aqui Adotar/Rejeitar/Anotar viviam só no sessionStorage do navegador: o
-- sinal mais direto de "o copiloto acertou?" morria com a aba do plantão.
--
-- `recommendation_key` = `<índice>-<12 hex do sha256 da ação>`, calculado no
-- servidor a partir do raw_output gravado. O índice único por
-- (interaction_id, recommendation_key, physician_id) sustenta o upsert.
--
-- ON DELETE CASCADE nas três FKs: apagar o encontro (direito de eliminação,
-- LGPD Art. 18) apaga as decisões junto, sem órfãos.
--
-- Permissões: GRANT explícito para a role de runtime (copiloto_app), além dos
-- DEFAULT PRIVILEGES de 20260605030000_aud_002_db_least_privilege. Os default
-- privileges só valem quando a migration roda com a MESMA role que os
-- declarou; o GRANT explícito não depende disso.
--
-- Reversível via:
--   DROP TABLE "recommendation_decisions";
--   DROP TYPE "RecommendationDecisionKind";

CREATE TYPE "RecommendationDecisionKind" AS ENUM ('adopted', 'rejected', 'modified');

CREATE TABLE "recommendation_decisions" (
    "id" UUID NOT NULL,
    "encounter_id" UUID NOT NULL,
    "interaction_id" UUID NOT NULL,
    "physician_id" UUID NOT NULL,
    "recommendation_index" INTEGER NOT NULL,
    "recommendation_key" VARCHAR(32) NOT NULL,
    "decision" "RecommendationDecisionKind" NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recommendation_decisions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "recommendation_decisions_encounter_id_idx" ON "recommendation_decisions"("encounter_id");

CREATE INDEX "recommendation_decisions_physician_id_idx" ON "recommendation_decisions"("physician_id");

CREATE UNIQUE INDEX "recommendation_decisions_interaction_id_recommendation_key__key" ON "recommendation_decisions"("interaction_id", "recommendation_key", "physician_id");

ALTER TABLE "recommendation_decisions" ADD CONSTRAINT "recommendation_decisions_encounter_id_fkey" FOREIGN KEY ("encounter_id") REFERENCES "encounters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "recommendation_decisions" ADD CONSTRAINT "recommendation_decisions_interaction_id_fkey" FOREIGN KEY ("interaction_id") REFERENCES "ai_interactions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "recommendation_decisions" ADD CONSTRAINT "recommendation_decisions_physician_id_fkey" FOREIGN KEY ("physician_id") REFERENCES "physicians"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- DML mínimo para a API: upsert (INSERT/UPDATE), leitura e apagamento LGPD.
-- Sem TRUNCATE, sem REFERENCES, sem TRIGGER.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "recommendation_decisions" TO copiloto_app;

-- Smoke check da própria migration (mesmo padrão da AUD-002). Um privilégio por
-- chamada: com a lista separada por vírgula, has_table_privilege devolve true se
-- QUALQUER um deles existir.
DO $$
DECLARE
  privilege TEXT;
BEGIN
  FOREACH privilege IN ARRAY ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE'] LOOP
    IF NOT has_table_privilege('copiloto_app', 'recommendation_decisions', privilege) THEN
      RAISE EXCEPTION 'Migration F0-D: copiloto_app sem % em recommendation_decisions', privilege;
    END IF;
  END LOOP;

  IF has_table_privilege('copiloto_app', 'recommendation_decisions', 'TRUNCATE') THEN
    RAISE EXCEPTION 'Migration F0-D: copiloto_app não deveria ter TRUNCATE em recommendation_decisions';
  END IF;
END;
$$;
