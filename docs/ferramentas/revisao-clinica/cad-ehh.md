# Revisão clínica — CAD e EHH (CC-326)

Achados do porte do KetoPath do ANY App (v4, revisão `95c8fba`:
`v2/src/pages/KetoPath.tsx`, `v2/src/components/clinical/Keto*.tsx`,
`v2/src/data/ketoData.ts` e `v2/src/utils/ketoCalc.ts`) para a revisão clínica
do CC-310, a cargo do Dr. Gustavo Moreira.

**Regra do porte (ADR-017):** contas, limiares, doses, critérios e textos
clínicos ficaram **iguais ao ANY**. Mudaram só as quatro ordens de conduta
listadas na seção 3 (viraram sugestão, com as mesmas doses). Nada das seções 1
e 2 foi corrigido no código: cada item espera uma decisão. A coluna de opções
sugere caminhos; a escolha é clínica.

**Como a paridade é conferida:**

- `tests/clinical-tools/cad-ehh-differential.spec.ts`: cada conta do
  `ketoCalc` contra a referência congelada em 1.000 entradas aleatórias (semente
  fixa), com igualdade exata; a gravidade da CAD em todas as combinações de pH,
  bicarbonato e consciência; e as regras que no ANY moram dentro das telas
  (trava da insulina, faixa do potássio, prescrição e espelho mL ↔ mEq do KCl,
  fase B, cartões do ciclo, tela Calculadoras), rodando os próprios
  componentes congelados por um harness sem React
  (`tests/clinical-tools/keto-path-harness.ts`).
- `tests/clinical-tools/cad-ehh-content.spec.ts`: todo export do `ketoData` tem
  correspondente no motor, igual, salvo as trocas da seção 3.

Toda mudança decidida aqui sobe a versão do conteúdo (`CAD_EHH_PROVENANCE` em
`src/shared/clinical-tools/cad-ehh/sources.ts`) e atualiza os testes, que
passam a registrar a diferença de propósito.

## 0. Origem e o que não veio

- **A especificação de origem não está no repositório do ANY.** O
  `ketoData.ts` diz que todo o conteúdo vem da spec `ketopath-spec.md` v1.0.0,
  validada pelo Gustavo, e que os textos marcados "TEXTO:" vão para a tela
  literalmente; o `ketoCalc.ts` diz que as contas foram "conferidas contra os
  casos de teste da spec v1.0.0". A spec não está no branch v4 nem nos outros
  branches do clone. Sem ela não dá para conferir se o `ketoData` reproduz a
  spec, nem portar os casos de teste dela. **Pedido:** a spec (ou ao menos os
  casos de teste) para virar teste no motor.
- **Casos de referência do Gustavo.** Na falta dos casos da spec, os limiares
  e doses-chave foram testados a partir das faixas do próprio ANY
  (`src/shared/clinical-tools/cad-ehh/calc.spec.ts`). Conferir.
- **Testes do branch antigo do ANY.** O KetoPath nasceu no v4; o branch antigo
  (`claude/update-test-database-M10pD`) não tem teste dele. Nada a portar.

## 1. Mesma conta nas calculadoras e no roteiro

Onde a conta do KetoPath é igual à de uma calculadora já portada, o roteiro usa
a função do motor: Katz (com fator 2,0), ACT × (Na/140 − 1), razão
delta/delta com as mesmas faixas e o AG bruto. Onde o KetoPath usa outra conta,
ficou a do KetoPath, e o mesmo paciente pode ter dois números no Copiloto:

| #   | Conta | Roteiro (KetoPath) | Calculadora | Por que importa | Opções |
| --- | --- | --- | --- | --- | --- |
| 1.1 | Sódio corrigido | Fator **2,0** fixo ([UTD]); com glicemia ≤ 100 devolve o sódio medido. | "Correção de sódio (Katz)" abre em **1,6** (aceita 1,6 a 2,4) e exige glicose ≥ 100. | Na 130 e glicemia 600: **140,0** no roteiro, **138,0** na calculadora. O corte de 135 da fase B foi pensado com 2,0 (nota do próprio ANY). | Manter as duas e dizer na calculadora; abrir a calculadora em 2,0; padronizar um fator. |
| 1.2 | Ânion-gap | Inteiro, **sem albumina**; acima de **12** "compatível com CAD". | "Anion Gap" corrige pela albumina (4,0 se vazia), uma casa; normal até **14**, muito elevado acima de 20. | AG 13: "elevado, compatível com CAD" no roteiro e "normal" na calculadora. | Alinhar o corte (12 ou 14); mostrar o AG corrigido no roteiro; manter. |
| 1.3 | Osmolalidade | **Efetiva**: 2 × Na + glicemia/18, inteira, em "mOsm/kg". | "Osmolaridade" **total**: soma ureia/6, uma casa, em mOsm/L, faixas 275–295. | Conceitos diferentes com nomes parecidos. O título no ANY é "Osmolaridade efetiva" com unidade de osmolalidade (mOsm/kg) para um valor calculado (mOsm/L). Os critérios do EHH (≥ 320) e a resolução (< 300) não dizem se é a efetiva ou a total. | Definir qual osmolaridade vale nos critérios; ajustar nome e unidade. |
| 1.4 | Déficit de água livre | Sódio **corrigido**, fator por sexo e idade (0,6 / 0,5 / 0,5 / 0,45), **uma** casa. | Sódio **medido**, fator escolhido (0,4 a 0,6), **duas** casas. | Mesma fórmula, entradas diferentes. | Manter (contextos diferentes); explicar na calculadora. |
| 1.5 | Delta/delta | Com HCO₃ ≥ 24 não calcula. | Só HCO₃ = 24 é barrado; acima de 24 dá razão negativa. | Achado da calculadora, visto aqui. | Barrar HCO₃ ≥ 24 na calculadora. |

## 2. Conteúdo clínico (decisão do revisor)

| #    | Onde | O que o ANY diz ou faz | Por que parece problema | Opções |
| ---- | ---- | ---- | ---- | ---- |
| 2.1  | Passo 7, insulina com K < 3,5 | Mostra "Insulina bloqueada" (adiar até o K passar de 3,5) e, logo abaixo, a calculadora de velocidade continua ativa. | A tela bloqueia no texto e libera na conta. | Esconder a calculadora com K < 3,5; manter. |
| 2.2  | Passo 7, borda do K | Libera com K = 3,5 exato (`< 3,5` bloqueia). O texto diz "até que o potássio **ultrapasse** 3,5". | Borda do texto e da conta não batem. | Bloquear até K > 3,5; ajustar o texto. |
| 2.3  | Passo 7, velocidade padrão | A calculadora abre em 0,1 U/kg/h em qualquer trilha. | No EHH sem cetose a tabela do próprio passo diz 0,05 U/kg/h. | Abrir em 0,05 na trilha EHH; manter. |
| 2.4  | Ciclo, transição SC | "Insulina basal: 0,15–0,3 U/kg". | É a faixa que o conteúdo dá para a basal em dose baixa **durante** a infusão ([ADA], "Insulina basal durante a infusão"), e a nota logo abaixo diz que "a calculadora não sugere a repartição entre basal e prandial". | Tirar a linha; renomear; decidir a basal da transição. |
| 2.5  | Ciclo, transição SC | A tabela de dose diária (`TRANSICAO_DDT`: 0,5–0,6; ~0,3; "considerar o esquema prévio e a HbA1c") não aparece em tela nenhuma; a tela só calcula sem uso prévio e com risco de hipoglicemia. | Quem já usava insulina não tem orientação na tela. | Mostrar a tabela; manter. |
| 2.6  | Ciclo, queda adequada | A conta chama de "adequada" a queda de 50 a 90 mg/dL/h; o texto do cartão diz "Dentro da faixa esperada de **50 a 70** mg/dL por hora". | Queda de 80 aparece "adequada" com texto de 50 a 70. | Texto "50 a 90"; faixa intermediária 70–90. |
| 2.7  | Ciclo, queda rápida | "Rápida" acima de 90 mg/dL/h; o teto citado é "90 a 120 mg/dL por hora" [UTD]. | O corte usa a borda inferior do teto. | Confirmar 90; usar 120. |
| 2.8  | Ciclo, intervalo da queda | O intervalo vai do toque em "Nova rodada" até o momento em que a tela é vista, não da hora da coleta. Abaixo de 15 min não extrapola por hora. | Exame digitado 40 min depois da coleta dá queda por hora errada. | Campo de hora da coleta; manter. |
| 2.9  | Passo 4, bicarbonato | O subtítulo do passo diz "trilha, gravidade, **bicarbonato**", mas nenhuma tela mostra o conteúdo de bicarbonato (pH < 7,0: 100 mEq em 400 mL de água estéril em 2 h; 20 mEq de KCl se K < 5,0). Ele só existe no `PassoAdjuvantes`, que o KetoPath não usa. | Promessa sem conteúdo; tema de alto risco. | Mostrar no passo 4 com pH < 7,0; tirar do subtítulo. Portado no motor, não mostrado. |
| 2.10 | Conteúdo fora das telas | Estão no `ketoData` e em componentes que nenhuma tela usa (`KetoMonitor`, `KetoResolucao`): texto da cadência, resposta esperada (50–70 mg/dL/h), nota do teto, alvos de manutenção, velocidade de correção da CAD, resolução pelo ADA, resolução adaptada (obrigatório / desejável / apoio), textos finais da transição (inclui "**Todos os pacientes precisam de insulina basal SC antes da suspensão da IV**"), textos de disposição, checklist clicável do EHH e a "velocidade dobrada" da queda insuficiente. | Parte disso parece importante (a basal antes de desligar a bomba). | Decidir o que entra. Tudo está portado no motor (marcado "fora das telas do ANY"). |
| 2.11 | Déficit de água livre | Com sódio corrigido abaixo de 140 o déficit sai negativo ("-3,0 L déficit estimado"). | Número negativo como "déficit". | Mostrar "sem déficit" abaixo de 140; manter. |
| 2.12 | Trilha EHH na primeira hora | A trilha é escolhida no passo 4 e começa em CAD. No passo 2 (primeira hora) os alertas do EHH (velocidades de correção, sódio que sobe, déficit de volume) só aparecem se o médico voltar depois de escolher EHH. | O EHH fica sem os alertas na hora da hidratação inicial. | Perguntar a trilha provável no passo 1; manter. |
| 2.13 | Painel, ureia | A ureia é pedida (opcional), mas nenhuma conta a usa. | Campo sem efeito. | Tirar; usar na osmolaridade total (ver 1.3). |
| 2.14 | Gravidade × critério A | Gravidade "leve" vai até HCO₃ **18** inclusive (tabela "15–18"); o critério A da CAD é HCO₃ **< 18** e pH < 7,3 ([UTD], os dois). A gravidade classifica com só um eixo em faixa de acidose. | HCO₃ = 18 com pH 7,35 é "CAD leve" na gravidade sem preencher o critério A. | Exigir o critério A para classificar; ajustar a borda; manter (o ANY classifica por eixo). |
| 2.15 | Resolução × diagnóstico | Resolução: pH ≥ 7,3 **ou** HCO₃ ≥ 18 (como o ADA). Diagnóstico: pH < 7,3 **e** HCO₃ < 18 (UTD). | Assimetria proposital? | Confirmar. |
| 2.16 | Fase B, borda | Corte em 135: abaixo, salina 0,9%; **135 exato**, 0,45%. | Confirmar a borda. | Manter; inverter. |
| 2.17 | Alerta do sódio no EHH | "Uma redução de 100 mg/dL na glicemia eleva o sódio em cerca de **1,6** mEq/L" [ADA]. O roteiro corrige o sódio com **2,0**. | Texto e conta do mesmo roteiro com fatores diferentes. | Ajustar o texto; manter (fontes diferentes). |
| 2.18 | KCl, limite da via | A concentração é arredondada antes de comparar com o limite: 50,4 mEq/L vira 50 e não acusa excesso na periférica. | Borda permissiva. | Comparar sem arredondar; manter. |
| 2.19 | KCl, diluente | A prescrição sempre diz "SF 0,9% (diluente)", mesmo quando o alerta de efeito osmótico (> 20 mEq/h) sugere salina 0,45%. | Texto da prescrição contra o alerta da mesma tela. | Diluente conforme o alerta; manter. |
| 2.20 | KCl, equivalência | "Equivale a … mEq/h" mostra zero casas: 12,5 mEq/h aparece "13 mEq/h". | Arredondamento na linha de conferência. | Uma casa; manter. |
| 2.21 | Unidade da insulina | "U/mL", "U/h", "U/kg/h". A história do CC-326 fala em "1 UI/mL". | Prescrição brasileira costuma usar UI. | Trocar para UI; manter U. |
| 2.22 | Escopo | Subtítulo "≥ 15 anos" e nota "Não cobre pediatria". | 15 a 17 anos é pediatria em muitos serviços. | Confirmar a idade. |
| 2.23 | Critérios do EHH | "Osmolaridade ≥ 320 mOsm/kg". | Mistura osmolaridade com unidade de osmolalidade (ver 1.3). | Ajustar. |
| 2.24 | Nome "KetoPath" | Textos clínicos citam a ferramenta: "Preferência do KetoPath: Ringer lactato", "O KetoPath adota o fator 2,0", "O KetoPath segue [UTD]". No Copiloto ela se chama "CAD e EHH". | Nome que o médico não vê em lugar nenhum. | Trocar por "este roteiro"; manter. |
| 2.25 | Tela Calculadoras | O cartão da tela inicial promete "AG · Na · Osm · Δ/Δ", mas a tela não tem delta/delta (só o ciclo calcula). | Promessa sem conteúdo. | Pôr o delta/delta na tela; ajustar o cartão. O cartão do ciclo agora tem link para a calculadora Delta Gap. |

## 3. Linguagem (mudado no porte)

As ordens de conduta viraram sugestão, com as mesmas doses (lista exata em
`tests/clinical-tools/cad-ehh-content.spec.ts`, `REWRITES`):

| ANY | Copiloto |
| --- | --- |
| "Adiar a insulina. Repor 10 a 20 mEq de KCl por hora até o potássio ultrapassar 3,5 mEq/L" | "Considere adiar a insulina e repor 10 a 20 mEq de KCl por hora até o potássio ultrapassar 3,5 mEq/L" |
| "Adicionar 10 a 20 mEq de KCl a cada litro de fluido, mantendo o potássio entre 4 e 5 mEq/L" | "Considere adicionar 10 a 20 mEq de KCl a cada litro de fluido, mantendo o potássio entre 4 e 5 mEq/L" |
| "Não repor. Dosar o potássio a cada 2 horas" | "Considere não repor e dosar o potássio a cada 2 horas" |
| "Reduzir para 0,05 U/kg/h" (tabela de doses) | "Considere reduzir para 0,05 U/kg/h" |

Ficaram como no ANY, por serem verificação e não conduta: "Avalie a causa
precipitante em paralelo", "Reavalie o estado volêmico", "Confirme função renal
adequada antes de repor potássio", "Confira também a vazão programada" e os dois
"Verifique…" da queda insuficiente. Também ficou "a infusão pode ser iniciada
**imediatamente**" (purga da insulina): diz que não é preciso esperar, não pede
pressa. **Revisar** se alguma troca enfraqueceu uma urgência e se as frases
mantidas devem virar sugestão.

O `ketoData` diz que os textos da spec vão para a tela literalmente ("não
reescrever"); a regra de linguagem do Copiloto pede sugestão. As quatro trocas
acima precisam do ok do Gustavo.

## 4. Faixas de entrada

No ANY os campos aceitavam qualquer número (`parseFloat` do que fosse
digitado). Pelo ADR-017, valor fora da faixa é erro e não entra em conta:

- **Painel de exames** (passos 1 e 3) e **ciclo**: as faixas do próprio ANY
  (`KETO_CAMPOS`), agora barrando: glicemia 20–1.500 mg/dL, sódio 100–190,
  potássio 1–9, cloro 60–140, bicarbonato 1–40 mEq/L, pH 6,5–7,7, ureia 5–300
  mg/dL. O ciclo do ANY não tinha faixa nenhuma; usa as mesmas.
- **Peso adulto** 40–200 kg (igual ao ANY).
- **Calculadora de KCl** (o ANY não tinha faixa; definidas no porte, **precisam
  de confirmação**): KCl a aspirar 0,1–150 mL; dose 1–200 mEq; volume final
  50–3.000 mL; velocidade 1–40 mEq/h.
- Efeito na trava: potássio fora da faixa (ex.: 12) fica como não informado e a
  insulina continua travada. No ANY, 12 liberava a seção.

## 5. Tela e navegação (engenharia, sem conteúdo clínico)

- **Cores** pelo ADR-017: vermelho do ANY fica vermelho, amarelo vira laranja,
  verde e azul viram cinza (neutro).
- **Insulina travada:** o ANY dizia "Volte ao passo 4 e informe o potássio",
  mas o potássio é digitado no passo 3 (o 4 é Classificar). A frase virou o
  botão "Informar o potássio (passo 3)"; a frase clínica ("Iniciar insulina sem
  conhecer o potássio pode levar a arritmia com risco de vida") ficou.
- **Glicemia no passo 3:** no ANY só no passo 1; entrou também no 3 para quem
  chega por "Editar exames". É o mesmo dado.
- **Nota dos critérios da CAD** mostrada com as marcas de fonte: sem elas o ANY
  exibia "aceita pH <7,30 ou bicarbonato <18…", sem o sujeito ("[ADA]").
- **Sessão:** o roteiro fica salvo na aba por até 6 h sem uso e avisa
  "Roteiro retomado nesta aba" com o botão Recomeçar (no ANY a memória era só
  da tela aberta). O peso é o mesmo das outras ferramentas adultas.
- **KCl:** volume final digitado e inválido não cai calado no mínimo da via;
  sem velocidade, a linha "Correr a" pede a velocidade (o ANY mostrava "0,0
  mL/h").
- **Planilha:** título "CAD e EHH — Planilha de acompanhamento" (no ANY,
  "KetoPath — …"); rodapé com o aviso fixo do Copiloto e "Conteúdo de Gustavo
  Moreira (ANY App)". A4 paisagem, cabeçalho das colunas na vertical, 19
  colunas e 12 linhas, como no ANY.

## Pendências

- Spec `ketopath-spec.md` v1.0.0 e os casos de teste dela (seção 0).
- Ok do Gustavo na tela final e nas trocas de linguagem (seção 3).
- Eventos de uso no Umami: não há módulo tipado de eventos no web ainda (PR
  separado); a tela não envia evento.
- O KetoPath não tinha "Copiar para o prontuário"; não foi criado.
