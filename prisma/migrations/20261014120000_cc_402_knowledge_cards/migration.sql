-- CC-402 / CC-403 / CC-412 (ADR-017) — cartões revisados.
--
-- Um cartão é uma situação clínica com pergunta e resposta curta, cada
-- afirmação e cada dose citando um trecho literal de uma diretriz já ingerida
-- (guideline_chunks). A IA rascunha; um médico com CRM verificado revisa e
-- assina. Três tabelas:
--
-- - knowledge_card_drafts: cada pedido de rascunho à IA (tema, trechos,
--   modelo, hash do prompt, hash do conteúdo de origem, o que foi rejeitado
--   pela checagem de citação). Escrito uma vez; a API só insere e lê.
-- - knowledge_cards: a identidade do cartão, o status e a versão publicada.
--   Nunca é apagado: sai de uso por `archived`.
-- - knowledge_card_versions: o conteúdo de cada versão e a revisão dela.
--   O trigger abaixo impede mudar conteúdo e autoria depois de gravados e
--   regravar a decisão do revisor: o que o médico assinou não muda.
--
-- FKs com RESTRICT: a assinatura de um cartão não some em cascata. Médico não
-- é apagado (a eliminação LGPD anonimiza a linha), e instituição com cartões
-- não pode ser apagada sem decidir antes o destino deles — SET NULL tornaria
-- global um cartão institucional (ADR-009).
--
-- Permissões: GRANT explícito para copiloto_app (ver
-- 20261010120000_f0d_recommendation_decisions) e REVOKE do que os DEFAULT
-- PRIVILEGES da AUD-002 concedem a mais (mesmo tratamento de ai_calls).
--
-- Reversível via:
--   DROP TABLE "knowledge_card_versions" CASCADE; DROP TABLE "knowledge_cards";
--   DROP TABLE "knowledge_card_drafts";
--   DROP FUNCTION knowledge_card_versions_guard();
--   DROP TYPE "KnowledgeCardDraftStatus"; DROP TYPE "KnowledgeCardReviewDecision";
--   DROP TYPE "KnowledgeCardAuthorKind"; DROP TYPE "KnowledgeCardStatus";

CREATE TYPE "KnowledgeCardStatus" AS ENUM ('draft', 'in_review', 'published', 'archived');

CREATE TYPE "KnowledgeCardAuthorKind" AS ENUM ('ai', 'physician');

CREATE TYPE "KnowledgeCardReviewDecision" AS ENUM ('approved', 'rejected');

CREATE TYPE "KnowledgeCardDraftStatus" AS ENUM ('completed', 'failed');

CREATE TABLE "knowledge_card_drafts" (
    "id" UUID NOT NULL,
    "topic" VARCHAR(200) NOT NULL,
    "syndrome" VARCHAR(40),
    "institution_id" UUID,
    "requested_by" UUID,
    "status" "KnowledgeCardDraftStatus" NOT NULL,
    "requested_model" VARCHAR(128) NOT NULL,
    "served_model" VARCHAR(128),
    "prompt_sha256" CHAR(64) NOT NULL,
    "source_content_sha256" CHAR(64) NOT NULL,
    "source_chunk_ids" TEXT[],
    "cards_accepted" INTEGER NOT NULL DEFAULT 0,
    "cards_rejected" INTEGER NOT NULL DEFAULT 0,
    "rejections" JSONB NOT NULL DEFAULT '[]',
    "failure_reason" VARCHAR(300),
    "cost_usd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "latency_ms" INTEGER NOT NULL,
    "request_id" VARCHAR(64),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "knowledge_card_drafts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "knowledge_cards" (
    "id" UUID NOT NULL,
    "institution_id" UUID,
    "topic" VARCHAR(200) NOT NULL,
    "syndrome" VARCHAR(40),
    "status" "KnowledgeCardStatus" NOT NULL DEFAULT 'draft',
    "current_version" INTEGER NOT NULL,
    "published_version_id" UUID,
    "archived_at" TIMESTAMP(3),
    "archived_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "knowledge_cards_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "knowledge_cards_current_version_check" CHECK ("current_version" >= 1),
    -- Publicado sempre tem versão assinada; arquivado sempre tem a data.
    CONSTRAINT "knowledge_cards_published_check"
        CHECK ("status" <> 'published' OR "published_version_id" IS NOT NULL),
    CONSTRAINT "knowledge_cards_archived_check"
        CHECK (("status" = 'archived') = ("archived_at" IS NOT NULL))
);

CREATE TABLE "knowledge_card_versions" (
    "id" UUID NOT NULL,
    "card_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "content" JSONB NOT NULL,
    "content_sha256" CHAR(64) NOT NULL,
    "author_kind" "KnowledgeCardAuthorKind" NOT NULL,
    "author_physician_id" UUID,
    "draft_id" UUID,
    "review_decision" "KnowledgeCardReviewDecision",
    "reviewer_id" UUID,
    "reviewed_at" TIMESTAMP(3),
    "review_comment" TEXT,
    "review_duration_ms" INTEGER,
    "valid_until" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "knowledge_card_versions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "knowledge_card_versions_version_check" CHECK ("version" >= 1),
    -- Versão da IA sempre aponta o rascunho de origem (CC-412); a do médico, o autor.
    CONSTRAINT "knowledge_card_versions_author_check" CHECK (
        ("author_kind" = 'ai' AND "draft_id" IS NOT NULL AND "author_physician_id" IS NULL)
        OR ("author_kind" = 'physician' AND "author_physician_id" IS NOT NULL)
    ),
    -- Decisão sem revisor e data não é revisão; aprovação sem validade nunca vence.
    CONSTRAINT "knowledge_card_versions_review_check" CHECK (
        "review_decision" IS NULL
        OR ("reviewer_id" IS NOT NULL AND "reviewed_at" IS NOT NULL)
    ),
    CONSTRAINT "knowledge_card_versions_approval_validity_check" CHECK (
        "review_decision" IS DISTINCT FROM 'approved' OR "valid_until" IS NOT NULL
    )
);

CREATE INDEX "knowledge_card_drafts_source_content_sha256_idx" ON "knowledge_card_drafts"("source_content_sha256");

CREATE INDEX "knowledge_card_drafts_created_at_idx" ON "knowledge_card_drafts"("created_at");

CREATE UNIQUE INDEX "knowledge_cards_published_version_id_key" ON "knowledge_cards"("published_version_id");

CREATE INDEX "knowledge_cards_status_updated_at_idx" ON "knowledge_cards"("status", "updated_at");

CREATE INDEX "knowledge_cards_institution_id_idx" ON "knowledge_cards"("institution_id");

CREATE INDEX "knowledge_cards_syndrome_idx" ON "knowledge_cards"("syndrome");

CREATE INDEX "knowledge_card_versions_draft_id_idx" ON "knowledge_card_versions"("draft_id");

CREATE INDEX "knowledge_card_versions_reviewer_id_idx" ON "knowledge_card_versions"("reviewer_id");

CREATE UNIQUE INDEX "knowledge_card_versions_card_id_version_key" ON "knowledge_card_versions"("card_id", "version");

ALTER TABLE "knowledge_cards" ADD CONSTRAINT "knowledge_cards_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "institutions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "knowledge_cards" ADD CONSTRAINT "knowledge_cards_published_version_id_fkey" FOREIGN KEY ("published_version_id") REFERENCES "knowledge_card_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "knowledge_card_versions" ADD CONSTRAINT "knowledge_card_versions_card_id_fkey" FOREIGN KEY ("card_id") REFERENCES "knowledge_cards"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "knowledge_card_versions" ADD CONSTRAINT "knowledge_card_versions_draft_id_fkey" FOREIGN KEY ("draft_id") REFERENCES "knowledge_card_drafts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "knowledge_card_versions" ADD CONSTRAINT "knowledge_card_versions_author_physician_id_fkey" FOREIGN KEY ("author_physician_id") REFERENCES "physicians"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "knowledge_card_versions" ADD CONSTRAINT "knowledge_card_versions_reviewer_id_fkey" FOREIGN KEY ("reviewer_id") REFERENCES "physicians"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- O que o revisor assinou não muda: conteúdo, hash e autoria ficam como
-- gravados, e a decisão do revisor (com data, comentário e validade) é
-- gravada uma vez só. Corrigir é criar uma versão nova.
CREATE FUNCTION knowledge_card_versions_guard() RETURNS trigger AS $$
BEGIN
  IF NEW.card_id IS DISTINCT FROM OLD.card_id
     OR NEW.version IS DISTINCT FROM OLD.version
     OR NEW.content IS DISTINCT FROM OLD.content
     OR NEW.content_sha256 IS DISTINCT FROM OLD.content_sha256
     OR NEW.author_kind IS DISTINCT FROM OLD.author_kind
     OR NEW.author_physician_id IS DISTINCT FROM OLD.author_physician_id
     OR NEW.draft_id IS DISTINCT FROM OLD.draft_id
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

CREATE TRIGGER knowledge_card_versions_guard
  BEFORE UPDATE ON "knowledge_card_versions"
  FOR EACH ROW EXECUTE FUNCTION knowledge_card_versions_guard();

-- DML mínimo para a API. Rascunho: só insere e lê. Cartão e versão: insere,
-- lê e atualiza (status, versão publicada, decisão do revisor). Nada se
-- apaga: um cartão sai de uso por `archived`.
GRANT SELECT, INSERT ON TABLE "knowledge_card_drafts" TO copiloto_app;
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE "knowledge_card_drafts" FROM copiloto_app;
GRANT SELECT, INSERT, UPDATE ON TABLE "knowledge_cards" TO copiloto_app;
REVOKE DELETE, TRUNCATE ON TABLE "knowledge_cards" FROM copiloto_app;
GRANT SELECT, INSERT, UPDATE ON TABLE "knowledge_card_versions" TO copiloto_app;
REVOKE DELETE, TRUNCATE ON TABLE "knowledge_card_versions" FROM copiloto_app;

-- Smoke check da própria migration, um privilégio por chamada.
DO $$
DECLARE
  privilege TEXT;
  card_table TEXT;
BEGIN
  FOREACH privilege IN ARRAY ARRAY['SELECT', 'INSERT'] LOOP
    IF NOT has_table_privilege('copiloto_app', 'knowledge_card_drafts', privilege) THEN
      RAISE EXCEPTION 'Migration CC-402: copiloto_app sem % em knowledge_card_drafts', privilege;
    END IF;
  END LOOP;
  FOREACH privilege IN ARRAY ARRAY['UPDATE', 'DELETE', 'TRUNCATE'] LOOP
    IF has_table_privilege('copiloto_app', 'knowledge_card_drafts', privilege) THEN
      RAISE EXCEPTION 'Migration CC-402: copiloto_app não deveria ter % em knowledge_card_drafts', privilege;
    END IF;
  END LOOP;

  FOREACH card_table IN ARRAY ARRAY['knowledge_cards', 'knowledge_card_versions'] LOOP
    FOREACH privilege IN ARRAY ARRAY['SELECT', 'INSERT', 'UPDATE'] LOOP
      IF NOT has_table_privilege('copiloto_app', card_table, privilege) THEN
        RAISE EXCEPTION 'Migration CC-402: copiloto_app sem % em %', privilege, card_table;
      END IF;
    END LOOP;
    FOREACH privilege IN ARRAY ARRAY['DELETE', 'TRUNCATE'] LOOP
      IF has_table_privilege('copiloto_app', card_table, privilege) THEN
        RAISE EXCEPTION 'Migration CC-402: copiloto_app não deveria ter % em %', privilege, card_table;
      END IF;
    END LOOP;
  END LOOP;
END;
$$;
