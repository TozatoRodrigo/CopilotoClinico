# LGPD — Política de Dados do Copiloto Clínico

**Versão:** 1.1  
**Data:** 2026-10-10  
**Base legal:** LGPD (Lei 13.709/2018), CFM Resolução 2.217/2018

## Princípios aplicados

| Princípio LGPD (Art. 6) | Como implementado |
|---|---|
| **Finalidade** | Dados clínicos usados exclusivamente para assistência ao médico no atendimento |
| **Adequação** | Apenas dados necessários ao atendimento são coletados |
| **Necessidade** | `patientRef` é identificador opaco — não armazenamos identidade do paciente; áudio de captura eliminado 30 dias após o upload |
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

### Capturas de áudio (AudioCapture)

Gravadas por `POST /encounters/:encounterId/audio` para transcrição (Whisper).

- **Áudio** (`encryptedContent`): cifrado com AES-256-GCM (`CryptoService`) e
  retido por **30 dias** a partir do upload (`retainUntil`).
- **Eliminação**: o `AudioRetentionCronService` roda de hora em hora (minuto 15,
  UTC), apaga o áudio das capturas vencidas (`encryptedContent = NULL`) e marca
  a captura como `deleted`. O áudio não sobrevive mais que ~1h ao prazo. Se uma
  captura falhar, ela continua elegível na hora seguinte e o job alerta (log
  `ERROR` + Sentry, só com contagens).
- **Transcrição** (`transcribedText`): gravada já com PII mascarada
  (`maskPII`); o texto sem máscara nunca é persistido.
- **O que fica depois da eliminação** (lápide): id, encontro, médico, tipo MIME,
  tamanho, datas e a transcrição mascarada. A linha não é apagada porque:
  - a transcrição mascarada é o mesmo texto que entra na análise e já fica em
    `AiInteraction.inputRedacted` pelo tempo de vida do atendimento. Apagá-la
    aqui não reduziria dado nenhum e perderia a proveniência da análise (de
    qual captura veio o texto);
  - a trilha de auditoria (`AUDIO_UPLOAD`, `AUDIO_PIPELINE_QUEUED`,
    `AUDIO_RETENTION_PURGE`) aponta para o id da captura. Com a lápide, a trilha
    continua resolvível e dá para provar por consulta que nenhum áudio passou do
    prazo;
  - a lápide sai junto com o atendimento (`ON DELETE CASCADE`) no direito de
    eliminação (`DELETE /lgpd/erasure`).
- **Garantias**:
  - CHECK no banco (`audio_captures_content_matches_status`):
    `status = 'deleted'` ⇔ `encrypted_content IS NULL`. Nenhuma captura
    eliminada guarda áudio, e nenhuma volta a um status ativo depois de
    eliminada.
  - Cada eliminação grava `AUDIO_RETENTION_PURGE` na trilha **na mesma
    transação** (ator `system`, payload só com `encounterId` e `physicianId`):
    ou as duas coisas acontecem, ou nenhuma.
  - Reexecutar o job, ou rodá-lo em réplicas concorrentes, não elimina nem
    audita a mesma captura duas vezes.
- **Transcrição direta** (`POST /audio/transcribe`, tela de Captura): o áudio
  não é persistido; só o hash SHA-256 vai para a trilha (`AUDIO_TRANSCRIBE`).

### Trilha de Auditoria (AuditLog)
- Todas as ações do sistema (login, geração, confirmação, etc.)
- Payload nunca contém PII de pacientes — contém apenas IDs de entidades

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
