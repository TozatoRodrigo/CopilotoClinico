-- CC-703 — Registro de lacunas: o que o médico procurou e o Copiloto não tinha.
--
-- Primeira fonte: o botão "não encontrei o que precisava" da análise. A CC-409
-- acrescenta a lacuna automática (análise sem cartão aplicável) e a CC-501, a
-- da pergunta rápida; as duas leem e escrevem nesta tabela.
--
-- Sem texto do caso: `syndrome` e `search_queries` vêm do entendimento da
-- análise (síndrome de PS e consultas da busca dirigida, mascaradas), e `note`
-- é a frase curta do médico, mascarada. Sem `physician_id`: a lacuna é do
-- conteúdo. ON DELETE CASCADE a partir da análise: apagar o atendimento
-- (LGPD Art. 18) leva a lacuna junto.
--
-- O índice único (interaction_id, source) faz o segundo toque na mesma
-- análise atualizar a nota em vez de contar duas vezes; lacunas sem análise
-- (NULL) não colidem entre si.
--
-- Permissões: GRANT explícito para copiloto_app (ver
-- 20261010120000_f0d_recommendation_decisions).
--
-- Reversível via:
--   DROP TABLE "knowledge_gaps";
--   DROP TYPE "KnowledgeGapSource";

CREATE TYPE "KnowledgeGapSource" AS ENUM ('physician_not_found');

CREATE TABLE "knowledge_gaps" (
    "id" UUID NOT NULL,
    "source" "KnowledgeGapSource" NOT NULL,
    "interaction_id" UUID,
    "syndrome" VARCHAR(40),
    "search_queries" TEXT[],
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "knowledge_gaps_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "knowledge_gaps_created_at_idx" ON "knowledge_gaps"("created_at");

CREATE INDEX "knowledge_gaps_syndrome_created_at_idx" ON "knowledge_gaps"("syndrome", "created_at");

CREATE UNIQUE INDEX "knowledge_gaps_interaction_id_source_key" ON "knowledge_gaps"("interaction_id", "source");

ALTER TABLE "knowledge_gaps" ADD CONSTRAINT "knowledge_gaps_interaction_id_fkey" FOREIGN KEY ("interaction_id") REFERENCES "ai_interactions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- DML mínimo para a API: registrar (INSERT), atualizar a nota (UPDATE), ler
-- (SELECT) e apagar (DELETE). Sem TRUNCATE, sem REFERENCES, sem TRIGGER.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "knowledge_gaps" TO copiloto_app;

-- Smoke check da própria migration, um privilégio por chamada.
DO $$
DECLARE
  privilege TEXT;
BEGIN
  FOREACH privilege IN ARRAY ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE'] LOOP
    IF NOT has_table_privilege('copiloto_app', 'knowledge_gaps', privilege) THEN
      RAISE EXCEPTION 'Migration CC-703: copiloto_app sem % em knowledge_gaps', privilege;
    END IF;
  END LOOP;

  IF has_table_privilege('copiloto_app', 'knowledge_gaps', 'TRUNCATE') THEN
    RAISE EXCEPTION 'Migration CC-703: copiloto_app não deveria ter TRUNCATE em knowledge_gaps';
  END IF;
END;
$$;
