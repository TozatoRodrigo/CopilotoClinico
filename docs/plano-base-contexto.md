# Plano — Base de contexto do Copiloto Clínico

Versão: 1.3 | Criado: 2026-09-03 | Atualizado: 2026-09-03
Origem: feedbacks de campo de 03/09/2026 (dois médicos do piloto).

---

## 1. O que foi reportado

| # | Reporte | Sintoma observado |
|---|---|---|
| A | Caso de dengue | O Copiloto conduziu o raciocínio pelo caminho de **sepse**. |
| B | Anexar arquivo | Erro ao tentar incluir um artigo no sistema, **mesmo convertendo para `.md` ou `.txt`**. O arquivo era a diretriz da ABRAMEDE de dengue (JBMEDE 2024;4(2):e24018). |
| C | Provável cefaleia em salvas | O Copiloto apontou **hemorragia intracerebral**, e a hipótese virou o título do atendimento e entrou no SBAR gerado. |

---

## 2. Diagnóstico — causa raiz de cada um

### A e C são o mesmo defeito, em dois cenários

Não é falha de raciocínio do modelo. É **ausência de conteúdo na base somada a
um retrieval que nunca devolve vazio**.

1. `RetrievalService.search()` (`src/modules/copilot/retrieval/retrieval.service.ts:36`)
   sempre retorna os `topK = 5` melhores chunks. A fusão por _reciprocal rank_
   (`hybrid-search.ts`) usa **posição**, não similaridade — o score semântico
   bruto é descartado. Não existe piso de relevância: o 5º melhor chunk de uma
   base que não cobre o caso entra no prompt exatamente com o mesmo status do
   melhor chunk de uma base que cobre.
2. O prompt entrega esses chunks dentro de
   `<guideline_evidence type="TRUSTED_CURATED_SOURCE">`
   (`orchestrator/prompt-builder.ts`), e a **Regra 1** obriga toda recomendação
   a citar um `citationChunkId` recuperado.
3. Resultado: quando o cenário real não está na base, o modelo é *empurrado*
   para o vizinho semântico mais próximo, com aparência de fundamentação.

Aplicando aos dois casos:

- **Dengue → sepse.** Não havia nenhum chunk de arbovirose na base (nem no seed
  `prisma/seeds/guidelines-seed.ts`, nem em KB-001/003/004). Havia três chunks
  de *Surviving Sepsis Campaign* e um de choque indiferenciado. Febre +
  hipotensão + hipoperfusão são vizinhos semânticos diretos de sepse. O modelo
  citou o único material existente.
- **Cefaleia em salvas → hemorragia.** A base só tinha o lado **secundário** da
  cefaleia: `kb-001/05-cefaleia.md` é inteiramente triagem de causas fatais e
  chega a instruir que "o retrieval deve puxar com força termos como cefaleia
  em trovoada"; `kb-003/02-hemorragia-subaracnoidea.md` acrescenta HSA. **Nenhum
  chunk descrevia uma cefaleia primária.** Não existia evidência recuperável
  capaz de sustentar o diagnóstico correto.

Dois agravantes específicos do caso C:

- O guardrail de coerência de subtipo (`output-validator.ts`,
  `findUnresolvedSubtypeAmbiguity`) só dispara quando ≥2 `subtipo` do **mesmo**
  `cenario` são recuperados. `cefaleia` e `hemorragia_subaracnoidea` são
  cenários diferentes e `cefaleia` não tinha subtipos — o guardrail não tinha
  como agir.
- `deriveChiefComplaint()` (`orchestrator.service.ts:50`) usa
  `differentials[0].hypothesis` como título do atendimento. Um diferencial é,
  por definição do próprio prompt, um "lembrete, não um bloqueador" — mas virou
  o **nome do caso** na lista, no cabeçalho e no documento gerado. Isso ancora o
  médico e contamina o registro médico-legal com uma hipótese que o Copiloto
  nunca afirmou ser o diagnóstico.

### B — o erro de anexar arquivo tem quatro causas somadas

Todas reproduzíveis no código atual:

1. **Permissão.** `POST /guidelines/ingest-review`
   (`guidelines.controller.ts:93`) exige `@Roles('COMPLIANCE','ADMIN')` **e**
   `CuratorGuard` (flag `isCurator` no médico). Um médico do piloto recebe
   `403 — "Apenas curadores podem revisar diretrizes"`.
2. **Front-matter obrigatório.** `parseGuidelineContent()`
   (`web/src/lib/front-matter.ts:34`) exige um bloco `--- ... ---` com `source`,
   `sourceVersion` e `specialty`. Um PDF convertido para `.md`/`.txt` nunca tem
   isso → `"Front-matter ausente ou mal formatado"`. **É por isso que converter
   o arquivo não resolveu**: o formato exigido não é markdown, é markdown com
   metadados de curadoria.
3. **Formato e tamanho.** O input aceita apenas `.md`/`.txt` (sem PDF), e o
   Fastify está com `bodyLimit: 1 MB` (`src/main.ts:22`) — um artigo longo
   convertido para texto pode estourar o limite e falhar com erro genérico.
4. **A funcionalidade que ele queria não existe.** O relato é "queria incluir um
   arquivo **lá**" — no caso. Não há nenhum caminho para anexar uma referência a
   **um atendimento**. O único upload do produto é o console de curadoria
   global, que é outra coisa: alimenta a base de todos os médicos e por isso
   exige curadoria.

---

## 3. O que já foi feito

### 3.1 Conteúdo de base

Seguindo o mesmo padrão dos pacotes KB-001/003/004 (rascunho
em `docs/guidelines/drafts/`, catálogo atualizado, spec de regressão):

| Entrega | Arquivos |
|---|---|
| **KB-005 — Arboviroses / dengue** (4 arquivos) | `docs/guidelines/drafts/kb-005-arboviroses-dengue/` |
| **KB-006 — Cefaleias primárias x secundárias** (3 arquivos) | `docs/guidelines/drafts/kb-006-cefaleias-primarias/` |
| Catálogo com fontes, tabela de cenários e pendências | `docs/guidelines-catalog.md` (§ KB-005, § KB-006) |
| Specs de pacote (front-matter, pares de subtipo, limiares numéricos) | `src/modules/guidelines/ingestion/kb-00{5,6}-*.spec.ts` |
| Casos de incidente de campo como regressão | `tests/fixtures/field-incident-cases.ts`, `tests/field-incident-cases.spec.ts` |

Fontes usadas — todas verificadas contra o documento original durante a
redação, nenhuma inventada:

- Ministério da Saúde. *Dengue: diagnóstico e manejo clínico (adulto e criança)*, 6ª ed., Brasília, 2024. (grupos A–D, sinais de alarme, sinais de choque, volumes)
- Silva LOJ, von Hellmann R, Maia IWA, et al. *Diretrizes clínicas da ABRAMEDE para o manejo de dengue em pacientes adultos na emergência*. **JBMEDE. 2024;4(2):e24018** — o artigo anexado no reporte B.
- Evans L, et al. *Surviving Sepsis Campaign 2021*. Intensive Care Med. 2021;47:1181–1247.
- ICHD-3, International Headache Society, 2018 — critérios 3.1, 1.1 e 2.
- Cohen AS, Burns B, Goadsby PJ. *High-flow oxygen for treatment of cluster headache: a randomized trial*. **JAMA. 2009;302(22):2451–7**.
- Do TP, Remmers A, Schytz HW, et al. *Red and orange flags for secondary headaches: SNNOOP10 list*. **Neurology. 2019;92(3):134–144**.
- Colman I, et al. *Parenteral dexamethasone for acute severe migraine*. **BMJ. 2008;336:1359**.

Os pacotes estão como **rascunho aguardando curadoria clínica assinada** — é o
mesmo gate dos pacotes anteriores e não deve ser pulado.

### 3.2 Código — F2, F3, F4, F6 e F7 implementados

| O quê | Onde |
|---|---|
| **Piso de relevância** (`applyRelevanceFloor`) — chunk abaixo do limiar não entra no prompt; quando nenhum passa, a análise cai no caminho de declarar a lacuna e perguntar | `retrieval/hybrid-search.ts`, `retrieval/retrieval.service.ts` |
| **Cobertura exposta ponta a ponta** — `retrievalCoverage` (`full`/`partial`/`none`) no retorno da análise, persistido em `ai_interactions.params` e devolvido por `GET /copilot/latest` | `orchestrator.service.ts`, `copilot.service.ts`, `shared/contracts/clinical.ts` |
| **Aviso de encaixe fraco no prompt** — quando a cobertura é `partial`, o modelo é instruído a tratar a evidência como "o que a base contém", não como confirmação da hipótese, e a nomear as características cardinais não endereçadas | `orchestrator/prompt-builder.ts` (`WEAK_COVERAGE_WARNING`) |
| **Aviso ao médico na tela de resultado** — banner distinto do de incerteza: incerteza fala do raciocínio, cobertura fala do que a base contém | `web/src/components/domain/coverage-banner.tsx` |
| **Título do caso nunca mais vem de um diferencial** (F3) | `orchestrator.service.ts` (`deriveChiefComplaint`) |
| **Observabilidade para calibrar** — cada busca loga `RETRIEVAL_COVERAGE coverage=… best=… kept=… discarded=…` | `retrieval.service.ts` |
| **Rollback sem redeploy** — `RETRIEVAL_MIN_SEMANTIC_SCORE=0` desliga o piso e restaura o comportamento anterior | `.env.example`, `docs/runbook.md` |
| **Chunking em fronteira de frase** (F6) — parágrafos agrupados até ~1.200 caracteres, sobreposição por frase; uma prescrição não é mais partida ao meio | `ingestion/chunking.ts` |
| **Sugestão de diretriz por qualquer médico** (F4) — `POST /guidelines/suggest`, sem exigir papel de curador nem front-matter; entra como `pending_review` e **nunca supersede** conteúdo aprovado | `guidelines.controller.ts`, `guidelines.service.ts`, `suggest-guideline-dialog.tsx` |
| **Feedback estruturado "cenário errado"** (F7) — registra `interactionId`, chunks recuperados, cobertura e chunks citados na trilha de auditoria | `copilot.service.ts` (`submitFeedback`), `copilot-feedback.tsx` |

Testes: piso de relevância (6 casos, incluindo o cenário exato do caso de
dengue), aviso de cobertura no prompt (3 casos), busca com cobertura
`none`/`partial` (2 casos), e a regressão que prova que um diferencial não
vira título. Suíte completa verde — 802 unitários + 13 e2e, typecheck e lint
limpos no backend e no front, build do Next passando.

**Limite conhecido:** o limiar inicial (`0.3`) é conservador e **ainda não foi
calibrado com dados reais** — o procedimento está em `docs/runbook.md`
("Calibrar o piso de relevância"). Até calibrar, o risco é o piso cortar de
mais e o Copiloto perguntar em casos que a base cobria. Isso é observável pelo
log e reversível por env.

---

## 4. Plano

Ordenado por relação entre risco removido e esforço. F1 e F2 são o que impede a
repetição; o resto reduz a probabilidade de o próximo gap virar um erro
silencioso.

### F1 — Ingerir, curar e provar os dois pacotes (sem código novo)

1. `pnpm ingest:guidelines docs/guidelines/drafts/kb-005-arboviroses-dengue`
2. `pnpm ingest:guidelines docs/guidelines/drafts/kb-006-cefaleias-primarias`
3. Curadoria clínica assinada (aprovar/rejeitar chunk a chunk no console).
4. Rodar `fi-001` e `fi-002` (`tests/fixtures/field-incident-cases.ts`) ponta a
   ponta contra o banco. Critério de aceite: o cenário correto aparece no top-3
   do retrieval **e** o `reasoning` nomeia o discriminador (defervescência /
   padrão temporal da crise), não só "acerta o rótulo".

**Sem este passo os arquivos não valem nada** — eles estão em `docs/`, não no
banco vetorial.

### F2 — Piso de relevância no retrieval + caminho honesto de "não cobre" — ✅ IMPLEMENTADO

O defeito estrutural: antes desta rodada era impossível o sistema dizer "minha
base não cobre este caso", porque ele sempre encontrava cinco chunks. Falta
apenas a calibração com dados de produção (ver 3.2).

- Preservar a similaridade semântica bruta (`semanticSearch` já a calcula e a
  descarta na fusão) e aplicar um **piso**: chunk abaixo do limiar não entra no
  prompt.
- Quando **nenhum** chunk passar do piso, usar o caminho já existente de
  `buildCaseOnlyUser()` (DECISION MATRIX path D: declarar lacuna de cobertura e
  **perguntar**), em vez de apresentar evidência fraca como
  `TRUSTED_CURATED_SOURCE`.
- Expor `retrievalCoverage` (`full | partial | none`) no metadata da análise.

**Calibração do limiar — não escolher o número no chute.** Rodar os 40 casos
sintéticos de `tests/fixtures/kb-001-synthetic-cases.ts` (que têm cobertura) e
os casos de incidente (que não tinham) contra a base já ingerida, comparar a
distribuição da melhor similaridade nos dois grupos e escolher o corte que
mantém 100% de recall nos casos cobertos. Registrar a distribuição no PR.

**Risco a medir:** piso agressivo aumenta o caminho D (perguntar em vez de
recomendar). Medir a taxa de path D antes e depois; se subir muito, o problema
é cobertura de base, não o limiar.

### F3 — Não promover diferencial a título do atendimento — ✅ IMPLEMENTADO

`deriveChiefComplaint()` deixa de usar `differentials[0].hypothesis`. Ordem
proposta: queixa extraída do texto do médico → `redFlags[0].finding` → `null`.
Se a hipótese for exibida em algum lugar, precisa vir rotulada como hipótese, e
nunca no documento gerado. Corrige diretamente o que aparece no print do
reporte C.

### F4 — Dois caminhos distintos para "incluir um arquivo" — 🟡 METADE IMPLEMENTADA

O reporte B é, na verdade, dois produtos diferentes que hoje estão fundidos num
só e trancados atrás da curadoria:

**(a) Referência do caso** — ⏳ PENDENTE. O que o médico talvez quisesse: Anexo no escopo de
um `encounter`, usado só naquela análise, **nunca** promovido à base global.
Entra no prompt em bloco próprio, marcado como entrada do médico e sujeito ao
`injection-defense`, jamais dentro de `<guideline_evidence
type="TRUSTED_CURATED_SOURCE">` — conteúdo não curado não pode herdar a
confiança de diretriz aprovada.

**(b) Sugerir diretriz para a base** — ✅ IMPLEMENTADO. `POST
/guidelines/suggest` aceita qualquer médico autenticado; o diálogo na tela de
Diretrizes aproveita o front-matter quando existe e, quando não existe, pede
três campos curtos (origem, ano, especialidade). PDF: o médico cola o texto —
o parser de front-matter deixou de ser obrigatório, que era o bloqueio real.

Duas decisões de segurança que valem registro:
- `suggestGuideline` **não supersede** versões anteriores da mesma fonte, ao
  contrário de `ingestForReview`. Num endpoint aberto isso seria escalação de
  privilégio: bastaria sugerir algo com `source: "Surviving Sepsis Campaign"` e
  uma versão nova para remover do retrieval conteúdo já aprovado.
- Sugestão nunca aceita `institutionId` — entra sempre como conteúdo global
  pendente, nunca como protocolo institucional.

Extração de PDF: ✅ implementada. `POST /guidelines/extract-text` lê PDF, `.md`
e `.txt` no servidor (via `unpdf`) e devolve o texto para o médico **conferir e
recortar** antes de enviar. Devolver em vez de ingerir direto é deliberado: um
artigo de 47 páginas inteiro viraria dezenas de chunks de filiação de autores,
metodologia e referências competindo no retrieval com a parte que muda a
conduta. O texto extraído passa pela normalização de hifenização e quebras de
linha do PDF — sem isso o chunking por fronteira de frase não acha fronteira
nenhuma e o material entra como um bloco só.

`bodyLimit` do Fastify: ✅ corrigido de 1 MB para 16 MB. O valor antigo tornava
**inalcançável** o limite de 10 MB que o próprio schema de áudio documenta —
em base64, 10 MB viram ~13,4 MB de corpo e o Fastify devolvia 413 antes de o
schema ser avaliado. Cada endpoint mantém teto próprio e menor.

### F5 — Regra de prompt: evidência recuperada não é confirmação de hipótese

Acrescentar ao `SYSTEM_INSTRUCTION` uma regra explícita de que os chunks
recuperados são **o que a base contém**, não confirmação do diagnóstico: se as
características cardinais do caso (curso temporal, vínculo epidemiológico,
padrão autonômico, dia de doença) não são endereçadas por nenhum chunk
recuperado, isso deve ser dito. Incluir o contexto endêmico brasileiro para
febre aguda no adulto. Alterar prompt é mudança de alto acoplamento: só depois
de F1 e F2, e com os 40 casos sintéticos rodando como rede de proteção.

### F6 — Chunking que não corta dose no meio — ✅ IMPLEMENTADO

`chunkText()` (`ingestion/chunking.ts`) fatia em 500 caracteres fixos com 50 de
sobreposição, sem respeitar frase ou parágrafo. Uma prescrição como "10 mL/kg de
soro fisiológico a 0,9% na primeira hora" pode ser partida em dois chunks, e um
chunk recuperado pode começar no meio de uma frase. Propor: quebra por
parágrafo, agrupando até ~1.200 caracteres, sem nunca cortar dentro de uma
frase.

### F7 — Fechar o ciclo de feedback — ✅ IMPLEMENTADO

Hoje um erro clínico chega por mensagem de WhatsApp. Proposta: botão "cenário
errado" na tela de resultado, que registra o `interactionId`, os chunks
recuperados, o cenário citado e o comentário do médico. Isso transforma cada
próximo reporte em um caso de regressão automático em
`tests/fixtures/field-incident-cases.ts`, em vez de depender de alguém lembrar.

### F8 — Cobertura de base guiada por dados, não por intuição

Com F7 alimentando dados, priorizar os próximos pacotes por frequência real de
casos sem cobertura. Candidatos já visíveis: demais arboviroses (chikungunya,
zika, febre amarela), leptospirose e malária (mesma armadilha da dengue: febre
aguda tratada como sepse), abdome agudo cirúrgico x clínico, TEP instável x
estável, meningite bacteriana x viral (os três últimos já listados como adiados
no KB-004).

### F9 — A busca "híbrida" é semântica na prática (achado desta rodada)

`keywordSearch()` usa `plainto_tsquery('portuguese', <texto do caso inteiro>)`,
que combina TODOS os termos com AND. Com uma narrativa clínica de dezenas de
palavras, praticamente nenhum chunk satisfaz a query — ou seja, na prática o
retrieval de casos reais é **só semântico**, e a metade lexical da busca
híbrida quase nunca contribui.

Isso agrava exatamente o modo de falha dos dois incidentes: não existe âncora
lexical capaz de resgatar um chunk que contenha literalmente "dengue" ou
"cefaleia em salvas" quando o embedding não o coloca no topo. Correção
proposta: extrair termos discriminantes do caso e consultá-los com semântica
OR (`websearch_to_tsquery` ou `to_tsquery` com `|`), ranqueando por `ts_rank`.

**Cuidado obrigatório ao fazer isso:** com OR, a busca lexical passa a
retornar muito mais candidatos fracos. Hits lexicais **não podem** contornar o
piso de relevância — hoje um chunk sem score semântico sobrevive apenas pelo
`ts_rank`, o que é seguro justamente porque a semântica AND torna o casamento
quase exato. Mudar para OR sem revisar essa regra reabre o buraco que o piso
fechou.

---

## 5. Sequenciamento

| Fase | Depende de | Natureza | Estado |
|---|---|---|---|
| F1 — ingerir e provar | curadoria clínica | operação, sem código | ⏳ próximo passo |
| F2 — piso de relevância | calibração depende de F1 | backend, alto impacto | ✅ implementado, a calibrar |
| F3 — título do atendimento | — | backend, baixo risco | ✅ implementado |
| F4 — sugestão de diretriz | — | produto (backend + web) | ✅ implementado |
| F4a — anexo de referência ao caso | — | produto, feature nova | ⏳ pendente |
| F5 — regra de prompt | F1, F2 | prompt, alto acoplamento | 🟡 parcial (aviso de cobertura fraca entregue em F2) |
| F6 — chunking | precisa entrar ANTES da ingestão | backend | ✅ implementado |
| F9 — busca lexical com semântica OR | F2 (piso precisa cobrir hits lexicais) | backend, risco médio | ⏳ pendente |
| F7 — feedback estruturado | — | produto | ✅ implementado |
| F8 — cobertura por dados | F7 | curadoria contínua | ⏳ pendente |

---

## 6. O que este plano não resolve

- Base de contexto é curadoria contínua: fechar dengue e cefaleia em salvas não
  impede que o próximo cenário ausente produza o mesmo tipo de erro. O que muda
  com F2 é que o sistema passa a **dizer** que não cobre, em vez de responder
  pelo vizinho semântico.
- Os pacotes KB-005 e KB-006 são rascunhos técnicos. Sem validação clínica
  assinada e sem ingestão, os dois casos reportados continuam se repetindo
  exatamente como estão hoje.
