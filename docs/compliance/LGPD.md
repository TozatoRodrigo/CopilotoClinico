# LGPD — Política de Dados do Copiloto Clínico

**Versão:** 1.1  
**Data:** 2026-10-16  
**Base legal:** LGPD (Lei 13.709/2018), CFM Resolução 2.217/2018  
**Conferido contra:** `main` em 16/10/2026. O que está só em PR aberto aparece
marcado como **em PR aberto (#N)**: ainda não vale em produção.

O sistema trata dados de dois titulares:

- **Médico usuário:** cadastro, sessões, uso do sistema e trilha de auditoria.
- **Paciente:** identificado só por um `patientRef` opaco. O texto clínico que o
  médico escreve ou dita pode conter dado pessoal, e o sistema o mascara antes
  de gravar ou enviar a um modelo.

## Princípios aplicados

| Princípio LGPD (Art. 6) | Como implementado                                                                                                                                                                                                           |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Finalidade**          | Dados clínicos usados para assistir o médico no atendimento                                                                                                                                                                 |
| **Adequação**           | O caso clínico entra no prompt já redigido; a pesquisa web recebe só o entendimento do caso                                                                                                                                 |
| **Necessidade**         | `patientRef` é identificador opaco; o arquivo anexado não é gravado, só o texto mascarado; a transcrição direta não grava o áudio; o áudio de captura é eliminado 30 dias após o upload                                    |
| **Livre acesso**        | `GET /v1/lgpd/export` — exportação em JSON dos dados do médico                                                                                                                                                              |
| **Qualidade**           | Hash encadeado na auditoria (ADR-015) e `contentHash` nos documentos confirmados                                                                                                                                            |
| **Transparência**       | Página pública `/privacidade` e aba Privacidade em Configurações (exportar, eliminar, consentimentos)                                                                                                                       |
| **Segurança**           | Trilha append-only (AUD-001), verificação diária da cadeia, role de banco com menor privilégio, áudio e segredo de MFA cifrados (AES-256-GCM), texto clínico cifrado em repouso (CC-207, ADR-021), cookies httpOnly |
| **Prevenção**           | Máscara de PII e redação do `patientRef` antes de qualquer gravação de texto clínico ou chamada a modelo; barreira de injeção                                                                                               |
| **Não discriminação**   | N/A                                                                                                                                                                                                                         |
| **Responsabilização**   | Trilha de auditoria das ações clínicas e de conta; `ai_calls` registra cada chamada de IA sem texto                                                                                                                         |

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

### Cifra em repouso do texto clínico (CC-207, ADR-021)

Com `CLINICAL_TEXT_ENCRYPTION=on`, o texto clínico já mascarado é gravado
cifrado (AES-256-GCM, chave `FIELD_ENCRYPTION_KEY` fora do banco): caso,
saída do modelo, citações, respostas, motivo da incerteza, conversa antes do
plano, anexos, transcrições, queixa principal, documentos, notas de decisão,
comentários de feedback e respostas de protocolo. Um dump do banco lido sem a
chave não mostra esse texto. Ficam em claro, com o motivo na ADR-021: o
`patientRef` (identificador opaco, usado na busca), metadados e a trilha de
auditoria (append-only). O padrão da flag é `off`: até alguém ligá-la e rodar
`pnpm crypto:encrypt-clinical-text`, o texto continua em claro no banco.

## Onde há dado pessoal e por quanto tempo

O código não tem prazo automático de retenção para dados clínicos: eles ficam
até a eliminação pedida pelo médico. As exceções estão na coluna "Retenção".

### Banco (PostgreSQL)

| Tabela                                         | Dado pessoal                                                                                                  | Retenção                                                                                                                                       |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `physicians`                                   | Nome, e-mail, CRM (UF + número), hash bcrypt da senha, segredo de MFA cifrado, idioma, especialidade, papel   | Até a eliminação, que anonimiza nome, e-mail e senha, apaga a especialidade e grava `erased_at` (a sessão cai). CRM e segredo de MFA ficam |
| `refresh_tokens`                               | SHA-256 do token, validade (7 dias no compose)                                                                | Apagados na eliminação                                                                                                                         |
| `external_identities`                          | Conta Google/Microsoft vinculada (CC-334): provedor, `sub`, e-mail no momento do vínculo e datas. Conta criada pelo login social não tem senha (`password_hash` nulo) | Apagadas na eliminação: a conta externa deixa de entrar. Na trilha, login social e vínculo levam só o provedor e o motivo da falha |
| `mfa_backup_codes`                             | SHA-256 dos códigos                                                                                           | Não são apagados na eliminação                                                                                                                 |
| `login_security_states`                        | SHA-256 do identificador do contador, id do médico, tentativas falhas, bloqueio (CC-025)                      | Sem limpeza                                                                                                                                    |
| `crm_verification_requests`                    | Status, notas do admin ou da checagem automática                                                              | Não são apagados na eliminação                                                                                                                 |
| `physician_institutions`                       | Vínculo médico↔instituição                                                                                    | Não são apagados na eliminação                                                                                                                 |
| `practice_sites`                               | Nome e recursos dos locais de plantão do médico (CC-602)                                                      | Apagados na eliminação                                                                                                                         |
| `consents`                                     | Escopo, concessão, revogação                                                                                  | Apagados na eliminação                                                                                                                         |
| `encounters`                                   | `patientRef` opaco, recursos disponíveis, queixa principal derivada da 1ª análise                             | Até a eliminação                                                                                                                               |
| `case_intakes`                                 | Caso e respostas **já redigidos**, leitura do caso, perguntas                                                 | Cascata do atendimento                                                                                                                         |
| `ai_interactions`                              | `input_redacted` (caso redigido), saída do modelo, respostas às perguntas, `request_id`                       | Cascata do atendimento                                                                                                                         |
| `recommendation_decisions`, `copilot_feedback` | Nota, comentário e nota de triagem já mascarados                                                              | Apagados na eliminação                                                                                                                         |
| `knowledge_gaps`                               | "Não encontrei o que precisava" (CC-703): síndrome, consultas da busca e nota já mascarada; sem coluna de médico | Cascata da análise, na eliminação                                                                                                           |
| `mentoring_requests`                           | Caso e plano já mascarados, dúvida e resposta da mentoria (CC-707)                                            | Os pedidos do médico são apagados na eliminação. As respostas que ele deu como mentor ficam no caso de quem pediu, com o nome anonimizado     |
| `documents`                                    | Conteúdo gerado e editado; prescrição, alta e atestado levam o `patientRef`. O PDF leva nome e CRM do médico  | Cascata do atendimento                                                                                                                         |
| `encounter_attachments`                        | Nome do arquivo e texto extraído **já mascarado**; o arquivo original nunca é gravado                         | Apagados na eliminação                                                                                                                         |
| `audio_captures`                               | Áudio cifrado (AES-256-GCM), transcrição mascarada, `retain_until` = upload + 30 dias                         | O áudio sai 30 dias após o upload (ver "Capturas de áudio"); a linha fica como lápide até a eliminação                                       |
| `protocol_runs`                                | Respostas do passo a passo, motivo de abandono                                                                | Cascata do atendimento                                                                                                                         |
| `audit_log`                                    | `actor_id`, ação, ids, **IP**, payload                                                                        | **Permanente** (append-only). Sobrevive à eliminação                                                                                           |
| `ai_calls`                                     | Ids do médico e do atendimento; só metadados, nenhum texto                                                    | **Permanente**, sem FK. Sobrevive à eliminação                                                                                                 |

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
  - a lápide sai no direito de eliminação (`POST /lgpd/erasure`).
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

### Trilha de auditoria (AuditLog)

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
- As decisões por recomendação e as respostas do copiloto guiado também vão
  para a trilha só como hash.

#### Entradas antigas não mudam

Antes desta regra entrar em produção, estes eventos gravaram texto livre ou
dado pessoal no payload:

| Ação                                                                                                                    | Campo       | Conteúdo                                                                                                                   |
| ----------------------------------------------------------------------------------------------------------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------- |
| `ENCOUNTER_ATTACHMENT_ADDED`, `ENCOUNTER_ATTACHMENT_REMOVED`, `PROMPT_INJECTION_DETECTED` (entity `EncounterAttachment`) | `filename`  | nome do arquivo anexado                                                                                                    |
| `COPILOT_FEEDBACK`                                                                                                      | `comment`   | comentário do médico (sem máscara antes do F0-D; com `maskFreeText` depois, que não pega nomes)                            |
| `CRM_VERIFICATION_APPROVED`, `CRM_VERIFICATION_REJECTED`                                                                | `notes`     | nota do admin ou resposta crua da verificação automática                                                                   |
| `PROTOCOL_RUN_ABANDONED`                                                                                                | `reason`    | motivo digitado pelo médico                                                                                                |
| `GUIDELINE_REJECTED`                                                                                                    | `reason`    | motivo do curador ao rejeitar um trecho de diretriz (as telas de curadoria mandam um texto fixo; a API aceita texto livre) |
| `AUTH_REGISTER`                                                                                                         | `email`     | email do médico                                                                                                            |
| `CRM_VERIFICATION_REQUESTED`                                                                                            | `crmNumber` | número do CRM do médico (com a UF, identifica o médico no cadastro público do CFM)                                         |

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

### Beta por convite (CC-702)

- **Lista de espera** (`beta_waitlist_entries`): e-mail, perfil opcional
  (formação, local de plantão e porte, UF, capital/interior) e a data do
  consentimento explícito para contato — sem ele nada é gravado. Apagada a
  pedido no console admin; a eliminação da conta com o mesmo e-mail também a
  apaga, e a portabilidade a inclui. Quem já tem conta não entra na lista.
- **Participante** (`beta_participants`): de qual convite a conta veio, versão
  e data do aceite do termo do beta e o mesmo perfil. Na eliminação, termo e
  perfil são apagados; ficam só os ids, para a contagem do lote.
- **Convites** (`beta_invites`): código aleatório, sem dado pessoal.
- Na trilha, os eventos do beta (`BETA_INVITE_REDEEMED`, `BETA_WAITLIST_*`,
  `BETA_TERMS_ACCEPTED`, `BETA_PROFILE_UPDATED`) levam ids, o lote, a versão do
  termo e os nomes dos campos — nunca e-mail, código ou os valores do perfil.
- Pendente: prazo de retenção da lista de espera e menção na Política de
  Privacidade (revisão jurídica, junto com o texto final do termo do beta).

### Aceite dos termos e da política (CC-905)

- `legal_acceptances`: só o vínculo (médico, versão do documento) e a data — sem IP nem navegador
- `legal_documents`: cada versão publicada dos Termos de Uso e da Política de Privacidade, com hash do texto e a marca de texto provisório; imutável
- Entra na exportação (`legalAcceptances`) e sai na eliminação; o evento continua na trilha (`LEGAL_DOCUMENT_ACCEPTED`)
- Com `LEGAL_TERMS_V2` ligada, quem não aceitou a versão vigente continua podendo exportar, eliminar, revogar consentimento e sair

### Revisão do plantão (ShiftReview, ShiftReviewQuestion) — CC-801

- Até 3 perguntas por semana geradas das análises do próprio médico, a
  resposta, o grau de certeza ("sei", "tenho dúvida", "chutei") e o acerto
- O que vai ao modelo passa pela máscara de PII e pela redação do `patientRef`;
  o texto do caso não vai. Pergunta com dado do paciente é descartada antes de
  gravar
- A fonte é copiada da análise (trecho da diretriz), nunca escrita pelo modelo
- Exportação: `data.shiftReviews` (com as perguntas). Eliminação: apagadas
  explicitamente; as perguntas também saem em cascata com o encontro
- CC-802 ("Seu mapa"): agregado calculado na hora a partir das respostas do
  próprio médico (tema, certeza, acerto); nada novo é gravado e não há
  agregado entre médicos

### Fora do banco

| Onde                       | Dado                                                                                                                                                                                                                                                           | Retenção                                                                                                                                                                       |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Redis — fila `inference`   | Só ids (`physicianId`, `encounterId`, `intakeId`) no pedido e no resultado: o caso de `POST .../copilot/analyze/async` e a transcrição da captura de áudio ficam redigidos em `case_intakes`. Job enfileirado antes do CC-011 tem o texto tirado do Redis pelo worker | Job concluído 24 h, falho 7 dias (`removeOnComplete`/`removeOnFail`)                                                                                                           |
| Redis — cache da busca     | Chave = SHA-256 da consulta; valor = trechos de diretriz                                                                                                                                                                                                       | 60 s                                                                                                                                                                           |
| Logs do container (stdout) | A linha de erro do log de acesso leva só os nomes dos campos do corpo (`bodyFields=…`). O log da checagem automática de CRM leva UF e número                                                                                                                   | Sem rotação configurada no compose                                                                                                                                             |
| Object storage (MinIO/S3)  | PDF do documento confirmado                                                                                                                                                                                                                                    | Só com `MINIO_*`, que o compose de produção não repassa de propósito (o PDF é montado no download; ver o runbook). Na eliminação, os PDFs são apagados antes da transação     |
| Navegador do médico        | Rascunho do caso (`sessionStorage`), fila offline com o caso **sem máscara** (IndexedDB, até reenviar), perfil do médico (`localStorage`), cookies httpOnly `access_token` e `refresh_token`                                                                   | Até enviar, fechar a aba ou sair                                                                                                                                               |

## Suboperadores e o que cada um recebe

| Suboperador                                                 | O que recebe                                                                                                                                                         | Quando                                                                                                                                                                                                                       |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Anthropic** (`AI_PROVIDER=anthropic`, padrão do compose)  | Caso e respostas **já redigidos**, texto mascarado dos anexos, entendimento do caso; trechos de PCDT na classificação                                                | Leitura do caso, entendimento, decisão, verificação, sync da base oficial. Nada com o consentimento `ai_processing` revogado                                                                                                 |
| **Anthropic — pesquisa web** (`web_search`, `web_fetch`)    | Só o entendimento (síndrome, hipóteses, dados que faltam), nunca o texto do caso                                                                                     | `COPILOT_KNOWLEDGE_SOURCE=web` ou `verify`                                                                                                                                                                                   |
| **Groq**                                                    | **Áudio do ditado, sem máscara** (Whisper `whisper-large-v3`, ou o de `WHISPER_MODEL`; o compose fixa `WHISPER_BASE_URL` na Groq). A máscara só roda no texto que volta | Todo ditado (`POST /audio/transcribe`) e captura (`POST /encounters/:id/audio`), se o consentimento `ai_processing` não estiver revogado                                                                                     |
| **Groq — perfil de etapa**                                  | Caso **já redigido**, se uma etapa usar `groq:<modelo>`                                                                                                              | Só com `AI_PROVIDER_PROFILES=groq` e um `AI_*_MODEL` apontando para o perfil                                                                                                                                                 |
| **OpenAI**                                                  | Texto para embedding: as consultas do entendimento (`stages`) ou o caso redigido (`legacy`); a consulta de diretrizes com `maskPII`; texto de diretrizes na ingestão | `EMBEDDING_PROVIDER=openai` (padrão do compose) com `COPILOT_KNOWLEDGE_SOURCE=internal_kb`, consulta e ingestão de diretrizes. O runbook registra a conta sem crédito desde 11/10/2026 e documenta `EMBEDDING_PROVIDER=none` |
| **Sentry**                                                  | Exceção e pilha; `beforeSend` tira corpo, query, cookies e cabeçalhos de credencial                                                                                  | Só com `SENTRY_DSN`, que o compose de produção repassa do `.env.production`                                                                                                                                                  |
| **Umami** (autoalojado em `analytics.servidortozato.cloud`) | Visitas por página, sem cookie; as URLs levam só ids opacos                                                                                                          | Toda página do web em produção (`NEXT_PUBLIC_UMAMI_*` na imagem). Para médico logado, só se o último registro de `analytics` não estiver revogado                                                                           |
| **Provedor de e-mail** (SMTP, CC-015)                       | E-mail do destinatário e o texto do template; nenhum texto clínico nem identificador de paciente, no máximo um link que exige login | Só com `SMTP_HOST`; sem ele nada sai e o envio vira só uma linha de log |
| **Hostinger** (VPS)                                         | Hospeda banco, Redis, API, web e logs                                                                                                                                | Sempre (comentário de `docker/docker-compose.prod.yml`)                                                                                                                                                                      |
| Verificação de CRM                                          | UF e número do CRM                                                                                                                                                   | Só com `CRM_VERIFICATION_URL`, que o compose de produção não repassa                                                                                                                                                         |

A Conitec/gov.br só fornece PDFs públicos: o sync não envia dado pessoal.
Requisitos de DPA, retenção e região de cada provedor (Anthropic, OpenAI, Groq
e Sentry): `docs/compliance/DPA_PROVIDER.md`.

## Direitos do titular (médico)

| Direito (Art. 18)              | Endpoint (prefixo `/v1`, médico logado)                                                  |
| ------------------------------ | ---------------------------------------------------------------------------------------- |
| Confirmação e acesso           | `GET /lgpd/export`                                                                       |
| Portabilidade                  | `GET /lgpd/export` (JSON, `exportVersion: lgpd-portability-v1`)                          |
| Correção                       | `PATCH /auth/me` (nome, idioma e especialidade). E-mail e CRM não mudam pela API         |
| Eliminação                     | `POST /lgpd/erasure` (corpo `{ "reason"?: string }`; o motivo não é gravado)             |
| Informação sobre consentimento | `GET /lgpd/consent`                                                                      |
| Consentimento                  | `POST /lgpd/consent` com `{ "scope": "ai_processing" \| "data_sharing" \| "analytics" }` |
| Revogação de consentimento     | `DELETE /lgpd/consent/:scope`                                                            |

O sistema não tem endpoint por `patientRef`: pedidos do paciente chegam pela
instituição ou pelo médico.

### O que a exportação inclui

`data` traz:

- o cadastro do médico, sem hash de senha, segredo de MFA, `mfaEnabled` nem
  `erasedAt`;
- `encounters`, `documents`, `aiInteractions` e `caseIntakes`;
- `encounterAttachments`, com o texto redigido inline: é todo o conteúdo que
  guardamos;
- `audioCaptures`, com metadados (id, atendimento, tipo MIME, tamanho, status,
  `retainUntil`, datas) e a transcrição já mascarada. O áudio cifrado
  (`encryptedContent`) não é exportado: está cifrado com a chave do servidor,
  e decifrá-lo poria a voz do paciente, sem máscara, num arquivo baixado pelo
  navegador. Entram todas as capturas, inclusive `deleted`, quando o áudio já
  foi eliminado na retenção;
- `recommendationDecisions` e `copilotFeedback`;
- `beta`, a participação no beta (lote do convite, termo e perfil) e a entrada
  da lista de espera com o mesmo e-mail;
- `practiceSites`, os locais de plantão;
- `knowledgeGaps`, os "não encontrei" das análises do médico;
- `mentoringRequests`, os pedidos de mentoria que ele fez e os que respondeu
  como mentor;
- `shiftReviews`, as revisões do plantão com as perguntas;
- `externalIdentities`, as contas Google/Microsoft vinculadas;
- `consents` e `legalAcceptances`;
- `auditLog`, só as entradas em que o médico é o ator.

Ficam de fora: execuções de protocolo, pedidos de verificação de CRM, vínculos
com instituições, refresh tokens, códigos de backup do MFA e `ai_calls`.

### O que a eliminação faz

1. Apaga do MinIO os PDFs dos documentos dos atendimentos do médico. Se o
   storage falhar, nada é apagado no banco e a resposta é 503 — o pedido pode
   ser repetido.
2. Numa transação: apaga decisões por recomendação, reportes do copiloto,
   anexos, capturas de áudio, pedidos de mentoria que o médico fez, revisões
   do plantão, atendimentos (e, em cascata, conversas do copiloto guiado,
   documentos, interações de IA, lacunas apontadas e execuções de protocolo),
   locais de plantão, consentimentos, aceites dos termos, refresh tokens,
   contas Google/Microsoft vinculadas, códigos de backup do MFA, pedidos de
   verificação de CRM, vínculos institucionais e os contadores do bloqueio por
   tentativas; apaga a lista de espera do beta com o e-mail da conta e tira da
   participação no beta o termo e o perfil; tira das chamadas de IA o vínculo
   com o médico; anonimiza o cadastro (nome `ERASED`, e-mail
   `erased-<id>@erased.com`, senha inutilizada, especialidade apagada) e grava
   `erased_at`, que derruba a sessão.
3. Registra `DATA_ERASURE` na trilha com as contagens e os nomes das colunas
   anonimizadas, nenhum valor do cadastro, e responde
   `{ status: "completed", erased: { … }, anonymized: { aiCalls, physicianColumns } }`.

Continuam depois da eliminação:

- a trilha de auditoria (append-only, AUD-001): é registro de obrigação legal
  (Art. 16, I). O payload não leva texto livre nem dado pessoal; entradas
  gravadas antes dessa regra podem levar e não mudam — ver "Trilha de
  auditoria" acima. O IP fica;
- `ai_calls`, sem vínculo com o médico nem com os atendimentos (custo e
  latência agregados);
- as exceções da tabela abaixo, apontando para o cadastro anonimizado;
- jobs da fila no Redis até expirarem (24 h ou 7 dias), só com ids;
- linhas de log já escritas.

#### Decisão por tabela (CC-012)

A fonte é `src/modules/lgpd/erasure-policy.ts`, com o porquê de cada linha.
O que precisa ficar para a trilha ou para obrigação legal fica anonimizado;
o resto é apagado.

| Dado | Decisão | Por quê |
|---|---|---|
| Cadastro (`physicians`) | anonimizado | Fica como referente do `actor_id` da trilha. Nome, e-mail, senha, CRM (UF, número, verificação), MFA (segredo e flag), idioma e especialidade são substituídos e `erased_at` é gravado; ficam id, papel, curador, mentor, assinatura e datas. |
| Códigos de backup do MFA | apagados | Credencial, sem valor de auditoria. |
| Pedidos de verificação de CRM | apagados | Fila do admin, com nota em texto livre. Quem pediu, quem decidiu e quando já estão na trilha (`CRM_VERIFICATION_*`). |
| Vínculos institucionais | apagados | Onde o médico trabalha; o vínculo fica na trilha (`PHYSICIAN_LINKED_TO_INSTITUTION`). A instituição fica. |
| Contadores do bloqueio por tentativas | apagados | Login, MFA e troca de senha; valem minutos. A chave do login é o SHA-256 sem sal do e-mail, reidentificável: sai também a linha sem `physician_id` achada pelo hash do e-mail. |
| Contas Google/Microsoft (`external_identities`) | apagadas | Com o e-mail do vínculo. Sem apagar, o login social entraria na conta anonimizada. |
| Aceites dos termos (`legal_acceptances`) | apagados | O evento fica na trilha (`LEGAL_DOCUMENT_ACCEPTED`). |
| Locais de plantão, revisões do plantão, pedidos de mentoria feitos | apagados | Dados do médico; local e porte ajudam a reidentificá-lo. |
| Lista de espera do beta | apagada | Achada pelo e-mail da conta, antes da anonimização. |
| Chamadas de IA (`ai_calls`) | anonimizadas | Custo e latência agregados ficam; `physician_id`, `encounter_id` e `request_id` viram NULL. A API só pode alterar essas três colunas (migration `20261016120000_cc_012_lgpd_erasure_privileges`). |
| Consentimentos | apagados | A prova do consentimento (Art. 8º, § 2º) fica na trilha. |
| Participação no beta | exceção | Termo e perfil apagados; ficam os ids e a data de entrada, para a contagem do lote de convite. |
| Respostas dadas como mentor | exceção | São parte do caso de quem pediu e ficam com ele; o mentor vira o cadastro anonimizado. |
| Autoria e revisão de cartões revisados | exceção | Proveniência de conteúdo clínico em uso por outros médicos (ADR-019). Um trigger impede regravar a versão e a decisão do revisor. |

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

### Consentimento

O consentimento é registrado e auditado (`CONSENT_GRANTED`,
`CONSENT_REVOKED`). Vale o registro mais recente de cada escopo:

- **`ai_processing`**: sem nenhum registro, fica ativo por padrão
  (`consentDefaults`). Revogado, o `AiConsentGuard` recusa com 403
  `AI_CONSENT_REVOKED` as rotas que mandam o caso a um modelo (conversa,
  análise, reanálise, fila, ditado e captura de áudio), e o worker confere de
  novo antes de analisar. A consulta de diretrizes continua, só por
  palavra-chave. Histórico, documentos e feedback continuam abertos.
- **`analytics`**: revogado, o web não carrega o Umami e grava
  `umami.disabled` no navegador.
- **`data_sharing`**: só registrado. Hoje nenhum dado vai à instituição nem a
  terceiros além dos suboperadores acima.

## Página pública `/privacidade`

A página (`web/src/app/privacidade/page.tsx`) foi reescrita para descrever o
que o código faz (CC-010 e CC-014). O texto depende de revisão jurídica antes
de ir para produção: a base legal, o consentimento de IA ativo por padrão, a
resolução do CFM citada, se os suboperadores são nomeados, o prazo da trilha
com IP e o CNPJ do rodapé.

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
