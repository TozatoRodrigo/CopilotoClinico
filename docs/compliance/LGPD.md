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
2. Numa transação: apaga decisões por recomendação, reportes do copiloto,
   anexos, capturas de áudio, atendimentos (e, em cascata, documentos,
   interações IA, conversas guiadas e execuções de protocolo),
   consentimentos, refresh tokens, códigos de backup do MFA, pedidos de
   verificação de CRM, vínculos institucionais e estado do bloqueio de login;
   tira das chamadas de IA o vínculo com o médico; anonimiza o cadastro.
3. Registra `DATA_ERASURE` na trilha com as contagens e os nomes das colunas
   anonimizadas — nenhum valor do cadastro.

#### Decisão por tabela (CC-012)

A fonte é `src/modules/lgpd/erasure-policy.ts`, com o porquê de cada linha.
O que precisa ficar para a trilha ou para obrigação legal fica anonimizado;
o resto é apagado.

| Dado | Decisão | Por quê |
|---|---|---|
| Cadastro (`physicians`) | anonimizado | Fica como referente do `actor_id` da trilha. Nome, e-mail, senha, CRM (UF, número, verificação), MFA (segredo e flag) e idioma são substituídos; ficam id, papel, curador, assinatura e datas. |
| Códigos de backup do MFA | apagados | Credencial, sem valor de auditoria. |
| Pedidos de verificação de CRM | apagados | Fila do admin, com nota em texto livre. Quem pediu, quem decidiu e quando já estão na trilha (`CRM_VERIFICATION_*`). |
| Vínculos institucionais | apagados | Onde o médico trabalha; o vínculo fica na trilha (`PHYSICIAN_LINKED_TO_INSTITUTION`). A instituição fica. |
| Estado do bloqueio de login | apagado | Vale minutos. A chave é o SHA-256 sem sal do e-mail, reidentificável: sai também a linha sem `physician_id` achada pelo hash do e-mail. |
| Chamadas de IA (`ai_calls`) | anonimizadas | Custo e latência agregados ficam; `physician_id`, `encounter_id` e `request_id` viram NULL. A API só pode alterar essas três colunas (migration `20261015180000_cc_012_lgpd_erasure_privileges`). |
| Consentimentos | apagados | A prova do consentimento (Art. 8º, § 2º) fica na trilha. |

Colunas de autoria em registros que não são do médico (`reviewed_by` da
curadoria, `triaged_by`, `created_by` de protocolo, `resolved_by` de
verificação) continuam com o id, agora de um cadastro anonimizado.

**Tabela nova com dado do médico.** O teste
`src/modules/lgpd/erasure-policy.spec.ts` lê o schema e falha se aparecer
coluna `physician_id`, `user_id` ou FK para `physicians` fora da política e
da lista de exceções justificadas. Coluna nova no cadastro do médico não
compila até entrar em `anonymizedPhysician` ou em `PHYSICIAN_KEPT_COLUMNS`. O
teste de integração `cc-012-lgpd-erasure-complete` semeia cada tabela da
política e roda a eliminação com a role de runtime (`copiloto_app`).

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
