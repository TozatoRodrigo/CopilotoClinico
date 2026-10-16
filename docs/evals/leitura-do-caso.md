# Leitura do caso: modelo e latência (CC-104)

Mede a leitura do caso do Copiloto guiado (ADR-014, etapa `intake_reading`) por modelo: quanto tempo leva até a leitura ficar pronta e até a primeira pergunta, e quantos dados do caso ela erra (sexo, idade, sinais vitais), com o julgamento ao lado (síndrome, instabilidade, tempo-crítico). É a régua para escolher o `AI_INTAKE_MODEL`.

## Por que existe

A primeira pergunta precisa chegar em segundos, ou o plantonista desiste antes do plano. Em 12/10/2026, com dois casos: Opus 5.5 levou 18–20 s (no teto de 20 s), Sonnet 5.5 13–15 s, Haiku 5.5 9–10 s, mas trocou o sexo do paciente. A meta da CC-104 é p50 da primeira pergunta ≤ 8 s sem errar dado do caso, e o gpt-oss na Groq é o candidato mais rápido. Dois casos não decidem nada: este harness roda o mesmo conjunto em cada modelo e põe os números lado a lado.

## Onde fica

| Caminho | Conteúdo |
| --- | --- |
| `evals/intake/cases/*.json` | Gabarito semeado do gabarito clínico (36 casos), no git |
| `evals/intake/cases-local/*.json` | Os casos reais anonimizados. **Fora do git** (`.gitignore`) |
| `evals/intake/case.schema.ts` | Formato do caso, validado ao carregar |
| `evals/intake/run.ts` | Runner (`pnpm eval:intake`) |
| `evals/intake/runs/<id>/` | `run.json`, `rows.jsonl` e `report.md` de cada rodada (fora do git) |

## O que roda

Para cada caso e cada modelo, o mesmo caminho de `IntakeService.start`, sem banco: a triagem do texto (máscara de PII e varredura de injeção), a leitura do `UnderstandingService` com `AI_INTAKE_MODEL` = o modelo da variante (com o retry de validação de produção) e o portão (`intake-gate.ts`) que decide se pergunta.

- **Leitura pronta**: da chamada até a leitura validada, retry incluído.
- **1ª pergunta**: do caso recebido até o portão decidir a primeira pergunta. Só existe quando o portão pergunta (paciente instável e caso completo vão direto ao plano). Em produção a tela ainda espera gravar a conversa, dezenas de milissegundos a mais.
- **Teto de 20 s**: o harness mede o tempo real, sem cortar. O relatório conta as leituras acima do teto de produção, que lá iriam ao plano sem perguntas.
- **Custo**: tokens de cada chamada pela tabela de preços do pipeline (`model-pricing.ts`), pelo modelo que respondeu. Modelo sem preço aparece como "desconhecido".

Os modelos se intercalam caso a caso (caso 1 em todos, depois caso 2...): medem no mesmo horário, e uma rodada interrompida ainda compara os modelos nos casos que leu.

## Freios: teto de gasto e limite de uso

A avaliação usa o mesmo workspace da Anthropic que a produção, que já foi esgotado duas vezes por avaliação (11/10 e 14/10/2026). **Antes de rodar, confira no console da Anthropic quanto do limite resta.**

- `--max-usd` é obrigatório. O dry-run mostra a estimativa; atingido o teto, nenhuma chamada nova sai, nem o retry de validação. Com `--concurrency N`, pode passar do teto em até N chamadas que já estavam em voo. Modelo sem preço entra no teto pela taxa genérica do pipeline.
- A primeira resposta de limite de uso ("usage limits", ou crédito insuficiente) para a rodada inteira, em todos os modelos.
- Limite de taxa (429) e erro de servidor refazem a leitura com espera (até 4 tentativas, esperas de até 1 min). A latência registrada é só a da tentativa que respondeu: os provedores compatíveis com a OpenAI rodam sem as novas tentativas deles (`AI_REQUEST_MAX_RETRIES=0`). Um 429 que continua depois de todas as esperas também para a rodada: no plano gratuito da Groq, é a cota diária.
- Concorrência padrão 1, no máximo 3.

Saída do comando: `0` rodada completa, `3` interrompida (teto ou limite), `1` falha do harness.

## Rodar

### 1. Ambiente

O harness lê `.env.local` e `.env`, como a API. Precisa da chave da Anthropic e, para o gpt-oss, do perfil da Groq igual ao de produção:

```bash
# .env.local (ou exportado no shell)
AI_PROVIDER=anthropic
AI_MODEL=claude-opus-5-5                    # exigido pelo gateway; a leitura usa o --model
AI_API_KEY=<chave da Anthropic>
AI_EMBEDDING_MODEL=text-embedding-3-small   # exigido pelo gateway; nenhum embedding é chamado
EMBEDDING_PROVIDER=none
AI_PROVIDER_PROFILES=groq
AI_PROVIDER_GROQ_KIND=openai
AI_PROVIDER_GROQ_API_KEY=<chave da Groq>
AI_PROVIDER_GROQ_BASE_URL=https://api.groq.com/openai/v1
AI_PROVIDER_GROQ_STRUCTURED_OUTPUT=json_schema
```

`AI_UNDERSTANDING_EFFORT` (padrão `low`, o de produção) vale para todos os modelos; `--effort` troca só na rodada. Um `--model groq:...` sem o perfil configurado falha antes de qualquer chamada.

### 2. Comandos

```bash
# Plano e estimativa, sem chamar modelo
pnpm eval:intake --dry-run
pnpm eval:intake --set local --reps 3 --dry-run

# A tabela da CC-104: os 10 casos reais, Sonnet, Haiku e gpt-oss (os modelos padrão), 3 repetições
pnpm eval:intake --set local --reps 3 --max-usd 3

# O gabarito semeado (36 casos), uma repetição
pnpm eval:intake --max-usd 2

# Um modelo, alguns casos
pnpm eval:intake --model groq:openai/gpt-oss-120b --cases 'kb004-*,cm-*' --max-usd 0.5

# Refazer o relatório com o gabarito corrigido, sem chamar modelo
pnpm eval:intake --report evals/intake/runs/<id>

# Fiação, sem custo: provedor determinístico, nenhuma chamada de rede
AI_PROVIDER=test AI_MODEL=deterministic-test AI_API_KEY=offline \
  AI_EMBEDDING_MODEL=deterministic-test-embedding \
  pnpm eval:intake --model deterministic-test --cases 'cm-*' --max-usd 0.01
```

Os modelos padrão são `claude-sonnet-5-5`, `claude-haiku-5-5` e `groq:openai/gpt-oss-120b`; `--model` (repetível) aceita qualquer referência `perfil:modelo` do gateway. A estimativa de custo é grosseira: entrada pelo tamanho do prompt e saída suposta de 2.500 tokens por leitura, mais 25% de retry. Pela tabela de preços atual, os 10 casos × 3 repetições nos três modelos ficam perto de US$ 1,20, quase tudo no Sonnet.

## Os 10 casos reais anonimizados

Cada caso é um arquivo em `evals/intake/cases-local/`, com o nome igual ao `id`. A pasta não vai para o git, mesmo com os casos anonimizados. Rode com `--set local`.

```json
{
  "id": "real-01-dor-toracica",
  "source": { "kind": "real_anonymized", "note": "plantão 13/10, PS adulto" },
  "review": { "status": "draft" },
  "input": {
    "caseText": "Masc, 61a, dor torácica em aperto há 2h, sudorese. PA 150x90, FC 104, SpO2 95%. ECG: supra de ST em DII, DIII e aVF."
  },
  "expected": {
    "sex": "M",
    "age": 61,
    "vitals": {
      "systolicBp": 150,
      "diastolicBp": 90,
      "heartRate": 104,
      "respiratoryRate": null,
      "spo2": 95,
      "temperature": null,
      "glucose": null
    },
    "syndrome": ["dor-toracica"],
    "instability": false,
    "timeCritical": true
  }
}
```

| Campo | O que significa |
| --- | --- |
| `id` | kebab-case, igual ao nome do arquivo. Sem nada do paciente. |
| `source` | `{"kind": "real_anonymized"}`; `note` opcional (de onde veio, sem identificar). |
| `review` | `draft`, ou `physician_reviewed` com `reviewer` (`name`, `crm`) e `date`. |
| `input.caseText` | O texto como o médico digitou no plantão, anonimizado: sem nome, prontuário, documento, telefone, endereço, data de nascimento ou data exata. Idade, sexo e sinais vitais ficam: são o que se mede. |
| `input.redFlags` | Chips marcados na captura (`anticoagulant`, `pregnant`...). Opcional. |
| `expected.sex`, `expected.age` | O que o texto diz (`"F"`/`"M"`, anos). `null` quando o texto não diz: a leitura também precisa deixar vazio. |
| `expected.vitals` | Os sete sinais, todos obrigatórios: `systolicBp`, `diastolicBp`, `heartRate`, `respiratoryRate`, `spo2`, `temperature`, `glucose`. Número como no texto (`39.4`); `null` quando o texto não traz; lista (`[186, 148]`) quando o texto traz duas medidas e qualquer uma vale. |
| `expected.syndrome` | Opcional: síndromes de PS aceitas (lista fechada em `src/shared/contracts/clinical.ts`, `PS_SYNDROMES`). Ausente, não é avaliada. |
| `expected.instability` | Opcional: ameaça imediata pela regra 2 do prompt (hipotensão ou choque, hipoxemia, desconforto respiratório, consciência rebaixada ou flutuante, sangramento importante, convulsão em curso, arritmia instável). |
| `expected.timeCritical` | Opcional: hipótese que precisa de tratamento em minutos a uma hora (regra 10 do prompt). |

O harness passa o texto pela mesma máscara de PII de produção antes de mandar ao modelo, e o relatório avisa quando ela alterou algum caso: sinal de que a anonimização deixou algo para trás. Se a triagem de injeção recusaria um texto em produção, o comando avisa antes de rodar.

### O gabarito semeado

Os 36 casos de `evals/intake/cases/` têm o mesmo texto de casos do gabarito clínico (`source.caseId`; um teste garante que continuam iguais). Sexo, idade e sinais vitais foram copiados do texto e conferidos por teste (cada número do gabarito aparece no texto que o modelo recebe). A síndrome aceita é o estrato do caso clínico (`tags[0]`) mais as alternativas defensáveis; instabilidade e tempo-crítico seguem as regras 2 e 10 do prompt e ficaram de fora quando o caso é limítrofe. Esses três campos de julgamento foram escritos por IA e estão como `draft`, à espera de revisão médica; os dados não dependem de julgamento.

## Como ler o relatório

O `report.md` abre com o que rodou (modelos e rotas, gabarito, esforço, gasto) e, se a rodada parou, o motivo.

- **Latência e erros de dado**: a tabela da CC-104. Latência (p50 · p90) sobre as leituras válidas; a coluna "1ª pergunta" traz entre parênteses quantos casos tiveram pergunta. Erros: casos com o campo errado, omitido (o texto informa, a leitura deixou vazio) ou inventado (o texto não informa, a leitura pôs um valor) sobre os casos lidos. Sinais vitais aparecem por caso e por campo. A coluna Meta marca ✓ quando o p50 da 1ª pergunta ≤ 8 s e não houve erro de sexo nem de idade.
- **Julgamento e caminho**: divergências de síndrome, instabilidade e tempo-crítico; quantas vezes o portão perguntou, viu paciente instável ou caso completo; leituras sem resultado; leituras acima do teto de 20 s; leituras refeitas por limite de taxa; custo total.
- **Erros por caso**: cada divergência com o valor do gabarito e o da leitura.
- **Leituras que não vieram**: saída inválida, recusa, truncamento, erro do provedor, com o tipo do erro e as tentativas.
- **Perguntas** (recolhido): as perguntas que passaram pelo portão, por caso e modelo, para comparar a qualidade.

## Como escolher o `AI_INTAKE_MODEL`

Com a tabela dos 10 casos reais × 3 repetições na mão, nesta ordem:

1. **Nenhum erro de sexo ou idade** em nenhuma repetição. Erro de dado do caso desqualifica: foi o que tirou o Haiku em 12/10.
2. **Sinais vitais** sem mais erros que o Sonnet 5.5, o modelo de produção hoje. Um vital inventado ou omitido muda a pergunta e o plano.
3. **Latência**: p50 da 1ª pergunta ≤ 8 s e nenhuma leitura acima de 20 s (lá, o caso iria ao plano sem perguntas).
4. **Instabilidade**: um "estável" em paciente instável faz o médico responder perguntas quando devia agir. Divergência aqui pesa mais que síndrome.
5. **Perguntas**: leia a seção recolhida. As do candidato precisam ser do nível das do Sonnet: dado à beira do leito, que muda a conduta, sem repetir o que o caso diz.
6. Empate no resto: o mais barato.

Se nenhum modelo passar de 1 a 4, mantenha `claude-sonnet-5-5` e registre o resultado na CC-104.

### Configurar em produção

```bash
# docker/.env.production — exemplo com o gpt-oss na Groq (CC-009: plano Developer)
AI_PROVIDER_PROFILES=groq
AI_PROVIDER_GROQ_KIND=openai
AI_PROVIDER_GROQ_API_KEY=<chave da Groq>
AI_PROVIDER_GROQ_BASE_URL=https://api.groq.com/openai/v1
AI_PROVIDER_GROQ_STRUCTURED_OUTPUT=json_schema
AI_INTAKE_MODEL=groq:openai/gpt-oss-120b
```

O compose já repassa essas variáveis ao `copiloto-api`; basta recriar o container (`docker compose --env-file .env.production -f docker-compose.prod.yml up -d --no-deps copiloto-api`, ver o runbook). Voltar é `AI_INTAKE_MODEL=claude-sonnet-5-5` e recriar de novo.

O segundo critério da CC-104 (p50 ≤ 8 s em produção) se confere nos logs, sem texto clínico: `docker logs copiloto-api | grep INTAKE_READING` dá o `model` e o `latencyMs` de cada leitura, e `INTAKE_READING_TIMEOUT` as que passaram de 20 s. Junte os primeiros casos reais depois da troca e tire o p50.

## Limitações conhecidas

- A latência é medida da máquina que roda o harness, não da VPS: a rede muda alguns centésimos de segundo. O critério de produção se confere nos logs.
- O SDK da Anthropic tem novas tentativas próprias em 429 e 5xx, dentro da latência medida. Com concorrência baixa e plano pago, é raro; a rodada registra quando o harness precisou refazer.
- A estimativa de custo supõe a saída; o custo real vem dos tokens de cada chamada, no relatório.
- O julgamento do gabarito semeado ainda não tem revisão médica (ver acima).
