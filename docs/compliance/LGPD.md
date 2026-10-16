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
| **Livre acesso** | `GET /lgpd/export` — exportação completa dos dados do médico |
| **Qualidade** | Hash encadeado na auditoria garante integridade dos dados |
| **Transparência** | Banner de status do CRM no dashboard |
| **Segurança** | Audit log append-only (AUD-001), verificação de cadeia (AUD-003), texto clínico cifrado em repouso (AES-256-GCM, CC-207/ADR-021) |
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

### Referências anexadas ao atendimento (EncounterAttachment)
- Nome, tipo e tamanho do arquivo enviado pelo médico
- `text`: texto extraído **já mascarado de PII** (LGPD-005); o arquivo original nunca é gravado

### Cifra em repouso do texto clínico (CC-207, ADR-021)
Com `CLINICAL_TEXT_ENCRYPTION=on`, o texto clínico já mascarado é gravado
cifrado (AES-256-GCM, chave `FIELD_ENCRYPTION_KEY` fora do banco): caso,
saída do modelo, citações, respostas, motivo da incerteza, conversa antes do
plano, anexos, transcrições, queixa principal, documentos, notas de decisão,
comentários de feedback e respostas de protocolo. Um dump do banco lido sem a
chave não mostra esse texto. Ficam em claro, com o motivo na ADR-021: o
`patientRef` (identificador opaco, usado na busca), metadados e a trilha de
auditoria (append-only).

### Documentos gerados (Document)
- Conteúdo SOAP/SBAR/etc. gerado pela IA
- Edições do médico, confirmação (com hash do conteúdo confirmado)
- PDF do documento confirmado no object storage (MinIO), referenciado por `pdfObjectKey`

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
    eliminação (`POST /lgpd/erasure`).
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
| Acesso | `GET /lgpd/export` |
| Portabilidade | `GET /lgpd/export` (formato JSON) |
| Eliminação | `POST /lgpd/erasure` |
| Revogação de consentimento | `DELETE /lgpd/consent/:scope` |

### O que a exportação inclui

`data` traz, do médico: cadastro (sem hash de senha nem segredo de MFA),
`encounters`, `encounterAttachments`, `documents`, `aiInteractions`,
`caseIntakes`, `recommendationDecisions`, `copilotFeedback`, `audioCaptures`,
`consents` e `auditLog`. Refresh tokens não entram.

Os anexos (`encounterAttachments`) vão com o texto redigido inline: é todo o
conteúdo que guardamos.

As capturas de áudio (`audioCaptures`) vão com metadados (id, atendimento, tipo
MIME, tamanho, status, `retainUntil`, datas) e a transcrição já mascarada de PII.
O áudio cifrado (`encryptedContent`) não é exportado: está cifrado com a chave do
servidor, e decifrá-lo poria a voz do paciente, sem máscara, num arquivo baixado
pelo navegador. Entram todas as capturas, qualquer que seja o status, inclusive
`deleted`, quando o áudio já foi eliminado na retenção.

### O que a eliminação faz

1. Apaga do MinIO os PDFs dos documentos dos atendimentos do médico. Se o
   storage falhar, nada é apagado no banco e a resposta é 503 — o pedido pode
   ser repetido.
2. Numa transação: apaga decisões por recomendação, reportes do copiloto,
   anexos, capturas de áudio, atendimentos (e, em cascata, documentos,
   interações IA e execuções de protocolo), consentimentos e refresh tokens;
   anonimiza o cadastro do médico.
3. Registra `DATA_ERASURE` na trilha com as contagens apagadas.

A trilha de auditoria **não** é apagada (append-only, AUD-001): é registro de
obrigação legal (Art. 16, I). O payload não leva texto livre nem dado pessoal;
entradas gravadas antes dessa regra podem levar e não mudam — ver "Trilha de
Auditoria" acima.

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
