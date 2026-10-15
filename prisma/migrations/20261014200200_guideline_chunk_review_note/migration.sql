-- Motivo da rejeição de um chunk pelo curador sai da trilha de auditoria.
--
-- `GuidelinesService.rejectChunk` gravava o `reason` cru no payload de
-- GUIDELINE_REJECTED, e a trilha era o único lugar onde ele existia.
-- `audit_log` é append-only (AUD-001) e a eliminação (LGPD) não a alcança, então
-- texto livre não pode ir para lá: o motivo passa a ficar aqui, mascarado, e o
-- payload leva só o hash (ver docs/compliance/LGPD.md → "Trilha de Auditoria").
--
-- Não toca em audit_log: as entradas antigas de GUIDELINE_REJECTED mantêm o
-- `reason` e não são copiadas para esta coluna.
--
-- Coluna nullable sem default: só muda o catálogo, sem reescrever a tabela nem
-- reconstruir o índice ivfflat (ver docs/runbook.md → "Migration que reescreve
-- `guideline_chunks`"). O GRANT de tabela de copiloto_app
-- (20260605030000_aud_002_db_least_privilege) já cobre a coluna nova.
--
-- Reversível via:
--   ALTER TABLE "guideline_chunks" DROP COLUMN "review_note";

ALTER TABLE "guideline_chunks" ADD COLUMN "review_note" TEXT;
