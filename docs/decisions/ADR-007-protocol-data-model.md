# ADR-007: Modelo de Dados de Protocolos Versionados (Árvore de Decisão)

**Status:** Aceito
**Data:** 2026-06-11
**Tarefa:** PROT-001 — https://app.clickup.com/t/90132511259/86ahzc1jd

## Contexto

O Dr. João pediu "árvore de decisão" e "protocolos". O copiloto (DEC-001 a
DEC-005) cobre raciocínio aberto via LLM + RAG sobre `guideline_chunks`, mas
protocolos de emergência (sepse bundle 1h, dor torácica, ACLS) são
determinísticos por natureza — hospitais exigem aderência exata a um fluxo
aprovado, não uma recomendação probabilística.

Este ADR introduz um modelo de dados complementar ao RAG: protocolos
institucionais representados como grafos de decisão (pergunta → condição →
próximo passo/ação → desfecho), versionados e imutáveis após publicação.

## Decisão

### Modelo de dados (`prisma/schema.prisma`)

- **`Protocol`**: `id`, `name`, `specialty`, `version` (Int, incremental por
  `name`+`specialty`+`institutionId`), `status` (`draft` | `published` |
  `retired`), `institutionId` (nullable = protocolo público/global),
  `sourceRef`, `createdBy`, `publishedAt`.
- **`ProtocolNode`**: `id`, `protocolId`, `nodeType` (`question` | `action` |
  `outcome`), `content` (Json — pergunta+answerType+choices, ação+citação, ou
  desfecho), `order`.
- **`ProtocolEdge`**: `id`, `fromNodeId`, `toNodeId`, `condition` (Json — ex.:
  `{answer: true}`, `{answer: '<48h'}`).

Migration `20260611120000_prot_001_protocol_data_model` cria as 3 tabelas, os
enums `ProtocolStatus`/`ProtocolNodeType`, FKs com `ON DELETE CASCADE` (deletar
um protocolo remove seus nós e edges) e índices em `(name, specialty,
institutionId)`, `status`, e nas FKs de `protocol_edges`. É revertível via
`DROP TABLE`/`DROP TYPE` (documentado no cabeçalho da migration).

### Validador de grafo (`protocol-graph-validator.ts`)

Função pura `validateProtocolGraph(nodes, edges)` que verifica:

1. **Nó inicial único** — exatamente um nó sem transições de entrada.
2. **Grafo acíclico** — DFS com detecção de ciclo.
3. **Cobertura de respostas em nós `question`** — para `answerType: boolean`,
   exige edges com `condition.answer === true` e `=== false`; para `choice`,
   exige uma edge para cada item de `content.choices`; em ambos os casos, um
   nó `question` sem nenhuma edge de saída também é rejeitado.
4. **Todo caminho termina em `outcome`** — qualquer nó sem transições de saída
   que não seja `outcome` é rejeitado (dead end).

Adicionalmente, edges que referenciam `fromNodeId`/`toNodeId` inexistentes são
rejeitadas antes das checagens acima.

### CRUD mínimo (`/v1/protocols`, `JwtAuthGuard`)

- `POST /protocols` — cria um protocolo em `draft`. Valida o grafo antes de
  qualquer escrita no banco; `version` é calculada como
  `max(version existente para name+specialty+institutionId) + 1`.
- `GET /protocols` — lista protocolos (filtros opcionais `specialty`,
  `status`).
- `GET /protocols/:id` — detalhe com `nodes` e `outgoingEdges`.
- `POST /protocols/:id/publish` — valida o grafo novamente (defesa em
  profundidade contra dados inseridos fora do fluxo de criação) e marca
  `status: published`, `publishedAt: now()`. Só é permitido a partir de
  `draft`; do contrário, `ConflictException`.
- `POST /protocols/:id/revise` — cria uma **nova versão** (nova linha
  `Protocol`, `version + 1`, `status: draft`) a partir de um protocolo
  `published`/`retired`. A versão anterior nunca é alterada (`prisma.protocol.update`
  não é chamado sobre ela) e permanece consultável via `GET /protocols/:id` —
  mesmo princípio de imutabilidade do `audit_log` (ADR-002), aplicado na
  camada de serviço em vez de trigger de banco, já que aqui "editar" é
  semanticamente "criar uma nova versão", não corrigir um registro de
  auditoria.

Toda criação/publicação/revisão gera evento em `audit_log`
(`PROTOCOL_CREATED`, `PROTOCOL_PUBLISHED`, `PROTOCOL_REVISED`).

## Consequências

### Positivas
- Modelo de dados habilita PROT-002 (engine de execução determinística) e
  PROT-003 (protocolos piloto curados) sem mudanças estruturais adicionais.
- Validação de integridade do grafo acontece tanto na criação quanto na
  publicação, prevenindo protocolos inconsistentes de chegarem a `published`.
- Versionamento simples (campo `version` incremental) evita a complexidade de
  branching/merging de grafos — cada edição é uma nova árvore completa.

### Negativas / fora de escopo
- Engine de execução (PROT-002) e UI de autoria ficam fora desta tarefa;
  protocolos piloto serão seedados via script.
- A checagem de cobertura de respostas para `answerType: number | text` exige
  apenas que o nó tenha ao menos uma transição de saída — não há validação
  genérica de "todas as faixas numéricas cobertas", o que ficaria a cargo de
  uma revisão humana do protocolo antes da publicação.
- `reviseAsNewVersion` não retira (`retired`) automaticamente a versão
  anterior; isso é uma decisão operacional explícita, fora do escopo desta
  tarefa.
