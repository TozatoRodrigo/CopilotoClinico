# Revisão clínica — Calculadoras (CC-306 a CC-309)

Achados do porte das 75 calculadoras do `calculatorData.ts` do ANY App v4
(revisão `95c8fba`) para o Copiloto, para a revisão clínica do CC-310. A regra
do porte é a paridade: o Copiloto calcula exatamente o que o ANY calculava
(conferido pelo teste diferencial em `tests/clinical-tools/differential.spec.ts`).
Nada abaixo foi corrigido no código. Cada item diz onde está, o que o ANY diz,
por que parece problema e as opções, para o Dr. Gustavo Moreira decidir.

Quando a decisão mudar conteúdo clínico, a versão da calculadora sobe
(`provenance.version`) e o teste diferencial passa a declarar a diferença.

## O que mudou em todas, sem mudar a conta

- **Linguagem.** Ações no imperativo viraram sugestão ("Iniciar NAC" →
  "Considere iniciar NAC"), e "imediatamente" saiu (vira "sem demora"), pela
  regra do ADR-017. Doses, limiares e critérios não mudaram. Revisar se alguma
  troca enfraqueceu uma urgência que deveria continuar explícita.
- **Acentuação.** Textos do ANY sem acento ("Deficit", "nao", "internacao")
  foram acentuados. Nenhuma palavra trocada além disso, salvo onde está dito.
- **Cores.** Verde vira cinza (neutro), amarelo vira laranja (atenção),
  vermelho fica (ADR-017). O ANY tem ainda o laranja `#FF9800` (ICH Score 3,
  ABC/2 "grande"), que aqui vira atenção, igual ao amarelo; e o azul
  informativo `#2196F3` (Parkland, déficit de água, DPP), que vira neutro.
  Opções: manter; ou levar ICH 3 e ABC/2 ≥ 30 mL para crítico.
- **Seleções sem resposta padrão.** No ANY, os campos de escolha das fórmulas
  (Killip, sexo, fator de água corporal, corticoide de origem) abriam com a
  primeira opção marcada (Killip I, "Masculino", "Homem jovem"). Aqui nada vem
  marcado: o médico escolhe, para um padrão esquecido não virar resultado.
  Campos numéricos com valor padrão (FiO₂ 21%, LDH 250 U/L, albumina 4,0)
  continuam preenchidos, como no ANY.
- **Faixas de entrada.** Mantidas as do ANY, mesmo as estranhas (apontadas em
  cada calculadora). Fora da faixa, o Copiloto não calcula; no ANY a faixa não
  barrava nada.

## Cardiologia / SCA

### GRACE Score (aproximação) — `grace-score`

- **Aviso de versão.** O CC-307 pede o aviso "versão aproximada definido pelo
  Gustavo". Texto provisório na tela: "Pontuação por faixas do GRACE. O escore
  oficial (GRACE 2.0) usa nomograma não linear; para decisão formal, prefira a
  calculadora oficial." **Decidir o texto final.**
- **Referência não confere com a conta.** A citação é Fox 2006 (modelo de
  morte/IAM em 6 meses), mas a tabela de pontos e os cortes 108/140 são os do
  modelo de mortalidade intra-hospitalar (Granger 2003). Opções: trocar a
  citação para Granger CB et al., Arch Intern Med 2003;163:2345-53; ou manter.
- **"Aproximação" de quê.** A tabela de pontos é a do GRACE original
  (intra-hospitalar); a aproximação é em relação ao GRACE 2.0. O nome e o aviso
  podem dizer isso.

### CHA2DS2-VASc, HAS-BLED, HEART, TIMI, EGSYS, San Francisco

Sem achado além da linguagem. HAS-BLED: a faixa baixa diz "Anticoagulação
segura", o que é forte para um escore de sangramento; avaliar "risco baixo de
sangramento".

## Neurologia

### Escala FOUR — `four-score`

- **B0 e B1 dizem a mesma coisa.** ANY: "B0 — reflexo pupilar e corneano
  ausentes" e "B1 — reflexo pupilar E corneano ausentes". No original
  (Wijdicks 2005), B0 é "reflexos pupilar, corneano **e de tosse** ausentes".
  Opção: corrigir o rótulo de B0.

### Escala de Fisher modificada — `fisher-modificado`

- A nimodipina aparece só nos graus 3 e 4 ("considere nimodipina"). Ela é
  indicada a toda HSA aneurismática, independentemente do grau. Opções:
  mencionar em todos os graus ou tirar das ações.

### Escala de Hunt-Hess — `hunt-hess`

- Mortalidade cirúrgica por grau (1%, 5%, 19%, 42%, 77%) não é a do artigo
  citado (Hunt e Hess 1968 relatam 11%, 26%, 37%, 71% e 100%). Conferir a
  fonte dos percentuais.

### CAM-ICU — `cam-icu`

- Os itens estão em inglês ("Feature 1"…). Opção: "Característica 1".
- Não há trava para RASS < -3 (a pérola diz que o teste exige RASS ≥ -3).

### ICH Score — `ich-score`

- Escore 3 (mortalidade ~72%) usa o laranja `#FF9800` no ANY, que aqui vira
  atenção, igual ao escore 2. Ver "Cores" acima.

### Volume do hematoma (ABC/2) — `abc2`

- A faixa é lida sobre o volume sem arredondar, e a tela mostra uma casa:
  29,96 mL aparece como "30,0 mL — moderado" (a faixa "grande" começa em
  30). Mesmo comportamento do ANY. Opção: ler a faixa sobre o valor
  arredondado.
- A pérola dizia "fórmula ABC/2 (disponível nesta página)"; no Copiloto virou
  "nesta área", porque cada calculadora tem a sua página.

## Vascular

### ADD-RS — `add-rs`

- Faixa 1: "D-dímero pode ser considerado, mas angioTC é preferida". No
  ADvISED (Nazerian 2018), ADD-RS ≤ 1 com D-dímero < 500 ng/mL exclui
  dissecção. A pérola "ADD-RS ≥ 1: angioTC recomendada (D-dímero não exclui)"
  também contradiz. Opções: alinhar ao ADvISED; ou manter.

### Caprini — `caprini`

- São 15 dos cerca de 40 fatores do Caprini (2005). Faltam, entre outros,
  trombofilias, uso de anticoncepcional, gesso e doença inflamatória
  intestinal; o escore tende a subestimar. Opções: completar; ou declarar
  "versão reduzida" como no GRACE.

## Respiratório / Sepse

### APACHE II (simplificado) — `apache-ii`

- **Aviso de versão.** Texto provisório: "Cada variável é escolhida por faixa,
  sem o diagnóstico de admissão. Serve como estimativa rápida de gravidade;
  não substitui o APACHE II completo." **Decidir o texto final.**
- **Pontos diferentes da tabela de Knaus (1985).** Em várias variáveis o ANY
  juntou duas faixas simétricas com o ponto da mais grave, o que superestima o
  escore:

  | Variável                | Faixa       | Original | ANY                  |
  | ----------------------- | ----------- | -------- | -------------------- |
  | Temperatura             | 32–33,9 °C  | 2        | 3                    |
  | Temperatura             | 30–31,9 °C  | 3        | 4 (junto com ≤ 29,9) |
  | Frequência respiratória | 6–9 irpm    | 2        | 3                    |
  | pH                      | 7,25–7,32   | 2        | 1                    |
  | Sódio                   | 150–154     | 1        | 2                    |
  | Sódio                   | 155–159     | 2        | 3                    |
  | Sódio                   | 160–179     | 3        | 4 (junto com ≥ 180)  |
  | Potássio                | 2,5–2,9     | 2        | 3                    |
  | Hematócrito             | 46–49,9%    | 1        | 2                    |
  | Hematócrito             | 50–59,9%    | 2        | 4 (junto com ≥ 60)   |
  | Leucócitos              | 15–19,9 mil | 1        | 2                    |
  | Leucócitos              | 20–39,9 mil | 2        | 3                    |

  Opções: separar as faixas com os pontos originais (sobe a versão e o
  diferencial passa a declarar a diferença); ou manter e dizer no aviso.

- A pérola diz "usamos os parâmetros mais impactantes", mas as 12 variáveis
  estão presentes; o que simplifica é a escolha por faixa.

### SOFA — `sofa`

- Pérola do ANY: "Utero de cada sistema: avaliar o pior valor do dia" (erro de
  digitação). No Copiloto: "Em cada sistema, avaliar o pior valor do dia".

### NEWS2 — `news2`

- A regra "3 pontos em um único parâmetro = resposta urgente" está só na
  pérola; a faixa usa apenas a soma. Um paciente com FR ≤ 8 e o resto normal
  sai "Baixo risco". Opção: faixa por regra que considere o parâmetro único.
- Só a escala 1 de SpO₂; não há a escala 2 (hipercápnicos, meta 88–92%).

### Tempo de O2 Torpedo — `tempo-o2`

- A conta assume cilindro cheio a 200 bar, mas aceita até 300 bar (mais de
  100% da capacidade).
- A reserva de 30 bar da pérola não é descontada: o tempo calculado vai até o
  cilindro vazio. Opção: descontar a reserva.
- Capacidade aceita de 1 a 10.000 L.

### CURB-65 — `curb65` (da fundação, CC-303)

- A pérola diz "Escore ≥ 3: UTI"; a faixa diz "≥ 4: considere UTI".

### qSOFA, Critérios de Light

Sem achado além da linguagem.

## Gastro / Hepato

### Bonacini — `bonacini`

- A pontuação não confere com o escore discriminante de Bonacini (1997), em
  que as plaquetas vão de 0 (> 340 mil) a 6 (< 40 mil), a relação é ALT/AST
  (> 1,7 = 0 … < 0,6 = 3) e o corte de cirrose é ≥ 8 (escore de 0 a 11). O
  ANY usa AST/ALT em três faixas, plaquetas de 0 a 5 sem a faixa > 340 mil e
  corte ≥ 7. Conferir a fonte; opções: alinhar ao original (sobe a versão)
  ou manter.

### MELD-Na — `meld-na`

- O ajuste pelo sódio é aplicado sempre. Na regra da UNOS (2016), ele só
  entra quando o MELD é > 11. Desde 2023 a UNOS usa o MELD 3.0. Opções:
  aplicar a regra do > 11; migrar para o MELD 3.0; ou manter.

### Rockall — `rockall`

- As faixas (≤ 2, ≤ 4, ≥ 5) misturam o escore pré-endoscópico (0–7) e o
  completo (0–11): sem EDA, os dois itens endoscópicos valem 0 e o escore cai
  na mesma régua do completo. A ação da faixa baixa cita "escore
  pré-endoscópico 0". Opção: separar as duas versões.

### Glasgow-Blatchford, Forrest, Child-Pugh, Alvarado

Sem achado além da linguagem. Forrest: o valor de cada classe é um código
(Ia = 6 … III = 1); a tela mostra só a classe.

## Trauma

### TASH — `tash`

- A pérola diz "considere ativar o protocolo com escore ≥ 15", mas a faixa
  alta começa em 16 (15 cai em "moderada", que já sugere reservar e ativar).
  Também: a ação alta dizia "ativar … imediatamente" e virou "considere
  ativar … sem demora".

### PECARN — `pecarn`

- A faixa etária não muda a conta: um menor de 2 anos com "vômitos (≥ 2a)"
  marcado sai como risco intermediário. Opção: mostrar só os critérios da
  faixa escolhida.
- Risco muito baixo é "< 0,05%" nas duas idades; no original é < 0,02% em
  menores de 2 anos e < 0,05% a partir de 2.

### Fórmula de Parkland — `parkland`

- Aceita peso de 1 a 200 kg (sem distinção pediátrica; em criança costuma-se
  somar manutenção) e SCQ até 100%, mas limita a conta a 50% sem avisar na
  tela. Opção: mostrar o aviso quando a SCQ passar de 50%.

### mBIG, Canadian C-Spine

Sem achado além da linguagem e da acentuação (o mBIG do ANY estava todo sem
acento).

## Hemodinâmica

### Gradiente A-a — `gradiente-aa`

- Aceita FiO₂ até 100%, mas a pérola diz que não se aplica com FiO₂ > 60%.
- PaO₂ maior que a PAO₂ dá gradiente negativo, mostrado como "normal para a
  idade".

### Delta gap — `delta-gap`

- HCO3 > 24 (ou AG < 12) dá razão negativa, lida como "acidose
  hiperclorêmica concomitante". Opção: só calcular com HCO3 < 24 e AG > 12.
- Com HCO3 = 24 o ANY mostrava o resultado "HCO3 normal" (valor interno 999);
  aqui o campo fica marcado com a mesma explicação e nada é calculado.
- O texto do delta gap no ANY usava AG 12 quando o AG digitado era 0
  (`ag || 12`); aqui usa o valor digitado.

### PAM — `pam`

- Não confere se a PAD é menor que a PAS (PAS 40 e PAD 200 calcula 147).

### Débito cardíaco por VTI, Winters, índice de choque

Sem achado além da linguagem. "Borderline" ficou em inglês, como no ANY.

## Toxicologia

### CIWA-Ar — `ciwa-ar`

- Náusea, tremor, sudorese, ansiedade e agitação só aceitam 0, 2, 5 ou 7 (o
  rótulo diz "1–3" e vale 2). No CIWA-Ar original cada um vai de 0 a 7. Um
  paciente com tremor 1 sai com 2 pontos. Opção: as 8 opções em cada item.
- No ANY ela também existe no roteiro de Toxicologia. O link "Abrir no
  roteiro" fica escondido até o roteiro existir no Copiloto (CC-323/CC-324).

### Nomograma de Rumack-Matthew — `nomograma-rumack`

- **Duas contas no ANY.** A calculadora arredonda a linha a 0,1 antes de
  comparar; o roteiro de Toxicologia (ToxPath) compara com a linha sem
  arredondar e aceita nível com decimais. No limite os dois discordam (ex.:
  linha 50,04 e nível 50: a calculadora diz acima, o roteiro diz abaixo). O
  Copiloto tem uma conta só (`src/shared/clinical-tools/toxicology`), a da
  calculadora; o roteiro vai usá-la. Decidir se fica assim.
- 0,173 é ln(2)/4 arredondado: a linha às 8 h sai 75,1 mcg/mL, não 75.
- A ação dizia "Iniciar NAC imediatamente"; virou "considere iniciar NAC sem
  demora".

### QTc — `qtc-corrigido`

- A faixa usa 440 ms para todos; a pérola diz < 460 ms em mulheres. Opção:
  pedir o sexo.

### PSS, intervalo osmolar

Sem achado além da linguagem.

## Renal / Metabólico

### Correção de sódio (Katz) — `correcao-na`

- O fator é um campo numérico de 1,6 a 2,4 (aceita 2,0), quando a pérola
  descreve duas escolhas (Katz 1,6; Hillier 2,4). O rótulo do campo ganhou
  "(1,6 Katz; 2,4 Hillier)". Opção: virar escolha entre as duas.

### Déficit de água livre — `deficit-agua`

- Aceita sódio a partir de 130: abaixo de 140 o déficit sai negativo (o ANY
  dizia "Repor -0,5 litros"). Opção: só calcular com Na > 145, como diz o
  "quando usar".

### Adrogué-Madias — `correcao-na-adrogue`

- Com infusato de sódio menor que o do paciente o valor é negativo; o ANY
  dizia "eleva o sódio em ~-X". Aqui o texto fala em "variação".
- O fator de água corporal abria em "Homem jovem (0,6)"; aqui precisa ser
  escolhido.

### Cockcroft-Gault, CKD-EPI 2021

- O sexo abria em "Masculino" no ANY; aqui precisa ser escolhido.

### AKIN/KDIGO, osmolaridade, cálcio corrigido, potássio, anion gap

Sem achado além da linguagem. Potássio: o ANY dizia a gravidade só no texto
("Hipocalemia leve"); aqui ela virou o nome da faixa.
