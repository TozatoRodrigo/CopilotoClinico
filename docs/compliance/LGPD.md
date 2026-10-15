# LGPD — Política de Dados do Copiloto Clínico

**Versão:** 1.0  
**Data:** 2026-06-05  
**Base legal:** LGPD (Lei 13.709/2018), CFM Resolução 2.217/2018

## Princípios aplicados

| Princípio LGPD (Art. 6) | Como implementado |
|---|---|
| **Finalidade** | Dados clínicos usados exclusivamente para assistência ao médico no atendimento |
| **Adequação** | Apenas dados necessários ao atendimento são coletados |
| **Necessidade** | `patientRef` é identificador opaco — não armazenamos identidade do paciente |
| **Livre acesso** | `GET /lgpd/data` — exportação completa dos dados do médico |
| **Qualidade** | Hash encadeado na auditoria garante integridade dos dados |
| **Transparência** | Banner de status do CRM no dashboard |
| **Segurança** | Audit log append-only (AUD-001), verificação de cadeia (AUD-003) |
| **Prevenção** | Sem coleta de PII de pacientes — pseudonimização via `patientRef` |
| **Não discriminação** | N/A |
| **Responsabilização** | Auditoria completa de todas as ações (AUD-005) |

## Dados armazenados

### Dados do Médico (Physician)
- ID, CRM (UF + número), email, nome, status de verificação CRM
- Tokens de refresh (hash SHA-256 — não o token original)
- Consentimentos LGPD

### Dados de Atendimento (Encounter)
- `patientRef`: **identificador opaco** fornecido pelo HIS/EMR do hospital (LGPD-001)
  - Não pode ser CPF, nome ou outro dado pessoal direto
  - Validado via regex no momento da criação
- Contexto clínico: disponibilidade de CT, laboratório, UTI, tipo de convênio

### Interações com IA (AiInteraction)
- `inputRedacted`: texto clínico com PII removido (CPF, telefone, email, etc.)
  - O `patientRef` também é substituído por `[PATIENT_REF_REDACTED]` (LGPD-005)
  - O texto original nunca é armazenado
- Output do modelo, incerteza, citações, custo, latência

### Documentos gerados (Document)
- Conteúdo SOAP/SBAR/etc. gerado pela IA
- Edições do médico, confirmação (com hash do conteúdo confirmado)

### Trilha de Auditoria (AuditLog)
- Todas as ações do sistema (login, geração, confirmação, etc.)
- Append-only (AUD-001): o trigger bloqueia UPDATE e DELETE; o REVOKE,
  TRUNCATE. A eliminação não alcança a trilha.
- Por isso o payload leva só IDs, enums, contagens, hashes e rótulos de
  catálogo (nome de protocolo, fonte de diretriz, nome e CNES de instituição).
  Nunca texto livre digitado por usuário nem dado pessoal:
  - **Nome de arquivo, email e número do CRM ficam de fora.** São curtos e
    previsíveis — o hash se reverte por dicionário ou força bruta. O
    `entityId` já identifica o anexo, o médico ou a solicitação de
    verificação.
  - **Comentário, nota e motivo vão como SHA-256** (`freeTextHash`, em
    `src/modules/audit/audit-payload.ts`). O texto fica na tabela do domínio;
    o hash prova que ele não foi trocado depois.

#### Entradas antigas não mudam

Antes desta regra entrar em produção, estes eventos gravaram texto livre ou
dado pessoal no payload:

| Ação | Campo | Conteúdo |
|---|---|---|
| `ENCOUNTER_ATTACHMENT_ADDED`, `ENCOUNTER_ATTACHMENT_REMOVED`, `PROMPT_INJECTION_DETECTED` (entity `EncounterAttachment`) | `filename` | nome do arquivo anexado |
| `COPILOT_FEEDBACK` | `comment` | comentário do médico (sem máscara antes do F0-D; com `maskFreeText` depois, que não pega nomes) |
| `CRM_VERIFICATION_APPROVED`, `CRM_VERIFICATION_REJECTED` | `notes` | nota do admin ou resposta crua da verificação automática |
| `PROTOCOL_RUN_ABANDONED` | `reason` | motivo digitado pelo médico |
| `GUIDELINE_REJECTED` | `reason` | motivo do curador ao rejeitar um trecho de diretriz (as telas de curadoria mandam um texto fixo; a API aceita texto livre) |
| `AUTH_REGISTER` | `email` | email do médico |
| `CRM_VERIFICATION_REQUESTED` | `crmNumber` | número do CRM do médico (com a UF, identifica o médico no cadastro público do CFM) |

Essas linhas ficam como estão. Corrigi-las exigiria desligar o trigger por
DDL, e reescrever um payload quebra a cadeia de hashes (AUD-003) dali em
diante. Num pedido de eliminação, essas entradas sobrevivem. As que têm o
médico como ator entram na exportação, então o titular pode vê-las.

Para levantar as linhas antigas de um titular:

```sql
SELECT id, action, created_at
FROM audit_log
WHERE actor_id = '<physician-id>'
  AND (
    (action IN ('ENCOUNTER_ATTACHMENT_ADDED', 'ENCOUNTER_ATTACHMENT_REMOVED',
                'PROMPT_INJECTION_DETECTED') AND payload ? 'filename')
    OR (action = 'COPILOT_FEEDBACK' AND payload ? 'comment')
    OR (action = 'PROTOCOL_RUN_ABANDONED' AND payload ? 'reason')
    OR (action = 'GUIDELINE_REJECTED' AND payload ? 'reason')
    OR (action = 'AUTH_REGISTER' AND payload ? 'email')
    OR (action = 'CRM_VERIFICATION_REQUESTED' AND payload ? 'crmNumber')
  );
```

As notas de verificação de CRM têm o admin como `actor_id`; filtre por
`payload->>'physicianId'`.

## Direitos do Titular (Médico)

| Direito (Art. 18) | Endpoint |
|---|---|
| Acesso | `GET /lgpd/data` |
| Portabilidade | `GET /lgpd/data` (formato JSON) |
| Eliminação | `DELETE /lgpd/erasure` |
| Revogação de consentimento | `DELETE /lgpd/consent/:scope` |

## Política de patientRef

O `patientRef` NUNCA deve ser:
- CPF do paciente (validação rejeita `^\d{11}$` e `\d{3}\.\d{3}\.\d{3}-\d{2}`)
- Nome completo (validação rejeita dois+ tokens capitalizados)

O `patientRef` DEVE ser:
- Número de prontuário do HIS: `PRN-2024-00123`
- UUID interno do hospital: `550e8400-e29b-41d4-a716-446655440000`
- Hash de CPF com salt por tenant (recomendado para R1/R2)
- Código opaco do sistema: `HOSP-XK9L-2024`

**Refs:** `docs/decisions/ADR-004-patient-ref-pseudonymization.md`

## Provider de IA

Ver `docs/compliance/DPA_PROVIDER.md` para requisitos de DPA com o provider externo.
