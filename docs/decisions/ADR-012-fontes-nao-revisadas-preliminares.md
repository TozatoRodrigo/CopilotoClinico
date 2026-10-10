# ADR-012: Fonte não revisada por médico sempre embasa conduta preliminar

**Status:** Proposto — implementado na Fase 0-C (contenção), aguardando revisão clínica
**Data:** 2026-10-10
**Altera:** ADR-010 (base oficial do MS como fonte "oficial, não revisada")

## Contexto

O diagnóstico de produto de outubro/2026 mostrou que o Copiloto apresenta como
definitivo conteúdo que nenhum médico revisou, e que isso leva o plantonista
ao cenário errado.

Três fatos sustentam a decisão:

1. **A base curada não é revisada.** Os chunks do seed
   (`prisma/seeds/guidelines-seed.ts`) entraram direto como `approved`, sem
   `reviewed_by`. Os pacotes IBCC (KB-003/KB-004) foram carregados sem
   revisão assinada. A ingestão interna (`GuidelinesService.ingest`) também
   aprova sem revisor. "Curado" virou sinônimo de "está no banco".
2. **A base oficial embasa conduta definitiva.** Pela ADR-010, os ~10 mil
   chunks `official_unreviewed` do MS podem sustentar recomendação não
   preliminar. A calibração mostrou o risco na prática: 8 casos com trecho
   oficial útil contra 17 com trecho irrelevante.
3. **O rótulo de cobertura engana.** Na mesma calibração, 29 de 38 casos que
   a base não cobria apareceram como "cobertura completa".

O médico lê "Diretriz pública" e uma recomendação sem a tag "Preliminar" como
conduta revisada. Nenhuma das duas leituras é verdadeira hoje.

## Decisão

### Recomendação que cita fonte não assinada sai preliminar

Toda recomendação que cita uma destas origens sai com `preliminary: true` e
`preliminaryReason: 'unreviewed_source'`:

- `official_unreviewed` — base oficial do MS (ADR-010);
- `curated_unsigned` — **nova origem**: chunk `approved` sem assinatura válida.

A regra é **determinística**: roda no orquestrador, depois do validador de
saída, nos três caminhos (`analyze`, `analyzeStream`, `continueAnalysis`).
Não depende de o modelo obedecer ao prompt. O prompt só foi ajustado para o
`rationale` não contradizer o rótulo: a frase da OFFICIAL MS GUIDELINES RULE
que dizia "do not need to be preliminary" agora pede `"preliminary": true`.
O resto do prompt ficou byte-idêntico.

O anexo do médico (F4) não muda: continua preliminar pelo validador de saída.

### O que conta como "assinado"

Um chunk é assinado (`clinicallySigned`) quando as três condições valem:

1. `status = 'approved'`;
2. `reviewed_by` preenchido;
3. o revisor é um médico com `crm_verified = true`.

Ser curador (`is_curator`) não basta: o `CuratorGuard` não exige CRM
verificado. "Assinatura" aqui é a aprovação registrada por médico com CRM
verificado, não assinatura digital ICP-Brasil.

O cálculo acontece no retrieval (`fetchChunks`), sem migração: `reviewed_by`
não tem FK para `physicians`, então uma segunda consulta resolve os revisores
verificados — só quando algum chunk tem revisor.

`institutional` e `public` passam a significar "curado **e** assinado". Chunk
institucional sem assinatura também vira `curated_unsigned`. Citação para um
id que não resolve para chunk nenhum idem: nunca é rotulada como diretriz
pública.

### Motivo do preliminar visível ao médico

O campo `preliminaryReason` diz por que a recomendação é preliminar:

| Motivo | Quando | O que o médico vê |
| --- | --- | --- |
| `subtype_ambiguity` | Evidência cobre subtipos de conduta oposta | "Subtipo indefinido — depende do dado que discrimina" |
| `pending_questions` | Modelo marcou preliminar (perguntas, red flag crítica, anexo) | "Preliminar" (texto de sempre) |
| `unreviewed_source` | Cita fonte não assinada | "Fonte não revisada por médico" |

Interações gravadas antes do campo são lidas como `pending_questions`.

### Kill-switch

`UNREVIEWED_SOURCES_PRELIMINARY` (padrão `true`). Com `false`, a contenção de
fonte não revisada é desligada e o prompt volta à frase da ADR-010 byte a
byte — rollback completo sem redeploy. Valor irreconhecível mantém ligado:
um typo não desliga uma proteção clínica.

A contenção por subtipo (`subtype_ambiguity`) não depende desta flag.

### Reversão por fonte (Fase 2)

A contenção é desfeita fonte a fonte, sem mudar flag nem código: quando um
médico com CRM verificado assina um chunk, ele passa a `clinicallySigned` e
volta a embasar conduta definitiva (o cache do retrieval expira em 60 s).

Hoje só chunks `pending_review` podem ser aprovados. A Fase 2 precisa de:

- fluxo para assinar chunks já `approved` sem revisor (seed, KB-003/KB-004);
- curadoria da base oficial por documento/seção, como previsto na ADR-010,
  gravando `reviewed_by`/`reviewed_at` reais;
- exigência de CRM verificado no fluxo de curadoria, para a aprovação já
  nascer assinada.

## Consequências

### Positivas

- O rótulo volta a dizer a verdade: conduta definitiva só com fonte assinada
  por médico.
- A garantia não depende do modelo: um modelo que ignore o prompt não
  consegue apresentar fonte não revisada como definitiva.
- A trilha fica rastreável: `preliminaryReason` é gravado em `rawOutput` e
  `citations` de cada interação.

### Negativas / riscos

- **Quase toda recomendação sai preliminar no curto prazo.** Enquanto a base
  não for assinada, a contenção vale para praticamente tudo. É o estado real
  da base, mas o médico perde o sinal "definitiva × preliminar" até a Fase 2.
- **Ruído no SBAR.** O gerador de SBAR lista toda recomendação preliminar em
  "Pendências", inclusive as de fonte não revisada.
- **Contenção por subtipo é conservadora por desenho.** Marca preliminar mesmo
  quando o modelo discriminou o subtipo certo. Só a conduta em duas camadas
  (Fase 1: conduta comum aos subtipos × conduta que depende do dado
  discriminante) permite afrouxar.
- **Cache.** Por até 60 s após o deploy, resultados de retrieval gravados
  antes do campo `clinicallySigned` são tratados como não assinados (falha
  para o lado seguro).
