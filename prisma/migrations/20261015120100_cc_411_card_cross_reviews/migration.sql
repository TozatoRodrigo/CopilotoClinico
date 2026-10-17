-- CC-411 (ADR-019, adendo) — revisão cruzada de 10% dos cartões aprovados.
--
-- Um revisor sozinho deixa passar erro de dose do rascunho da IA ("dexametasona
-- 4 mg 6/6h" fora de contexto, no modo verify). Cada aprovação é sorteada pelo
-- SHA-256 do id da versão aprovada — determinístico, auditável, sem escolha de
-- ninguém — e 10% das sorteadas ganham uma linha aqui, `pending`, na mesma
-- transação da aprovação. Um segundo médico, diferente de quem aprovou e de
-- quem escreveu a versão, concorda ou diverge. Divergir é corrigir: a correção
-- vira versão nova, o cartão sai do ar (`published_version_id` volta a nulo)
-- e volta para a fila de revisão.
--
-- O banco guarda as regras sozinho: CHECK de segundo médico diferente do
-- primeiro e do autor da versão, CHECK de que toda decisão tem revisor e data
-- e toda divergência tem motivo e correção, e trigger que impede regravar a
-- decisão ou trocar o que foi sorteado. FKs com RESTRICT; a role da API não
-- apaga linha (mesmo tratamento de knowledge_card_versions).
--
-- Reversível via:
--   DROP TABLE "knowledge_card_cross_reviews";
--   DROP FUNCTION knowledge_card_cross_reviews_guard();
--   DROP TYPE "KnowledgeCardCrossReviewStatus";

CREATE TYPE "KnowledgeCardCrossReviewStatus" AS ENUM ('pending', 'agreed', 'diverged');

CREATE TABLE "knowledge_card_cross_reviews" (
    "id" UUID NOT NULL,
    "card_id" UUID NOT NULL,
    "version_id" UUID NOT NULL,
    "first_reviewer_id" UUID NOT NULL,
    "version_author_id" UUID,
    "sample_bucket" SMALLINT NOT NULL,
    "status" "KnowledgeCardCrossReviewStatus" NOT NULL DEFAULT 'pending',
    "reviewer_id" UUID,
    "reviewed_at" TIMESTAMP(3),
    "comment" TEXT,
    "review_duration_ms" INTEGER,
    "correction_version_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "knowledge_card_cross_reviews_pkey" PRIMARY KEY ("id"),
    -- O sorteio: balde de 0 a 99 do hash da versão; entra quem cai abaixo de 10.
    CONSTRAINT "knowledge_card_cross_reviews_sample_bucket_check"
        CHECK ("sample_bucket" >= 0 AND "sample_bucket" < 100),
    -- Segundo médico: nem quem aprovou, nem quem escreveu a versão sorteada.
    CONSTRAINT "knowledge_card_cross_reviews_second_reviewer_check" CHECK (
        "reviewer_id" IS DISTINCT FROM "first_reviewer_id"
        AND ("version_author_id" IS NULL OR "reviewer_id" IS DISTINCT FROM "version_author_id")
    ),
    -- Pendente não tem decisão; decidida tem revisor e data.
    CONSTRAINT "knowledge_card_cross_reviews_decision_check" CHECK (
        ("status" = 'pending' AND "reviewer_id" IS NULL AND "reviewed_at" IS NULL)
        OR ("status" <> 'pending' AND "reviewer_id" IS NOT NULL AND "reviewed_at" IS NOT NULL)
    ),
    -- Divergência sempre com motivo e a correção que ela gerou; concordância sem correção.
    CONSTRAINT "knowledge_card_cross_reviews_divergence_check" CHECK (
        ("status" = 'diverged' AND "comment" IS NOT NULL AND "correction_version_id" IS NOT NULL)
        OR ("status" <> 'diverged' AND "correction_version_id" IS NULL)
    )
);

CREATE UNIQUE INDEX "knowledge_card_cross_reviews_version_id_key" ON "knowledge_card_cross_reviews"("version_id");

CREATE UNIQUE INDEX "knowledge_card_cross_reviews_correction_version_id_key" ON "knowledge_card_cross_reviews"("correction_version_id");

CREATE INDEX "knowledge_card_cross_reviews_status_created_at_idx" ON "knowledge_card_cross_reviews"("status", "created_at");

CREATE INDEX "knowledge_card_cross_reviews_card_id_idx" ON "knowledge_card_cross_reviews"("card_id");

ALTER TABLE "knowledge_card_cross_reviews" ADD CONSTRAINT "knowledge_card_cross_reviews_card_id_fkey" FOREIGN KEY ("card_id") REFERENCES "knowledge_cards"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "knowledge_card_cross_reviews" ADD CONSTRAINT "knowledge_card_cross_reviews_version_id_fkey" FOREIGN KEY ("version_id") REFERENCES "knowledge_card_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "knowledge_card_cross_reviews" ADD CONSTRAINT "knowledge_card_cross_reviews_correction_version_id_fkey" FOREIGN KEY ("correction_version_id") REFERENCES "knowledge_card_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "knowledge_card_cross_reviews" ADD CONSTRAINT "knowledge_card_cross_reviews_first_reviewer_id_fkey" FOREIGN KEY ("first_reviewer_id") REFERENCES "physicians"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "knowledge_card_cross_reviews" ADD CONSTRAINT "knowledge_card_cross_reviews_version_author_id_fkey" FOREIGN KEY ("version_author_id") REFERENCES "physicians"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "knowledge_card_cross_reviews" ADD CONSTRAINT "knowledge_card_cross_reviews_reviewer_id_fkey" FOREIGN KEY ("reviewer_id") REFERENCES "physicians"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- O sorteio e a decisão do segundo médico não mudam: o que foi sorteado
-- (cartão, versão, primeiro revisor, autor, balde) fica como gravado, e a
-- decisão é gravada uma vez só.
CREATE FUNCTION knowledge_card_cross_reviews_guard() RETURNS trigger AS $$
BEGIN
  IF NEW.card_id IS DISTINCT FROM OLD.card_id
     OR NEW.version_id IS DISTINCT FROM OLD.version_id
     OR NEW.first_reviewer_id IS DISTINCT FROM OLD.first_reviewer_id
     OR NEW.version_author_id IS DISTINCT FROM OLD.version_author_id
     OR NEW.sample_bucket IS DISTINCT FROM OLD.sample_bucket
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'knowledge_card_cross_reviews: o sorteio de uma revisão cruzada não muda';
  END IF;

  IF OLD.status <> 'pending' AND (
       NEW.status IS DISTINCT FROM OLD.status
       OR NEW.reviewer_id IS DISTINCT FROM OLD.reviewer_id
       OR NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at
       OR NEW.comment IS DISTINCT FROM OLD.comment
       OR NEW.review_duration_ms IS DISTINCT FROM OLD.review_duration_ms
       OR NEW.correction_version_id IS DISTINCT FROM OLD.correction_version_id) THEN
    RAISE EXCEPTION 'knowledge_card_cross_reviews: a decisão do segundo médico é gravada uma vez só';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER knowledge_card_cross_reviews_guard
  BEFORE UPDATE ON "knowledge_card_cross_reviews"
  FOR EACH ROW EXECUTE FUNCTION knowledge_card_cross_reviews_guard();

-- DML mínimo para a API: insere (no sorteio), lê e atualiza (a decisão).
GRANT SELECT, INSERT, UPDATE ON TABLE "knowledge_card_cross_reviews" TO copiloto_app;
REVOKE DELETE, TRUNCATE ON TABLE "knowledge_card_cross_reviews" FROM copiloto_app;

-- Smoke check da própria migration, um privilégio por chamada.
DO $$
DECLARE
  privilege TEXT;
BEGIN
  FOREACH privilege IN ARRAY ARRAY['SELECT', 'INSERT', 'UPDATE'] LOOP
    IF NOT has_table_privilege('copiloto_app', 'knowledge_card_cross_reviews', privilege) THEN
      RAISE EXCEPTION 'Migration CC-411: copiloto_app sem % em knowledge_card_cross_reviews', privilege;
    END IF;
  END LOOP;
  FOREACH privilege IN ARRAY ARRAY['DELETE', 'TRUNCATE'] LOOP
    IF has_table_privilege('copiloto_app', 'knowledge_card_cross_reviews', privilege) THEN
      RAISE EXCEPTION 'Migration CC-411: copiloto_app não deveria ter % em knowledge_card_cross_reviews', privilege;
    END IF;
  END LOOP;
END;
$$;
