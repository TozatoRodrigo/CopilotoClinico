# ADR-008: Pipeline de Ingestão em Lote com Revisão por Curador

**Status:** Aceito
**Data:** 2026-06-13
**Tarefa:** KB-002 — https://app.clickup.com/t/90132511259/86ahzc1y1

## Contexto

A ingestão de diretrizes (`GuidelinesService.ingest`) era endpoint a endpoint,
texto a texto, e os chunks resultantes entravam direto em retrieval. Para
escalar a base (KB-001) e absorver protocolos institucionais em volume
(PROT-004), é necessário ingerir documentos em lote — mas curadoria clínica é
requisito regulatório: o copiloto não pode citar conteúdo que não passou por
revisão humana.

## Decisão

### Estado de chunk (`GuidelineChunkStatus`)

Novo enum `pending_review | approved | rejected | superseded` em
`guideline_chunks.status`, com `reviewed_by`/`reviewed_at`. Migration
`20260613090000_kb_002_guideline_review_pipeline` migra os chunks existentes
para `approved` (preserva o comportamento atual de retrieval para diretrizes
já publicadas) e adiciona `is_curator` em `physicians`.

`RetrievalService.semanticSearch`/`keywordSearch` passam a filtrar
`status = 'approved'` — chunk `pending_review`/`rejected`/`superseded` nunca
aparece em resultados de busca, independentemente de similaridade.

### Dois caminhos de ingestão

- `ingest()` (endpoint único, `InternalServiceGuard`, service-to-service):
  continua criando chunks como `approved` diretamente. É um caminho restrito
  já existente; a exigência de curadoria do KB-002 mira especificamente o novo
  pipeline em lote.
- `ingestForReview()` (novo, usado pelo CLI de lote): cria chunks como
  `pending_review`. Ao final, marca como `superseded` todos os chunks
  `approved`/`pending_review` de versões anteriores da mesma `source` —
  **sem deletar**, preservando rastreabilidade de quais chunks embasaram
  análises passadas.

### CLI de ingestão em lote (`scripts/ingest-batch.ts`)

`pnpm ingest:guidelines <diretório>` lê arquivos `.md`/`.txt` com front-matter
(`source`, `sourceVersion`/`version`, `specialty`, `evidenceLevel`), chama
`ingestForReview` para cada um e imprime um relatório com chunks
criados/superseded por arquivo. Implementado como
`NestFactory.createApplicationContext()` com um módulo mínimo
(`ConfigModule` + `PrismaModule` + `GuidelinesModule`), evitando bootstrapar
`AppModule` (filas, Redis, Sentry) para uma ferramenta de linha de comando. O
parser de front-matter (`src/modules/guidelines/ingestion/front-matter.ts`) é
uma função pura sem dependência externa, dado o formato simples `key: value`.

### Endpoints de revisão e RBAC provisório

`GET /v1/guidelines/pending`, `POST /v1/guidelines/chunks/:id/approve` e
`POST /v1/guidelines/chunks/:id/reject` são protegidos por `JwtAuthGuard` +
novo `CuratorGuard`, que verifica `Physician.isCurator`. Como o sistema ainda
não tem RBAC completo, `isCurator` é uma flag booleana provisória — documentada
aqui e no runbook como solução temporária até existir um modelo de papéis
mais geral. Aprovação/rejeição registram o revisor (`reviewedBy`/`reviewedAt`)
e geram eventos `GUIDELINE_APPROVED`/`GUIDELINE_REJECTED` na trilha de
auditoria.

## Consequências

### Positivas
- Nenhum conteúdo entra em retrieval sem aprovação de um curador — requisito
  clínico/regulatório atendido por construção (filtro no SQL de retrieval, não
  apenas na UI).
- Re-ingestão de uma nova versão de fonte preserva histórico (`superseded`),
  permitindo auditar qual versão de uma diretriz embasou uma recomendação
  passada.
- Habilita KB-001 (escala da base) e PROT-004 (ingestão de protocolos
  institucionais) sem mudanças estruturais adicionais.

### Negativas / fora de escopo
- `isCurator` é um stopgap deliberado: não há hierarquia de papéis, apenas um
  booleano por médico, concedido manualmente via SQL (documentado no
  runbook). Deve ser substituído quando um RBAC completo existir.
- Não há UI de revisão nesta tarefa — a curadoria é feita via API
  (`/v1/guidelines/pending` + approve/reject).
- `ingest()` (endpoint único) permanece auto-aprovado; se o uso desse endpoint
  crescer, ele também deveria migrar para `ingestForReview`.
