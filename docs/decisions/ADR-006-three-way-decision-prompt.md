# ADR-006: Prompt de Decisão em 3 Vias (recomendar / perguntar / incerteza)

**Status:** Aceito
**Data:** 2026-06-11
**Tarefa:** DEC-003 — https://app.clickup.com/t/90132511259/86ahzc181

## Contexto

Antes desta mudança, o `SYSTEM_INSTRUCTION` em `prompt-builder.ts` orientava o
modelo a recomendar com citação ou declarar `uncertainty: true` quando a
evidência recuperada não cobrisse o caso. Não havia, porém, nenhuma orientação
sobre o que fazer quando a evidência é suficiente, mas falta um dado do
paciente que mudaria a conduta — situação em que o modelo tendia a recomendar
de forma definitiva mesmo com informação incompleta, ou a declarar incerteza
indevidamente (mesmo havendo diretriz aplicável).

O DEC-001 já havia introduzido os campos `clarifyingQuestions` e
`preliminary` no `CopilotOutputSchema` (`output-validator.ts`), e o DEC-002
construiu o loop multi-turno que consome essas perguntas. Faltava, no entanto,
instruir o modelo sobre quando e como usá-los — o `OUTPUT SCHEMA` enviado ao
LLM nem sequer documentava esses campos.

## Decisão

`SYSTEM_INSTRUCTION` passa a descrever uma regra de decisão em 3 vias,
aplicada a cada caso:

- **A — Evidência suficiente + dados do paciente suficientes:** recomendação
  definitiva com citação; `clarifyingQuestions` vazio; `preliminary: false`.
- **B — Evidência suficiente, mas falta um dado do paciente que mudaria a
  conduta:** o modelo emite até 3 `clarifyingQuestions` (ordenadas por
  `criticality`: `blocker` > `important` > `optional`), perguntando apenas o
  que muda a conduta, e marca todas as recomendações como `preliminary: true`.
  `uncertainty` permanece `false` — a evidência é suficiente, falta apenas
  dado do paciente.
- **C — Evidência insuficiente para o cenário clínico:** comportamento
  existente (`uncertainty: true` + `uncertaintyReason`), inalterado.

### Checklist de red flags universais

O prompt lista red flags que o modelo deve sempre considerar quando
relevantes ao caso: imunossupressão, gestação/amamentação, alergias
medicamentosas, tempo de evolução dos sintomas, uso de anticoagulante, idade
extrema (pediátrico ou idoso frágil) e sinais vitais instáveis.

### Regra anti-interrogatório

Para evitar que o copiloto vire um questionário genérico, o prompt exige que
cada `clarifyingQuestions[].why` cite a diretriz específica que torna a
resposta relevante para a conduta (ex.: "Imunossupressão muda a indicação de
oseltamivir — Diretriz Influenza"). Perguntas que não mudam a conduta segundo
a evidência recuperada não devem ser feitas.

### Few-shot: síndrome gripal >48h

O prompt inclui um exemplo completo (caminho B) com um caso de síndrome
gripal com mais de 48h de sintomas, evidência sobre indicação de oseltamivir
condicionada ao status imunológico, e a saída esperada com uma
`clarifyingQuestion` de `criticality: "blocker"` sobre imunossupressão.

### OUTPUT SCHEMA atualizado

O bloco `OUTPUT SCHEMA` enviado ao modelo agora documenta `preliminary` (em
cada recomendação) e `clarifyingQuestions[]` (com `id`, `question`, `why`,
`criticality`, `expectedAnswerType`, `choices`), que já existiam no
`CopilotOutputSchema` desde o DEC-001 mas não eram comunicados ao modelo.

### Limite de 3 perguntas por turno

`output-validator.ts`: `clarifyingQuestions` agora tem `.max(3, ...)` no
schema Zod, rejeitando (com erro de validação) qualquer saída que exceda 3
perguntas por turno — reforçando no guardrail a regra já comunicada no prompt.

## Consequências

### Positivas
- O modelo tem uma regra explícita e determinística para escolher entre
  recomendar, perguntar ou declarar incerteza, reduzindo recomendações
  definitivas com dados incompletos.
- O guardrail (`output-validator`) impõe o limite de 3 perguntas
  independentemente do que o prompt instrui, defesa em profundidade.
- O few-shot fornece um exemplo concreto e auditável do formato esperado para
  o caminho B.

### Negativas / fora de escopo
- A avaliação manual com Dr. João (10 casos reais, meta ≥8 com decisão
  apropriada) é um passo de avaliação humana e não está coberta por testes
  automatizados — deve ser conduzida separadamente antes de considerar o
  prompt validado clinicamente.
- Como nenhum conteúdo de diretriz sobre influenza/oseltamivir está
  atualmente ingerido (KB-002 ainda em aberto), os testes automatizados
  validam o conteúdo do prompt e o guardrail de schema, não o comportamento
  fim-a-fim do modelo com evidência real de influenza.
