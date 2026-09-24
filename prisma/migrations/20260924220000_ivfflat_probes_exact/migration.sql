-- Busca vetorial exata em guideline_chunks (ivfflat.probes = lists).
--
-- Incidente de 24/09/2026 em produção: a migration F9 reescreveu
-- guideline_chunks e reconstruiu o índice ivfflat (lists = 100) sobre ~10 mil
-- vetores. Com o default `ivfflat.probes = 1`, a busca varre só o grupo mais
-- próximo e aplica o filtro de status DEPOIS. Como a base oficial
-- (`official_unreviewed`) é ~98% da tabela e a curada ~1%, consultas próximas
-- de conteúdo curado caíam em grupos sem trecho oficial: 35 de 109 consultas
-- de teste voltavam com a base oficial VAZIA (todas as de dengue).
--
-- probes = 100 = todas as listas: o planejador passa a fazer busca exata
-- (varredura sequencial, ~130 ms com 10 mil vetores). Nesta escala a
-- exatidão vale mais que os milissegundos; revisar (HNSW, ou iterative scan
-- do pgvector >= 0.8) se a tabela crescer uma ordem de grandeza.
--
-- ALTER DATABASE vale para conexões NOVAS: reiniciar a API depois de aplicar.
-- Idempotente. Reversível via:
--   DO $$ BEGIN EXECUTE format('ALTER DATABASE %I RESET ivfflat.probes', current_database()); END $$;
DO $$
BEGIN
  EXECUTE format('ALTER DATABASE %I SET ivfflat.probes = 100', current_database());
END $$;
