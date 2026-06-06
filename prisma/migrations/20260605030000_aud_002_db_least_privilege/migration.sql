-- Migration: AUD-002 — Role de banco de menor privilegio
-- Tarefa: https://app.clickup.com/t/90132565680/86ahx6fqk
--
-- Objetivo: separar os privilegios da aplicacao dos privilegios de owner/migration.
-- A aplicacao deve operar por uma role sem superuser, sem createdb, sem createrole
-- e sem poderes destrutivos sobre audit_log.
--
-- Modelo operacional:
--   - migrations rodam com a role owner/admin definida em MIGRATION_DATABASE_URL;
--   - a API roda com um usuario LOGIN membro da role NOLOGIN `copiloto_app`;
--   - `copiloto_app` recebe DML minimo nas tabelas da aplicacao;
--   - em audit_log, `copiloto_app` recebe apenas SELECT e INSERT.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'copiloto_app') THEN
    CREATE ROLE copiloto_app
      NOLOGIN
      NOSUPERUSER
      NOCREATEDB
      NOCREATEROLE
      NOREPLICATION;
  ELSE
    ALTER ROLE copiloto_app
      NOLOGIN
      NOSUPERUSER
      NOCREATEDB
      NOCREATEROLE
      NOREPLICATION;
  END IF;
END;
$$;

-- Reduzir superficie padrao do schema publico. A aplicacao pode usar objetos
-- existentes, mas nao criar novos objetos no schema.
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
REVOKE CREATE ON SCHEMA public FROM copiloto_app;
GRANT USAGE ON SCHEMA public TO copiloto_app;

-- Permissoes gerais de operacao da API.
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO copiloto_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO copiloto_app;

-- A aplicacao nunca precisa escrever no ledger interno de migrations.
REVOKE ALL ON TABLE _prisma_migrations FROM copiloto_app;

-- Permissoes para tabelas futuras criadas por migrations executadas pela role
-- atual. Mantem o padrao seguro para novos objetos sem exigir grants manuais.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO copiloto_app;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO copiloto_app;

-- audit_log e append-only: a aplicacao escreve novos eventos e le historico,
-- mas nao pode alterar, apagar ou truncar a trilha.
REVOKE UPDATE, DELETE, TRUNCATE ON audit_log FROM copiloto_app;
GRANT SELECT, INSERT ON audit_log TO copiloto_app;

-- Defesa explicita contra grants herdados por PUBLIC.
REVOKE UPDATE, DELETE, TRUNCATE ON audit_log FROM PUBLIC;

-- Smoke checks da propria migration.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_roles
    WHERE rolname = 'copiloto_app'
      AND rolsuper = false
      AND rolcreatedb = false
      AND rolcreaterole = false
      AND rolreplication = false
  ) THEN
    RAISE EXCEPTION 'Migration AUD-002: role copiloto_app is missing or overprivileged';
  END IF;

  IF has_table_privilege('copiloto_app', 'audit_log', 'TRUNCATE') THEN
    RAISE EXCEPTION 'Migration AUD-002: copiloto_app still has TRUNCATE on audit_log';
  END IF;

  IF has_table_privilege('copiloto_app', 'audit_log', 'DELETE') THEN
    RAISE EXCEPTION 'Migration AUD-002: copiloto_app still has DELETE on audit_log';
  END IF;
END;
$$;
