-- CC-021 — apagar instituição não pode tornar global o conteúdo dela.
--
-- `institution_id IS NULL` é "global, visível a todos" (ADR-009). Com
-- ON DELETE SET NULL, apagar uma instituição transformava os protocolos e os
-- trechos de diretriz internos dela em conteúdo global, servido a qualquer
-- médico. Agora o banco recusa o DELETE enquanto houver protocolo, trecho ou
-- atendimento apontando para a instituição. Atendimento entra pela mesma
-- regra: perder o vínculo apagaria em silêncio o contexto institucional do
-- caso (ver o adendo CC-021 no ADR-009).
--
-- `physician_institutions` continua ON DELETE CASCADE: sem a instituição, o
-- vínculo não tem sentido e removê-lo só tira acesso.
--
-- Sem perda de dado e sem janela: troca só a regra das FKs (mesmos nomes,
-- gerados por `prisma migrate diff`). Não reescreve tabela nem reconstrói o
-- índice ivfflat de `guideline_chunks`. Ao recriar cada FK, o Postgres confere
-- as linhas com `institution_id` preenchido, que já satisfazem a FK antiga;
-- as travas duram só essa conferência.
--
-- Reversível (reabre o vazamento) via:
--   ALTER TABLE "<tabela>" DROP CONSTRAINT "<tabela>_institution_id_fkey";
--   ALTER TABLE "<tabela>" ADD CONSTRAINT "<tabela>_institution_id_fkey"
--     FOREIGN KEY ("institution_id") REFERENCES "institutions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
--   para <tabela> em encounters, guideline_chunks e protocols.

-- DropForeignKey
ALTER TABLE "encounters" DROP CONSTRAINT "encounters_institution_id_fkey";

-- DropForeignKey
ALTER TABLE "guideline_chunks" DROP CONSTRAINT "guideline_chunks_institution_id_fkey";

-- DropForeignKey
ALTER TABLE "protocols" DROP CONSTRAINT "protocols_institution_id_fkey";

-- AddForeignKey
ALTER TABLE "encounters" ADD CONSTRAINT "encounters_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "institutions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guideline_chunks" ADD CONSTRAINT "guideline_chunks_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "institutions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "protocols" ADD CONSTRAINT "protocols_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "institutions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
