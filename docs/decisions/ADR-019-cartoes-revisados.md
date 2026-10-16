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
