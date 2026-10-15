-- CC-207 / ADR-020: a queixa principal é texto clínico e passa a ser gravada
-- cifrada (enc:v1:…, bem maior que o texto), o que não cabe em VARCHAR(140).
-- O limite de 140 caracteres continua na aplicação (deriveChiefComplaint).
-- VARCHAR -> TEXT é binariamente compatível no PostgreSQL: só muda o
-- catálogo, sem reescrever a tabela. A versão anterior da API roda igual
-- sobre a coluna TEXT (rollback sem migration reversa).
-- AlterColumn
ALTER TABLE "encounters" ALTER COLUMN "chief_complaint" SET DATA TYPE TEXT;
