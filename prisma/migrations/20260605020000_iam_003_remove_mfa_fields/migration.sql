-- Migration: IAM-003 — Remoção dos campos MFA não implementados
-- Tarefa: https://app.clickup.com/t/90132565680/86ahx6fh1
--
-- DECISÃO: Opção B (honestidade > complexidade para R0)
--
-- Os campos mfa_enabled e mfa_secret existiam no schema mas não tinham
-- nenhum código de implementação associado (sem endpoints, sem serviço,
-- sem UI, sem recovery codes, sem criptografia do secret).
--
-- Manter campos sem implementação é tecnicamente dívida e conceitualmente
-- desonesto: sugere proteção que não existe. O risco é que um administrador
-- ou auditor assuma que MFA está disponível quando não está.
--
-- Plano para R1: implementar MFA TOTP completo com:
--   - Setup via QR code (otplib)
--   - mfaSecret criptografado em repouso (AES-256, não hash)
--   - Recovery codes (8 tokens de uso único)
--   - Rate limiting no endpoint de verificação (5 tentativas/5 min)
--   - Auditoria: AUTH_MFA_SETUP, AUTH_MFA_ENABLED, AUTH_MFA_FAILED
--
-- Ref: ADR-003 (docs/decisions/ADR-003-mfa-deferred.md)

ALTER TABLE physicians DROP COLUMN IF EXISTS mfa_enabled;
ALTER TABLE physicians DROP COLUMN IF EXISTS mfa_secret;
