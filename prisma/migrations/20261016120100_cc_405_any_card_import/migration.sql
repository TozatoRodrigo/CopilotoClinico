-- CC-405 (ADR-019, emenda de 16/10/2026) — importação do conteúdo do ANY
-- como cartões revisados.
--
-- - knowledge_card_imports: cada execução de `pnpm cards:import-any` (o que
--   foi criado, atualizado, mantido ou recusado). Escrita uma vez, como o
--   rascunho de IA; a API só insere e lê.
-- - knowledge_cards.source_key: a chave do item importado
--   ("any:infusoes/noradrenalina"), única — reimportar acha o mesmo cartão
--   em vez de duplicar.
-- - knowledge_cards.assigned_reviewer_id: o revisor indicado (o Dr. Gustavo
--   Moreira, autor do conteúdo do ANY); o lote de uma ferramenta só ele
--   assina.
-- - knowledge_card_versions.import_id e review_flags: de qual importação a
--   versão saiu e os achados da revisão clínica (CC-310) para o revisor ver
--   antes de assinar. Os dois entram no trigger: não mudam depois de
--   gravados.
--
-- FKs com RESTRICT, como no resto do cartão: nada assinado some em cascata.
--
-- Reversível via:
--   ALTER TABLE "knowledge_card_versions" DROP CONSTRAINT "knowledge_card_versions_author_check";
--   (recriar o CHECK e a função do trigger da 20261014120000_cc_402_knowledge_cards)
--   ALTER TABLE "knowledge_card_versions" DROP COLUMN "import_id", DROP COLUMN "review_flags";
--   ALTER TABLE "knowledge_cards" DROP COLUMN "source_key", DROP COLUMN "assigned_reviewer_id";
--   DROP TABLE "knowledge_card_imports";

CREATE TABLE "knowledge_card_imports" (
    "id" UUID NOT NULL,
    "tool_id" VARCHAR(40),
    "assigned_reviewer_id" UUID,
    "any_commits" TEXT[],
    "items_total" INTEGER NOT NULL,
    "cards_created" INTEGER NOT NULL DEFAULT 0,
    "cards_updated" INTEGER NOT NULL DEFAULT 0,
    "cards_unchanged" INTEGER NOT NULL DEFAULT 0,
    "cards_skipped" INTEGER NOT NULL DEFAULT 0,
    "rejections" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "knowledge_card_imports_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "knowledge_card_imports_created_at_idx" ON "knowledge_card_imports"("created_at");

ALTER TABLE "knowledge_card_imports" ADD CONSTRAINT "knowledge_card_imports_assigned_reviewer_id_fkey" FOREIGN KEY ("assigned_reviewer_id") REFERENCES "physicians"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "knowledge_cards" ADD COLUMN "source_key" VARCHAR(200),
ADD COLUMN "assigned_reviewer_id" UUID;

CREATE UNIQUE INDEX "knowledge_cards_source_key_key" ON "knowledge_cards"("source_key");

CREATE INDEX "knowledge_cards_assigned_reviewer_id_idx" ON "knowledge_cards"("assigned_reviewer_id");

ALTER TABLE "knowledge_cards" ADD CONSTRAINT "knowledge_cards_assigned_reviewer_id_fkey" FOREIGN KEY ("assigned_reviewer_id") REFERENCES "physicians"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "knowledge_card_versions" ADD COLUMN "import_id" UUID,
ADD COLUMN "review_flags" JSONB NOT NULL DEFAULT '[]';

CREATE INDEX "knowledge_card_versions_import_id_idx" ON "knowledge_card_versions"("import_id");

ALTER TABLE "knowledge_card_versions" ADD CONSTRAINT "knowledge_card_versions_import_id_fkey" FOREIGN KEY ("import_id") REFERENCES "knowledge_card_imports"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Autoria: a versão da IA aponta o rascunho (CC-412); a do médico, o autor;
-- a importada, a importação — e só ela.
ALTER TABLE "knowledge_card_versions" DROP CONSTRAINT "knowledge_card_versions_author_check";
ALTER TABLE "knowledge_card_versions" ADD CONSTRAINT "knowledge_card_versions_author_check" CHECK (
    ("author_kind" = 'ai' AND "draft_id" IS NOT NULL AND "author_physician_id" IS NULL AND "import_id" IS NULL)
    OR ("author_kind" = 'physician' AND "author_physician_id" IS NOT NULL AND "import_id" IS NULL)
    OR ("author_kind" = 'import' AND "import_id" IS NOT NULL AND "draft_id" IS NULL AND "author_physician_id" IS NULL)
);

-- Mesmo trigger da CC-402, com a origem da importação e os achados também
-- congelados: o revisor assina vendo exatamente aqueles achados.
CREATE OR REPLACE FUNCTION knowledge_card_versions_guard() RETURNS trigger AS $$
BEGIN
  IF NEW.card_id IS DISTINCT FROM OLD.card_id
     OR NEW.version IS DISTINCT FROM OLD.version
     OR NEW.content IS DISTINCT FROM OLD.content
     OR NEW.content_sha256 IS DISTINCT FROM OLD.content_sha256
     OR NEW.author_kind IS DISTINCT FROM OLD.author_kind
     OR NEW.author_physician_id IS DISTINCT FROM OLD.author_physician_id
     OR NEW.draft_id IS DISTINCT FROM OLD.draft_id
     OR NEW.import_id IS DISTINCT FROM OLD.import_id
     OR NEW.review_flags IS DISTINCT FROM OLD.review_flags
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'knowledge_card_versions: conteúdo e autoria de uma versão não mudam — crie uma versão nova';
  END IF;

  IF OLD.review_decision IS NOT NULL AND (
       NEW.review_decision IS DISTINCT FROM OLD.review_decision
       OR NEW.reviewer_id IS DISTINCT FROM OLD.reviewer_id
       OR NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at
       OR NEW.review_comment IS DISTINCT FROM OLD.review_comment
       OR NEW.review_duration_ms IS DISTINCT FROM OLD.review_duration_ms
       OR NEW.valid_until IS DISTINCT FROM OLD.valid_until) THEN
    RAISE EXCEPTION 'knowledge_card_versions: a decisão do revisor é gravada uma vez só';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- DML mínimo para a API: a importação só insere e lê, como o rascunho.
GRANT SELECT, INSERT ON TABLE "knowledge_card_imports" TO copiloto_app;
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE "knowledge_card_imports" FROM copiloto_app;

-- Smoke check da própria migration, um privilégio por chamada.
DO $$
DECLARE
  privilege TEXT;
BEGIN
  FOREACH privilege IN ARRAY ARRAY['SELECT', 'INSERT'] LOOP
    IF NOT has_table_privilege('copiloto_app', 'knowledge_card_imports', privilege) THEN
      RAISE EXCEPTION 'Migration CC-405: copiloto_app sem % em knowledge_card_imports', privilege;
    END IF;
  END LOOP;
  FOREACH privilege IN ARRAY ARRAY['UPDATE', 'DELETE', 'TRUNCATE'] LOOP
    IF has_table_privilege('copiloto_app', 'knowledge_card_imports', privilege) THEN
      RAISE EXCEPTION 'Migration CC-405: copiloto_app não deveria ter % em knowledge_card_imports', privilege;
    END IF;
  END LOOP;
END;
$$;
