-- Migration: IAM-005 — Criptografia de campos sensíveis em repouso
-- Tarefa: https://app.clickup.com/t/86ahx6ghe
--
-- Adiciona coluna mfa_secret à tabela physicians.
-- O valor é criptografado com AES-256-GCM pela CryptoService antes de ser
-- persistido. A chave é gerenciada fora do banco (FIELD_ENCRYPTION_KEY).
-- Plaintext nunca é armazenado; descriptografia ocorre apenas em runtime.
--
-- Dependência: CryptoService (src/shared/crypto/crypto.service.ts)

ALTER TABLE physicians
  ADD COLUMN IF NOT EXISTS mfa_secret TEXT;

COMMENT ON COLUMN physicians.mfa_secret IS
  'AES-256-GCM encrypted TOTP secret (iv:authTag:ciphertext, hex). Plaintext never stored.';
