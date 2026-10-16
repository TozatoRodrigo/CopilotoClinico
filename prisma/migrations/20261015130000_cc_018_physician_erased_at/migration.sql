-- Migration: CC-018 — marcador explícito de cadastro eliminado (LGPD Art. 18, VI)
--
-- A estratégia JWT e o refresh recusam a sessão de quem tem erased_at: sem
-- isso, o access token de um médico eliminado seguia válido até expirar.
--
-- Aditiva: coluna nula sem default é só metadado no PostgreSQL. O GRANT de
-- copiloto_app é por tabela e já cobre a coluna nova.
ALTER TABLE "physicians" ADD COLUMN "erased_at" TIMESTAMP(3);

-- Cadastros eliminados antes desta migration: a eliminação grava
-- password_hash = 'erased:<id>', que nenhum cadastro ativo tem (o hash bcrypt
-- começa com '$2'). updated_at é a melhor aproximação da data da eliminação.
UPDATE "physicians"
SET "erased_at" = "updated_at"
WHERE "password_hash" LIKE 'erased:%' AND "erased_at" IS NULL;
