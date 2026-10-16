# ADR-019: Cartões revisados — modelo, rascunho com citação literal e anti-circularidade

**Status:** Proposto — base implementada (CC-402, CC-403, CC-412), aguardando revisão clínica
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
