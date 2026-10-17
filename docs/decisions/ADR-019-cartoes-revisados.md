# ADR-019: Cartões revisados — modelo, rascunho com citação literal e anti-circularidade

**Status:** Proposto — base implementada (CC-402, CC-403, CC-412), índice (CC-406) e cartões na decisão atrás de flag (CC-408), aguardando revisão clínica
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

## Adendo — revisão no celular e papel de revisor (CC-404, 15/10/2026)

**Decisão:** a tela de revisão (`/revisao`) não usa a barreira do console. Os
revisores do piloto (Luiz, Ripardo, Gustavo Moreira) são médicos de papel
`PHYSICIAN`; dar a eles COMPLIANCE/ADMIN + `is_curator` abriria diretrizes,
feedback, verificação de CRM e o pedido de rascunho à IA, que não são deles.

- Flag nova `physicians.is_card_reviewer` (mesmo modelo provisório do
  `is_curator`, KB-002), concedida à mão pelo runbook.
- Controller próprio, `review/knowledge-cards`, com `CardReviewerGuard`: exige
  a flag **e** CRM verificado já na entrada — o revisor existe para assinar.
  A flag não abre nada de `admin/knowledge-cards`; o papel de admin não abre a
  fila (quem administra e revisa recebe as duas coisas).
- O revisor só vê e decide cartões `in_review` globais ou da instituição com
  que tem vínculo ativo (ADR-009, CC-019): fora do escopo, 404; já decidido, 409.
- As decisões são as mesmas do console (`KnowledgeCardsService`): versão
  vista, CRM para aprovar, trilha `CARD_*`. Na fila, `reviewDurationMs` é
  obrigatório; a tela conta só o tempo com a página visível.
- A vista do revisor traz o texto integral de cada fonte e as faixas do
  trecho citado, calculadas no servidor com a mesma normalização da checagem
  de citação; se o texto da fonte mudou depois da citação (`chunkSha256`), a
  tela avisa.

**Consequência:** dois caminhos de decisão sobre o mesmo serviço. O console
continua para quem cura a base; a fila é o caminho do médico revisor.

## Adendo — revisão cruzada de 10% (CC-411, 15/10/2026)

**Contexto:** no modo verify, uma fonte trouxe "dexametasona 4 mg 6/6h" fora
de contexto — o rascunho da IA erra dose, e um revisor sozinho pode deixar
passar.

**Decisão:**

- **Sorteio na aprovação, determinístico.** O balde é o SHA-256 de
  `cc-411:<id da versão aprovada>` (4 primeiros bytes, módulo 100); entra quem
  fica abaixo de 10. O id da versão existe antes da aprovação, então ninguém
  escolhe o que cai na amostra nem a influencia pelo momento em que decide, e
  o sorteio é reproduzível em SQL. Por aprovação, não por cartão: cada
  aprovação nova é um sorteio novo. A linha `pending` nasce na transação da
  aprovação (`knowledge_card_cross_reviews`).
- **Segundo médico ≠ primeiro.** Nem quem aprovou nem quem escreveu a versão
  (correção de médico): filtro na fila, 403 no serviço e CHECK no banco.
- **Divergir é corrigir, e tira do ar.** Esta é a exceção à regra "corrigir
  não derruba a versão publicada": quando o segundo médico discorda, a versão
  disputada não deve seguir liberando dose. A correção vira versão nova, o
  cartão volta a `in_review` com `published_version_id` nulo e outro médico
  decide (aprovar a correção, corrigir de novo ou descartar). Novo `reopen` no
  ciclo de vida (publicado → em revisão).
- Sorteio e decisão não mudam depois de gravados (trigger), e a trilha recebe
  `CARD_CROSS_REVIEW_AGREED`/`_DIVERGED` com versões e hashes, sem texto livre.
- Sem flag: a revisão cruzada só restringe (pode tirar cartão do ar), nunca
  libera conduta, e os cartões ainda não chegam à decisão (CC-408).

**Consequências:** a taxa de concordância (painel `/revisao/concordancia`,
meta de divergência < 5%) só tem sentido com volume: com os 200–300 cartões do
CC-410, são 20–30 revisões cruzadas. A porcentagem é constante no código
(`CROSS_REVIEW_SAMPLE_PERCENT`); mudar exige PR.

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
   do caso — na instituição do atendimento, se o médico ainda tem vínculo
   ativo com ela (CC-019; senão, só nos globais). Um portão de relevância decide
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
   só para quem tem vínculo ativo com ela, CC-019; vencido aparece como
   "revisar"). A verificação com
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
