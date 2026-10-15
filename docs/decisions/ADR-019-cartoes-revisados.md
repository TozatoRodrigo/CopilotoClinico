# ADR-019: Cartões revisados — modelo, rascunho com citação literal e anti-circularidade

**Status:** Proposto — base implementada (CC-402, CC-403, CC-412), índice (CC-406), cartões na decisão atrás de flag (CC-408) e importação do ANY com assinatura em lote (CC-405), aguardando revisão clínica
**Data:** 2026-10-14
**Relaciona:** ADR-002/ADR-015 (trilha de auditoria), ADR-009 (multi-tenancy),
ADR-010/ADR-012 (fontes não revisadas)

## Contexto

A ADR-012 deixou o rótulo honesto: conduta que cita fonte sem assinatura de
médico sai preliminar, e dose sem fonte é bloqueada. O efeito é que quase tudo
sai preliminar e sem dose, porque a base não tem assinatura (seed, KB-003/004
e os ~10 mil trechos do MS).

Na reunião de 13/10 com os médicos, a saída combinada foi o **cartão**: uma
situação clínica, pergunta e resposta curta com fonte. A IA rascunha; o médico
só revisa e assina com CRM verificado. O cartão revisado libera a dose e
mostra "Revisado por" (CC-408). Antes disso, três coisas precisam existir:
onde o cartão vive, como a IA o rascunha sem inventar, e como o gabarito não
passa a medir o Copiloto contra os próprios cartões (o problema do gabarito
v1).

## Decisão

### 1. Modelo: cartão estável, conteúdo em versões imutáveis

- `knowledge_cards`: identidade, tema, síndrome de PS, `institution_id`
  (ADR-009: null = global), status e `published_version_id`.
- `knowledge_card_versions`: o conteúdo (JSON validado pelo zod),
  `content_sha256` (JSON canônico, como a ADR-015 — não depende da ordem das
  chaves no jsonb), autoria (`ai` com o rascunho de origem, ou `physician`) e a
  revisão (revisor, data, decisão, comentário mascarado, tempo de revisão,
  validade).
- `knowledge_card_drafts`: cada pedido à IA — tema, trechos, modelo pedido e
  servido, hash do system prompt, hash do conteúdo de origem, o que foi
  rejeitado e por quê, custo.

Status: `draft → in_review → published → archived`. "Revisar" (validade
vencida) é derivado na leitura, não gravado. Corrigir cria versão nova e
**não** derruba a versão publicada: ela vale até outra ser aprovada. Toda
transição recebe a versão que a pessoa viu (409 se mudou) e grava evento na
trilha (`CARD_*`) com versão e hash — comentário e motivo só como hash.

O banco guarda a assinatura sozinho: trigger impede mudar conteúdo e autoria
de uma versão ou regravar a decisão do revisor; CHECKs exigem revisor e data
em toda decisão, validade em toda aprovação e versão assinada em todo
publicado; FKs com RESTRICT; a role da API não apaga cartão nem versão.

Aprovar exige `crm_verified` (403). Rejeitar não: descartar um rascunho não
libera nada para o médico.

### 2. Rascunho por IA com citação conferida por código

O modelo recebe o tema e trechos numerados (`S1`, `S2`…) de diretrizes já
ingeridas — base curada e base oficial, vigentes, da instituição do cartão ou
globais — e devolve cartões em JSON com schema (etapa `card_draft` no
rastro). O modelo só **sugere** a citação. O código decide, por cartão:

- todo trecho citado existe no texto integral da fonte, depois de normalizar
  acento, caixa, espaço e tipografia; trecho com menos de 20 letras não prova
  origem;
- toda dose escrita na resposta ou numa afirmação (o detector de dose da
  ADR-013 diz o que é dose) está num trecho citado por ela;
- a dose estruturada está, campo a campo, no trecho da dose; a droga, no texto
  da fonte.

Cartão que falha é rejeitado antes da revisão e fica só no registro do
rascunho, com o motivo. A correção do médico passa pela mesma checagem: toda
versão gravada tem citação literal.

A busca restrita a domínios oficiais (`research()`), citada no CC-403, ficou
de fora: a checagem determinística precisa do texto integral da fonte, que a
pesquisa web não entrega. Os 188 documentos da Conitec já ingeridos são a
matéria-prima.

### 3. Anti-circularidade

A origem de um rascunho tem duas impressões digitais: o id do pedido e o
SHA-256 dos trechos entregues ao modelo (normalizados, sem ordem). O caso do
gabarito ganha `draftOrigin` opcional — ausente = escrito sem rascunho de IA,
o que mantém os casos atuais válidos. Caso e cartão com o mesmo id ou o mesmo
hash são circulares: o runner do gabarito recusa medir, e
`pnpm cards:check-circularity` sai com código 1. `goldSource` `card` é
recusado pelo schema.

## Consequências

- A base para CC-404 (tela de revisão), CC-405 (importar o ANY) e CC-408
  (cartão na decisão) existe, com a assinatura protegida no banco.
- O rascunho é desligado por padrão (`KNOWLEDGE_CARDS_DRAFT_ENABLED`): custo
  e workspace compartilhado com a produção.
- A checagem é estrita de propósito: paráfrase, conversão de unidade e dose
  arredondada rejeitam o cartão. A taxa de rejeição por modelo
  (`knowledge_card_drafts`) mede isso.
- A revisão usa a barreira da curadoria (papel COMPLIANCE/ADMIN +
  `is_curator`). Se a tela do CC-404 for para médicos sem papel de admin, a
  barreira precisa de um papel de revisor — decisão daquela história.
- A checagem anti-circularidade só vale para casos que registram
  `draftOrigin`: caso escrito a partir de um cartão sem declarar a origem não
  é detectável por código. A revisão do caso continua sendo a defesa.

## Emenda — 15/10/2026: índice semântico dos cartões (CC-406)

**Contexto.** A decisão (CC-408) e a pergunta rápida (CC-501) precisam achar o
cartão certo mesmo quando o médico usa outras palavras. A produção roda com
`EMBEDDING_PROVIDER=none` desde 12/10 (conta da OpenAI sem crédito), e a
coluna das diretrizes é `vector(1536)` — presa ao `text-embedding-3-small`.

**Decisão.**

1. **Índice próprio, derivado.** `knowledge_card_index`: uma linha por
   cartão que pode ser usado agora — versão publicada, aprovada, dentro da
   validade, revisor com CRM verificado, cartão não arquivado. Aprovar
   (versão nova) reindexa; arquivar tira; a varredura diária (04:00 UTC) e
   `pnpm cards:reindex` tiram o vencido e completam o vetor que faltou. A
   busca confere tudo de novo na consulta (junta cartão, versão e revisor):
   uma sincronização que falhou nunca serve cartão fora de uso. A API pode
   apagar linhas daqui (FKs CASCADE a partir do cartão); nada assinado muda.
2. **Vetor sem dimensão fixa, modelo por linha.** `embedding vector` e
   `embedding_model`; a busca só compara vetores do modelo atual e da mesma
   dimensão. Trocar o provedor dos cartões é reindexar, não migrar — e não
   mexe no índice das diretrizes. Sem índice ANN: centenas de cartões cabem
   numa varredura exata.
3. **Provedor atrás de interface.** `CardEmbedder` (`CARD_EMBEDDER`), com
   `purpose` documento/consulta para os provedores assimétricos. A
   implementação de hoje usa o provedor e o modelo das diretrizes pelo
   gateway (`EMBEDDING_PROVIDER`, `AI_EMBEDDING_MODEL`,
   `EMBEDDING_BASE_URL`). Com o provedor desligado, a linha entra sem vetor e
   a busca não roda: a análise segue como antes dos cartões.
4. **O que vira vetor.** Tema, pergunta, população, resposta e o texto das
   afirmações (`cardEmbeddingText`) — sem fontes nem trechos, que puxariam o
   cartão para qualquer busca do mesmo documento.

**Escolha do provedor.** Comparação pela documentação pública (preços de
2025–2026; conferir antes de contratar). Custo não decide: 500 cartões são
~200 mil tokens (centavos para indexar), e uma análise manda até 4 consultas
curtas.

| | OpenAI `text-embedding-3-small` (atual) | Voyage `voyage-3.5` / `-lite` | Qwen3-Embedding (0,6B/4B/8B) por provedor | Modelo local (`bge-m3`, `multilingual-e5-large`, Qwen3-0,6B) |
| --- | --- | --- | --- | --- |
| Custo | US$ 0,02/M tokens | US$ 0,06/M (`lite`: 0,02/M); 200 M tokens grátis por conta | centavos/M, conforme o provedor (DeepInfra e similares) | zero por token; ~2–3 GB de RAM na VPS |
| Dimensões | 1536 | 1024 (256–2048) | até 4096 (8B), 1024 (0,6B), com Matryoshka | 1024 |
| Qualidade em português | boa; a mais fraca das quatro em multilíngue | forte em multilíngue e domínio médico (benchmarks da Voyage) | Qwen3-Embedding-8B liderou o MTEB multilíngue em 2025 | boa (bge-m3 forte no MIRACL); abaixo dos dois anteriores |
| Latência por consulta | rede até os EUA (~100–300 ms) | idem | depende do provedor | CPU da VPS, sem rede (dezenas a centenas de ms) |
| Consulta × documento | não distingue | `input_type` | instrução na consulta | prefixo `query:`/`passage:` (e5) |
| Integração hoje | pronta | formato compatível pela `EMBEDDING_BASE_URL`; `input_type` pede um `CardEmbedder` próprio | compatível com OpenAI (`EMBEDDING_BASE_URL`) | servidor compatível com OpenAI (ex.: text-embeddings-inference) |
| Privacidade | DPA OpenAI | DPA novo (Voyage/MongoDB) | DPA com quem hospeda | nada sai da VPS |
| Risco operacional | conta sem crédito em 11/10 | fornecedor novo | fornecedor novo | um contêiner a mais para operar |

A escolha é pela medição, não pela tabela: `pnpm eval:card-retrieval` embute
os cartões publicados e as perguntas do gabarito de busca em memória (sem
tocar no índice) e mede acerto top-1/top-3, MRR e latência da consulta, com
o provedor que o ambiente apontar. Critério da CC-406: o provedor com maior
acerto top-3 nas 50 perguntas, com meta ≥ 85%; diferença menor que 5 pontos
desempata por privacidade e operação (local > provedor com DPA). Os
candidatos a medir são `voyage-3.5`, Qwen3-Embedding-8B, `bge-m3` local e o
`text-embedding-3-small` como base. Voyage é a favorita em qualidade e é o
mesmo fornecedor do `rerank-2.5`, a alternativa ao Jev no portão da CC-407.

**Pendente.** As 50 perguntas (escritas pelos médicos, depois de haver
cartões publicados), as chaves dos provedores e a rodada de medição. Até lá,
o índice usa o provedor das diretrizes — desligado em produção.

## Emenda — 15/10/2026: cartões na decisão (CC-408)

**Contexto.** Na produção (`stages` + v3 + `model_only`) toda conduta é
conhecimento do modelo, e a regra 7 do prompt e o validador
(`DOSE WITHOUT SOURCE`, ADR-013) não deixam dose sem fonte citada: o médico
recebe "dose conforme protocolo institucional". O cartão revisado é a fonte
que pode liberar a dose.

**Decisão.** Atrás de `COPILOT_REVIEWED_CARDS` (padrão desligada), só na
decisão em etapas (v2, v3, v4), em qualquer fonte de conhecimento:

1. **Busca e portão.** Com o entendimento do caso (Etapa 1), a busca
   semântica do índice (CC-406) roda com as `searchQueries` — nunca o texto
   do caso — na instituição do atendimento. Um portão de relevância decide
   se cada cartão se aplica: hoje similaridade mínima
   (`REVIEWED_CARDS_MIN_SIMILARITY`, padrão 0,50, provisório) e tema — mesma
   síndrome quando cartão e caso têm síndrome definida; senão, o tema do
   cartão nas hipóteses do caso. Até `REVIEWED_CARDS_MAX` cartões (padrão 3).
   O portão é a interface `CardRelevanceGate` (`CARD_RELEVANCE_GATE`): a
   CC-407 troca a implementação (Jev ou reranker) sem mexer na busca nem na
   decisão, recebendo só o entendimento. Portão que falha = nenhum cartão.
   Nenhum cartão aplicável = lacuna (`REVIEWED_CARDS_GAP`, para a CC-409).
2. **Prompt.** O cartão entra na mensagem do usuário, antes da outra
   evidência, como `card:N`, com "Revisado por Dr(a). X, CRM Y/UF, em data",
   versão, pergunta, população, resposta e as afirmações com a dose
   estruturada. Uma nota diz que só a dose de uma linha "Dose" do cartão
   citado pode ser escrita, exatamente como lá. O system prompt não muda; sem
   cartão (flag desligada ou nenhum aplicável) a mensagem é byte a byte a de
   antes — impressões digitais no teste tiradas do código anterior.
3. **Dose liberada só do cartão.** Conduta que cita `card:N` pode trazer
   dose, desde que toda dose do texto dela esteja num campo da dose
   estruturada do cartão (quantidade, teto, frequência), do mesmo fármaco
   (todas as palavras do nome). Dose na resposta em texto livre do cartão não
   basta. Dose fora do cartão é corrigível (`CARD DOSE NOT IN CARD`: um retry
   com feedback); se sobrar, a conduta perde a citação e sai como
   conhecimento do modelo com `unverified_dose`. O resto não afrouxa:
   conhecimento do modelo continua sem dose, e as outras fontes seguem as
   regras de antes.
4. **Origem e tela.** Nova origem `reviewed_card` (rótulo verde, "Cartão
   revisado por médico"); a conduta leva `reviewedCard` (cartão, versão,
   pergunta, nome e CRM do revisor, data) e a tela mostra "Revisado por …
   CRM … em …" com o link para `/cartoes/:id`, que lê o cartão publicado em
   `GET /v1/knowledge-cards/:id` (médico autenticado; cartão de instituição
   só para quem é dela; vencido aparece como "revisar"). A verificação com
   fonte (`verify`) não troca um cartão por página web.
5. **Trilha.** `rawOutput.reviewedCards` guarda id, versão, hash assinado,
   revisor e similaridade de cada cartão entregue; `params.reviewedCards`, o
   que a busca e o portão fizeram (sem texto).

**Medição.** Variante `claude-opus-5-5-v3-modelo-cartoes` do gabarito: a
`claude-opus-5-5-v3-modelo` mais a flag e o embedding dos cartões. O
relatório conta condutas que citam cartão e as que trazem a dose dele.
Critério 3 da CC-408 para ligar: nenhum aumento de erro crítico contra a
v3-modelo, caso a caso.

**Riscos.** O portão provisório erra para os dois lados: tema por radical
de palavra perde sinônimos (cartão fica de fora, a análise segue como antes)
e a mesma síndrome não garante o mesmo cenário (dor torácica: SCA ×
dissecção) — por isso a camada `depends` e a nota do prompt ("só quando
trata desta apresentação") continuam valendo, e a CC-407 calibra o portão
com pares rotulados pelos médicos.

## Emenda — 16/10/2026: conteúdo do ANY como cartões (CC-405)

**Contexto.** O ANY já tem doses e protocolos com a autoria do Dr. Gustavo
Moreira, portados como dado tipado no motor das Ferramentas (ADR-017,
`src/shared/clinical-tools`). Escrever esses cartões do zero, ou pedir à IA
que os reescreva a partir das diretrizes, gasta revisão e modelo no que já
existe. A meta da CC-405 é chegar a 100+ cartões sem começar do zero.

**Decisão.**

1. **Fonte `clinical_tool`.** A fonte do cartão passa a ser uma união: o
   trecho de diretriz de sempre (sem `kind`, para o conteúdo e o hash das
   versões gravadas não mudarem) ou um item do motor (`kind:
   'clinical_tool'`, `toolItemId` = "infusoes/noradrenalina"). O servidor
   resolve o item pelo código no ar (`any-card-catalog.ts`): título (a
   referência do ANY, ou "sem referência bibliográfica"), procedência
   (`ContentProvenance.source`), versão do conteúdo, versão e commit do ANY e
   o hash do texto do item. O cliente manda só a chave e o id, como faz com o
   chunk. Item que saiu do motor não é fonte.
2. **Mapeamento determinístico, sem IA.** Um mapeador por ferramenta escreve
   o dado tipado em linhas ("Noradrenalina: faixa de dose em infusão contínua
   0,01 - 3 mcg/kg/min."). Cada linha é ao mesmo tempo texto da fonte e texto
   do cartão: a resposta e as afirmações citam a linha inteira e a dose
   estruturada sai dela — por campo estruturado do motor (faixa, teto da
   conta, via) ou, no texto corrido (antídotos, CAD, dengue), por regra
   explícita, sempre como pedaço literal da linha. A checagem de citação do
   CC-403 confere tudo; o que não passa fica fora e é listado. Linha de
   limite ("Máximo: …"), de diluição ou ambígua fica sem dose estruturada: a
   dose não é liberada na decisão (CC-408), que é o lado seguro.
3. **Idempotência.** `knowledge_cards.source_key` ("any:<item>"), única.
   Mesmo hash de conteúdo, nada muda; hash novo, versão nova (`author_kind
   import`, `import_id`), de volta a `in_review` sem derrubar a publicada;
   arquivado não volta. Cada execução fica em `knowledge_card_imports`.
4. **Achados para o revisor.** O conteúdo do motor está todo com `review:
   pendente` (CC-310). A versão importada leva `review_flags`: o aviso da
   revisão pendente, os achados dos documentos de revisão
   (`docs/ferramentas/revisao-clinica/`) cujo "Onde" cita o item (ou a
   ferramenta inteira) e, na pediatria, a divergência do id na fonte única
   (CC-321). Ficam fora do conteúdo assinado — são nota para o revisor, não
   texto para o médico — e o trigger os congela com a versão.
5. **Status.** O ciclo do CC-402 não tem "aguardando assinatura": o
   importado entra `in_review` com `assigned_reviewer_id` = o revisor
   indicado.
6. **Assinar lote.** `POST /admin/knowledge-cards/import-batches/sign`: o
   revisor indicado, com CRM verificado, aprova de uma vez os cartões
   importados de uma ferramenta, cada um na versão que viu. Tudo ou nada.
   Por cartão, as mesmas gravações do aprovar um a um (revisor, data,
   validade, `CARD_APPROVED` com versão e hash, índice), mais o `batch` na
   trilha. Só o revisor indicado: o lote é o atalho de quem escreveu o
   conteúdo, não de qualquer curador com CRM — os outros aprovam um a um.

**Consequências.** 175 cartões hoje (pediatria 81, paliativos 25, infusões
23, antídotos 15, ACLS 6, CAD 6, via aérea 6, sedação 5, bloqueios 4, dengue
4), 258 doses estruturadas. A tela do cartão publicado mostra a fonte do ANY
com os mesmos campos da diretriz (título, seção, versão). A anti-
circularidade (CC-412) não cobre o cartão importado: ele não sai de rascunho
de IA; caso do gabarito escrito a partir do conteúdo do ANY precisa ser
recusado na revisão do caso. Mudou o motor (decisão da revisão clínica, novo
porte do ANY), reimportar gera a versão nova para assinar.

**Riscos.** A ligação achado → item é por texto ("Onde" cita o nome ou o id):
achado com nome diferente do item cai só no aviso geral da ferramenta. A
assinatura em lote é rápida de propósito; o tempo de revisão por cartão não é
medido nela (`review_duration_ms` nulo).
