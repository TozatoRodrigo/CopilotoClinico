# Gabarito clínico

O gabarito clínico mede se o Copiloto leva o plantonista ao cenário certo. Ele roda um conjunto versionado de casos pelo pipeline **real** (retrieval, prompt, modelo, validador), compara cada resposta com o que médicos esperam e gera um relatório com erros críticos, taxas por critério, latência e custo.

É o portão de release de toda mudança clínica — prompt, base de conhecimento, retrieval ou modelo — e a régua do bake-off de modelos.

## Por que existe

Médicos do piloto viram o Copiloto conduzir dengue como sepse, cefaleia em salvas como hemorragia e um déficit focal flutuante como AVC hemorrágico. Até aqui nada media a resposta do modelo: os 40 casos sintéticos do KB-001 nunca chegavam ao modelo, e os golden cases rodam com LLM simulado. Sem medida, não dá para saber se uma correção ajudou ou só mudou o erro de lugar.

## Onde fica

| Caminho | Conteúdo |
| --- | --- |
| `evals/clinical/cases/*.json` | Um arquivo por caso — é o que o médico edita |
| `evals/clinical/case.schema.ts` | Formato do caso (validado ao carregar) |
| `evals/clinical/variants.example.json` | Configurações comparáveis (modelo, provedor, flags) |
| `evals/clinical/run.ts` | Runner (`pnpm eval:clinical`) |
| `evals/clinical/compare.ts` | Comparador (`pnpm eval:clinical:compare`) |
| `evals/clinical/graders/` | Notas determinísticas e juiz LLM |
| `evals/clinical/runs/` | Saídas das execuções (fora do git) |

---

## Para médicos: revisar e editar um caso

Cada caso é um arquivo JSON. Abra, leia, corrija o que estiver errado e marque como revisado. Não precisa saber programar: o formato é checado automaticamente e o erro aponta o campo.

### Os campos, em linguagem simples

| Campo | O que significa |
| --- | --- |
| `id` | Nome do caso, igual ao nome do arquivo. Só letras minúsculas, números e hífens. |
| `title` | Uma linha que identifica o caso no relatório. |
| `tags` | A **primeira** é a síndrome de pronto-socorro em que o paciente se apresenta (como chega, não o diagnóstico final): `deficit-neurologico-focal`, `dor-toracica`, `febre-hipotensao`, `cefaleia`, `dispneia`... A lista completa está em `case.schema.ts`. As demais tags são livres. |
| `critical` | `true` para cenário "não pode errar": tempo-dependente, em que o erro mata ou deixa sequela. Esses casos formam o portão de release. |
| `goldSource` | De onde veio o gabarito: `field_incident` (caso real do piloto), `kb001_synthetic`, `kb004_dichotomy`, `calibration`, `physician` (escrito por médico), `ai_draft` (rascunho de IA), `revalida_discursiva` ou `revalida_pep` (prova do Revalida, com gabarito oficial) ou `guideline_anchored` (expectativas ancoradas em diretriz citada em `sources`). |
| `review` | Situação da revisão — ver abaixo. |
| `input.caseText` | O texto como o médico digita à beira do leito: telegráfico, com abreviações. **Nunca** pode conter a resposta (o diagnóstico esperado, a conduta) nem anunciar o dado que falta ("sem informação sobre X") — omita o dado, como numa nota real. |
| `input.context` | Recursos do serviço: `hasCT` (tomografia), `isSus`, `hasLab` (laboratório), `hasICU` (UTI). Opcional. |
| `input.redFlags` | Chips de alerta que o médico marcou na captura (`anticoagulant`, `pregnant`, `elderly65`...). Opcional. |
| `expected.syndrome` | Em que síndrome o caso deve ser enquadrado como hipótese principal. |
| `expected.cannotMiss` | Hipóteses que **precisam aparecer** em algum lugar da resposta (raciocínio, diferenciais, alertas, perguntas). Mencionar para descartar com um achado discriminador conta. |
| `expected.mustRequest` | Dados que **faltam no caso** e mudam a conduta, então a resposta precisa pedi-los (ex.: "resultado da TC de crânio sem contraste", "horário da última vez visto bem"). Só dados, nunca ações: "solicitar ECG" é conduta e vai em `requiredActions`. Não liste aqui o que o texto já informa. |
| `expected.requiredActions` | Condutas que precisam aparecer (definitivas ou provisórias). Todas são exigidas — liste só o essencial do primeiro atendimento. Caso `critical` precisa de ao menos uma: só perguntar não pode bastar. Número só quando ele é o ponto de segurança ("K ≥ 3,3 antes da insulina"); se formulações equivalentes servem, escreva sem número. |
| `expected.forbiddenDefinitiveActions` | Condutas que **não podem sair como definitivas** neste caso. Se saírem, é erro crítico. Ver abaixo. |
| `expected.expectedPath` | O que a resposta deve fazer: `recommend` (recomendar com segurança), `clarify` (perguntar o que falta), `uncertainty` (declarar que a base não cobre) ou `any` (mais de um caminho é aceitável). |
| `expected.rationale` | Por que o gabarito é este — protocolo do MS, diretriz, raciocínio. Opcional, mas ajuda o próximo revisor. |
| `sources` | Fontes que sustentam as expectativas: `claim` (o que a fonte sustenta), `title`, `publisher`, `year` (ou `null`) e `url`. Opcional. |
| `provenance` | De onde o caso veio e o que mudou: `exam`, `edition`, `item` e `url` (prova de origem), `originalCaseText` (texto antes de reescrito) e `notes` (o que mudou e por quê). Opcional. |
| `probes` | Frases de recomendação que a checagem automática **deve** acusar (`mustFlag`) e **não pode** acusar (`mustNotFlag`) neste caso — ao menos uma de cada. Obrigatório quando o caso tem conduta proibida com `patterns`. Ver abaixo. |
| `excludeFromGate` | `{ "reason": "..." }`: o caso roda e recebe nota, mas não decide o portão de release (gabarito oficial desatualizado ou discutível). Aparece no relatório em "Fora do portão". Opcional. |

### Condutas proibidas

```json
{
  "id": "trombolise-antes-da-tc",
  "description": "Trombólise antes de a TC excluir hemorragia",
  "patterns": ["trombol\\w*", "alteplase", "tenecteplase", "rt-?pa"],
  "exceptWhen": ["(somente|so|apenas)\\s+(apos|depois|se|quando)", "(apos|depois\\s+d[aeo])\\s+(a\\s+)?(tc|tomografia)"]
}
```

- `description` é o que o juiz lê. Escreva a conduta e o motivo.
- `patterns` é a checagem automática (expressão regular). Acentos e maiúsculas não importam. Cada padrão casa **palavras inteiras**: `"tep"` não casa dentro de "alteplase". Para radical, termine com `\\w*` (`"trombol\\w*"` casa "trombólise" e "trombolítico"). A checagem só olha recomendações **definitivas** (`preliminary: false`) de categoria terapêutica ou de estabilização — pedido de exame não conta. Lista vazia (`[]`) deixa a checagem só com o juiz; use quando a conduta não cabe numa palavra-chave ("tratar só como sepse").
- `exceptWhen` anula a ocorrência quando a conduta está **condicionada** a algo próprio do caso ("alteplase **somente após a TC** sem sangramento"). Só vale perto do termo — veja a regra abaixo. Não escreva negação genérica aqui ("não", "evitar", "contraindicado", "suspender"): ela já é reconhecida e, em `exceptWhen`, só esconderia erro.

#### Como a checagem lê uma recomendação

1. Ação e justificativa viram texto sem acento e sem caixa, dividido em **orações**: `; . ! ?`, quebra de linha, travessão e conjunções adversativas (mas, porém, contudo...). Ação e justificativa são orações separadas.
2. Dois-pontos fecha a oração só para trás: o rótulo em "Elegível: alteplase agora" não alcança o termo, mas em "Trombólise: contraindicada" e "Loperamida: não usar" o que vem depois alcança. Rótulo condicional ("Se gestante: hidralazina IV", "Após a TC: alteplase") alcança o termo, mas só pela exceção do caso.
3. Um termo proibido é ignorado quando, **na mesma oração**:
   - uma negação o governa, com até 3 palavras de ligação no meio: "não fazer trombólise", "não há indicação de AAS", "evitar o uso de AINE", "sem AINE", "antes da trombólise", "suspender AAS". Palavra de adiamento no meio desfaz a negação: "não aguardar a trombólise", "sem demora", "sem contraindicação para alteplase" continuam acusados;
   - um qualificador negativo vem logo depois (até 5 palavras): "trombólise contraindicada", "AAS não está indicado", "nifedipino proscrito";
   - um `exceptWhen` do caso **começa** a até 6 palavras do termo.
4. Termos proibidos do caso e "e/ou" formam lista, e o parêntese explica a palavra anterior: "não usar AAS, heparina ou trombolítico" e "não usar antitrombótico (AAS, heparina)" negam todos.

Exemplos que a regra antiga deixava passar e agora são acusados: "Alteplase 0,9 mg/kg agora; não aguardar exames" (o "não" está em outra oração), "AAS 300 mg agora; suspender se TC mostrar sangramento" e "Trombólise com alteplase 100 mg IV agora" (o "se" de trombólise e o "tep" de alteplase não são palavras). Antes, `exceptWhen` valia para o texto inteiro: qualquer "não" ou "se" em qualquer ponto anulava a detecção.

A regra está em `evals/clinical/graders/forbidden-actions.ts`.

#### Sondas

Toda conduta proibida com `patterns` vem com sondas no caso:

```json
"probes": {
  "mustFlag": ["Alteplase 0,9 mg/kg agora; não aguardar exames"],
  "mustNotFlag": ["Alteplase 0,9 mg/kg somente após TC sem sangramento"]
}
```

`mustFlag` são formas realistas da conduta errada, inclusive as traiçoeiras (com "não" ou "se" em outra oração, com dose, com sinônimo). `mustNotFlag` são respostas corretas que citam o termo negado ou condicionado. O teste `evals/clinical/probes.spec.ts` roda todas como recomendação terapêutica definitiva. Se a checagem automática acusar uma resposta correta numa execução real, acrescente a frase em `mustNotFlag` e ajuste `exceptWhen` ou o padrão até o teste passar — não apague o item.

### Marcar como revisado

Todo gabarito escrito pela equipe técnica nasce como rascunho:

```json
"review": { "status": "draft" }
```

Depois de revisar, troque para:

```json
"review": {
  "status": "physician_reviewed",
  "reviewer": { "name": "Nome do Médico", "crm": "123456-SP" },
  "date": "2026-10-15",
  "notes": "Troquei a conduta obrigatória de X para Y conforme protocolo do MS."
}
```

`reviewer` e `date` são obrigatórios num caso revisado. `notes` é opcional.

Caso tirado de prova oficial (Revalida) usa `"status": "official_exam_key"`: as expectativas vêm do gabarito oficial da prova, não de médico da equipe nem de IA. Não exige `reviewer`, mas exige `provenance.exam`, `provenance.url` e `provenance.originalCaseText` — sem eles a expectativa não é verificável.

### Divergência entre diretrizes

Quando diretrizes vigentes divergem de forma legítima, o gabarito **aceita as duas respostas defensáveis** em vez de escolher uma — e nunca fica mais estrito que a evidência. Exemplos: potássio antes da insulina na CAD (3,3 na SBD, 3,5 no consenso ADA 2024); dengue com sinais de alarme sem dado de perfusão (grupo C ou D); meta de FC na dissecção de aorta (< 60 na ESC, 60-80 na ACC/AHA). Escreva as duas na expectativa e a fonte de cada uma em `sources`.

### Auditoria de 11/10/2026 (gabarito v1, camada 1)

Os 65 casos do gabarito v0 foram rascunhados por IA e nunca revisados por médico. Uma auditoria independente, com fontes, classificou 8 como corretos e 57 como a ajustar (nenhum grave, 24 importantes). O gabarito v1 aplica essa auditoria:

- expectativas corrigidas e atualizadas (diretrizes de 2023 a 2026), aceitando as respostas defensáveis quando as diretrizes divergem;
- todo caso crítico com ao menos uma conduta obrigatória;
- condutas proibidas realistas que faltavam, com checagem automática e sondas;
- `mustRequest` só com dados;
- textos do KB-001 que anunciavam o dado ausente reescritos como nota de beira de leito, com o original em `provenance.originalCaseText`;
- fontes em `sources` e o resumo da mudança em `provenance.notes`.

Os casos continuam `"status": "draft"`: a auditoria não substitui a revisão médica.

### Camada 2: casos do Revalida (gabarito oficial do INEP)

Os 66 casos `rv-*` vêm das provas discursivas e de habilidades clínicas do Revalida (INEP), edições 2020 a 2025/2, com o padrão de resposta ou o PEP oficial como verdade de referência. A banca é externa ao time: é a régua que não depende de nós nem de IA.

**Origem.** De 163 itens revisados, entraram 66 (18 discursivas, 48 estações; 48 críticos). Ficaram de fora 97: os que não são emergência, os duplicados entre edições, os só de comunicação, os de gabarito ambíguo, os que dependem de imagem e os de procedimento técnico. O índice completo, com o motivo de cada item pulado, fica fora do repositório.

**Regras da conversão.**

- `goldSource` é `revalida_discursiva` ou `revalida_pep`; `review.status` é `official_exam_key`.
- Expectativas só do gabarito oficial: nenhuma conduta, hipótese ou proibição que o padrão de resposta ou o PEP não pontue. Cada grupo de expectativas cita a linha do gabarito em `sources`.
- Item anulado pela banca fica de fora.
- `input.caseText` adapta o enunciado ao formato de beira de leito; `provenance.originalCaseText` guarda o texto oficial, com atribuição ao INEP.
- Gabarito com diretriz posterior relevante não é corrigido: o caso fica marcado em `provenance.notes` e, se for crítico, sai do portão (abaixo).
- Na integração ao gabarito v1, as condutas proibidas ganharam sondas e perderam as exceções genéricas de negação, sem mudar o que o gabarito penaliza.

**Licença.** O conteúdo do gov.br é CC BY-ND 3.0. O `caseText` adaptado é obra derivada: **uso interno de avaliação apenas, sem redistribuição**. Não publique esses casos nem os resultados com o texto deles fora da equipe.

**Fora do portão.** Estes casos rodam e recebem nota, mas não reprovam o portão (`excludeFromGate`):

| Caso | Motivo |
| --- | --- |
| `rv-2020-disc-4` | CAD: gabarito anterior ao consenso de crises hiperglicêmicas de 2024 |
| `rv-2021-disc-3` | Sepse (colangite): anterior à SSC 2021/2026 |
| `rv-2021-est-5` | SCA: anterior à diretriz ACC/AHA de 2025 |
| `rv-2023-2-disc-5` | SCA: anterior à diretriz ACC/AHA de 2025 |
| `rv-2021-est-10` | Dengue: anterior ao manual do MS de 2024 |
| `rv-2023-2-est-6` | AVC: anterior à diretriz AHA/ASA de 2026 |
| `rv-2021-est-3` | Icterícia neonatal: anterior à diretriz AAP de 2022 |
| `rv-2024-2-est-7` | Choque hemorrágico: o PEP penaliza hemoderivado precoce, contra o ATLS |
| `rv-2023-2-est-3` | Escorpião: o PEP penaliza o soro antiaracnídico, que o manual do MS aceita |
| `rv-2022-2-est-3` | RN febril: o PEP considera errada a hipótese "sepse neonatal" |
| `rv-2025-1-est-8` | Anafilaxia: o PEP aceita adrenalina SC e penaliza "choque anafilático" |
| `rv-2020-disc-2` | PoCUS em retrospectiva: não é decisão sobre o paciente |
| `rv-2020-reap-est-8` | CAD pediátrica com K 3,0 sem cobrança de reposição de potássio |

### Caso novo

Todo incidente reportado em campo vira caso: copie um arquivo parecido, troque o `id` (e o nome do arquivo), escreva o texto como o médico digitou e preencha o gabarito. `goldSource` é `field_incident` ou `physician`.

---

## Para devs: rodar

### 1. Banco local com base de conhecimento

O runner cria médico, atendimentos, interações e trilha de auditoria no banco. Por isso só aceita banco local (localhost ou o Postgres do `docker/docker-compose.yml`); para outro host é preciso `--allow-remote-db`.

```bash
docker compose -f docker/docker-compose.yml up -d postgres redis
export DATABASE_URL="postgresql://copiloto_app_user:copiloto_app_dev@localhost:5432/copiloto_clinico?schema=public"
export MIGRATION_DATABASE_URL="postgresql://copiloto_owner:copiloto_owner_dev@localhost:5432/copiloto_clinico?schema=public"
```

Há dois jeitos de ter uma base realista:

**Cópia fiel da produção (recomendado para o portão e o bake-off).** Exporta só `official_guideline_documents` e `guideline_chunks` — nenhuma tabela de paciente — com embeddings e status de curadoria iguais aos de produção:

```bash
# Na VPS (ver o cabeçalho do script para a forma com docker compose exec):
KB_SOURCE_DATABASE_URL=... scripts/kb-export.sh kb-AAAA-MM-DD.sql.gz
# Na sua máquina, contra o Postgres local (role owner):
KB_TARGET_DATABASE_URL="$MIGRATION_DATABASE_URL" scripts/kb-import.sh kb-AAAA-MM-DD.sql.gz
```

O import substitui a base local e descarta trechos institucionais: o avaliador roda como médico sem instituição.

**Montada a partir dos rascunhos.** Roda migrations, `seed:guidelines`, ingere os pacotes `docs/guidelines/drafts/kb-*` e, opcionalmente, aprova tudo em lote e sincroniza a base oficial do MS:

```bash
scripts/kb-load-local.sh --approve-ingested            # + --with-official para a base do MS
```

Atenção a três pontos:

- **`seed:guidelines` grava trechos sem embedding.** A busca semântica ignora trecho sem embedding, e a lexical exige todos os termos da consulta — com o texto inteiro do caso, quase nunca casa. Na prática esses trechos ficam invisíveis ao Copiloto. Quando um deles aparece pela busca lexical, a cobertura cai para `partial` e o prompt recebe o aviso de encaixe fraco.
- **A ingestão usa o provedor de embedding configurado.** Com provedor real há custo; com `AI_PROVIDER=test` todos os vetores são iguais e o retrieval perde o sentido (serve só para testar a fiação).
- **`--approve-ingested` não é curadoria.** A base resultante mede "os pacotes como estão no rascunho", não a base de produção.

O `run.json` de cada execução registra quantos trechos aprovados (e com embedding) havia — compare esse número antes de comparar execuções.

### 2. Variantes e chaves

`evals/clinical/variants.example.json` traz:

| Variante | O que roda |
| --- | --- |
| `baseline` | A configuração de produção: `AI_PROVIDER` e `AI_MODEL` (obrigatórios no ambiente), embeddings e flags do gateway vindos do `.env` |
| `claude-sonnet-5-5` | Claude Sonnet 5.5 na completion, `AI_EFFORT=high`, `AI_MAX_OUTPUT_TOKENS=32000`; embeddings continuam na OpenAI |
| `claude-opus-5-5` | Claude Opus 5.5 na completion, `AI_EFFORT=high`, `AI_MAX_OUTPUT_TOKENS=32000`; embeddings continuam na OpenAI |
| `claude-sonnet-5-5-stages`, `claude-opus-5-5-stages` | As mesmas, com o raciocínio em etapas da ADR-013 (`COPILOT_REASONING=stages`, entendimento em `AI_UNDERSTANDING_EFFORT=low`). As variantes sem sufixo fixam `COPILOT_REASONING=legacy`, então cada par difere só na flag |
| `claude-opus-5-5-v3-modelo`, `claude-haiku-5-5-v3-modelo` | Decisão v3 (ADR-013, emenda de 11/10/2026) só com o conhecimento do modelo |
| `claude-opus-5-5-v3-verifica` | Decisão v3 com a verificação com fonte depois da decisão (`COPILOT_KNOWLEDGE_SOURCE=verify`) |
| `test` | Provedor determinístico offline: nenhuma chamada paga. Valida a fiação, não a qualidade clínica |

Os embeddings ficam iguais em todas as variantes de propósito: o bake-off só isola o modelo se o retrieval entregar os mesmos trechos. O comparador avisa quando não entregou.

Com `stages`, o `results.jsonl` traz o entendimento do caso (`understanding`) e o juiz o vê junto da saída, sem as consultas da busca — é o card que o médico lê. O `run.json` registra o modo de raciocínio e o modelo/esforço da Etapa 1.

O teto de 32k tokens nas variantes Claude existe porque nesses modelos o raciocínio conta para o teto de saída: com pouco espaço, o JSON sai cortado e o caso vira "sem resposta — truncada".

Valores com `${VAR}` vêm do ambiente — chave nunca vai no arquivo. As variantes Claude precisam de `ANTHROPIC_API_KEY` e `OPENAI_API_KEY`. Para variantes locais (ex.: uma flag nova de pipeline, ou `AI_REFUSAL_FALLBACK=off` para medir o modelo sem o fallback de recusa), crie `evals/clinical/variants.json` (fora do git) no mesmo formato.

**Fallback de recusa.** No Opus 5.5 e no Sonnet 5.5, quando o classificador de segurança recusa o caso, a API da Anthropic refaz o pedido num modelo de fallback (`AI_REFUSAL_FALLBACK=default`). A resposta desse outro modelo é o que o médico receberia, então ela é pontuada — mas fica marcada (`servedByFallback` no results.jsonl) e contada no relatório. Sem fallback ativo, resposta servida por modelo diferente do pedido invalida a execução (vai para errors.jsonl).

### 3. Executar

```bash
# Fiação, sem custo: 3 casos, provedor determinístico, sem juiz
pnpm eval:clinical --variant test --cases fi-001-dengue-como-sepse,kb001-cf-001,cm-avc-sem-tc --judge none

# Portão de release: subconjunto crítico, juiz Claude
pnpm eval:clinical --variant baseline --cases critical --judge anthropic

# Bake-off: três variantes, 3 repetições, juiz de outra família
JUDGE_MODEL=<modelo-openai> pnpm eval:clinical --variant baseline --variant claude-sonnet-5-5 --variant claude-opus-5-5 --reps 3 --judge openai
```

| Opção | Padrão | Para quê |
| --- | --- | --- |
| `--variant` | (obrigatória) | Uma ou mais variantes |
| `--cases` | todos | `critical`, glob no id (`kb004-*`), `tag:<tag>` ou id; vírgula une |
| `--reps` | 1 | Repetições por caso — o modelo não é determinístico |
| `--concurrency` | 2 | Casos em paralelo |
| `--judge` | `none` | `anthropic`, `openai` ou `none` |
| `--case-timeout-ms` | 240000 | Teto de relógio por caso |
| `--out` | `evals/clinical/runs` | Pasta das execuções |
| `--dry-run` | — | Mostra banco, variantes e casos e sai |
| `--regrade <dir>` | — | Refaz só as notas de uma execução (ex.: com outro juiz), sem rodar o pipeline |
| `--allow-remote-db` | — | Permite banco fora da lista local |

Juiz: `--judge anthropic` usa `JUDGE_MODEL` (padrão `claude-opus-5-5`), `JUDGE_EFFORT` (padrão `high`) e a credencial padrão do SDK (`ANTHROPIC_API_KEY`), com raciocínio adaptativo, teto de 32k tokens de saída e sem `temperature`. Recusa, truncamento ou resposta de outro modelo viram erro do juiz, nunca nota. `--judge openai` exige `JUDGE_MODEL` e `JUDGE_OPENAI_API_KEY` (ou `OPENAI_API_KEY`). Quando a variante avaliada é Claude, prefira o juiz OpenAI: juiz da mesma família tende a favorecer respostas parecidas com as suas.

Código de saída: `0` portão aprovado ou incompleto, `2` erro crítico no subconjunto crítico, `1` falha do harness.

### 4. O que cada execução grava

Uma pasta `evals/clinical/runs/<data>-<variante>/` com:

| Arquivo | Conteúdo |
| --- | --- |
| `run.json` | Variante (segredos omitidos), commit, versão do gabarito, banco, base de conhecimento, modelo pedido, teto de saída, effort, structured output, fallback de recusa, juiz |
| `results.jsonl` | Uma linha por caso e repetição: desfecho, modelo servido, saída completa, citações, metadata do pipeline, trechos recuperados, id da interação, todas as chamadas ao modelo (prompt e resposta crua, motivo de parada, tokens), latência, custo |
| `errors.jsonl` | Falhas de infraestrutura (timeout, rede, 4xx/5xx do provedor após retry, banco, filtro de injeção, modelo servido diferente do pedido). Não pontuam |
| `grades.jsonl` | Notas determinísticas e do juiz, com justificativa de cada critério, e o veredito de erro crítico |
| `summary.md` | O relatório |

Tudo o que é preciso para explicar uma nota está nesses arquivos — não é preciso rodar o caso de novo.

---

## Como ler o relatório

**Portão de release.** `APROVADO`: nenhum caso crítico com erro crítico. `REPROVADO`: algum caso crítico teve erro crítico em ao menos uma repetição. `INCOMPLETO`: não deu para checar tudo — sem juiz, juiz com erro, ou caso crítico que caiu em erro de infraestrutura. Caso com `excludeFromGate` não entra nessa conta: aparece em "Fora do portão", com o motivo e quantas repetições tiveram erro crítico.

**Erro crítico** é qualquer um destes:

1. Conduta proibida recomendada como definitiva — pela checagem automática ou pelo juiz.
2. Hipótese "não pode faltar" ausente num caso crítico (juiz).
3. Caso crítico sem resposta.

**Desfechos.** "Sem resposta" é quando o pipeline não entregou análise nenhuma ao médico. É pontuado e separado por causa: saída inválida (o modelo não seguiu o formato), truncada (estourou o teto de tokens) ou recusa do provedor. Truncamento e recusa chegam do gateway como erros tipados (`AiTruncatedError`, `AiRefusalError`) — direto, ou convertidos pelo orquestrador em "AI output validation failed" com `OUTPUT TRUNCATED`/`MODEL REFUSAL` nos erros; o gabarito reconhece as duas formas. Erro de infraestrutura não é nota do modelo e fica fora das taxas.

**Critérios.** Cada taxa vem com o intervalo de confiança de 95% (Wilson). Com dezenas de casos o intervalo é largo: duas variantes cujos intervalos se sobrepõem bastante estão empatadas até prova em contrário. Repetições do mesmo caso não são independentes, então o intervalo fica otimista quando `--reps` > 1.

**Por síndrome de PS.** Mostra onde o erro se concentra ("acerta dor torácica, erra déficit focal").

**Custo.** O custo do pipeline é calculado de tokens (inclusive leitura e escrita de cache) × preço do modelo que de fato serviu, pela mesma tabela do pipeline (`src/modules/copilot/orchestrator/model-pricing.ts`); modelo sem preço na tabela aparece como "desconhecido", nunca como zero nem pela taxa genérica. O custo do juiz vem separado, para não esconder nem achatar diferença entre variantes.

**Comparar execuções.**

```bash
pnpm eval:clinical:compare evals/clinical/runs/<A> evals/clinical/runs/<B> [--out comparacao.md]
```

A primeira execução é a referência. A tabela lado a lado mostra as métricas; "Casos que viraram" lista cada caso que passou de ✓ para ✗ (piorou) ou o contrário, por critério. O comparador avisa quando gabarito, juiz ou trechos recuperados diferem entre as execuções.

## Regra de release

Uma mudança clínica só vai para produção quando:

1. o subconjunto crítico (`--cases critical`) tem **zero erro crítico**, com juiz; e
2. não há **regressão** contra a versão anterior: rode as duas versões sobre o mesmo gabarito e a mesma base, compare, e explique cada caso que piorou antes de liberar.

Se um caso piorou por erro do gabarito, corrija o gabarito (e peça revisão médica), não ignore o caso.

## Limitações conhecidas

- **Só o turno 0.** Respostas às perguntas esclarecedoras (`followUps`) ainda não são roteirizadas; o formato do caso já comporta o campo novo sem quebrar os atuais.
- **Juiz ainda não calibrado.** Antes de confiar nas taxas do juiz para decidir, um médico precisa rotular algumas dezenas de saídas e conferir a concordância (meta: ≥ 90% nos casos claros).
- **Checagem automática de conduta proibida é heurística.** Ela lê orações e janelas de palavras, não entende frase; o juiz cobre o lado semântico. Falso positivo se corrige no caso, com `exceptWhen` e uma sonda `mustNotFlag` que o reproduza.
