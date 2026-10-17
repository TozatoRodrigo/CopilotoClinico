-- CC-406 (ADR-019, emenda de 15/10/2026) — índice semântico dos cartões revisados.
--
-- Uma linha por cartão que pode ser usado agora: versão publicada, aprovada,
-- dentro da validade e assinada por médico com CRM verificado. O índice é
-- DERIVADO de knowledge_cards/knowledge_card_versions: entra ao publicar, é
-- refeito quando outra versão é publicada e sai ao arquivar ou vencer
-- (CardIndexService, `pnpm cards:reindex` e a varredura diária). Por isso,
-- diferente das tabelas do cartão, a API pode apagar linhas daqui, e as FKs
-- são CASCADE: apagar o índice não apaga nada assinado.
--
-- `embedding` é `vector` SEM dimensão fixa, de propósito: trocar o provedor
-- de embedding dos cartões (CC-406 compara OpenAI, Voyage, Qwen3 e modelo
-- local, de 1024 a 4096 dimensões) é reindexar, não migrar. Cada linha guarda
-- o modelo que gerou o vetor e a busca só compara vetores do modelo atual e da
-- mesma dimensão. Sem índice ANN: são centenas de cartões, e a varredura
-- exata cabe folgada no orçamento da análise.
--
-- `embedding` nulo = cartão elegível ainda sem vetor (provedor desligado ou
-- fora do ar); a busca o ignora até o reindex preenchê-lo.
--
-- Reversível via:
--   DROP TABLE "knowledge_card_index";

CREATE TABLE "knowledge_card_index" (
    "card_id" UUID NOT NULL,
    "version_id" UUID NOT NULL,
    "institution_id" UUID,
    "syndrome" VARCHAR(40),
    "valid_until" TIMESTAMP(3) NOT NULL,
    "content_sha256" CHAR(64) NOT NULL,
    "text_sha256" CHAR(64) NOT NULL,
    "embedding" vector,
    "embedding_provider" VARCHAR(40),
    "embedding_model" VARCHAR(128),
    "indexed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "knowledge_card_index_pkey" PRIMARY KEY ("card_id"),
    -- Vetor sem modelo não pode ser comparado com segurança; modelo sem vetor é lixo.
    CONSTRAINT "knowledge_card_index_embedding_model_check"
        CHECK (("embedding" IS NULL) = ("embedding_model" IS NULL))
);

CREATE UNIQUE INDEX "knowledge_card_index_version_id_key" ON "knowledge_card_index"("version_id");

CREATE INDEX "knowledge_card_index_embedding_model_idx" ON "knowledge_card_index"("embedding_model");

ALTER TABLE "knowledge_card_index" ADD CONSTRAINT "knowledge_card_index_card_id_fkey" FOREIGN KEY ("card_id") REFERENCES "knowledge_cards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "knowledge_card_index" ADD CONSTRAINT "knowledge_card_index_version_id_fkey" FOREIGN KEY ("version_id") REFERENCES "knowledge_card_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- DML completo para a API: o índice é refeito a partir dos cartões. TRUNCATE
-- fica de fora como em toda tabela da aplicação.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "knowledge_card_index" TO copiloto_app;
REVOKE TRUNCATE ON TABLE "knowledge_card_index" FROM copiloto_app;

-- Smoke check da própria migration, um privilégio por chamada.
DO $$
DECLARE
  privilege TEXT;
BEGIN
  FOREACH privilege IN ARRAY ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE'] LOOP
    IF NOT has_table_privilege('copiloto_app', 'knowledge_card_index', privilege) THEN
      RAISE EXCEPTION 'Migration CC-406: copiloto_app sem % em knowledge_card_index', privilege;
    END IF;
  END LOOP;
  IF has_table_privilege('copiloto_app', 'knowledge_card_index', 'TRUNCATE') THEN
    RAISE EXCEPTION 'Migration CC-406: copiloto_app não deveria ter TRUNCATE em knowledge_card_index';
  END IF;
END;
$$;
