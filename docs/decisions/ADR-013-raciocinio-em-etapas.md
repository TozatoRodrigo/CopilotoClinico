# ADR-013: Raciocínio em etapas — entender antes de buscar, conduta em duas camadas

**Status:** Proposto — Fase 1 do Plano de Confiabilidade Clínica
**Data:** 2026-10-10
**Relaciona:** ADR-006 (decisão em três caminhos), ADR-010/ADR-012 (fontes não
revisadas), ADR-008 (motor de protocolos)

## Contexto

O diagnóstico de outubro/2026 mostrou que o Copiloto erra o cenário por
desenho, não por acaso:

1. **Busca antes de raciocinar.** O texto inteiro do caso vira um único vetor;
   os 5 trechos "mais parecidos" definem, na prática, o que o modelo vai
   considerar. O modelo nunca é perguntado "o que está acontecendo com este
   paciente?" como etapa própria.
2. **Toda conduta precisa citar o trecho recuperado** (Regra 1 do prompt). Com a
   base fina, o modelo fica preso ao vizinho semântico e não pode usar o que
   sabe.
3. **Um prompt único com ~15 regras** faz diagnóstico, prioridade, perguntas e
   formatação ao mesmo tempo.

O gabarito clínico (65 casos, 45 críticos, 10/10/2026) quantificou o efeito.
Trocar o modelo ajuda muito — erros críticos caíram de 12 (gpt-5.6-luna, o
modelo de produção) para 1 (Claude Opus 5.5) —, mas o teto continua baixo para
qualquer modelo: o melhor deles trouxe só **49% das condutas obrigatórias** e
acertou o **caminho esperado em 62%** dos casos. No caso de AVC sem TC, numa
rodada inicial, os quatro modelos testados omitiram oclusão de grande vaso,
angio-TC e trombectomia — o que eles sabem, mas a Regra 1 não deixa dizer sem
um trecho.

Restrição de produto: os médicos parceiros não fazem curadoria de conteúdo. O
Copiloto precisa, ele mesmo, dizer ao plantonista para onde atuar e quais
dúvidas ficaram abertas; o conteúdo editorial virá de fonte licenciada
(negociação em andamento) e a validação vem do gabarito e do uso em campo.

## Decisão

O orquestrador passa a raciocinar em etapas, no método de um emergencista:
estabilidade → representação do problema → síndrome → hipóteses → pergunta que
mais muda a conduta → conduta em duas camadas.

### Etapa 1 — Entendimento (nova chamada ao modelo)

Antes de qualquer busca, uma chamada com saída estruturada produz o
`CaseUnderstanding`:

| Campo | O que é |
| --- | --- |
| `problemRepresentation` | Uma linha com os qualificadores que mudam a conduta (idade, início, tempo, padrão, achados-chave, contexto) |
| `structuredData` | Dados que o texto JÁ informa: idade, sexo, sinais vitais, glicemia, início/tempo de evolução, achados, medicações relevantes |
| `instability` | Há ameaça imediata? Com os achados que a indicam |
| `syndrome` | Síndrome de pronto-socorro (lista fechada, a mesma das tags do gabarito) |
| `cannotMiss` | Hipóteses que matam ou incapacitam em minutos/horas, do pior ao menos grave, cada uma com o achado que confirma ou afasta |
| `likely` | Hipóteses mais prováveis |
| `missingDiscriminators` | Dados ausentes que separam hipóteses de conduta diferente, com quais hipóteses cada um separa |
| `searchQueries` | Consultas de busca orientadas por síndrome e hipótese (até 4) |

O entendimento vai para a tela antes do plano ("O que eu entendi"). No
streaming, sai num evento próprio (`understanding`) antes dos primeiros
deltas, para o médico ver em segundos se o Copiloto entendeu o caso — e
corrigir.

### Etapa 2 — Busca dirigida por hipótese

O retrieval deixa de usar o texto inteiro do caso. Roda uma busca por consulta
de `searchQueries`, junta os resultados pela melhor similaridade de cada trecho
e mantém os mesmos pisos e tetos (curada e oficial). Assim a evidência
acompanha as hipóteses do raciocínio, e não o vocabulário do texto.

### Etapa 3 — Decisão em duas camadas

Um prompt novo (v2) recebe o entendimento e a evidência e devolve:

- **Conduta em duas camadas.** Cada recomendação tem `layer`:
  - `now` — seguro e útil em qualquer das hipóteses: fazer já;
  - `depends` — diverge entre hipóteses: só depois do dado em `dependsOn`
    (ex.: "resultado da TC sem contraste").
- **Perguntas por valor de informação.** Cada pergunta diz quais hipóteses a
  resposta separa (`separates`) e só pede dado ausente do `structuredData`.
- **Conhecimento geral rotulado.** A Regra 1 deixa de proibir o que o modelo
  sabe: uma recomendação pode ter `basis: 'model_knowledge'` sem trecho
  citado. Ela sai sempre preliminar, com o rótulo "Conhecimento geral do
  modelo — confirme no protocolo local", e **não pode trazer dose** (o
  validador recusa números com unidade de dose; a dose vem de fonte citada ou
  do protocolo local).

### Regras verificadas por código (validador v2)

1. `layer: 'depends'` exige `dependsOn`.
2. `basis: 'source'` exige `citationChunkId` válido; `basis: 'model_knowledge'`
   proíbe dose.
3. Toda hipótese `cannotMiss` do entendimento aparece em `differentials`,
   `redFlags` ou `reasoning` (cobertura). Falha vira retry com feedback.
4. Pergunta sobre dado já presente em `structuredData` é recusada.
5. Nenhuma regra nova bloqueia a resposta na segunda tentativa: o que não se
   resolve vira aviso e rótulo (princípio da emenda de 10/10/2026 ao ADR-012).

### Contrato (aditivo e compatível)

- `EnrichedCopilotOutput.understanding: CaseUnderstanding | null`.
- `Recommendation`: `layer`, `dependsOn`, `basis`; `citationChunkId` passa a
  aceitar `null` apenas com `basis: 'model_knowledge'`.
- `ClarifyingQuestion.separates: string[]`.
- Nova origem `model_knowledge` e novo motivo de preliminar `model_knowledge`.
- Interações antigas (sem esses campos) continuam renderizando como hoje.

### Flag e rollback

`COPILOT_REASONING=stages|legacy` — padrão `legacy` até o gabarito aprovar a
versão nova. Trocar para `legacy` volta ao pipeline atual sem redeploy.

## Critérios de liberação (gabarito clínico, mesmo conjunto e juiz)

| Métrica | Hoje (Opus 5.5, legacy) | Meta para ligar `stages` |
| --- | --- | --- |
| Erro crítico no subconjunto crítico | 1 | 0 |
| Condutas obrigatórias presentes | 49% | ≥ 75% |
| Caminho esperado | 62% | ≥ 80% |
| Próximo passo seguro | 89% | ≥ 95% |
| Dados ausentes pedidos | 90% | ≥ 95% |
| Tempo até "o que eu entendi" (p50) | — | ≤ 10 s |
| Tempo até o plano completo (p50) | 45 s | ≤ 60 s |
| Custo por análise | US$ 0,12 | ≤ US$ 0,25 |

A comparação usa também o juiz de outra família (OpenAI) para evitar viés de
autopreferência, e o gabarito passa a ter casos com respostas roteirizadas
(`followUps`) para medir o afunilamento: rodadas até um plano utilizável ≤ 2.

## Entrega em PRs sequenciais (nunca empilhados)

1. **Entendimento e busca dirigida:** contrato, Etapa 1, Etapa 2, card "O que
   eu entendi" (com "Corrigir", que reanalisa com o complemento do médico),
   evento `understanding` no streaming. Flag desligada por padrão.
2. **Decisão em duas camadas:** prompt v2, validador v2, conhecimento geral
   rotulado, tela com "Fazer agora" e "Depende de…", perguntas com o que
   separam.
3. **Gabarito multi-turno e comparação** legacy × stages, com os dois juízes.
4. **Verificação (Etapa 4)** — só se o gabarito mostrar condutas da camada
   `now` inseguras para alguma hipótese grave. YAGNI até lá.

## Consequências

### Positivas

- O cenário passa a ser decidido por raciocínio explícito e visível, e não pela
  similaridade de texto.
- O médico vê e corrige o entendimento antes da conduta.
- O que diverge entre hipóteses fica explicitamente condicionado ao dado que
  decide — a classe de erro dos incidentes dengue → sepse, cefaleia em salvas
  → hemorragia e AVC isquêmico → hemorrágico.
- A base fina deixa de limitar o raciocínio; ela passa a servir para o que
  precisa de fonte: doses, critérios, janelas.

### Negativas / riscos

- **Latência:** uma chamada a mais. Mitigação: o entendimento sai primeiro e
  usa esforço baixo.
- **Custo:** cerca de +20% por análise. Mitigação: cache do system prompt.
- **Conhecimento sem fonte:** risco de alucinação. Mitigação: rótulo
  preliminar, proibição de dose, verificação pelo gabarito.
- **Regressão em casos que hoje funcionam.** Mitigação: flag e comparação caso
  a caso no gabarito antes de ligar.

## Emenda — 11/10/2026: PR 2 e as fontes de conhecimento

**Contexto.** O produto passa a ser 100% Anthropic (decisão de 11/10/2026). A
base interna (81 trechos curados sem assinatura + ~10 mil trechos de PCDT,
quase todos crônicos) só é consultada por embedding da OpenAI. Antes de
decidir se ela sai do caminho da análise, o gabarito precisa medir as
alternativas.

**Decisão.**

1. A Etapa 3 entra atrás de `COPILOT_DECISION_PROMPT=v1|v2` (padrão `v1`;
   `v2` exige `stages`).
2. A evidência vem de `COPILOT_KNOWLEDGE_SOURCE`:
   - `internal_kb` (padrão) — a busca da Etapa 2, como hoje;
   - `model_only` — nenhuma busca;
   - `web` — pesquisa com as ferramentas de servidor da Anthropic (web search
     e web fetch) restrita a uma lista de domínios oficiais (Ministério da
     Saúde, sociedades brasileiras, diretrizes internacionais de referência),
     a partir do entendimento do caso — nunca do texto do caso. Só as
     citações viram evidência (`web:1`…), com origem `web_official`.
   `model_only` e `web` nunca chamam o provedor de embedding; falha da
   pesquisa segue como `model_only`. `web` exige `stages` e a v2 (só ela cita
   página web); sem elas, também vira `model_only`.
3. **Proveniência vira rótulo, não preliminar.** Diferente do texto original
   desta ADR ("ela sai sempre preliminar"), na v2 `preliminary` volta a dizer
   uma coisa só — "espere o dado": é a camada `depends` (`depends_on_data`).
   Conhecimento geral do modelo (`model_knowledge`), página oficial externa
   (`web_official`) e fonte não revisada aparecem como rótulo de origem. A
   camada `now` já é, por definição, segura em toda hipótese aberta. Anexo do
   médico continua nunca definitivo (F4). Na v1, a contenção da ADR-012 não
   muda.
4. Dose sem fonte citada é regra corrigível: vale um retry; se sobrar, a
   conduta sai marcada (`unverified_dose`) em vez de sumir.

**Medição.** Variantes `claude-opus-5-5-v2-modelo`, `claude-opus-5-5-v2-web`,
`claude-haiku-5-5-v2-modelo` e `claude-opus-5-5-v2-web-entendimento-haiku` no
gabarito, com a parcela de condutas com fonte citada e o custo da pesquisa no
relatório. Os critérios de liberação da tabela acima valem para cada uma.
