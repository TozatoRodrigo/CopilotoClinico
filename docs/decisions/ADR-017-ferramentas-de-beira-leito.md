# ADR-017: Ferramentas de beira-leito (incorporação do ANY App)

**Status:** Aceito — área atrás de `NEXT_PUBLIC_FERRAMENTAS` (desligada) até a cessão do ANY (CC-301) e a revisão clínica do conteúdo (CC-310)
**Data:** 2026-10-14
**Relaciona:** ADR-007 (modelo de protocolo), ADR-008 (motor de execução de protocolo)

## Contexto

O ANY App (Gustavo Moreira) foi autorizado a ser absorvido inteiro no
Copiloto: 75 calculadoras em 16 categorias, infusões contínuas, ACLS, via
aérea, choque, TEP, pediatria, toxicologia, dengue, CAD, ventilação,
sedação, paliativos e bloqueios. No ANY toda a conta roda no navegador, em
React, sem testes no v4 (um branch antigo tem 81 testes Vitest). As faixas de
entrada existem só como `min`/`max` de HTML e não barram nada.

O motor de protocolos do backend (`ProtocolRun`, ADR-008) exige um
atendimento, compara resposta só por igualdade e não tem timer nem faixa
numérica. Não serve para o ciclo do ACLS, para infusão nem para dose por peso.

São 15 ferramentas para portar em sequência (CC-306 a CC-329). A base precisa
estar decidida antes da primeira, para não ser refeita no meio.

## Decisão

### 1. Motor clínico em TypeScript puro, compartilhado

O cálculo mora em `src/shared/clinical-tools/`, sem dependência de navegador
nem de Node e sem pacote externo. O mesmo código serve:

- ao web, pelo alias `@clinical-tools/*` (`web/tsconfig.json` e
  `web/vitest.config.ts`), na tela e, no CC-322, offline;
- à API, por import direto, quando o Copiloto precisar calcular um escore
  dentro do caso.

`tsconfig.clinical-tools.json` compila o motor sozinho com `lib: ES2022` e
`types: []`: um `window`, `document`, `process` ou `Buffer` quebra o
`pnpm typecheck`.

O web passa a importar código de fora de `web/`. O `next.config.ts` fixa
`turbopack.root` e `outputFileTracingRoot` na raiz do repositório, e a imagem
do web (`docker/Dockerfile.web`) copia `src/shared/clinical-tools` para o
mesmo lugar relativo. Com isso o build standalone sai em
`.next/standalone/web/server.js` em todo ambiente (local, CI e Docker).

### 2. Conteúdo clínico é dado tipado e versionado

Calculadora, droga e roteiro são definições (`CalculatorDefinition` e as que
vierem), não JSX. Itens, pontos, faixas, textos de ação, referência e
pérolas ficam na definição. **Nenhuma dose ou limiar mora em componente.**

A faixa sai do valor por limites (a maioria dos escores) ou por regra
(`byRule`), quando o valor sozinho não decide: CAM-ICU (F1 e F2 e F3 ou F4),
Winters (pCO2 medida contra a esperada), Rumack-Matthew (nível contra a
linha). Mesmo na regra, os textos de cada faixa ficam na definição; a regra só
escolhe o id. Resultados secundários da mesma conta (QTc de Fridericia,
divisão do Parkland, DPP) saem em `details`; combinação de campos que não
fecha (31/02, DUM no futuro) sai em `check` e não calcula. Versão não oficial
do escore (GRACE "aproximação", APACHE II "simplificado") traz
`versionNotice`, fixo na tela e no texto do prontuário.

Toda definição carrega `provenance`: origem (arquivo e revisão do ANY),
versão do conteúdo (semver, sobe a cada mudança clínica), data e revisão
clínica (`pendente` ou `revisado` com nome, CRM e data). A tela mostra isso no
rodapé da ferramenta.

### 3. Testes diferenciais contra o ANY congelado

O código de cálculo do ANY usado como referência é copiado sem alteração para
`tests/any-reference/` (só teste; `tests/` não entra em build nem na imagem).
Cada arquivo traz no cabeçalho a origem e o sha256 do original;
`reference-integrity.spec.ts` confere o hash e falha se algo em `src/`,
`web/src`, `evals/` ou `scripts/` importar de lá.

Cada função portada é comparada com a referência em **1.000 entradas
aleatórias dentro das faixas válidas**, com gerador de semente fixa
(`tests/clinical-tools/seeded-random.ts`, sem dependência nova), e com
**tolerância declarada por função** (`PORTS` em `differential.spec.ts`).
Escore pequeno (até 10.000 combinações) é conferido também em todas as
combinações. Compara-se valor, nome da faixa e tom; o texto da ação passa
pela regra de linguagem (item 4) e pela revisão clínica.

Os testes do branch antigo do ANY são portados junto com a ferramenta que
testam.

### 4. Telas no design system, celular primeiro

- Resultado ao vivo, sem botão "Calcular".
- Valor fora da faixa é erro e não calcula. Peso adulto 40–200 kg,
  pediátrico 0,5–50 kg; cada campo numérico declara a sua faixa.
- Vírgula decimal na tela; a entrada aceita vírgula ou ponto. Ponto seguido de
  exatamente três dígitos ("1.500") é recusado como ambíguo, porque em
  português é milhar e o `parseFloat` leria 1,5.
- Unidade sempre visível ao lado do valor, no campo e no resultado.
- Linguagem de sugestão: "considere …", nunca "faça imediatamente". As
  definições têm teste que barra frase começando por verbo de ordem.
- Aviso fixo em toda ferramenta: "Apoio à decisão; não substitui o
  julgamento clínico".
- Botão "Copiar para o prontuário" com resultado, faixa, respostas, sugestão e
  referência, sem dado de paciente.

#### Cores

O motor não conhece cor, só o tom do resultado. A tela mapeia para o design
system preservando a semântica clínica fixa (laranja muda a conduta, verde é
conduta confirmada, vermelho é risco crítico):

| ANY | Significado no ANY | Tom no motor | Design system |
| --- | --- | --- | --- |
| Verde `#4CAF50` | baixo risco, dose na faixa | `neutral` | cinza (`gray`) |
| Amarelo `#FFC107` | risco intermediário, dose acima do usual | `attention` | laranja (`orange`) |
| Vermelho `#F44336` | alto risco, dose crítica | `critical` | vermelho (`red`) |

O verde do ANY não vira verde: no Copiloto verde é "conduta confirmada/
assinada", e um escore baixo não confirma conduta nenhuma. O amarelo vira
laranja porque pede reavaliação, que é o significado do laranja; o amarelo do
design system é tom de categoria, sem peso clínico. O rótulo da faixa vai
sempre junto do tom: estado nunca só por cor.

### 5. O motor de protocolos fica para o caso

`ProtocolRun` continua servindo só a protocolos ligados a um atendimento. Timer,
faixa numérica e dose por peso ficam no motor das Ferramentas.

### 6. Offline primeiro

ACLS, Pediatria, Infusões e Calculadoras precisam abrir e calcular sem sinal.
Por isso o motor não chama rede e as páginas de calculadora são
pré-renderizadas (`generateStaticParams`); o que depende do endereço
(`?droga=`, `?de=`) é lido no cliente, atrás de `Suspense`.

Implementação (CC-322):

- `pnpm build` do web roda `scripts/generate-offline-manifest.mjs` depois do
  `next build`: lê as rotas pré-renderizadas de `/ferramentas/**` e os arquivos
  de `/_next/static` que o HTML e o payload RSC delas citam (os chunks do motor
  entre eles) e grava `public/ferramentas-offline.json` (gerado, ignorado no
  repositório) com a versão = hash do conteúdo. Hoje: 126 páginas, ~80
  arquivos, ~8 MB. Com a flag desligada o arquivo não existe e nada é
  pré-carregado.
- `public/sw.js` baixa a lista na primeira abertura com sinal, em qualquer tela,
  num cache por versão (`copiloto-ferramentas-<versão>`); a versão nova só
  substitui a anterior depois de baixada inteira, e sessão vencida (redirect
  para /login) não entra no cache. Página de ferramenta vem do cache completo
  na hora (com sinal ruim não espera a rede); a troca de tela por RSC espera a
  rede no máximo 4 s e, sem resposta, o Next recarrega a página, que vem do
  cache.
- A página pede a sincronização ao abrir e no evento `online`; o rodapé das
  Ferramentas mostra "Disponível sem conexão · versão do conteúdo …" e oferece
  recarregar quando chega versão nova. Sem sinal, o aviso do topo nas
  Ferramentas é "Sem conexão: ferramentas funcionam, análise do caso fica na
  fila".
- Teste: `e2e/ferramentas-offline.spec.ts` (Playwright, só o web, sem API:
  `pnpm exec playwright test -c playwright.ferramentas.config.ts` depois de um
  build com a flag ligada).

### 7. Navegação

- Rota `/ferramentas` no grupo `(app)`, protegida como as demais. Grupos do
  hub: Calculadoras, Ressuscitação, Via aérea, Choque e sepse, Pediatria,
  Toxicologia, Metabólico, Ventilação, Sedação e dor, Paliativos e
  Infecciosas. Infusões fica em Calculadoras; TEP em Choque e sepse; bloqueios
  em Sedação e dor.
- Busca por nome e sinônimo, sem acento. Ferramenta ainda não portada aparece
  como "em breve" e não abre.
- Favoritos no aparelho (`localStorage`), até 15, sem servidor.
- **Barra inferior do celular: Ferramentas entra no lugar de Buscar.** A
  barra fica Plantão, Casos, microfone, Diretrizes, Ferramentas. A busca vai
  para uma lupa no topo (celular) e continua no ⌘K e no sidebar. Diretrizes
  fica porque é a referência clínica do caso; Buscar era o único item que
  repetia um atalho já presente. Assim qualquer ferramenta abre em dois
  toques: Ferramentas e o item (ou o favorito).
- A área também entra no sidebar, na trilha da rota e na paleta ⌘K.

### 8. Ativação

`NEXT_PUBLIC_FERRAMENTAS=on` (variável de build do web) liga a área. Desligada
(padrão), nada muda para o médico: sem item de menu, barra inferior como
antes e `/ferramentas` mostra a página de não encontrada. Ligar exige a cessão do ANY assinada
(CC-301) e a revisão clínica das ferramentas publicadas (CC-310).

### 9. Roteiro com relógio: o estado mora acima das rotas (ACLS)

O ACLS (CC-313) tem relógio, alertas e metrônomo que não podem parar quando o
médico abre outra ferramenta. O estado da parada é um reducer puro no motor
(`src/shared/clinical-tools/acls/session.ts`, tempo sempre injetado) e o
provider que o roda fica no `AppShell`, só com a flag ligada. Uma faixa
"Parada em andamento" aparece abaixo da barra do topo em qualquer tela.

A parada em curso é guardada no aparelho (`localStorage`) a cada registro,
para sobreviver a um recarregamento da aba; some ao ser descartada e, se
esquecida, 12 h depois do início. Só o roteiro: horários, ritmo, contadores e
linha do tempo, sem identificação do paciente e sem ir ao servidor.

O metrônomo agenda as batidas à frente no relógio do Web Audio (o ANY usava
`setInterval`, que acumula atraso) e a tela fica acesa pela Wake Lock API,
com aviso discreto quando o navegador não suporta.

**Histórico de paradas (CC-314): no aparelho, sem identificação, apagável.**
Ao encerrar (RCE ou óbito), a parada vira um registro no `localStorage`
(`copiloto:ferramentas:acls:historico`): número do atendimento, data, horários,
ritmo inicial, desfecho, ciclos, choques, duração e o relatório pronto para o
prontuário. O roteiro não pede nem guarda nome, leito, prontuário ou qualquer
dado do paciente, e o relatório não traz nenhum. O médico apaga um registro ou
todos (com confirmação); passando de 50, sai o mais antigo. Nada vai para o
servidor neste momento.

Alternativas consideradas: cifrar no aparelho (sem segredo do usuário, a chave
ficaria ao lado do dado; não protege nada a mais do que o próprio aparelho) e
ligar a parada a um caso do Copiloto (exige servidor, auditoria e o fluxo de
dado de paciente; fica para quando houver pedido e a revisão de LGPD). Em
aparelho compartilhado, quem abre o navegador vê o histórico: por isso ele não
tem identificação e o apagar fica na própria tela.

### 10. Ligações entre ferramentas e estado na aba (CC-331)

Os roteiros se chamam: o Choque abre a noradrenalina em Infusões, o TEP a
heparina, o ACLS a Via aérea e a Toxicologia, a Via aérea a sedação pós-IOT, a
Sedação a Via aérea, e as calculadoras o roteiro em que também existem. No
legado o `goToInfusion(droga)` guardava o estado; no ANY v2 o `?drug=` era
ignorado e o estado se perdia.

- **Estado:** um módulo só, `web/src/lib/tool-session.ts` (`sessionStorage`,
  chave `copiloto:ferramentas:sessao:<chave>`, formato `{ savedAt, value }`),
  com validade por chave: roteiros de reavaliação horária (Choque, CAD e EHH)
  6 h, HACOR 4 h, o resto 30 min. O peso adulto é um só para as ferramentas
  adultas. As respostas das calculadoras também ficam ali. O ACLS continua no
  `localStorage` do item 9, porque a parada precisa sobreviver a fechar a aba.
- **Endereço:** só o que o destino precisa para abrir no lugar certo
  (`?droga=`, `?indicacao=tep`, `?grupo=sedation`, `?aba=vti`) e de onde o
  médico veio (`?de=<ferramenta>` ou `?de=calculadoras/<id>`). Os montadores
  ficam no motor (`src/shared/clinical-tools/links.ts` e `infusionHref`); nada
  de paciente vai no endereço.
- **Volta:** o layout de `/ferramentas` mostra "Voltar para …" quando há `?de=`
  válido. No app instalado não existe o "voltar" do navegador.
- Um teste varre o código e falha se algum `?droga=` apontar para droga que
  não está nas Infusões, ou algum link para ferramenta fora do catálogo.

### 11. Ferramenta certa no plano do Copiloto (CC-332)

O plano leva o médico à ferramenta que o caso pede, já preenchida.

- **Mapeamento no motor, por regra fixa.** `case-suggestions.ts` decide a
  partir do entendimento do caso (síndrome, sinais vitais, idade, achados,
  hipóteses; ADR-013/014) e das condutas do plano. Nada de IA: a mesma
  entrada dá sempre a mesma sugestão. Há regras de dado, que valem em
  qualquer síndrome (parada → ACLS, criança → Pediatria, IOT → Via aérea,
  sepse com hipotensão → Choque séptico, TEP nas hipóteses → TEP, droga
  vasoativa no plano → Infusões na droga, CAD/EHH, dengue), e uma decisão por
  síndrome de PS: `SYNDROME_DECISIONS` é `Record<PsSyndrome, …>`, então
  síndrome nova no catálogo não compila sem dizer "ferramenta" ou "nenhuma, e
  por quê". Roteiro adulto não aparece para criança e vice-versa. No máximo 3
  sugestões. O mapeamento é conteúdo clínico, versionado em
  `CASE_TOOL_MAPPING_PROVENANCE` com revisão pendente do Dr. Ripardo
  (`docs/ferramentas/revisao-clinica/ferramentas-no-plano.md`).
- **Flag na API, não no web.** `COPILOT_TOOL_SUGGESTIONS` (padrão `off`) é
  lida a cada chamada em `GET /copilot/conversation`, porque o caso inteiro
  está na API: o entendimento de cada rodada e, sem ele, a leitura do
  Copiloto guiado, que o web não recebe. Liga e desliga sem redeploy, como as
  outras flags clínicas. Desligada, a resposta fica idêntica (nem o campo
  `toolSuggestions` aparece). A tela ainda exige `NEXT_PUBLIC_FERRAMENTAS=on`.
- **Preenchimento.** A API devolve os números do caso (`CaseToolFacts`: idade,
  sexo, peso dito no texto, PA, FC, FR, SpO₂, temperatura, glicemia; nada
  estimado). `case-prefill.ts` diz o que cada calculadora recebe: campo direto
  ou item pelo mesmo limiar do rótulo. Quando o número não decide o item, ele
  fica vazio: o "SpO₂ < 95% em ar ambiente" do PERC só vira Sim, porque o Não
  exigiria saber que a medida foi em ar ambiente e um PERC negativo afasta TEP.
  O preenchimento nunca fecha um escore nem avança um roteiro sozinho. Todo
  campo preenchido aparece "vindo do caso" até o médico trocar o valor.
- **Nada de dado clínico no endereço.** "Abrir <ferramenta>" grava na sessão
  da aba (`tool-session.ts`) o elo `caso:<token>` (caso, ferramenta, números;
  30 min), o aviso `caso-aberto` (2 min, só para a tela que abre em seguida
  montar já com o caso) e o que as telas leem ao montar (peso adulto,
  respostas da calculadora). Abrir pelo caso troca o peso adulto da aba pelo
  do caso, ou o apaga: o peso do paciente anterior nunca entra numa conta
  deste. O endereço leva só a ferramenta, o lugar dentro dela (`?droga=`) e
  `?caso=<token>`, 16 letras sorteadas, sem dígito.
- **Resultado de volta ao caso.** Na ferramenta aberta pelo plano, "Anexar ao
  caso" fica ao lado de "Copiar para o prontuário" e guarda o mesmo texto
  (sem dado de identificação) em `caso-anexos:<atendimento>` (6 h). A conversa
  mostra os anexos e os leva na próxima reanálise, seja ela qual for, como
  respostas com o `questionId` reservado `resultado-de-ferramenta`, rotulado
  no prompt como "Resultado de ferramenta calculado pelo médico". Sem o token
  no endereço não há "Anexar ao caso".
- **Caminho para o CC-333.** A API já importa o motor e já extrai do caso as
  entradas das calculadoras (`caseToolFacts`, `calculatorCasePrefill`). Para
  o Copiloto calcular o escore citado no plano, a decisão chama o motor com
  essas entradas (tool use) e, faltando dado, pede o dado em vez de estimar.

#### Adendo (CC-333, 2026-10-15): escore do plano pelo motor, sem tool use

O escore citado no plano vem do motor, não do modelo, em duas camadas atrás
de `COPILOT_DETERMINISTIC_SCORES` (padrão `off`; desligada, prompt e saída
ficam byte a byte iguais, conferido por impressão digital em
`orchestrator.deterministic-scores.spec.ts`):

1. **Pré-cálculo, antes da decisão.** As calculadoras que o mapeamento acima
   sugere para o caso (as diretas e as de dentro de um roteiro, como Wells e
   PERC no TEP) são calculadas pelo motor quando o caso traz todas as
   entradas, e vão ao fim da mensagem do usuário como fato: "CURB-65 = 5
   pontos, calculado pelo sistema com: estado mental: confusão; ureia 64
   mg/dL; FR 32 irpm; PA 85x50 mmHg; idade 72 anos". As que não fecham vão
   com o que falta. Uma regra fixa diz ao modelo para nunca calcular escore e,
   sem o valor, escrever "Falta saber: <dado> para calcular <escore>". O
   system prompt não muda (continua cacheável).
2. **Conferência, depois da decisão.** Todo escore de uma lista fechada
   (`SCORE_CITATIONS`, 25 escores) citado com número em qualquer campo da
   saída é recalculado com os dados do caso. Divergiu: o número vira o do
   motor, marcado "[corrigido pelo sistema]", e o log registra
   `SCORE_CORRECTED` (id, campo e referência, sem texto clínico). Sem dado
   para calcular: o número sai, fica "CURB-65 [falta saber: ureia para
   calcular]" e o log registra `SCORE_INPUTS_MISSING`. Quando o motor calcula,
   as entradas usadas vão ao fim da justificativa da conduta (ou do
   raciocínio). Quando o motor não calcula mas o próprio caso informa o valor
   (Glasgow dito pelo médico, resultado de ferramenta anexado), esse valor é a
   referência. É correção determinística, como a da pergunta sobre dado já
   informado na v3: roda na saída já validada e nunca pede retry. Cada
   conferência (número que o modelo escreveu, campo, referência e resultado)
   e os escores calculados ficam em `rawOutput.deterministicScores`.

As entradas vêm do caso por regra fixa (`case-scores.ts`): sinais vitais e
idade do entendimento; ureia, estado mental, O₂ e Glasgow do texto. Item que o
dado não decide fica sem resposta e o escore não sai: um escore com item
chutado viria com a autoridade do sistema. Hoje fecham CURB-65, qSOFA, NEWS2 e
índice de choque; PERC, Wells, HEART, Ottawa e Alvarado só recebem idade, FC e
temperatura e, citados com número, viram pedido do dado. A leitura é conteúdo
clínico versionado (`CASE_SCORES_PROVENANCE`), com revisão pendente do Dr.
Ripardo (`docs/ferramentas/revisao-clinica/escores-pelo-motor.md`).

**Por que não tool use.** O critério da história fala em "tool use"; o que ele
pede é que o número venha do código, com as entradas listadas, e que sem dado
o plano peça o dado. Pré-cálculo e conferência entregam isso com menos
latência e menos risco do que o modelo chamar a calculadora pela API da
Anthropic que o projeto usa (Messages API, saída estruturada em
`output_config.format`, raciocínio adaptativo, streaming):

- **Não garante o critério sozinho.** No Opus 5.5, o modelo da decisão,
  `tool_choice` forçado (`any`/`tool`) devolve 400; só existe `auto`, e o
  modelo pode citar o escore sem chamar a ferramenta. A conferência depois da
  decisão seria necessária de qualquer jeito.
- **Pelo menos uma ida e volta a mais.** A chamada para em `tool_use`, o
  código calcula, e a decisão continua numa segunda inferência com o prompt
  inteiro reenviado (o cache barateia a entrada, não o tempo de geração) e os
  blocos de raciocínio devolvidos sem alteração. A decisão já leva dezenas de
  segundos no plantão; a conferência custa milissegundos.
- **As entradas seriam do modelo.** Na chamada, quem escolhe "ureia = 64" é
  o modelo; ele pode passar um valor estimado. Aqui as entradas saem do caso
  por regra fixa, a mesma do preenchimento acima.
- **Um laço por provedor e por caminho.** O gateway tem um provedor por etapa
  (Anthropic e perfis compatíveis com OpenAI, como a Groq), streaming com
  deltas, retry com o feedback do validador, fallback de recusa e rastro por
  chamada (`ai_calls`). Tool use exigiria o laço em cada provedor e no
  streaming; pré-cálculo e conferência não dependem do provedor.

Tool use volta a valer para escores cujas entradas são história em texto
livre, que regra fixa não lê (CHA₂DS₂-VASc, a história do HEART): aí o modelo
extrairia as entradas, o motor calcularia e a tela mostraria as entradas para
o médico confirmar.

**Medida.** A variante `claude-opus-5-5-v3-modelo-escores` do gabarito é a v3
só com o conhecimento do modelo mais a flag; o relatório ganha "Escore citado
≠ motor" (o que o modelo escreveu, antes da correção) e o mesmo número no
texto entregue ao médico, que com a flag tem de ser zero.

## Consequências

- Toda ferramenta nova traz definição com procedência, teste diferencial e,
  quando houver, os testes antigos do ANY. Sem isso não entra no registro.
- A imagem do web passa a incluir `src/shared/clinical-tools`. Mudança no motor
  exige rebuild do web, não só da API.
- O `vitest` do web roda no CI (job Frontend Quality Gates).
- O texto clínico portado do ANY teve só acentuação corrigida e imperativos
  trocados por sugestão; a revisão médica (CC-310) pode mudar texto e sobe a
  versão do conteúdo.
- Inconsistências do ANY encontradas no porte vão para a revisão clínica em vez
  de serem corrigidas por engenharia (ex.: a pérola do CURB-65 diz "≥ 3: UTI" e a
  faixa diz "≥ 4: considere UTI").
