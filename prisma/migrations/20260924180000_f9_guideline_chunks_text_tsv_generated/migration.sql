-- F9 — `text_tsv` passa a ser preenchida pelo próprio banco.
--
-- A coluna existe desde a migration inicial ("textTsv", renomeada em
-- 20260613090000_kb_002_guideline_review_pipeline), mas nenhuma migration
-- criou trigger ou coluna gerada e nenhum código a escrevia: ficou NULL em
-- todas as linhas. Consequências: `RetrievalService.keywordSearch()` nunca
-- retornava nada (a busca "híbrida" do Copiloto era só semântica) e a busca
-- textual da biblioteca (`GuidelinesService.searchChunks`) nunca achava nada.
--
-- Vira coluna GENERATED ... STORED: o Postgres calcula na inserção e em todo
-- UPDATE de `text`, então nenhum caminho de escrita (ingestão, curadoria,
-- coletor da Conitec, seeds) precisa lembrar de preenchê-la. Não dá para
-- converter uma coluna comum em gerada com ALTER COLUMN — por isso drop e
-- re-add. O ADD COLUMN reescreve a tabela sob ACCESS EXCLUSIVE; com o volume
-- atual de `guideline_chunks` (milhares de linhas) isso leva segundos.
--
-- Muda respostas do Copiloto em produção: ver docs/runbook.md →
-- "Busca lexical (text_tsv)".
--
-- Reversível via (volta ao estado anterior: coluna comum, sempre NULL):
--   DROP INDEX "guideline_chunks_text_tsv_idx";
--   ALTER TABLE "guideline_chunks" DROP COLUMN "text_tsv";
--   ALTER TABLE "guideline_chunks" ADD COLUMN "text_tsv" tsvector;

ALTER TABLE "guideline_chunks" DROP COLUMN "text_tsv";

ALTER TABLE "guideline_chunks"
    ADD COLUMN "text_tsv" tsvector
    GENERATED ALWAYS AS (to_tsvector('portuguese', coalesce("text", ''))) STORED;

CREATE INDEX "guideline_chunks_text_tsv_idx" ON "guideline_chunks" USING GIN ("text_tsv");
