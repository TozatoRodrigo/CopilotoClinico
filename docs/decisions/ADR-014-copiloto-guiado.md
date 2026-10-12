# ADR-014: Copiloto guiado — perguntar antes do plano, numa conversa só

**Status:** Aceito — atrás de `COPILOT_INTAKE` (padrão `off`)
**Data:** 2026-10-12
**Relaciona:** ADR-013 (raciocínio em etapas), ADR-006 (decisão em três
caminhos), ADR-005 (auditoria do loop de decisão), ADR-012 (nunca bloquear)

## Contexto

O primeiro relato do caso costuma chegar curto. Até aqui o Copiloto analisava
assim mesmo (~58 s no p50, Opus 5.5 v3), devolvia um plano cheio de conduta
condicional e só então perguntava — numa página longa, com todas as perguntas
de uma vez e um botão "Reanalisar" que custava outra análise inteira. A lista
"O que falta saber" do entendimento aparecia, mas não dava para responder ali.

Os médicos parceiros pediram o formato de conversa: o Copiloto pergunta, o
médico responde, vem a próxima pergunta, até ter o que precisa. O discovery
(artefato de 11/10/2026) recomendou perguntar antes do plano, com três
lições do próprio produto e uma da literatura:

- quando o modelo decide sozinho, "até 3 perguntas" vira "3" (v2: 272 de 272);
- pergunta sobre dado já informado irrita e custou retentativas;
- pedir ao LLM que pergunte piora a acurácia; decidir **quando** perguntar
  melhora (MediQ, NeurIPS 2024);
- paciente instável não pode esperar pergunta nenhuma.

## Decisão

### 1. Leitura do caso e portão (backend)

Quando o caso chega, uma **leitura do caso** (`UnderstandingService.readForIntake`)
produz o mesmo `CaseUnderstanding` da Etapa 1 — com as regras 1 a 9 do prompt
aprovadas pelo gabarito, byte a byte — mais `timeCritical` e até 3
`intakeQuestions` candidatas (texto, tipo de resposta, opções, sinais vitais
que faltam, o que separa, por que muda a conduta, respostas urgentes).

Quem decide se pergunta é o **portão em código** (`intake-gate.ts`):

| Situação | Caminho | Perguntas |
| --- | --- | --- |
| `instability.present` | `unstable` | 0 — plano direto |
| Nenhuma pergunta sobra depois dos filtros | `complete` | 0 — plano direto |
| `timeCritical` | `ask` | no máximo 1 |
| Demais | `ask` | no máximo 3, a mais decisiva primeiro |

Filtros: pergunta sobre dado do `structuredData` sai (mesmo detector do
validador v2); sinais vitais já informados saem da pergunta de sinais vitais
(e ela some se não sobrar nenhum); escolha com menos de 2 opções sai; só uma
pergunta de sinais vitais; sim/não sempre com "Não sei"; resposta urgente só
vale se for uma das opções.

Leitura que falha, recusa ou passa de 20 s (`INTAKE_READING_TIMEOUT_MS`) vira
`reading_failed` e o caso segue direto ao plano. Nada aqui bloqueia o plano.

### 2. A conversa fica no servidor

Nova tabela `case_intakes` (migration `20261012120000_adr_014_case_intakes`):
caso e respostas **já redigidos** (PII + patientRef), caminho, situação,
motivo de fechamento, leitura, perguntas, respostas, custo e tempo da leitura
e o vínculo com a análise que a conversa gerou. O médico interrompido volta
de qualquer aparelho na pergunta da vez.

A análise continua sendo uma `AiInteraction` ("um plano"), e o funil de
produto não muda. As respostas de antes do plano entram no turno 0
(`answered_questions`, `turnIndex: -1`) e chegam às reanálises seguintes pelo
mesmo bloco "P: … R: …" de sempre. As perguntas de antes do plano não gastam
as 5 rodadas.

Sem resposta nenhuma, a análise reaproveita o entendimento da leitura (a
Etapa 1 não roda de novo); com respostas, a Etapa 1 refaz o entendimento.

### 3. Rotas — nenhum texto clínico na URL

| Rota | O quê |
| --- | --- |
| `POST /encounters/:id/copilot/intake` | Abre a conversa (lê o caso, decide) |
| `POST …/intake/:intakeId/answers` | Uma resposta (`tap`, `text` ou `voice`) |
| `POST …/intake/:intakeId/skip` | "Analisar agora com o que tenho" |
| `GET …/intake/:intakeId/stream` | O plano por SSE, só com o id da conversa |
| `POST …/intake/:intakeId/analyze` | O plano sem streaming (reserva) |
| `GET /encounters/:id/copilot/conversation` | A conversa inteira: perguntas e rodadas |

Uma conversa gera um plano só: com plano gravado ou outro em andamento há
menos de 6 min (acima do pior caso de uma análise), 409 — a tela recarrega a
conversa em vez de duplicar. Cada tentativa leva uma marca: só ela libera a
conversa se falhar, e o primeiro plano que fica pronto é o que vale.
Resposta repetida, atrasada ou que perdeu a corrida para outro aparelho não
reabre nada nem entra na trilha.

Resposta grave encerra as perguntas e começa o plano (`urgent_answer`):

- a opção marcada como urgente pela leitura do caso, tocada, digitada ou
  ditada ("Sim.", "sim, há 2 h" — sem acento, caixa e pontuação; vence a
  opção mais longa, para "não sei" não virar "não");
- sinais vitais de instabilidade, decididos por código: PAS < 90, SpO₂ < 90,
  FC > 130 ou < 40, FR > 30, glicemia capilar < 60 (`intake-urgency.ts`).

### 4. Uma tela só (frontend)

`/encounters/:id/conversation` substitui a captura e o resultado (as rotas
antigas redirecionam). O caso, as perguntas, o plano de cada rodada e as
perguntas que a decisão deixa **depois** do plano ficam no mesmo fio, uma
pergunta por vez, com resposta de um toque (teclas 1–9 no computador),
sinais vitais numa tela só, número com teclado numérico e texto ou voz no
campo de baixo. A última resposta começa o plano sozinha. Rodadas
anteriores ficam recolhidas.

### 5. Auditoria e observabilidade

Trilha (padrão ADR-005, só hash das respostas): `COPILOT_INTAKE_STARTED`,
`COPILOT_INTAKE_ANSWERED`, `COPILOT_INTAKE_CLOSED`. Logs: `INTAKE_READING`,
`INTAKE_STARTED`, `INTAKE_CLOSED`, `INTAKE_READING_TIMEOUT`,
`INTAKE_READING_LATE`, `INTAKE_CONCURRENT_UPDATE`.

### 6. Flag e rollback

`COPILOT_INTAKE=off|on`, padrão `off`, lida a cada caso. Com `off` a tela é a
mesma conversa, mas sem leitura: o caso vai direto ao plano, como antes.
`AI_INTAKE_MODEL` troca o modelo da leitura (vazio = o da Etapa 1) se a
primeira pergunta passar de 8 s.

## Consequências

### Positivas

- O dado que muda a conduta entra antes do primeiro plano, em segundos e sem
  outra análise de ~58 s.
- Paciente instável e caso completo não ganham atrito nenhum.
- O plano, as perguntas e as rodadas ficam numa linha só; nada se perde numa
  interrupção.
- O streaming do plano deixa de levar o caso na URL.

### Negativas / riscos

- **Latência da leitura:** uma chamada de esforço baixo antes da primeira
  pergunta (meta ≤ 8 s). Mitigação: teto de 20 s, `AI_INTAKE_MODEL`.
- **Custo:** uma leitura a mais por caso (centavos), contra reanálises evitadas.
- **Regulatório (RDC 657):** o ciclo de perguntas que mudam a conduta é o
  ponto de maior risco de enquadramento como software médico. Mantido como
  apoio à decisão: pular sempre possível, nenhuma pergunta obrigatória.
- **Qualidade das perguntas ainda não medida no gabarito:** o funil
  ("plantão simulado") ainda não tem a etapa de perguntas antes do plano.
  Próximo passo antes de ligar para todos.

## Medição

Métrica principal: tempo do envio até um plano sem pergunta pendente que
muda a conduta (meta ≤ 90 s no p50 nos casos que recebem pergunta).
Guarda-corpos: primeira pergunta ≤ 8 s (p50), média ≤ 1,5 pergunta por caso,
"Analisar agora" entre 10% e 25%, "Não sei" ≤ 20% por pergunta, 0 pergunta em
paciente instável. Os tempos e caminhos estão em `case_intakes` e nos logs.
