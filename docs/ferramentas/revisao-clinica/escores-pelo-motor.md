# Revisão clínica — Escores do plano calculados pelo motor (CC-333)

O que o Copiloto lê do caso para calcular um escore e conferir o número que a
análise escreveu, para a revisão do **Dr. Ripardo**. Vale só com
`COPILOT_DETERMINISTIC_SCORES=on` (desligada por padrão).

**Como funciona.** Nada de IA: regras fixas do motor
(`src/shared/clinical-tools/case-scores.ts`) leem os sinais vitais, a idade e
o sexo do entendimento do caso e, do texto do caso, ureia, estado mental, uso
de O₂ e o Glasgow que o médico escreveu. Com **todas** as entradas, o escore é
calculado pela mesma calculadora das Ferramentas; faltando uma, o escore não
sai e o plano pede o dado. Dois usos:

- **Antes da decisão**: as calculadoras que a CC-332 sugere para o caso vão ao
  prompt já calculadas ("CURB-65 = 5 pontos, calculado pelo sistema com: …"),
  ou com o que falta. O modelo é instruído a nunca calcular escore.
- **Depois da decisão**: todo escore da lista do item 4 citado com número é
  conferido. Diferente do motor: o número vira o do motor, com
  "[corrigido pelo sistema]". Sem dado para calcular: o número sai e fica
  "CURB-65 [falta saber: ureia para calcular]". Quando o motor calcula, as
  entradas usadas vão junto da conduta ("[CURB-65 = 5 pontos, calculado pelo
  sistema com: estado mental: confusão; ureia 64 mg/dL; FR 32 irpm; PA 85x50
  mmHg; idade 72 anos]").

Versão atual: **1.0.0** (`CASE_SCORES_PROVENANCE`), revisão **pendente**. Cada
mudança decidida aqui sobe a versão e o teste `case-scores.spec.ts` registra o
novo comportamento. Os limiares de cada item repetem o rótulo da calculadora;
o que está em revisão aqui é **o que conta como dado do caso**.

## 1. Dados lidos do texto do caso

| #   | Dado           | Como é lido                                                                                                                                                                                                                                                                                                                                                                              | Pergunta para o revisor                                                                                                                       |
| --- | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| 1.1 | Ureia          | "ureia 64", "uréia: 58", "Ur 61" (sem unidade = mg/dL); "ureia 9 mmol/L". Faixa plausível 5–600 mg/dL. Dois valores diferentes no texto: nenhum. **BUN não conta** (é outra medida)                                                                                                                                                                                                      | Converter BUN (× 2,14) para ureia? Com dois valores (chegada e controle), usar o mais recente em vez de nenhum?                               |
| 1.2 | Estado mental  | Pior menção sem negação: não responsivo/comatoso → U; "responde à dor" → P; "responde à voz/ao chamado" → V; sonolento, torporoso, obnubilado, "rebaixamento" → rebaixado (nível não definido); confuso, desorientado, confusão mental, delirium → confusão; lúcido, LOTE, "orientado em/no…", "alerta e orientado" → alerta. "Orientado sobre…" (orientação dada ao paciente) não conta | A lista de termos cobre o que se escreve no PS? "Agitado" sozinho deveria contar como alteração?                                              |
| 1.3 | Glasgow        | O número que o texto do caso traz ("Glasgow 14", "GCS 13"); com dois, o último. Glasgow 15 com "confuso" no texto: conflito, nenhum dos dois decide                                                                                                                                                                                                                                      | Confirmar o conflito como "não decide".                                                                                                       |
| 1.4 | O₂ suplementar | "em ar ambiente", "aa" → ar; cateter, máscara, Venturi, VNI, alto fluxo, "com O₂", intubado/VM → O₂. As duas menções no mesmo caso: nenhuma                                                                                                                                                                                                                                              | Confirmar.                                                                                                                                    |
| 1.5 | Sinais vitais  | Só do entendimento do caso (PAS, PAD, FC, FR, SpO₂, temperatura, idade), nas faixas plausíveis da CC-332. Sem entendimento (`COPILOT_REASONING=legacy`), nenhum                                                                                                                                                                                                                          | O sinal vital é o da chegada. Com valores seriados no caso, o entendimento escolhe um; serve para escore de gravidade, ou deveria ser o pior? |

## 2. Itens de cada escore

| #    | Escore                               | Item                                      | O caso responde                                                                                                                                                                                              | Pergunta para o revisor                                                                                                                                          |
| ---- | ------------------------------------ | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2.1  | CURB-65                              | Confusão mental                           | Sim com qualquer alteração do estado mental (1.2); Não com "alerta" ou Glasgow 15. **Glasgow < 15 sozinho não decide**                                                                                       | Glasgow 14 por abertura ocular não é confusão; por isso não decide. Aceitar Glasgow ≤ 13 como confusão?                                                          |
| 2.2  | CURB-65                              | Ureia > 42 mg/dL (> 7 mmol/L)             | Pela ureia (1.1)                                                                                                                                                                                             | Confirmar.                                                                                                                                                       |
| 2.3  | CURB-65                              | FR ≥ 30; idade ≥ 65                       | Como no preenchimento da CC-332                                                                                                                                                                              | Confirmar.                                                                                                                                                       |
| 2.4  | CURB-65                              | PAS < 90 ou PAD ≤ 60                      | Sim com uma das duas; Não só com as duas conhecidas e normais (CC-332)                                                                                                                                       | Confirmar.                                                                                                                                                       |
| 2.5  | qSOFA                                | FR ≥ 22; PAS ≤ 100                        | Pelos sinais vitais                                                                                                                                                                                          | Confirmar.                                                                                                                                                       |
| 2.6  | qSOFA                                | Alteração da consciência                  | Glasgow < 15 → Sim, Glasgow 15 → Não; sem Glasgow, qualquer alteração (1.2) → Sim e "alerta" → Não                                                                                                           | Confirmar.                                                                                                                                                       |
| 2.7  | NEWS2                                | FR, SpO₂ (escala 1), PAS, FC, temperatura | Faixa pelo valor, nos limites do rótulo                                                                                                                                                                      | A calculadora só tem a escala 1 de SpO₂. Para DPOC com retenção de CO₂ (escala 2), o NEWS2 calculado superestima. Deixar de calcular quando o caso fala em DPOC? |
| 2.8  | NEWS2                                | O₂ suplementar                            | Pelo uso de O₂ (1.4)                                                                                                                                                                                         | Confirmar.                                                                                                                                                       |
| 2.9  | NEWS2                                | Nível de consciência (ACVPU)              | A letra pelo estado mental (1.2); Glasgow 15 sem outra menção → A. "Rebaixado" sem o nível, ou Glasgow < 15 sozinho, **não decide**                                                                          | C, V, P e U valem os mesmos 3 pontos. Aceitar "rebaixado" e Glasgow < 15 como 3 pontos, mesmo sem a letra?                                                       |
| 2.10 | Índice de choque                     | FC e PAS                                  | Pelos sinais vitais                                                                                                                                                                                          | Confirmar.                                                                                                                                                       |
| 2.11 | PERC                                 | SpO₂ < 95% em ar ambiente                 | Sim com SpO₂ < 95% (mesmo com O₂); **Não só com a medida em ar ambiente** (1.4)                                                                                                                              | O preenchimento da CC-332 (item 3.3 de ferramenta-no-plano.md) só preenche o Sim. Aqui o Não entra quando o texto diz "ar ambiente". Serve?                      |
| 2.12 | PERC, Wells, HEART, Ottawa, Alvarado | Idade, FC, temperatura                    | Como no preenchimento da CC-332; os outros itens (história, exame, ECG, troponina) ficam sem resposta, então esses escores **nunca saem calculados** pelo Copiloto: citados com número, viram pedido do dado | PERC com um critério positivo já é positivo, mesmo sem os outros. Mostrar "PERC positivo" nesse caso, sem o número?                                              |

## 3. Valor que o próprio caso informa

Quando o motor não calcula, mas o texto do caso traz o valor ("Glasgow 9",
"NIHSS 12", ou o resultado de uma ferramenta anexado ao caso), esse valor é a
referência: a análise que cita o mesmo número fica como está; a que cita outro
é corrigida para o do caso, com "[corrigido pelo sistema: valor informado no
caso]". Com dois valores, vale o último do texto.

| #   | Pergunta para o revisor                                                                                                                             |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| 3.1 | Quando o motor calcula e o médico escreveu outro valor (ex.: "CURB-65 3" no texto, motor dá 4), hoje vale o do motor. Deveria valer o do médico?    |
| 3.2 | Glasgow e NIHSS são exames à beira do leito: o Copiloto nunca os calcula. A análise citando um valor que o caso não traz vira "falta saber". Serve? |

## 4. Escores conferidos depois da decisão

CURB-65, qSOFA, SOFA, NEWS2, índice de choque, Glasgow, Glasgow-Blatchford,
NIHSS, HEART, TIMI (não o fluxo TIMI da angiografia), GRACE, Wells (TEP; o de
TVP não), PERC, ADD-RS, Ottawa para HSA, Alvarado, CHA₂DS₂-VASc, HAS-BLED,
ABCD², Centor/McIsaac, ICH score, APACHE II, Child-Pugh, MELD-Na e Rockall.

Conta como "citado com número" o nome seguido do valor ("CURB-65 de 3",
"qSOFA 2/3", "NEWS2: 7"). Não contam limiares ("CURB-65 ≥ 3", "qSOFA 2 ou
mais"), faixas ("CURB-65 0–1", "HEART 4 a 6") nem tempo ("NIHSS em 24 h").
RASS e EVA ficam de fora: "meta de RASS 0" é alvo, não resultado.

| #   | Pergunta para o revisor                                                                                                                                                       |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 4.1 | Falta algum escore que o plano costuma citar com número?                                                                                                                      |
| 4.2 | Na correção, o número muda mas o texto em volta continua o do modelo ("CURB-65 de 5 [corrigido pelo sistema]: tratamento ambulatorial" pode ficar incoerente). A marca basta? |
