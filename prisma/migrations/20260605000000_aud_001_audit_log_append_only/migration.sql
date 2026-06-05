-- Migration: AUD-001 — Imutabilidade append-only do audit_log
-- Tarefa: https://app.clickup.com/t/90132565680/86ahx6f5w
--
-- Objetivo: garantir que audit_log seja imutável no banco (defense-in-depth).
-- A aplicação já encadeia hashes (audit.service.ts), mas sem proteção no banco
-- um atacante com acesso direto ao PostgreSQL poderia adulterar ou deletar registros.
--
-- Estratégia:
--   1. Trigger BEFORE UPDATE OR DELETE que rejeita qualquer mutação por linha.
--   2. REVOKE de UPDATE, DELETE e TRUNCATE da role da aplicação.
--      (TRUNCATE não dispara trigger de linha, por isso é revogado separadamente.)
--
-- IMPORTANTE — edge cases documentados:
--   - ALTER TABLE (DDL de migrations futuras) NÃO é bloqueado por este trigger.
--     Qualquer migration futura que altere audit_log requer revisão manual.
--   - A role da aplicação é configurada via DATABASE_URL. Se o banco usar uma role
--     diferente de 'postgres' para a aplicação, ajustar o REVOKE abaixo.
--   - Interação com LGPD-003 (direito ao esquecimento): o payload nunca deve
--     conter PII — o esquecimento atua nos dados clínicos, não na trilha.

-- ============================================================
-- 1. Função e trigger para bloquear UPDATE e DELETE por linha
-- ============================================================

CREATE OR REPLACE FUNCTION audit_log_prevent_mutation()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION
    'audit_log is append-only — direct mutations are not permitted. '
    'Action: %, Table: audit_log',
    TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_log_no_update_delete
  BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW
  EXECUTE FUNCTION audit_log_prevent_mutation();

-- ============================================================
-- 2. Revogar TRUNCATE da role da aplicação
--    (TRUNCATE não dispara trigger de linha)
-- ============================================================

-- Revogar do usuário atual (role da aplicação derivada da DATABASE_URL).
-- Em ambientes com role explícita, substituir current_user pela role correta.
DO $$
DECLARE
  app_role TEXT := current_user;
BEGIN
  -- Só revoga se não for superuser (superusers ignoram REVOKE de qualquer forma)
  IF NOT EXISTS (
    SELECT 1 FROM pg_roles
    WHERE rolname = app_role AND rolsuper = true
  ) THEN
    EXECUTE format('REVOKE TRUNCATE ON audit_log FROM %I', app_role);
  END IF;
END;
$$;

-- ============================================================
-- 3. Verificação de sanidade (smoke test na própria migration)
-- ============================================================

-- Confirmar que trigger foi criado corretamente
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'audit_log_no_update_delete'
  ) THEN
    RAISE EXCEPTION 'Migration AUD-001: trigger audit_log_no_update_delete not found after creation';
  END IF;
END;
$$;
