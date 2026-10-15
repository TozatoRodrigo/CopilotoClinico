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

ACLS, Pediatria, Infusões e Calculadoras precisam abrir e calcular sem sinal
(implementação no CC-322). Por isso o motor não chama rede, as páginas de
calculadora são pré-renderizadas (`generateStaticParams`) e o service worker
vai pré-carregar `/ferramentas` e os chunks do motor.

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
