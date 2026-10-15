# LGPD — Política de Dados do Copiloto Clínico

**Versão:** 1.1  
**Data:** 2026-10-14  
**Base legal:** LGPD (Lei 13.709/2018), CFM Resolução 2.217/2018  
**Conferido contra:** `codex/production-readiness` (fa829a46). O que está só em
PR aberto aparece marcado como **em PR aberto (#N)**: ainda não vale em
produção.

O sistema trata dados de dois titulares:

- **Médico usuário:** cadastro, sessões, uso do sistema e trilha de auditoria.
- **Paciente:** identificado só por um `patientRef` opaco. O texto clínico que o
  médico escreve ou dita pode conter dado pessoal, e o sistema o mascara antes
  de gravar ou enviar a um modelo.

## Princípios aplicados

| Princípio LGPD (Art. 6) | Como implementado                                                                                                                                               |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Finalidade**          | Dados clínicos usados para assistir o médico no atendimento                                                                                                     |
| **Adequação**           | O caso clínico entra no prompt já redigido; a pesquisa web recebe só o entendimento do caso                                                                     |
| **Necessidade**         | `patientRef` é identificador opaco; o arquivo anexado não é gravado, só o texto mascarado; a transcrição direta não grava o áudio                               |
| **Livre acesso**        | `GET /v1/lgpd/export` — exportação em JSON dos dados do médico                                                                                                  |
| **Qualidade**           | Hash encadeado na auditoria (ADR-015) e `contentHash` nos documentos confirmados                                                                                |
| **Transparência**       | Página pública `/privacidade` e aba Privacidade em Configurações (exportar, eliminar, consentimentos)                                                           |
| **Segurança**           | Trilha append-only (AUD-001), verificação diária da cadeia, role de banco com menor privilégio, áudio e segredo de MFA cifrados (AES-256-GCM), cookies httpOnly |
| **Prevenção**           | Máscara de PII e redação do `patientRef` antes de qualquer gravação de texto clínico ou chamada a modelo; barreira de injeção                                   |
| **Não discriminação**   | N/A                                                                                                                                                             |
| **Responsabilização**   | Trilha de auditoria das ações clínicas e de conta; `ai_calls` registra cada chamada de IA sem texto                                                             |

## Como o texto clínico é protegido

Todo caso e toda resposta do médico passam por três passos antes de gravar e
antes do modelo (`screenClinicalText` em
`src/modules/copilot/guardrails/clinical-text-screening.ts`, e o mesmo
encadeamento no orquestrador):

1. `maskPII` troca por marcador: e-mail, CNPJ, CNS, CPF válido, telefone, CEP,
   data com contexto de nascimento e RG.
2. `redactPatientRef` troca o `patientRef` do atendimento por
   `[PATIENT_REF_REDACTED]`, mesmo que o médico o tenha digitado no texto.
3. `scanForInjection` recusa o pedido antes do modelo e audita só tamanho e
   sinais (`PROMPT_INJECTION_DETECTED`).

Limite conhecido: **nomes de pessoas não são detectados**. Um nome digitado no
caso chega ao banco e ao provedor de IA. A medição está em `pnpm eval:deid`; um
filtro com OpenMed está **em PR aberto (#172)**, só no harness de avaliação.

Notas de decisão, comentários de feedback e notas de triagem passam por
`maskFreeText` (a mesma máscara) antes de gravar.

## Onde há dado pessoal e por quanto tempo

O código não tem prazo automático de retenção para dados clínicos: eles ficam
até a eliminação pedida pelo médico. As exceções estão na coluna "Retenção".

### Banco (PostgreSQL)

| Tabela                                         | Dado pessoal                                                                                                 | Retenção                                                                                                                                 |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `physicians`                                   | Nome, e-mail, CRM (UF + número), hash bcrypt da senha, segredo de MFA cifrado, idioma, papel                 | Até a eliminação, que anonimiza nome, e-mail e senha. CRM e segredo de MFA ficam                                                         |
| `refresh_tokens`                               | SHA-256 do token, validade (7 dias no compose)                                                               | Apagados na eliminação                                                                                                                   |
| `mfa_backup_codes`                             | SHA-256 dos códigos                                                                                          | Não são apagados na eliminação                                                                                                           |
| `login_security_states`                        | SHA-256 do e-mail, tentativas falhas, bloqueio                                                               | Sem limpeza                                                                                                                              |
| `crm_verification_requests`                    | Status, notas do admin ou da checagem automática                                                             | Não são apagados na eliminação                                                                                                           |
| `physician_institutions`                       | Vínculo médico↔instituição                                                                                   | Não são apagados na eliminação                                                                                                           |
| `consents`                                     | Escopo, concessão, revogação                                                                                 | Apagados na eliminação                                                                                                                   |
| `encounters`                                   | `patientRef` opaco, recursos disponíveis, queixa principal derivada da 1ª análise                            | Até a eliminação                                                                                                                         |
| `case_intakes`                                 | Caso e respostas **já redigidos**, leitura do caso, perguntas                                                | Cascata do atendimento                                                                                                                   |
| `ai_interactions`                              | `input_redacted` (caso redigido), saída do modelo, respostas às perguntas, `request_id`                      | Cascata do atendimento                                                                                                                   |
| `recommendation_decisions`, `copilot_feedback` | Nota, comentário e nota de triagem já mascarados                                                             | Apagados na eliminação                                                                                                                   |
| `documents`                                    | Conteúdo gerado e editado; prescrição, alta e atestado levam o `patientRef`. O PDF leva nome e CRM do médico | Cascata do atendimento                                                                                                                   |
| `encounter_attachments`                        | Nome do arquivo e texto extraído **já mascarado**; o arquivo original nunca é gravado                        | Cascata do atendimento                                                                                                                   |
| `audio_captures`                               | Áudio cifrado (AES-256-GCM), transcrição mascarada, `retain_until` = upload + 30 dias                        | Hoje **nenhum job aplica o prazo**: o áudio fica até a eliminação do atendimento. A eliminação após 30 dias está **em PR aberto (#146)** |
| `protocol_runs`                                | Respostas do passo a passo, motivo de abandono                                                               | Cascata do atendimento                                                                                                                   |
| `audit_log`                                    | `actor_id`, ação, ids, **IP**, payload                                                                       | **Permanente** (append-only). Sobrevive à eliminação                                                                                     |
| `ai_calls`                                     | Ids do médico e do atendimento; só metadados, nenhum texto                                                   | **Permanente**, sem FK. Sobrevive à eliminação                                                                                           |

**Payloads da trilha com texto livre ou dado pessoal.** Hoje estes eventos gravam
texto que sobrevive à eliminação:

| Ação                                                                                              | Campo                                     |
| ------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| `AUTH_REGISTER`                                                                                   | `email`                                   |
| `CRM_VERIFICATION_REQUESTED`                                                                      | `crmUf`, `crmNumber`                      |
| `ENCOUNTER_ATTACHMENT_ADDED`, `ENCOUNTER_ATTACHMENT_REMOVED`, `PROMPT_INJECTION_DETECTED` (anexo) | `filename`                                |
| `COPILOT_FEEDBACK`                                                                                | `comment` (mascarado, sem detectar nomes) |
| `CRM_VERIFICATION_APPROVED`, `CRM_VERIFICATION_REJECTED`                                          | `notes`                                   |
| `PROTOCOL_RUN_ABANDONED`                                                                          | `reason`                                  |
| `GUIDELINE_REJECTED`                                                                              | `reason`                                  |

Tirar esses campos da trilha (hash do texto livre, texto na tabela do domínio)
está **em PR aberto (#147)**, que não trata o CRM de
`CRM_VERIFICATION_REQUESTED`. As entradas antigas não mudam: reescrevê-las
quebraria a cadeia de hashes. As decisões por recomendação e as respostas do
copiloto guiado já vão para a trilha só como hash.

### Fora do banco

| Onde                       | Dado                                                                                                                                                                                                                                          | Retenção                                                                                                                       |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Redis — fila `inference`   | `analyze` vindo de `POST .../copilot/analyze/async`: o pedido com o texto do caso **antes da redação** e o resultado. `transcribe`: ids no pedido e a transcrição mascarada no resultado; o `analyze` que ele enfileira leva essa transcrição | Job concluído 24 h, falho 7 dias (`removeOnComplete`/`removeOnFail`)                                                           |
| Redis — cache da busca     | Chave = SHA-256 da consulta; valor = trechos de diretriz                                                                                                                                                                                      | 60 s                                                                                                                           |
| Logs do container (stdout) | Linha de erro do log de acesso com o corpo da requisição sem os campos de credencial: **pode conter o texto do caso**. O log da checagem automática de CRM leva UF e número                                                                   | Sem rotação configurada no compose. Logar só os nomes dos campos do corpo está **em PR aberto (#168)**                         |
| Object storage (MinIO/S3)  | PDF do documento confirmado                                                                                                                                                                                                                   | Só com `MINIO_*`, que o compose de produção não repassa. Na eliminação o PDF fica órfão; apagá-lo está **em PR aberto (#142)** |
| Navegador do médico        | Rascunho do caso (`sessionStorage`), fila offline com o caso **sem máscara** (IndexedDB, até reenviar), perfil do médico (`localStorage`), cookies httpOnly `access_token` e `refresh_token`                                                  | Até enviar, fechar a aba ou sair                                                                                               |

## Suboperadores e o que cada um recebe

| Suboperador                                                 | O que recebe                                                                                                                                                         | Quando                                                                                                                                                                                                                       |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Anthropic** (`AI_PROVIDER=anthropic`, padrão do compose)  | Caso e respostas **já redigidos**, texto mascarado dos anexos, entendimento do caso; trechos de PCDT na classificação                                                | Leitura do caso, entendimento, decisão, verificação, sync da base oficial                                                                                                                                                    |
| **Anthropic — pesquisa web** (`web_search`, `web_fetch`)    | Só o entendimento (síndrome, hipóteses, dados que faltam), nunca o texto do caso                                                                                     | `COPILOT_KNOWLEDGE_SOURCE=web` ou `verify`                                                                                                                                                                                   |
| **Groq**                                                    | **Áudio do ditado, sem máscara** (Whisper `whisper-large-v3`; o compose fixa `WHISPER_BASE_URL` na Groq). A máscara só roda no texto que volta                       | Todo ditado (`POST /audio/transcribe`) e captura (`POST /encounters/:id/audio`)                                                                                                                                              |
| **Groq — perfil de etapa**                                  | Caso **já redigido**, se uma etapa usar `groq:<modelo>`                                                                                                              | Só com `AI_PROVIDER_PROFILES=groq` e um `AI_*_MODEL` apontando para o perfil                                                                                                                                                 |
| **OpenAI**                                                  | Texto para embedding: as consultas do entendimento (`stages`) ou o caso redigido (`legacy`); a consulta de diretrizes com `maskPII`; texto de diretrizes na ingestão | `EMBEDDING_PROVIDER=openai` (padrão do compose) com `COPILOT_KNOWLEDGE_SOURCE=internal_kb`, consulta e ingestão de diretrizes. O runbook registra a conta sem crédito desde 11/10/2026 e documenta `EMBEDDING_PROVIDER=none` |
| **Sentry**                                                  | Exceção, pilha e o que o SDK anexa do pedido (sem `beforeSend` próprio)                                                                                              | Só com `SENTRY_DSN`, que o compose de produção não repassa. Evento limpo e DSN no compose: **em PR aberto (#168)**                                                                                                           |
| **Umami** (autoalojado em `analytics.servidortozato.cloud`) | Visitas por página, sem cookie; as URLs levam só ids opacos                                                                                                          | Toda página do web em produção (`NEXT_PUBLIC_UMAMI_*` na imagem)                                                                                                                                                             |
| **Hostinger** (VPS)                                         | Hospeda banco, Redis, API, web e logs                                                                                                                                | Sempre (comentário de `docker/docker-compose.prod.yml`)                                                                                                                                                                      |
| Verificação de CRM                                          | UF e número do CRM                                                                                                                                                   | Só com `CRM_VERIFICATION_URL`, que o compose de produção não repassa                                                                                                                                                         |

A Conitec/gov.br só fornece PDFs públicos: o sync não envia dado pessoal.
Requisitos de DPA, retenção e região de cada provedor de IA:
`docs/compliance/DPA_PROVIDER.md`. Groq e Sentry no DPA: **em PR aberto
(#168)**.

## Direitos do titular (médico)

| Direito (Art. 18)              | Endpoint (prefixo `/v1`, médico logado)                                                  |
| ------------------------------ | ---------------------------------------------------------------------------------------- |
| Confirmação e acesso           | `GET /lgpd/export`                                                                       |
| Portabilidade                  | `GET /lgpd/export` (JSON, `exportVersion: lgpd-portability-v1`)                          |
| Correção                       | `PATCH /auth/me` (nome e idioma). E-mail e CRM não mudam pela API                        |
| Eliminação                     | `POST /lgpd/erasure` (corpo `{ "reason"?: string }`; o motivo não é gravado)             |
| Informação sobre consentimento | `GET /lgpd/consent`                                                                      |
| Consentimento                  | `POST /lgpd/consent` com `{ "scope": "ai_processing" \| "data_sharing" \| "analytics" }` |
| Revogação de consentimento     | `DELETE /lgpd/consent/:scope`                                                            |

O sistema não tem endpoint por `patientRef`: pedidos do paciente chegam pela
instituição ou pelo médico.

### O que a exportação inclui

`data` traz:

- o cadastro do médico, sem hash de senha, segredo de MFA nem `mfaEnabled`;
- `encounters`, `documents`, `aiInteractions` e `caseIntakes`;
- `recommendationDecisions` e `copilotFeedback`;
- `consents`;
- `auditLog`, só as entradas em que o médico é o ator.

Ficam de fora: anexos (`encounter_attachments`), capturas de áudio,
execuções de protocolo, pedidos de verificação de CRM, vínculos com
instituições, refresh tokens, códigos de backup do MFA e `ai_calls`. Anexos e
capturas de áudio (sem o áudio cifrado) estão **em PR aberto (#142, #149)**.

### O que a eliminação faz

Numa transação:

1. Apaga decisões por recomendação e feedback do médico.
2. Apaga os atendimentos. A cascata leva conversas do copiloto guiado,
   interações de IA, documentos, anexos, capturas de áudio, execuções de
   protocolo, decisões e feedback.
3. Apaga consentimentos e refresh tokens.
4. Anonimiza o cadastro: nome `ERASED`, e-mail `erased-<id>@erased.com`,
   senha inutilizada.

Depois registra `DATA_ERASURE` na trilha com as contagens e responde
`{ status: "completed", erased: { … } }`.

Continuam depois da eliminação:

- a trilha de auditoria (append-only, AUD-001), com IP e os payloads listados
  acima;
- `ai_calls`, com os ids do médico e dos atendimentos;
- CRM e segredo de MFA no cadastro, códigos de backup, pedidos de verificação
  de CRM, vínculos com instituições e o estado de bloqueio de login;
- jobs da fila no Redis até expirarem (24 h ou 7 dias);
- linhas de log já escritas;
- PDFs no object storage, quando configurado (**em PR aberto: #142**).

### Consentimento

O consentimento é registrado e auditado (`CONSENT_GRANTED`,
`CONSENT_REVOKED`), mas **nenhum fluxo o consulta hoje**: `checkConsent` não
tem chamador. Revogar `ai_processing` não impede novas análises.

## Divergências com a página pública `/privacidade`

A página (`web/src/app/privacidade/page.tsx`) promete mais do que o código faz:

- "A revogação interrompe novas análises por IA": a análise não consulta o
  consentimento.
- "Logs de auditoria … já anonimizados": a trilha guarda `actor_id`, IP e os
  payloads listados acima.
- "Endereço IP (com retenção mínima)": o IP fica em `audit_log.ip` sem prazo.
- "Filtro automático de PII (CPF, telefone, e-mail, datas)": confere, mas nomes
  não são detectados.

Corrigir o texto da página ou o código é decisão de produto e jurídica.

## Política de patientRef

O `patientRef` é opcional na criação do atendimento (consulta rápida). Para
gerar documento, o atendimento precisa dele. Quando preenchido, a validação
(`src/modules/encounters/schemas/encounter.schemas.ts`) rejeita:

- CPF: `^\d{11}$` e `^\d{3}\.\d{3}\.\d{3}-\d{2}$`;
- nome completo: duas ou mais palavras com inicial maiúscula (com acentos);
- mais de 50 caracteres.

O `patientRef` DEVE ser:

- Número de prontuário do HIS: `PRN-2024-00123`
- UUID interno do hospital: `550e8400-e29b-41d4-a716-446655440000`
- Hash de CPF com salt por instituição
- Código opaco do sistema: `HOSP-XK9L-2024`

A trilha registra só se o atendimento está identificado (`identified`), nunca
o valor.

**Refs:** `docs/decisions/ADR-004-patient-ref-pseudonymization.md`

## Provider de IA

Ver `docs/compliance/DPA_PROVIDER.md` para requisitos de DPA com os provedores
externos.
