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
