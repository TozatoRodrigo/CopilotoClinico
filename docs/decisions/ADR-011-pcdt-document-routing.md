# ADR-011: Roteamento por documento e afunilamento guiado pelos PCDTs (fase B)

**Status:** Proposto — aguardando revisão
**Data:** 2026-09-24
**Depende de:** ADR-010 (base oficial do MS em produção e medida)

## Contexto

Na fase A (ADR-010), o Copiloto usa os PCDTs como **trechos soltos**: até 3
por análise, no máximo 2 do mesmo documento. Isso desperdiça o que o PCDT tem
de mais valioso — a **sequência**: critérios de diagnóstico → casos
especiais → classificação → tratamento por gravidade. Um trecho como "soro
antibotrópico, 4 ampolas" citado sozinho omite que ele só vale para o acidente
moderado, que é justamente a classificação que o médico precisa fazer antes.

A proposta de produto (24/09/2026): o médico descreve o caso, o sistema
localiza o documento que se aplica, segue o caminho do documento e, com a LLM,
pergunta o que falta para afunilar num ramo específico.

Três fatos limitam o desenho:

1. **Poucos PCDTs são roteiro de pronto-socorro.** De ~190 documentos, 8 a 10
   orientam conduta aguda (AVC isquêmico, acidentes ofídicos e escorpiônicos,
   agrotóxicos, Guillain-Barré, asma em crise, Covid hospitalar). O resto é
   doença crônica, e os "critérios de inclusão" desses documentos decidem
   dispensação de medicamento no SUS, não triagem de emergência.
2. **Seguir um documento amplifica o erro de escolha.** Com trechos, a busca
   errada põe um trecho errado no prompt. Com roteamento, a análise inteira
   segue o documento errado — o modo de falha dengue→sepse em escala maior.
3. **Gerar árvore de decisão a partir do PCDT por LLM** seria conteúdo novo,
   derivado e não revisado. Roteiro determinístico já tem lugar no projeto: o
   motor de protocolos guiados (ADR-008, PROT-002), que exige validação clínica
   assinada.

## Decisão proposta

### 1. Roteamento: documento antes de trecho

Etapa própria, antes do prompt clínico:

- Candidatos vêm do **catálogo de documentos** (`official_guideline_documents`:
  título, CID-10, `careSetting`, cenários do piloto, títulos de seção) — não
  da busca de trechos.
- Cada documento ganha um vetor de roteamento (título + CIDs + cenários +
  títulos de seção + início da introdução), gravado pelo coletor.
- Busca semântica sobre esses vetores + casamento de CID quando o caso cita um
  CID ou diagnóstico explícito. `cronico` penalizado como na fase A.
- Resultado: **0, 1 ou 2 documentos**, cada um com um motivo. **"Nenhum" é
  resposta válida e esperada** na maioria dos casos: aí a análise segue
  exatamente como na fase A.

### 2. Leitura do documento inteiro, não de trechos

Para o documento escolhido, entram no prompt as **seções clínicas completas**
(diagnóstico, critérios, casos especiais, tratamento, monitorização), em
ordem, dentro do bloco `OFFICIAL_MS_UNREVIEWED`.

Documentos grandes (asma: ~117 mil caracteres de seções clínicas; parto
normal: ~800 chunks) não cabem inteiros. Para eles: teto de tokens por
documento e seleção das seções pelo par (título da seção × caso), mantendo
sempre diagnóstico e classificação.

### 3. Afunilamento pelas perguntas que já existem

Sem mecanismo novo: o ciclo de `clarifyingQuestions` (até 3 por turno, até
`COPILOT_MAX_TURNS` turnos) passa a ser **ancorado no documento**. Regra
nova no prompt, só quando há documento roteado:

- Identificar no documento o **ponto de decisão** em que o caso está
  (ex.: classificação de gravidade) e quais critérios o texto do caso já
  preenche.
- Perguntar **somente** pelos critérios que faltam para escolher o ramo, com
  o `why` citando o documento ("O PCDT de Acidentes Ofídicos classifica a
  gravidade pelo tempo de coagulação e pelo sangramento sistêmico").
- Recomendar a conduta do ramo quando os critérios estiverem preenchidos; até
  lá, recomendações do ramo são `preliminary`.
- Se o caso contradiz o documento (ex.: o quadro não é o que o documento
  trata), dizer isso e voltar ao caminho da fase A — nunca forçar o encaixe.

### 4. O caminho visível e corrigível

Na tela de resultado, acima das recomendações:

> Caminho sugerido: **PCDT de Acidentes Ofídicos** (Ministério da Saúde · não
> revisado) → Classificação de gravidade → Soroterapia · [Ver documento] ·
> [Não é este caso]

"Não é este caso" refaz a análise sem o documento e registra o evento no
feedback estruturado (F7) — é o dado que calibra o roteamento.

### 5. Fora do escopo desta fase

- Converter PCDT em `ProtocolNode`/`ProtocolEdge` automaticamente. Os 8 a 10
  PCDTs agudos podem virar protocolos guiados (fase C), com a mesma validação
  clínica assinada exigida pelo PROT-003.
- Roteamento para documentos curados (KB-00x) — mesma ideia, depois.

## Etapas

| # | O quê | Critério de aceite |
|---|---|---|
| B1 | Vetor de roteamento por documento no coletor (`--reclassify` gera para a base existente) | 100% dos documentos ativos com vetor; teste de unidade do texto de roteamento |
| B2 | `DocumentRouter`: candidatos por vetor + CID, penalização crônica, limiar próprio, 0–2 documentos | Casos de incidente (dengue, cefaleia em salvas) roteiam para **nenhum** PCDT; casos de ofídico/escorpiônico/AVC isquêmico roteiam para o documento certo |
| B3 | Montagem do contexto do documento com teto de tokens e seleção de seções | Nenhum prompt acima do teto; diagnóstico/classificação sempre presentes |
| B4 | Regra de afunilamento no prompt + validador (perguntas com `why` citando o documento roteado) | Em caso de ofídico sem dados de gravidade, 1ª rodada pergunta pelos critérios de classificação e marca a conduta como preliminar; 2ª rodada, com os dados, recomenda o ramo certo |
| B5 | UI do caminho + "Não é este caso" + evento F7 | Teste de componente; evento aparece na trilha de auditoria |
| B6 | Medição: fase A × fase B nos casos sintéticos + casos de roteamento | Sem regressão nos 40 casos sintéticos; taxa de roteamento errado reportada no PR |

## Métricas de sucesso

- **Roteamento correto** nos casos com PCDT agudo aplicável.
- **"Nenhum" correto** nos casos sem PCDT aplicável (o mais importante: é o
  que evita o vizinho semântico).
- **Rodadas até a conduta** nos casos roteados (esperado: menos perguntas
  genéricas, mais perguntas decisivas).
- Taxa de "Não é este caso" em produção (F7).

## Consequências

### Positivas
- Usa a estrutura do PCDT, não só o texto: a conduta chega com a
  classificação que a justifica.
- Perguntas deixam de ser genéricas (ABCDE) quando há documento, e passam a
  ser as que o próprio documento diz que decidem o caminho.
- Reaproveita o ciclo de perguntas, o validador e a UI existentes.

### Negativas / riscos
- Uma etapa a mais por análise (roteamento): custo e latência pequenos (uma
  busca vetorial sobre ~190 documentos), mas o prompt fica maior quando há
  documento roteado.
- Roteamento errado é mais danoso que trecho errado — por isso o caminho é
  visível, corrigível com um clique e medido antes de ir para produção.
- Continua sendo conteúdo **não revisado** pela equipe clínica (ADR-010): o
  rótulo acompanha o caminho inteiro, não só a citação.

## Pré-requisitos

1. Fase A em produção com a base sincronizada (`pnpm sync:official-guidelines`).
2. Medição da fase A (passo 8 do `docs/plano-fontes-oficiais-pcdt.md`): diz em
   quais casos os PCDTs de fato aparecem e ajudam, e calibra os limiares que o
   roteador herda.
3. `text_tsv` populado (busca lexical) — CID e nome de medicamento são o que
   mais ajuda a escolher o documento certo.

## Perguntas para a revisão

1. A lista dos PCDTs agudos (fase C) deve ser definida por um médico agora, ou
   derivada da classificação automática depois de medida?
2. "Não é este caso" deve refazer a análise automaticamente ou só registrar e
   deixar a análise atual como está?
3. Qual o teto aceitável de latência extra por análise com documento roteado?
