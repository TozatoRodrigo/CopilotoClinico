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

## Adendo — CC-019 (15/10/2026): a regra em todas as rotas de leitura

A busca da biblioteca (`GET /guidelines/search`), o trecho citado
(`GET /guidelines/chunks/:id`), o catálogo de fontes (`GET /guidelines`), a
publicação e a revisão de protocolos e o roteiro de protocolo no caso não
aplicavam o isolamento acima: qualquer médico autenticado lia o trecho ou o
protocolo de outra instituição.

**Vínculo ativo.** O institucional só aparece para quem tem vínculo ativo com
a instituição: o `PhysicianInstitution` existe e a instituição está `active`
(`activeInstitutionIds`, em `institutions/institution-visibility.ts`). Vínculo
com instituição desativada não conta, nem para a instituição implícita de
`resolveInstitutionId` nos protocolos.

**Por rota:**

- `GET /guidelines/search` (busca e biblioteca): globais e os das
  instituições de vínculo ativo do médico — todas, não só uma, porque a
  biblioteca não está dentro de um caso. Filtro no SQL, antes do `LIMIT`, para
  a página não vir curta. Sem instituições, só o global.
- `GET /guidelines/chunks/:id`: trecho de instituição sem vínculo ativo é
  `404`, como id inexistente.
- `POST /guidelines/consult`: só conteúdo global, para todos (mais restrito
  que este ADR permite; levar o institucional à consulta é decisão de
  produto).
- Análise: a instituição do caso só filtra a busca enquanto o médico tem
  vínculo ativo com ela; sem ele, a busca fica no global
  (`RETRIEVAL_INSTITUTION_DROPPED` no log).
- Protocolos: `publish`, `revise` e o roteiro no caso
  (`/protocol-runs`) usam `findVisibleById` (`404` para outra instituição);
  criar ou revisar com `institutionId` exige vínculo ativo (`403`).
- `POST /guidelines/suggest` já não aceitava `institutionId`: a sugestão
  entra global e pendente.

**Papéis.** ADMIN e COMPLIANCE não veem mais nas rotas do médico: a regra é o
vínculo. As exceções são as rotas que já são deles: a curadoria (ADR-008,
`pending`/`approve`/`reject`/`ingest-review`, com `CuratorGuard`) vê os
pendentes de todas as instituições, e o catálogo de fontes (`GET /guidelines`)
passa a exigir COMPLIANCE ou ADMIN — é o console administrativo.

## Adendo — CC-020 (15/10/2026): quem escreve protocolo

O adendo do CC-019 fechou o protocolo de outra instituição, mas qualquer
médico autenticado ainda criava, publicava ou criava versão nova de protocolo
**global**. Protocolo publicado vira roteiro que o médico segue no plantão
(ADR-008 do motor de execução de protocolos): escrever é ato de curadoria
clínica, não de qualquer usuário.

**Regra.** Criar rascunho (`POST /protocols`), publicar
(`POST /protocols/:id/publish`) e criar versão nova
(`POST /protocols/:id/revise`) exigem curador (`is_curator`, ADR-008 da
revisão de diretrizes) **ou** ADMIN. Sem um dos dois, `403` para qualquer id,
antes de ler o protocolo (não confirma que ele existe), e nada é gravado. Papel
e flag são lidos do banco a cada pedido, não do token: tirar a flag vale no
pedido seguinte. Ler e rodar protocolo continua aberto a todo médico, com o
filtro do CC-019. A checagem fica em `ProtocolsService`, não num guard, para
valer em qualquer chamador do serviço.

**Institucional.** Este ADR não tem papel de gestor da instituição, então a
regra é a mesma do global: curador ou ADMIN. O vínculo ativo do CC-019 continua
exigido à parte: sem ele, publicar ou revisar o protocolo da instituição é
`404` e criar nela é `403`, inclusive para ADMIN (papel não amplia o que se vê
nas rotas do médico). O médico vinculado sem papel lê e roda o protocolo da
própria instituição, mas não escreve. Se um dia houver gestor por instituição,
ele entra como mais um caminho em `protocolAuthority`
(`protocols/protocol-authoring.ts`), restrito à instituição dele.

**Por que curador OU ADMIN, e não E como na curadoria de diretrizes.** As rotas
de curadoria de diretrizes pedem COMPLIANCE/ADMIN **e** `is_curator`. Para
protocolo valem os dois caminhos: o curador clínico, que revisa o conteúdo, e
o ADMIN, que opera a base. COMPLIANCE sem a flag não escreve: auditar não é
autorar.

**Auditoria.** `PROTOCOL_CREATED`, `PROTOCOL_PUBLISHED` e `PROTOCOL_REVISED`
ganham `authorizedAs: 'curator' | 'admin'` no payload: o papel que autorizou o
ato, sem outro dado do médico além do `actorId` de sempre. A recusa não entra
na trilha (nada mudou); vai para o log como
`PROTOCOL_WRITE_DENIED action=<create|publish|revise>`, sem identificar o
médico (rota e IP já estão no log de acesso).

**Web.** O front não tem tela de autoria de protocolo nem botão de publicar ou
revisar; não há o que esconder. Quando houver, a tela segue a mesma regra.
