# Revisão clínica — Cuidados paliativos no PS (CC-329)

Achados do porte do PaliaPath do ANY App v4 (revisão `95c8fba`): o conteúdo de
`v2/src/data/paliaData.ts` e o que morava na tela `v2/src/pages/PaliaPath.tsx`
(conta do conversor de opioides, soma do PPI, textos de destaque). São para a
revisão clínica do CC-310, a cargo do Dr. Gustavo Moreira.

**Regra do porte (ADR-017):** doses, limiares, critérios e textos clínicos
ficaram **iguais ao ANY**. O teste diferencial
(`tests/clinical-tools/palliative-differential.spec.ts`) roda a própria tela
congelada do ANY e confere:

- conversor de opioides: os 36 pares de opioides, cada um com 1.000 doses
  aleatórias de semente fixa e os dois limites da faixa (36.072 casos), mesmo
  número com uma casa decimal;
- ECOG (6 níveis, tocando em cada um), PPS (11 níveis, coluna a coluna) e PPI
  (as 72 combinações, clicando nas opções da tela do ANY): mesmo nível, escore,
  faixa e tom;
- matriz de compatibilidade célula a célula, como a tela do ANY mostra;
- busca das 19 medicações subcutâneas em 1.000 buscas aleatórias;
- todo o dado do `paliaData` campo a campo e todo texto que as telas do ANY
  mostram, com as trocas de texto declaradas (seções 8 e 9).

Nada abaixo foi corrigido no código: cada item espera uma decisão. A coluna
"Opções" sugere caminhos; a escolha é clínica. Toda mudança decidida aqui sobe
a versão do conteúdo (`PALLIATIVE_PROVENANCE.version` em
`src/shared/clinical-tools/palliative/provenance.ts`) e entra no teste
diferencial como diferença declarada.

Nenhum teste do branch antigo do ANY (`claude/update-test-database-M10pD`)
cobre o PaliaPath; não houve teste antigo a portar. Os "casos de referência do
Gustavo" da história ainda não existem: enquanto isso, os casos-âncora são os
da própria tabela de equivalência do ANY
(`src/shared/clinical-tools/palliative/opioids.spec.ts`).

## 1. Conversor de opioides

Conta do ANY: `dose × fator(origem) ÷ fator(destino) × 0,75`, uma casa
decimal. Fator = mg de morfina VO em 24 h por unidade da dose: morfina VO 1,
morfina EV/SC 3, tramadol 0,1, codeína 0,15, fentanil 2,4 (por mcg/h).

| #   | Onde                   | O que o ANY diz                                                                                                                                                                             | Por que parece problema                                                                                                                                                                                                                                    | Opções                                                                                                     |
| --- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| 1.1 | Fentanil, fator        | Rótulo "Fentanil **EV/SC contínuo** (mcg/h)"; fator 2,4, com o comentário "25 mcg/h equivalem a cerca de 60 mg/24 h de morfina oral".                                                       | 25 mcg/h ≈ 60 mg/24 h de morfina VO é a equivalência usada para o **adesivo transdérmico**. Para fentanil EV em infusão contínua as tabelas costumam usar outra razão (25 mcg/h EV = 0,6 mg/dia de fentanil EV). A conta pode subestimar a dose do EV.     | (a) confirmar 2,4 para EV/SC; (b) separar "fentanil transdérmico" e "fentanil EV/SC" com fatores próprios. |
| 1.2 | Tabela de equivalência | Linha "Fentanil EV/SC (mcg/h) — 25 mcg/h — fator 2,4", ao lado de "Morfina VO 30mg", "Tramadol 300mg" etc.                                                                                  | As outras linhas dão a dose equivalente a **30 mg** de morfina VO (300 × 0,1 = 30; 200 × 0,15 = 30). Pelo fator da própria linha, 25 mcg/h dão **60 mg**; o equivalente a 30 mg seria 12,5 mcg/h. Tabela e conta discordam.                                | (a) trocar a dose da linha para 12,5 mcg/h; (b) explicar que a linha é por 60 mg; (c) rever junto com 1.1. |
| 1.3 | Redução de 25%         | Aplicada em toda conversão, inclusive morfina VO → morfina VO (60 → 45 mg) e na troca só de via (morfina VO → morfina EV/SC).                                                               | A redução por tolerância cruzada incompleta vale para troca de **opioide**; na mesma droga, trocando só a via, não costuma ser aplicada. Mesmo opioide e mesma via devolvendo 75% não tem sentido clínico.                                                 | (a) não reduzir quando a droga é a mesma; (b) avisar "mesmo opioide" e não calcular; (c) manter.           |
| 1.4 | Rótulo do campo        | "Dose em 24h" para todos os opioides, inclusive o fentanil (que a conta lê em mcg/h).                                                                                                       | Quem digita a dose de fentanil em 24 h (ex.: 600 mcg) recebe uma conta 24 vezes maior. **Mudança de tela feita:** o campo virou "Dose atual" com a unidade de cada opioide ao lado (mg/24 h; fentanil mcg/h). A conta não mudou.                           | Confirmar a unidade do fentanil (mcg/h).                                                                   |
| 1.5 | Faixas de entrada      | Qualquer número > 0.                                                                                                                                                                        | Faixas do porte (fora delas não calcula): morfina VO **1 a 3.000 mg/24 h**; morfina EV/SC **0,5 a 1.000 mg/24 h**; tramadol, codeína e metadona **1 a 1.000 mg/24 h**; fentanil **1 a 1.000 mcg/h**. Tramadol e codeína têm teto de dose bem abaixo disso. | Confirmar ou trocar cada faixa (tramadol até 400–600 mg/24 h? codeína até 360 mg/24 h?).                   |
| 1.6 | Metadona               | Tela: "Conversão sugerida apenas com orientação de especialista" (sem número). Nota: "Solicitar avaliação especializada para doses altas". O dado ainda guarda fator 4, que a tela não usa. | Tela e nota dizem coisas diferentes (qualquer dose × só dose alta). O fator 4 não foi portado (nunca aparece).                                                                                                                                             | Alinhar a nota com a tela.                                                                                 |
| 1.7 | Resultado              | Uma casa decimal (ex.: 60 mg de morfina VO → 18,8 mcg/h de fentanil).                                                                                                                       | Bombas e adesivos têm apresentações próprias (adesivo 12, 25, 50 mcg/h); o número com décimo pode induzir prescrição impraticável.                                                                                                                         | (a) manter; (b) mostrar também a apresentação mais próxima abaixo do valor.                                |
| 1.8 | Opioides da lista      | Morfina VO e EV/SC, tramadol, codeína, fentanil e metadona.                                                                                                                                 | Oxicodona e hidromorfona, comuns em paliativos, não estão.                                                                                                                                                                                                 | Escopo: manter ou incluir (com fator revisado).                                                            |

## 2. PPI (Palliative Prognostic Index)

| #   | Onde              | O que o ANY diz                                                                                                                                        | Por que parece problema                                                                                                                                                        | Opções                                                          |
| --- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------- |
| 2.1 | Estado inicial    | Abre com a primeira opção de cada item marcada: escore 0 e "Sobrevida mediana: ~155 dias — Prognóstico melhor" antes de qualquer resposta.             | O médico que não responde tudo vê o melhor prognóstico. **Mudança de tela feita:** no Copiloto o PPI começa sem resposta e só mostra resultado com os cinco itens respondidos. | Confirmar.                                                      |
| 2.2 | Faixas e medianas | ≤ 2: ~155 dias; > 2 a ≤ 4: ~89 dias; > 4 a ≤ 6: ~18–21 dias (sobrevida < 6 semanas: sens 80%, esp 77%); > 6: ~5 dias (< 3 semanas: sens 80%, esp 85%). | A referência listada (Morita 1999) define os cortes > 4 e > 6. As quatro faixas e as medianas não têm fonte citada.                                                            | Citar a fonte das medianas ou ficar só com os cortes do artigo. |
| 2.3 | Item delirium     | "Delirium: Ausente / Presente (+4)".                                                                                                                   | Confirmar se o critério deve excluir o delirium causado só por um medicamento (como opioide), como no artigo original.                                                         | Acrescentar a ressalva ao rótulo ou manter.                     |
| 2.4 | Cores             | Verde, amarelo, laranja e vermelho.                                                                                                                    | Pelo ADR-017 viraram cinza, laranja, laranja e vermelho; amarelo e laranja ficam iguais e o rótulo da faixa diferencia.                                                        | Confirmar.                                                      |

## 3. ECOG e PPS

| #   | Onde               | O que o ANY diz                                                                     | Por que parece problema                                                                                                                                                    | Opções                                                          |
| --- | ------------------ | ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| 3.1 | PPS 100% e 90%     | Linhas idênticas: deambulação completa, atividade normal, autocuidado completo etc. | No PPS original a diferença está na evidência de doença (100%: nenhuma; 90%: alguma), coluna que a tabela do ANY não tem. Do jeito que está, as duas não se distinguem.    | Acrescentar "evidência de doença" à atividade (texto do PPSv2). |
| 3.2 | ECOG e PPS na tela | ECOG só destacava o nível tocado; PPS era só a tabela.                              | **Mudança de tela feita:** os dois viraram escolha de nível com a descrição na própria opção e "Copiar para o prontuário"; o PPS mantém a tabela completa. Conteúdo igual. | Confirmar.                                                      |

## 4. Matriz de compatibilidade (hipodermóclise)

**O critério "15×15 completa" da história depende desta seção:** a matriz só
fica completa quando as células abaixo forem preenchidas e assinadas.

### 4.1 Células sem dado (aguardam o Dr. Gustavo)

O ANY tem 15 colunas (CEF, CRO, DIP, ESC, FUR, HAL, LEV, MTC, MDZ, MOR, OCT,
OND, RAN, TRA, DEX) e **14 valores por linha**. A tela do ANY põe os 14
valores da 1ª à 14ª coluna e deixa a 15ª (**DEX**) vazia. O legado
(`tools/palia-path/index.html`) tem o mesmo defeito, então o histórico não
recupera o valor. O porte reproduz a tela do ANY e marca cada célula vazia
como **"sem dado — aguarda revisão"** (`'sem-dado'` em
`COMPATIBILITY_MATRIX`, "s/d" na tela):

| Linha                   | Coluna | Valor a preencher |
| ----------------------- | ------ | ----------------- |
| Cefepime                | DEX    | ☐ C ☐ I           |
| Ceftriaxona             | DEX    | ☐ C ☐ I           |
| Dipirona                | DEX    | ☐ C ☐ I           |
| Escopolamina            | DEX    | ☐ C ☐ I           |
| Furosemida              | DEX    | ☐ C ☐ I           |
| Haloperidol             | DEX    | ☐ C ☐ I           |
| Levomepromazina         | DEX    | ☐ C ☐ I           |
| Metoclopramida          | DEX    | ☐ C ☐ I           |
| Midazolam               | DEX    | ☐ C ☐ I           |
| Morfina                 | DEX    | ☐ C ☐ I           |
| Octreotide              | DEX    | ☐ C ☐ I           |
| Ondansetrona            | DEX    | ☐ C ☐ I           |
| Ranitidina              | DEX    | ☐ C ☐ I           |
| Tramadol                | DEX    | ☐ C ☐ I           |
| Dexametasona (diagonal) | DEX    | — (mesma droga)   |

O texto do ANY abaixo da matriz ("Dexametasona: incompatível com TODOS os
medicamentos — sempre usar sítio exclusivo") sugere "I" em toda a coluna DEX,
mas o porte não preenche por inferência.

### 4.2 Sinais de que os valores estão fora das colunas certas

Antes de preencher só a coluna DEX, vale conferir a matriz inteira contra a
fonte (Azevedo e Barbosa):

- **Diagonal** (droga com ela mesma): "I" em Morfina × MOR, Ondansetrona × OND
  e Tramadol × TRA. Droga incompatível com ela mesma não faz sentido.
- A **14ª coluna mostrada (TRA) é "I" nas 15 linhas**, inclusive na linha do
  próprio tramadol. É o padrão que se esperaria da coluna DEX.
- A coluna MOR é "I" em 12 das 15 linhas (só octreotide, ondansetrona e
  ranitidina dizem "C"), enquanto a linha da morfina é "C" para 11 das 14
  colunas mostradas. Na linha do midazolam, midazolam + morfina aparece como
  incompatível; na linha da morfina, como compatível.
- O porte testou as 15 hipóteses de "uma coluna faltando no meio da linha":
  nenhuma deixa a matriz simétrica (a melhor, OND faltando, ainda deixa 10
  pares discordantes). Ou seja, não dá para consertar só deslocando valores.

### 4.3 Pares discordantes (linha A × coluna B ≠ linha B × coluna A)

Compatibilidade é simétrica; cada par abaixo é erro de dado ou de alinhamento.
São 37 (a coluna DEX, sem dado, fica de fora). `compatibilityDisagreements()`
lista os mesmos pares; o teste trava o número em 37 até a revisão.

| #      | A                     | B                     | A × B | B × A |
| ------ | --------------------- | --------------------- | ----- | ----- |
| 4.3.1  | Cefepime (CEF)        | Morfina (MOR)         | I     | C     |
| 4.3.2  | Cefepime (CEF)        | Ondansetrona (OND)    | I     | C     |
| 4.3.3  | Cefepime (CEF)        | Ranitidina (RAN)      | C     | I     |
| 4.3.4  | Cefepime (CEF)        | Tramadol (TRA)        | I     | C     |
| 4.3.5  | Ceftriaxona (CRO)     | Morfina (MOR)         | I     | C     |
| 4.3.6  | Ceftriaxona (CRO)     | Ondansetrona (OND)    | I     | C     |
| 4.3.7  | Ceftriaxona (CRO)     | Ranitidina (RAN)      | C     | I     |
| 4.3.8  | Ceftriaxona (CRO)     | Tramadol (TRA)        | I     | C     |
| 4.3.9  | Dipirona (DIP)        | Morfina (MOR)         | I     | C     |
| 4.3.10 | Dipirona (DIP)        | Ondansetrona (OND)    | I     | C     |
| 4.3.11 | Dipirona (DIP)        | Ranitidina (RAN)      | C     | I     |
| 4.3.12 | Dipirona (DIP)        | Tramadol (TRA)        | I     | C     |
| 4.3.13 | Escopolamina (ESC)    | Morfina (MOR)         | I     | C     |
| 4.3.14 | Escopolamina (ESC)    | Ondansetrona (OND)    | I     | C     |
| 4.3.15 | Escopolamina (ESC)    | Ranitidina (RAN)      | C     | I     |
| 4.3.16 | Escopolamina (ESC)    | Tramadol (TRA)        | I     | C     |
| 4.3.17 | Furosemida (FUR)      | Levomepromazina (LEV) | I     | C     |
| 4.3.18 | Furosemida (FUR)      | Ondansetrona (OND)    | I     | C     |
| 4.3.19 | Furosemida (FUR)      | Ranitidina (RAN)      | C     | I     |
| 4.3.20 | Furosemida (FUR)      | Tramadol (TRA)        | I     | C     |
| 4.3.21 | Haloperidol (HAL)     | Morfina (MOR)         | I     | C     |
| 4.3.22 | Haloperidol (HAL)     | Ondansetrona (OND)    | I     | C     |
| 4.3.23 | Haloperidol (HAL)     | Ranitidina (RAN)      | C     | I     |
| 4.3.24 | Haloperidol (HAL)     | Tramadol (TRA)        | I     | C     |
| 4.3.25 | Levomepromazina (LEV) | Morfina (MOR)         | I     | C     |
| 4.3.26 | Levomepromazina (LEV) | Ondansetrona (OND)    | I     | C     |
| 4.3.27 | Levomepromazina (LEV) | Ranitidina (RAN)      | C     | I     |
| 4.3.28 | Levomepromazina (LEV) | Tramadol (TRA)        | I     | C     |
| 4.3.29 | Metoclopramida (MTC)  | Morfina (MOR)         | I     | C     |
| 4.3.30 | Metoclopramida (MTC)  | Ondansetrona (OND)    | I     | C     |
| 4.3.31 | Metoclopramida (MTC)  | Ranitidina (RAN)      | C     | I     |
| 4.3.32 | Metoclopramida (MTC)  | Tramadol (TRA)        | I     | C     |
| 4.3.33 | Midazolam (MDZ)       | Morfina (MOR)         | I     | C     |
| 4.3.34 | Midazolam (MDZ)       | Tramadol (TRA)        | I     | C     |
| 4.3.35 | Ondansetrona (OND)    | Ranitidina (RAN)      | C     | I     |
| 4.3.36 | Ondansetrona (OND)    | Tramadol (TRA)        | I     | C     |
| 4.3.37 | Ranitidina (RAN)      | Tramadol (TRA)        | I     | C     |

### 4.4 Outros pontos da matriz

| #     | Onde                     | O que o ANY diz                                                                                                                                                              | Por que parece problema                                                                                                                                     | Opções                                                 |
| ----- | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| 4.4.1 | Octreotide               | Lista de medicações: "**Sítio exclusivo**". Matriz: compatível com 11 das 14 colunas mostradas.                                                                              | As duas telas dizem coisas opostas.                                                                                                                         | Escolher uma.                                          |
| 4.4.2 | Drogas da matriz × lista | Ranitidina e levomepromazina estão na matriz e fora das 19 medicações; ampicilina, dimenidrinato, ertapenem, fentanil, metadona e omeprazol estão na lista e fora da matriz. | Quem procura fentanil ou metadona na matriz não acha. Omeprazol diz "Não mesclar com outros medicamentos" só na lista.                                      | Alinhar as duas listas ou explicar.                    |
| 4.4.3 | Ranitidina               | Linha e coluna próprias.                                                                                                                                                     | A ranitidina saiu do mercado em 2020 (recolhimento por nitrosamina). Confirmar se a linha fica.                                                             | Tirar ou manter.                                       |
| 4.4.4 | Cores                    | C verde, I vermelho, linha da dexametasona em vermelho.                                                                                                                      | Pelo ADR-017: C sem cor (verde é conduta confirmada), I vermelho, "s/d" laranja (aguarda revisão). A tela traz o aviso "Matriz aguardando revisão clínica". | Confirmar; tirar o aviso quando a matriz for assinada. |

## 5. Hipodermóclise (fora a matriz)

| #   | Onde                          | O que o ANY diz                                                      | Por que parece problema                                                               | Opções                         |
| --- | ----------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------ |
| 5.1 | Técnica, "Conectar medicação" | "BIC até 62,5 mL/h (noturno em coxa: 70-100 mL/h)".                  | A aba Soluções diz "Máx. 62,5 mL/h" para as três soluções. O noturno passa do máximo. | Explicar a exceção ou alinhar. |
| 5.2 | Técnica, "Puncionar"          | "cateter 22-24G".                                                    | Dispositivos: escalpe 21G a 25G, cateter não agulhado 20G a 24G.                      | Alinhar os calibres.           |
| 5.3 | Ampicilina                    | "1 g/dia".                                                           | Conferir a posologia (a ampicilina costuma ser fracionada ao longo do dia).           | Confirmar.                     |
| 5.4 | Escopolamina                  | "20 mg 8/8h até 60 mg 6/6h".                                         | O teto equivale a 240 mg/24 h; conferir.                                              | Confirmar.                     |
| 5.5 | Fentanil                      | "A critério médico", diluição "4 amp (50 mcg/mL) em SF 0,9% 210 mL". | Sem dose; ver também 1.1.                                                             | Confirmar.                     |

## 6. Manejo de sintomas

| #   | Onde                    | O que o ANY diz                                                                                                   | Por que parece problema                                                                                                                 | Opções                                         |
| --- | ----------------------- | ----------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| 6.1 | Fase final, sinais      | "Tempo médio até óbito (mediana)"; sororoca ~23h, respiração mandibular ~2,5h, cianose ~1h, sem pulso radial ~1h. | "Médio" e "mediana" são coisas diferentes; os tempos não têm fonte citada.                                                              | Escolher "mediana" ou "médio" e citar a fonte. |
| 6.2 | Dispneia, "Efeito teto" | "Morfina >20mg/24h geralmente não traz alívio adicional para dispneia."                                           | Fica ao lado do mito 10 ("Opioides NÃO têm dose teto"). Sem fonte; o contexto (dispneia, paciente virgem de opioide?) não está escrito. | Citar a fonte e o contexto.                    |
| 6.3 | Náusea, metoclopramida  | "Gastroparesia — Metoclopramida 10mg EV 8/8h"; logo abaixo, "Obstrução intestinal: considere octreotide".         | Procinético é contraindicado na obstrução completa; a tela não avisa.                                                                   | Acrescentar o aviso ou manter.                 |
| 6.4 | Sedação paliativa       | Midazolam: bolus 2,5–5 mg; manutenção 0,5–1 mg/h; titulação +0,5 mg/h a cada 30 min; alvo RASS −3 a −4.           | Sem ponto a corrigir; registrar a revisão (dose, intervalo e alvo).                                                                     | Confirmar.                                     |
| 6.5 | Desprescrição           | "SUSPENDER: …" e "MANTER: …" (caixa-alta).                                                                        | Viraram "Considere suspender" e "Considere manter" pela regra de linguagem. Conferir se o "manter analgésicos…" ficou fraco.            | Confirmar a troca.                             |

## 7. Identificar, decidir e comunicar

| #   | Onde                    | O que o ANY diz                                                          | Por que parece problema                                                                                                               | Opções                                    |
| --- | ----------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| 7.1 | SPICT-BR, "Quando usar" | "Se 2 ou mais indicadores positivos, considerar abordagem paliativa."    | No SPICT os indicadores gerais e os clínicos (por doença) entram de formas diferentes; "2 ou mais indicadores" não diz de qual grupo. | Escrever a regra do SPICT-BR por extenso. |
| 7.2 | SAVED, "Se incapaz"     | "Identificar representante legal (cônjuge -> filhos -> pais -> irmãos)". | Confirmar a ordem e a base (CFM 1.995/2012, Código Civil).                                                                            | Confirmar ou citar a base.                |
| 7.3 | SAVED, referência       | "Ribeiro VZ, et al. SAVED Framework. J Bras Med Emerg. 2024."            | Não foi possível conferir a citação no porte.                                                                                         | Confirmar a citação completa.             |

## 8. Linguagem (mudanças de texto do porte)

Pela regra de sugestão do ADR-017 (lista em `LANGUAGE` do teste diferencial):

| Onde                         | ANY                                                   | Copiloto                                                  |
| ---------------------------- | ----------------------------------------------------- | --------------------------------------------------------- |
| SPICT-BR, "Quando usar"      | "considerar abordagem paliativa"                      | "considere abordagem paliativa"                           |
| Pergunta surpresa            | "considerar cuidados paliativos"                      | "considere cuidados paliativos"                           |
| Dispneia, efeito teto        | "Considerar midazolam associado"                      | "Considere midazolam associado"                           |
| Náusea, obstrução intestinal | "Considerar octreotide 100-300mcg SC 8/8h"            | "Considere octreotide 100-300mcg SC 8/8h"                 |
| Delirium, haloperidol        | "Iniciar 1mg SC/EV a cada 2h até controle"            | "Considere iniciar 1mg SC/EV a cada 2h até controle"      |
| Opioides, equianalgesia      | "Sempre iniciar com 75% da dose calculada ao trocar." | "Ao trocar, considere iniciar com 75% da dose calculada." |
| Fase final, desprescrição    | "SUSPENDER:" / "MANTER:"                              | "Considere suspender" / "Considere manter"                |

Textos de protocolo no infinitivo ("Tratar mesmo com SpO2 normal…",
"Reavaliar a cada 4h", "Evitar contenção física", "NÃO aspirar") foram
mantidos. Revisar se alguma troca enfraqueceu uma urgência que deveria
continuar explícita.

## 9. Ortografia e exibição (sem mudar conteúdo)

Só grafia evidente (lista em `SPELLING` e `DISPLAY` do teste diferencial):

- **"Escopolâmina" → "Escopolamina"** (lista de medicações e linha da matriz;
  o acento entrou numa passada de ortografia do ANY);
- "estagio" → "estágio", "avancada" → "avançada", "Multiplas" → "Múltiplas",
  "declinio" → "declínio", "Auxilio" → "Auxílio", "Presenca" → "Presença",
  "Codeina" → "Codeína", "usuario" → "usuário", "1a linha" → "1ª linha",
  "refratario(s)" → "refratário(s)", "Mudanca" → "Mudança", "periodos" →
  "períodos", "horario" → "horário", "regiao … infraclavícular" → "região …
  infraclavicular", "alcool" → "álcool", "cutanea" → "cutânea", "pulmao" →
  "pulmão", "dependencia" → "dependência", "analgesico" → "analgésico",
  "Familia" → "Família", "comecar apos" → "começar após", "Ortotanasia" →
  "Ortotanásia", "Max" → "Máx.", "Equianalgesica" → "Equianalgésica";
- "e" que é verbo virou "é" em oito frases dos mitos ("Dependência física
  (tolerância) é diferente…", "O subtratamento da dor é…", "O duplo efeito é…",
  "AGORA é o correto", "…da dor é responsabilidade…", "A UTI é um dos…",
  "…frequentemente é o primeiro…", "…ao DE, é porque…");
- acento a mais em nome de revista em inglês: "Support Care **Câncer**" →
  "Support Care Cancer"; "CA **Câncer** J Clin" → "CA Cancer J Clin";
- defeitos de exibição: a frase a evitar "Não há mais nada a fazer" aparecia
  como `&quot;Não há mais nada a fazer.&quot;` (entidade HTML no React);
  "Se incapaz:" aparecia duas vezes (o dado já tinha o rótulo); ">=60%" virou
  "≥60%"; "Levomeprom." virou "Levomepromazina".

Não mexido, para decisão: **"Octreotide"** (a DCB em português é
"octreotida"); "DE" (departamento de emergência) nos textos, enquanto o nome
da ferramenta no Copiloto diz "PS".

## 10. O que mudou na tela, sem mudar conteúdo

- **Cores** (ADR-017): destaques "success" do ANY viraram nota cinza, "info"
  azul, "warning" laranja e "danger" vermelho, sempre com título.
- **Estado preservado**: no ANY sair de uma tela zerava o PPI e a conversão;
  aqui o estado vive enquanto a ferramenta está aberta ("Limpar" apaga).
- **Voltar do celular**: cada tela do roteiro fica no endereço (`#decidir`),
  então o voltar do navegador volta à tela anterior em vez de sair.
- **Náusea**: a causa ("Geral / QT", "Gastroparesia"…) era prefixo do nome e
  a coluna "Obs" ficava vazia; virou coluna "Causa".
- **Mitos**: o modal virou lista que abre no lugar (um por vez). "Mito" e
  "Verdade" em etiqueta neutra e azul (no ANY, vermelho e verde).
- **Busca de medicação**: sem diferença de acento ("lam" acha Escopolamina).
- **Conversor**: unidade por opioide (1.4), faixa por opioide (1.5), resultado
  com equivalente de morfina VO e dose a 100%, e "Copiar para o prontuário".
- **ECOG, PPS e PPI**: "Copiar para o prontuário" (sem dado de paciente).
