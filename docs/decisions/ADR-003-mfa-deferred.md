# ADR-003: MFA Diferido para R1

**Status:** Aceito  
**Data:** 2026-06-05  
**Tarefa:** IAM-003 — https://app.clickup.com/t/90132565680/86ahx6fh1

## Contexto

Os campos `mfa_enabled` e `mfa_secret` existiam no modelo `Physician` mas não havia nenhum código de implementação associado: sem endpoints de setup/verificação, sem serviço TOTP, sem recovery codes, sem criptografia do secret, sem UI.

Manter infraestrutura de segurança incompleta é pior do que não tê-la: sugere proteção que não existe e pode enganar auditores ou parceiros hospitalares.

## Decisão

**Remover os campos para R0. Implementar MFA completo em R1.**

Os campos `mfa_enabled` e `mfa_secret` foram removidos do schema via migration `20260605020000_iam_003_remove_mfa_fields`.

## Consequências

### Positivas
- Schema honesto — nenhum campo implica funcionalidade inexistente
- Sem surface de ataque por secret armazenado sem criptografia
- Código mais simples e auditável

### Negativas
- MFA não disponível no R0 (pre-demo)
- Será necessária nova migration em R1

## Plano para R1 (MFA Completo)

Quando implementado, o MFA seguirá estas garantias:

1. **TOTP via `otplib`** — RFC 6238
2. **`mfaSecret` criptografado em repouso** — AES-256 com `AES_SECRET` do `.env` (nunca hash)
3. **Recovery codes** — 8 tokens de uso único, armazenados como hashes bcrypt
4. **Rate limiting** — máximo 5 tentativas / 5 min no endpoint de verificação
5. **Auditoria completa** — `AUTH_MFA_SETUP`, `AUTH_MFA_ENABLED`, `AUTH_MFA_FAILED`, `AUTH_MFA_RECOVERY_USED`
6. **Graceful degradation** — médico sem MFA segue fluxo normal; com MFA, segunda etapa obrigatória

## Alternativa Rejeitada

Implementar MFA TOTP no R0. Rejeitado por: (a) esforço estimado 2-3 sprints para fazer corretamente; (b) recovery codes são essenciais para produção — sem eles, qualquer perda de dispositivo bloqueia acesso ao sistema médico; (c) `mfaSecret` sem criptografia seria um risco de segurança pior que não ter MFA.
