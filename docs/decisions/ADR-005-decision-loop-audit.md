# ADR-005: Auditoria do Loop de Decisão Conversacional do Copiloto

**Status:** Aceito
**Data:** 2026-06-11
**Tarefa:** DEC-005 — https://app.clickup.com/t/90132511259/86ahzc1h8

## Contexto

O DEC-002 introduziu um loop de decisão multi-turno: o copiloto pode emitir
`clarifyingQuestions`, o médico responde via `POST /encounters/:id/copilot/respond`,
e a análise é refinada com base nas respostas (`continueAnalysis`). Esse diálogo
influencia diretamente as recomendações apresentadas, mas até então não deixava
nenhum rastro na trilha de auditoria — apenas o `AiInteraction` final era
persistido, sem registro encadeado e auditável de cada etapa do diálogo.

Para conformidade regulatória (CFM, LGPD) é necessário que toda a sequência de
decisão — perguntas feitas, respostas recebidas, análise refinada — seja
auditável e à prova de adulteração, sem expor o conteúdo clínico das respostas
do médico em texto claro.

## Decisão

Cada etapa do loop de decisão passa a gerar um evento na cadeia de hash já
existente (`audit_log`, ver [ADR-002](./ADR-002-audit-chain-hash.md)), usando
`AuditService.log()` sem nenhuma alteração no mecanismo de encadeamento/verificação:

| Ação | Quando ocorre | Payload |
|---|---|---|
| `COPILOT_QUESTIONS_EMITTED` | `analyze()` ou `continueAnalysis()` retornam `clarifyingQuestions` não vazio | `{ interactionId, turnIndex, questionIds }` |
| `COPILOT_QUESTION_ANSWERED` | Início de `continueAnalysis()`, após o filtro de injection | `{ interactionId (pai), turnIndex, questionIds, answersHash }` |
| `COPILOT_ANALYSIS_REFINED` | Após persistir o novo `AiInteraction` em `continueAnalysis()` | `{ interactionId, parentInteractionId, turnIndex, uncertainty, cost }` |

Em ambos os casos `entity = 'Encounter'` e `entityId = encounterId`, seguindo o
padrão já usado por `PROMPT_INJECTION_DETECTED`.

### Minimização de dados (LGPD)

`COPILOT_QUESTION_ANSWERED` **nunca** grava o conteúdo das respostas do médico
em texto claro — mesmo após a redação de PII (LGPD-005), o texto livre ainda
pode conter informações clínicas sensíveis do paciente. Em vez disso, o
payload contém `answersHash = SHA256(JSON.stringify(input.answers))`, que
permite detectar adulteração/retransmissão sem reconstruir o conteúdo original.

### Tela de auditoria

A tela `/audit` ganha um mapa `ACTION_LABELS` que traduz os três novos códigos
para rótulos em PT-BR, e o campo "ID" passa a ser um link para
`/encounters/:id/result` quando `entity === 'Encounter'`, permitindo navegar
diretamente do evento de auditoria para o atendimento correspondente.

### Verificação da cadeia

Nenhuma mudança foi necessária em `AuditService.verifyChain()` ou no
`AuditChainCronService`: a cadeia é global e cronológica — qualquer novo
evento gravado via `log()` já participa da mesma cadeia e é coberto pela
verificação diária.

## Consequências

### Positivas
- Diálogo completo do loop de decisão é reconstruível cronologicamente a
  partir do `audit_log`, sem custo adicional de infraestrutura.
- Um fluxo de 3 turnos gera no mínimo 5 eventos encadeados
  (`QUESTIONS_EMITTED` no turno 0 + `ANSWERED`/`REFINED` em cada um dos 2
  turnos seguintes), suficientes para reconstruir a sequência de
  pergunta→resposta→refinamento.
- Conteúdo de respostas do médico nunca aparece em texto claro no
  `audit_log`.

### Negativas
- `answersHash` não permite auditoria humana do conteúdo da resposta — apenas
  detecção de integridade. Caso seja necessário auditar o conteúdo, será
  preciso correlacionar com `AiInteraction.answeredQuestions` (que já passa
  pela mesma redação de PII do DEC-002, mas não é hash-encadeado).
