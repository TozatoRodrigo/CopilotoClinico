# ADR-009: Multi-tenancy Institucional na Base de Conhecimento

**Status:** Aceito
**Data:** 2026-06-11
**Tarefa:** PROT-004 — https://app.clickup.com/t/90132511259/86ahzc22t

## Contexto

Protocolos (ADR-007) e diretrizes (ADR-008) eram sempre globais: todo
conteúdo aprovado é visível para qualquer encounter, em qualquer hospital.
Hospitais clientes do copiloto têm protocolos institucionais próprios — por
vezes divergentes do consenso público para a mesma especialidade/condição
(ex.: "sepse" com bundle próprio do Hospital A) — que não podem vazar para
outras instituições, nem ser confundidos com diretrizes públicas nas citações
exibidas ao médico.

PROT-004 introduz isolamento institucional como um eixo ortogonal ao modelo
existente: conteúdo `institutionId: null` ("global") permanece visível a
todos; conteúdo `institutionId: <uuid>` ("institucional") só é visível à
própria instituição, somado ao conteúdo global.

## Decisão

### Modelo de dados

`Institution` e `PhysicianInstitution` (N:N médico↔instituição) já existiam.
PROT-004 adiciona `institutionId` (nullable, FK para `institutions`) em:

- `Protocol` (já existia desde ADR-007 — apenas a aplicação da regra de
  isolamento era pendente).
- `GuidelineChunk` — novo campo, nullable. `null` = diretriz pública;
  preenchido = protocolo/diretriz institucional.

`institutionId: null` é o estado "global/público" em ambas as tabelas — não
há um terceiro valor sentinela.

### Resolução de instituição na borda (`resolveInstitutionId`)

Endpoints autenticados (`ProtocolsController`) resolvem a instituição efetiva
do request via um helper:

1. Se o cliente informa `institutionId` na query, valida que o médico
   pertence a ela (`InstitutionsService.listForPhysician`); caso contrário,
   `ForbiddenException`.
2. Caso contrário, se o médico pertence a exatamente uma instituição, usa-a
   implicitamente.
3. Caso contrário (zero ou múltiplas instituições, sem escolha explícita),
   `institutionId = null` — o médico só enxerga conteúdo global.

Esse padrão evita exigir o parâmetro em todo request para o caso comum
(médico de um único hospital) sem abrir mão de explicitação para médicos
multi-hospital.

### Isolamento em `ProtocolsService`

- `findAll({ institutionId })`: com `institutionId` informado, retorna
  `WHERE institutionId IS NULL OR institutionId = :institutionId`; sem
  `institutionId`, retorna apenas `institutionId IS NULL`.
- `findById(id, institutionId)`: se o protocolo pertence a outra instituição
  (diferente da informada), lança `NotFoundException` — **não**
  `ForbiddenException` — para não confirmar a existência de protocolos de
  outras instituições a um médico não autorizado. `institutionId === undefined`
  pula a checagem (uso interno/sistema).

### Isolamento em retrieval (`RetrievalService`)

`search(query, topK, institutionId?)` propaga `institutionId` para
`semanticSearch`/`keywordSearch`, que aplicam o mesmo filtro SQL via
`institutionFilter()`:

```sql
AND (institution_id IS NULL OR institution_id = $institutionId::uuid)
```

quando `institutionId` é informado; sem `institutionId`, filtra apenas
`institution_id IS NULL`. O filtro é aplicado nas duas pernas da busca híbrida
(semântica e keyword) antes do RRF, garantindo que chunks de outra instituição
nunca entram no conjunto de candidatos — não é apenas um corte de exibição.

Adicionalmente, `applyInstitutionBoost` (em `hybrid-search.ts`) aplica
`INSTITUTION_RANK_BOOST` (0.05) ao score RRF de chunks cujo `institutionId`
coincide com o da instituição do encounter, priorizando o protocolo local do
hospital sobre o equivalente público quando ambos são relevantes.

### Propagação institutionId → orquestrador → citações

`OrchestratorService` já carrega `encounter.institutionId` (campo existente em
`Encounter`); as três chamadas a `RetrievalService.search` (`analyze`,
`analyzeStream`, `continueAnalysis`) passam esse valor. Cada citação retornada
em `OrchestratorResult.citations` ganha:

- `institutionId: string | null` — instituição de origem do chunk citado.
- `origin: 'institutional' | 'public'` — derivado de `institutionId` (não
  persistido; calculado no momento da resposta), usado pelo frontend para
  rotular a citação como "Protocolo institucional" vs "Diretriz pública".

### Ingestão institucional

`GuidelinesService.ingest`/`ingestForReview` aceitam `institutionId?` opcional
em `IngestGuidelineInput`, persistido em `guideline_chunks.institution_id`
(default `null`). `ingestForReview` marca como `superseded` apenas chunks da
**mesma** `institutionId` (global vs institucional não se sobrepõem na
supersedência) — duas instituições podem ter versões divergentes da "mesma"
fonte sem uma invalidar a outra.

O front-matter do CLI de ingestão em lote (`scripts/ingest-batch.ts`,
ADR-008) ganha o campo opcional `institutionId`.

## Consequências

### Positivas
- Isolamento aplicado na camada de query (SQL), não apenas em filtros pós-busca
  ou na UI — uma instituição nunca recebe sequer como candidato um chunk/
  protocolo de outra.
- `findById` retorna `NotFoundException` (não `ForbiddenException`) para
  conteúdo de outra instituição, evitando enumeração de protocolos
  institucionais de terceiros.
- Conteúdo global continua funcionando sem qualquer mudança para instituições
  que não têm protocolos próprios — `institutionId: null` é o default em todo
  o pipeline.
- `origin`/`institutionId` nas citações dão ao frontend a informação necessária
  para distinguir "Protocolo institucional X v2" de "Diretriz pública" sem
  round-trip adicional.

### Negativas / fora de escopo
- Um médico vinculado a múltiplas instituições sem `institutionId` explícito
  no request enxerga apenas conteúdo global — não há agregação automática de
  conteúdo de várias instituições numa mesma busca.
- Não há endpoint para listar/gerenciar `institutionId` de chunks já
  ingeridos (mover um chunk global para institucional, ou vice-versa) —
  requer re-ingestão.
- `INSTITUTION_RANK_BOOST` é uma constante fixa (0.05); calibração por
  instituição/especialidade fica fora de escopo.
