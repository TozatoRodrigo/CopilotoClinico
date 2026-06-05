-- Migration: IAM-001 — Estado honesto de verificação de CRM
-- Tarefa: https://app.clickup.com/t/90132565680/86ahx6ffj
--
-- Adiciona o campo crm_verified à tabela physicians.
-- Default false = honesto: nenhum médico existente tem CRM verificado
-- (pois o sistema ainda não validou nenhum). Isso é intencional — honestidade
-- sobre o estado real do sistema é o objetivo desta tarefa.
--
-- Interação com LGPD: o campo crm_verified não contém dados pessoais,
-- apenas um status de verificação. Seguro para audit_log.
--
-- Nota: a verificação real contra a API do CFM é backlog R1.
-- Por ora, o campo é setado manualmente ou via processo administrativo.

ALTER TABLE physicians
  ADD COLUMN crm_verified BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN physicians.crm_verified IS
  'Indica se o CRM do médico foi verificado contra fonte oficial (API CFM). '
  'Default false — verificação real planejada para R1.';
