-- Migration: IAM-004 — MFA TOTP completo
-- Tarefa: https://app.clickup.com/t/86ahx6gf0
--
-- Adiciona:
--   • mfa_enabled (boolean) na tabela physicians — controla se MFA está ativo
--   • tabela mfa_backup_codes — 8 recovery codes por usuário, hasheados (SHA-256)
--
-- O segredo TOTP (mfa_secret) já existe desde IAM-005.
-- Backup codes seguem o mesmo padrão dos refresh_tokens: só o hash é persistido.

ALTER TABLE physicians
  ADD COLUMN IF NOT EXISTS mfa_enabled BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN physicians.mfa_enabled IS
  'True quando MFA TOTP está configurado e confirmado pelo médico.';

CREATE TABLE IF NOT EXISTS mfa_backup_codes (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  physician_id  UUID        NOT NULL REFERENCES physicians(id) ON DELETE CASCADE,
  code_hash     CHAR(64)    NOT NULL,
  used_at       TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  mfa_backup_codes IS 'Recovery codes de MFA; apenas SHA-256(code) armazenado.';
COMMENT ON COLUMN mfa_backup_codes.code_hash IS 'SHA-256 do código plaintext mostrado uma única vez ao usuário.';

CREATE INDEX IF NOT EXISTS mfa_backup_codes_physician_id_idx
  ON mfa_backup_codes(physician_id);
