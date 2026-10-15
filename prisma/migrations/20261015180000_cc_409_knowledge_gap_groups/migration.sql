-- CC-409 — Registro de lacunas e fila de criação de cartões.
--
-- 1. As três fontes de lacuna gravam em `knowledge_gaps` (CC-703): o
--    "não encontrei o que precisava" da análise, a decisão sem cartão
--    aplicável (CC-408) e a pergunta rápida sem cartão (CC-501).
-- 2. `knowledge_gap_groups` junta lacunas parecidas (mesma síndrome,
--    consultas próximas — agrupamento determinístico no código) e é o item
--    da fila do curador: aberta, em rascunho, coberta por cartão, descartada.
--
-- Contagem, primeira e última ocorrência saem das lacunas na leitura: não há
-- contador para ficar velho depois de uma eliminação LGPD. Sem médico nas
-- duas tabelas; quem tratou o grupo fica na trilha de auditoria.
--
-- Grupo → lacuna é ON DELETE SET NULL (a varredura reagrupa). Grupo →
-- rascunho e grupo → cartão são RESTRICT: nenhum dos dois é apagado (ADR-019).
--
-- As duas linhas de ALTER TYPE ... ADD VALUE ficam sem uso nesta migration
-- (o Postgres não deixa usar o valor novo na mesma transação).
--
-- Permissões: GRANT explícito para copiloto_app (ver
-- 20261010120000_f0d_recommendation_decisions). DELETE em
-- knowledge_gap_groups: a varredura diária apaga grupo aberto que ficou sem
-- lacuna (retenção ou eliminação LGPD).
--
-- Reversível via:
--   DROP TABLE "knowledge_gap_groups" CASCADE;  -- leva a FK de knowledge_gaps
--   ALTER TABLE "knowledge_gaps" DROP COLUMN "group_id";
--   DROP TYPE "KnowledgeGapGroupStatus";
--   (os valores novos de "KnowledgeGapSource" ficam: o Postgres não remove
--   valor de enum; apague as linhas com eles antes de recriar o tipo, se
--   precisar)

-- CreateEnum
CREATE TYPE "KnowledgeGapGroupStatus" AS ENUM ('open', 'drafting', 'covered', 'dismissed');

-- AlterEnum
ALTER TYPE "KnowledgeGapSource" ADD VALUE 'decision_no_card';
ALTER TYPE "KnowledgeGapSource" ADD VALUE 'quick_question';

-- AlterTable
ALTER TABLE "knowledge_gaps" ADD COLUMN     "group_id" UUID;

-- CreateTable
CREATE TABLE "knowledge_gap_groups" (
    "id" UUID NOT NULL,
    "syndrome" VARCHAR(40),
    "signature" TEXT[],
    "topic" VARCHAR(200) NOT NULL,
    "status" "KnowledgeGapGroupStatus" NOT NULL DEFAULT 'open',
    "draft_id" UUID,
    "covered_by_card_id" UUID,
    "dismiss_reason" TEXT,
    "status_changed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "knowledge_gap_groups_pkey" PRIMARY KEY ("id"),
    -- "Coberta por cartão X" sempre diz o X; "descartada" sempre diz o porquê.
    CONSTRAINT "knowledge_gap_groups_covered_card_check"
      CHECK ("status" <> 'covered' OR "covered_by_card_id" IS NOT NULL),
    CONSTRAINT "knowledge_gap_groups_dismiss_reason_check"
      CHECK ("status" <> 'dismissed' OR "dismiss_reason" IS NOT NULL)
);

-- CreateIndex
CREATE INDEX "knowledge_gap_groups_status_idx" ON "knowledge_gap_groups"("status");

-- CreateIndex
CREATE INDEX "knowledge_gap_groups_syndrome_idx" ON "knowledge_gap_groups"("syndrome");

-- CreateIndex
CREATE INDEX "knowledge_gap_groups_draft_id_idx" ON "knowledge_gap_groups"("draft_id");

-- CreateIndex
CREATE INDEX "knowledge_gaps_group_id_created_at_idx" ON "knowledge_gaps"("group_id", "created_at");

-- AddForeignKey
ALTER TABLE "knowledge_gaps" ADD CONSTRAINT "knowledge_gaps_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "knowledge_gap_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_gap_groups" ADD CONSTRAINT "knowledge_gap_groups_draft_id_fkey" FOREIGN KEY ("draft_id") REFERENCES "knowledge_card_drafts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_gap_groups" ADD CONSTRAINT "knowledge_gap_groups_covered_by_card_id_fkey" FOREIGN KEY ("covered_by_card_id") REFERENCES "knowledge_cards"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- DML mínimo para a API: agrupar (INSERT), mudar o status (UPDATE), ler
-- (SELECT) e apagar o grupo aberto sem lacuna (DELETE). Sem TRUNCATE, sem
-- REFERENCES, sem TRIGGER.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "knowledge_gap_groups" TO copiloto_app;

-- Smoke check da própria migration, um privilégio por chamada.
DO $$
DECLARE
  privilege TEXT;
BEGIN
  FOREACH privilege IN ARRAY ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE'] LOOP
    IF NOT has_table_privilege('copiloto_app', 'knowledge_gap_groups', privilege) THEN
      RAISE EXCEPTION 'Migration CC-409: copiloto_app sem % em knowledge_gap_groups', privilege;
    END IF;
  END LOOP;

  IF has_table_privilege('copiloto_app', 'knowledge_gap_groups', 'TRUNCATE') THEN
    RAISE EXCEPTION 'Migration CC-409: copiloto_app não deveria ter TRUNCATE em knowledge_gap_groups';
  END IF;
END;
$$;
