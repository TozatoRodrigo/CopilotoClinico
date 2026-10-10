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
| **Livre acesso** | `GET /lgpd/export` — exportação completa dos dados do médico |
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

### Referências anexadas ao atendimento (EncounterAttachment)
- Nome, tipo e tamanho do arquivo enviado pelo médico
- `text`: texto extraído **já mascarado de PII** (LGPD-005); o arquivo original nunca é gravado

### Capturas de áudio (AudioCapture)
- `encryptedContent`: áudio cifrado na própria linha do banco (não vai para o object storage)
- `transcribedText`: transcrição **já mascarada de PII**
- Metadados (tipo, tamanho, status) e `retainUntil` (30 dias)

### Documentos gerados (Document)
- Conteúdo SOAP/SBAR/etc. gerado pela IA
- Edições do médico, confirmação (com hash do conteúdo confirmado)
- PDF do documento confirmado no object storage (MinIO), referenciado por `pdfObjectKey`

### Trilha de Auditoria (AuditLog)
- Todas as ações do sistema (login, geração, confirmação, etc.)
- Payload nunca contém PII de pacientes — contém apenas IDs de entidades

## Direitos do Titular (Médico)

| Direito (Art. 18) | Endpoint |
|---|---|
| Acesso | `GET /lgpd/export` |
| Portabilidade | `GET /lgpd/export` (formato JSON) |
| Eliminação | `POST /lgpd/erasure` |
| Revogação de consentimento | `DELETE /lgpd/consent/:scope` |

### O que a exportação inclui

Todas as entidades acima, com uma exceção: o áudio cifrado (`encryptedContent`)
não é exportado. A captura vai com metadados e transcrição redigida — decifrar o
áudio poria a voz do paciente, sem máscara, num arquivo baixado pelo navegador.
Os anexos vão com o texto redigido inline: é todo o conteúdo que guardamos.

### O que a eliminação faz

1. Apaga do MinIO os PDFs dos documentos dos atendimentos do médico. Se o
   storage falhar, nada é apagado no banco e a resposta é 503 — o pedido pode
   ser repetido.
2. Numa transação: apaga anexos, capturas de áudio, atendimentos (e, em
   cascata, documentos, interações IA e execuções de protocolo),
   consentimentos e refresh tokens; anonimiza o cadastro do médico.
3. Registra `DATA_ERASURE` na trilha com as contagens apagadas.

A trilha de auditoria **não** é apagada (append-only, AUD-001): é registro de
obrigação legal (Art. 16, I). Pendência conhecida: as entradas de anexo
(`ENCOUNTER_ATTACHMENT_ADDED`, `ENCOUNTER_ATTACHMENT_REMOVED`,
`PROMPT_INJECTION_DETECTED`) guardam o nome do arquivo no payload, que pode
conter dado pessoal e sobrevive à eliminação.

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
