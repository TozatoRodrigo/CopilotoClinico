-- Rastro de cada chamada de IA (fase 0 do plano de 13/10/2026).
--
-- ai_calls guarda só metadados de cada chamada ao modelo: etapa, provedor,
-- modelo pedido e servido, esforço, hash do system prompt (a versão do prompt
-- que decidiu), tokens, custo, latência e desfecho. Nenhum texto do caso, do
-- prompt ou da resposta. Sem FK: a gravação é fora do caminho da análise e
-- nunca pode falhá-la; apagar o atendimento não apaga o custo agregado.
--
-- ai_interactions.request_id liga a interação às chamadas da mesma requisição.
--
-- Permissões: GRANT explícito para copiloto_app (ver
-- 20261010120000_f0d_recommendation_decisions). A API só insere e lê: o
-- REVOKE tira o UPDATE/DELETE que os DEFAULT PRIVILEGES de
-- 20260605030000_aud_002_db_least_privilege concedem quando a migration roda
-- com a role que os declarou (mesmo tratamento do audit_log).
--
-- Reversível via:
--   DROP TABLE "ai_calls";
--   DROP INDEX "ai_interactions_request_id_idx";
--   ALTER TABLE "ai_interactions" DROP COLUMN "request_id";

ALTER TABLE "ai_interactions" ADD COLUMN "request_id" VARCHAR(64);

CREATE INDEX "ai_interactions_request_id_idx" ON "ai_interactions"("request_id");

CREATE TABLE "ai_calls" (
    "id" UUID NOT NULL,
    "request_id" VARCHAR(64),
    "physician_id" UUID,
    "encounter_id" UUID,
    "stage" VARCHAR(32) NOT NULL,
    "profile" VARCHAR(32) NOT NULL,
    "provider" VARCHAR(16) NOT NULL,
    "requested_model" VARCHAR(128) NOT NULL,
    "served_model" VARCHAR(128),
    "effort" VARCHAR(8),
    "prompt_sha256" CHAR(64) NOT NULL,
    "response_schema" VARCHAR(64),
    "prompt_tokens" INTEGER,
    "completion_tokens" INTEGER,
    "cache_read_tokens" INTEGER,
    "cache_write_tokens" INTEGER,
    "cost_usd" DOUBLE PRECISION,
    "latency_ms" INTEGER NOT NULL,
    "outcome" VARCHAR(16) NOT NULL,
    "error_type" VARCHAR(64),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_calls_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ai_calls_request_id_idx" ON "ai_calls"("request_id");

CREATE INDEX "ai_calls_encounter_id_created_at_idx" ON "ai_calls"("encounter_id", "created_at");

CREATE INDEX "ai_calls_created_at_idx" ON "ai_calls"("created_at");

GRANT SELECT, INSERT ON TABLE "ai_calls" TO copiloto_app;
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE "ai_calls" FROM copiloto_app;

-- Smoke check da própria migration, um privilégio por chamada.
DO $$
DECLARE
  privilege TEXT;
BEGIN
  FOREACH privilege IN ARRAY ARRAY['SELECT', 'INSERT'] LOOP
    IF NOT has_table_privilege('copiloto_app', 'ai_calls', privilege) THEN
      RAISE EXCEPTION 'Migration ai_calls: copiloto_app sem % em ai_calls', privilege;
    END IF;
  END LOOP;

  IF has_table_privilege('copiloto_app', 'ai_calls', 'UPDATE')
    OR has_table_privilege('copiloto_app', 'ai_calls', 'DELETE')
    OR has_table_privilege('copiloto_app', 'ai_calls', 'TRUNCATE') THEN
    RAISE EXCEPTION 'Migration ai_calls: copiloto_app só deveria inserir e ler ai_calls';
  END IF;
END;
$$;
