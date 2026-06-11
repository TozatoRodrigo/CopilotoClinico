# ADR-008: Engine de Execução de Protocolo (Modo Guiado Determinístico)

**Status:** Aceito
**Data:** 2026-06-12
**Tarefa:** PROT-002 — https://app.clickup.com/t/86ahzc1mp

## Contexto

Com o modelo de dados de protocolos versionados pronto (PROT-001 / ADR-007),
falta o motor que executa um `Protocol` publicado passo a passo durante um
atendimento — o "modo guiado" descrito pelo Dr. João. Diferente do loop do
copiloto baseado em LLM (DEC-001..005), aqui o próximo passo é **determinístico**,
definido pelo grafo (`ProtocolNode`/`ProtocolEdge`); não há chamada de IA no
caminho de execução.

## Decisão

### Modelo de dados (`prisma/schema.prisma`)

- **`ProtocolRun`**: `id`, `encounterId`, `protocolId`, `protocolVersion`,
  `currentNodeId`, `status` (`in_progress` | `completed` | `abandoned`),
  `answers` (Json — histórico de respostas do médico), `abandonReason`,
  `startedBy`.
- Migration `20260612090000_prot_002_protocol_runs` cria `protocol_runs` com
  FK `ON DELETE CASCADE` para `encounters` (run morre com o encounter) e
  `ON DELETE RESTRICT` para `protocols` (não é possível apagar um protocolo
  com runs associados). Revertível via `DROP TABLE`/`DROP TYPE`.

### Engine (`src/modules/copilot/protocol-engine/`)

- **`startRun(physicianId, encounterId, protocolId)`**: valida posse do
  encounter, exige `protocol.status === 'published'`, localiza o nó inicial
  (sem transições de entrada — garantido pelo validador de grafo do PROT-001),
  cria o `ProtocolRun` com `protocolVersion` fixado no momento da criação, e
  audita `PROTOCOL_RUN_STARTED`.
- **`answerNode(physicianId, runId, answer)`**: determinístico, sem LLM.
  1. Valida o `run.status === 'in_progress'` (senão `409 Conflict`).
  2. Valida o `answer` contra `currentNode.content.answerType`
     (`boolean`/`choice`/`number`/`text`); tipo incompatível →
     `422 UnprocessableEntityException` com mensagem descritiva.
  3. Localiza a edge cuja `condition.answer === answer` (ou uma edge
     "catch-all" sem `condition.answer`, usada por nós `number`/`text`).
  4. Avança automaticamente (`autoAdvance`) por nós `action` com uma única
     edge de saída — eles não exigem resposta do médico — até chegar a um nó
     `question` ou `outcome`.
  5. Persiste `currentNodeId`, acrescenta a resposta a `answers`, e marca
     `status: completed` se o novo nó for `outcome`.
  6. Audita `PROTOCOL_STEP` com `{ runId, nodeId, answerHash, nextNodeId }` —
     **apenas o hash SHA-256 da resposta**, nunca o valor bruto, seguindo o
     princípio de minimização de dados do DEC-005/LGPD. O valor bruto fica em
     `protocol_runs.answers` (dado clínico do encounter, já coberto pelo
     mesmo modelo de proteção de `ai_interactions`).
  7. Se completar, audita também `PROTOCOL_RUN_COMPLETED`.
- **`abandonRun(physicianId, runId, reason)`**: exige `reason` não vazio
  (validado via Zod no controller), só permitido em `in_progress`, marca
  `status: abandoned` e audita `PROTOCOL_RUN_ABANDONED` com o motivo.
- **`getRun(physicianId, runId)`**: retorna o estado atual do run (nó atual
  completo, respostas acumuladas, status).

### Versionamento do run

`protocolId` aponta para a linha imutável da versão executada (cada versão de
`Protocol` é uma linha própria — ADR-007). Publicar uma v2 cria uma nova linha
`Protocol`; o `ProtocolRun` em andamento continua referenciando a v1 e nunca é
afetado. `protocolVersion` é gravado no momento de `startRun` para
rastreabilidade no histórico/SOAP.

### Endpoints (`/v1`, `JwtAuthGuard`)

- `POST /encounters/:encounterId/protocol-runs` — inicia um run.
- `GET /protocol-runs/:runId` — estado atual.
- `POST /protocol-runs/:runId/answer` — responde ao nó atual.
- `POST /protocol-runs/:runId/abandon` — abandona com motivo obrigatório.

Todas as rotas verificam posse do encounter via `EncountersService.findById`
(lança `NotFoundException`/`ForbiddenException` se o encounter não pertencer
ao médico autenticado).

## Consequências

### Positivas
- Trilha de auditoria (`PROTOCOL_RUN_STARTED` → `PROTOCOL_STEP`* →
  `PROTOCOL_RUN_COMPLETED`/`PROTOCOL_RUN_ABANDONED`) permite reconstruir o
  caminho completo percorrido a partir do `audit_log`, sem depender de
  `protocol_runs.answers`.
- Nós `action` (sem pergunta) são auto-atravessados, simplificando a UI: o
  médico só responde nós `question`.
- Resposta de tipo incompatível com `answerType` retorna `422` com mensagem
  clara, sem tocar o banco.

### Negativas / fora de escopo
- **Detecção automática de protocolos aplicáveis** (`suggestedProtocols[]` na
  resposta de `analyze`, via matching de keywords/specialty) descrita no
  escopo técnico do PROT-002 fica para uma tarefa de acompanhamento — requer
  mudanças no `OrchestratorService`/`output-validator` que merecem revisão
  isolada dada a sensibilidade desse caminho (555+ testes existentes).
- **UI de execução guiada** (`encounters/[id]/protocol/[runId]`) fica para uma
  tarefa de acompanhamento de frontend, assim como a UI de autoria de
  protocolos foi deferida no PROT-001.
- **Geração de SOAP a partir do outcome** do run não está implementada nesta
  tarefa; `protocol_runs.answers` e `currentNode` ficam disponíveis via
  `GET /protocol-runs/:runId` para uso futuro pelo gerador de documentos.
- Para nós `question` com `answerType: number | text`, a v1 não valida faixas
  específicas — qualquer número/texto não vazio segue pela edge "catch-all"
  (sem `condition.answer`), mesma simplificação documentada no ADR-007.
