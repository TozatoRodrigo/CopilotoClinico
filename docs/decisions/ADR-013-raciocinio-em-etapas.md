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

## Emenda 11/10/2026 — regras v3 e verificação depois da decisão

**Contexto.** O experimento de 11/10/2026 (92 casos críticos, Opus 5.5,
decisão v2) mostrou:

- **Perguntas:** a v2 fez exatamente 3 perguntas em 272 de 272 análises —
  "até 3" virou "3".
- **Excesso de condutas:** cerca de 12 por análise, 43% delas condicionais.
- **Doses:** 0% das condutas com dose no modo sem pesquisa.
- **Retentativas:** 41% das análises fizeram uma 2ª chamada (cerca de +27 s).
  Causas, em ordem: hipótese grave não citada, pergunta sobre dado já
  informado e linguagem de probabilidade.
- **Sem resposta:** a regra de linguagem de probabilidade bloqueou uma resposta
  inteira, e o médico ficou sem nada (kb001-pc-002).
- **Pesquisa antes da decisão puxa o raciocínio:** com `web`, as condutas
  obrigatórias caíram de 62% para 48%, e o complexo protrombínico ficou
  condicionado ao INR.

**Decisão.**

1. **Prompt v3** (`COPILOT_DECISION_PROMPT=v3`, exige `stages`, como a v2):
   mesmo contrato de saída e mesma mensagem do usuário da v2. Regras novas:
   tratamento tempo-crítico já indicado pelo caso é "now" (não espera exame
   que não muda a decisão); no máximo 6 "now" e 5 "depends"; o destino do
   paciente sempre como recomendação (e a notificação SINAN, quando couber);
   0 a 2 perguntas, só quando a resposta muda a conduta. A v2 fica byte a
   byte igual.
2. **Validador v3.** Só JSON/schema, beco sem saída e tipo de resposta
   bloqueiam. Linguagem de probabilidade vira corrigível (um retry, depois
   aviso). Pergunta sobre dado já presente no `structuredData` sai da
   resposta sem retry e vira aviso — salvo se deixaria a resposta sem próximo
   passo. Hipótese grave não citada e passar dos tetos viram só aviso: o card
   "O que eu entendi" já mostra todas as hipóteses graves ao médico. O schema
   mantém o teto rígido de 3 perguntas.
3. **Verificação depois da decisão** (`COPILOT_KNOWLEDGE_SOURCE=verify`, exige
   `stages` e v2 ou v3, como `web`). Entendimento e decisão rodam exatamente
   como em `model_only`. Depois de uma decisão válida, uma pesquisa com os
   settings de `web` confere as condutas de tratamento e estabilização (até 8,
   nunca o texto do caso), e uma chamada curta (`AI_VERIFY_ATTACH_MODEL`,
   padrão `claude-sonnet-5-5`, esforço baixo) liga cada conduta a um trecho
   citado. O código só aceita id desta análise e dose que aparece literalmente
   no trecho. A conduta vinculada ganha a fonte (origem `web_official`), a dose
   da fonte no texto e, quando a fonte diverge, o preliminar `source_conflict`
   com o motivo no `rationale`. A verificação nunca tira um rótulo de cautela
   que a decisão já tinha e nunca bloqueia: falha, recusa ou nenhuma citação
   devolvem a saída da decisão intacta (`SOURCE_VERIFICATION_FALLBACK`). Roda
   na análise, no streaming (depois dos deltas, antes do `done`) e na
   reanálise; rastro, evidência, tempo e custo são gravados como no modo web.

**Medição.** As variantes v3 com `model_only` e com `verify` entram no
gabarito ao lado das v2, com os mesmos critérios de liberação, mais o número
de perguntas por análise, a taxa de 2ª chamada e a parcela de condutas com
fonte e dose citadas.

**Resultado (11/10/2026, gabarito v2, juiz Sonnet 5.5).** Nos 92 casos
críticos, no modo caso completo (86 decidem o portão):

| | Opus v2 | Opus v3 | Opus v3 + `verify` | Haiku v3 |
| --- | --- | --- | --- | --- |
| Casos com erro crítico | 10 (3 sem resposta) | 3 | 3 | 4 |
| Condutas críticas na camada exigida | 95% | 98% | 98% | 97% |
| Condutas importantes | 87% | 88% | 87% | 78% |
| Perguntas por análise | 3,0 | 1,6 | 1,6 | 1,9 |
| Latência p50 | 61 s | 58 s | 79 s | 49 s |
| Custo por análise | US$ 0,19 | US$ 0,15 | US$ 0,30 | US$ 0,006 |

No afunilamento (24 estações com roteiro), a v3 chega ao fato decisivo em
88% dos casos (v2: 92%) com 1,0 pergunta por análise (v2: 3,0). Nos 39 casos
que não entraram na escrita destas regras, v3 e v2 empatam — parte do ganho
nos críticos é ajuste a casos já vistos.

**Decisão de produção.** `COPILOT_REASONING=stages`,
`COPILOT_DECISION_PROMPT=v3`, `COPILOT_KNOWLEDGE_SOURCE=model_only`.
`verify` fica desligado: não melhorou a segurança, custa +21 s e o dobro, e
ainda precisa de três correções — domínios só de diretriz oficial (a maior
parte das citações veio de artigos do PubMed/PMC), conferir que a dose é do
fármaco da conduta (houve dexametasona em dose de outra indicação) e
divergências falsas (trombectomia "divergindo" da AHA por leitura errada do
trecho). Haiku não decide conduta: perde condutas importantes (manejo de
insulina e potássio, drenagem após descompressão).

**Pendente (v3.1).** Condutas como anticoagulação e VNI ainda saem
condicionadas a checagens rápidas quando a diretriz manda iniciar já; o
destino do paciente não pode sugerir alta antes do dado decisivo (edema
periorbitário: "alta com antibiótico oral" no primeiro turno); trombólise não
aparece nem condicionada em cefaleia em trovoada.

**Decisão v4 (`COPILOT_DECISION_PROMPT=v4`, desligada).** A v3 com as quatro
regras do "Pendente (v3.1)": suporte ventilatório já indicado pelos sinais
clínicos é tempo-crítico; checagem de segurança de minutos à beira do leito
fica na mesma conduta em "now"; "depends" só quando existe dado que decide —
sem exame que exclua a hipótese que torna a conduta perigosa, a conduta não
aparece; sem o dado do destino, observação, nunca alta, e transferência para
recurso que falta no serviço já. Mesmo contrato e validador da v3. As regras
nasceram dos erros deste gabarito: liberar só depois de medir também em casos
que não entraram no ajuste.

## Emenda 14/10/2026 — linha de "por quê" (CC-601)

**Contexto.** O médico de UPA sem residência precisa entender por que cada
conduta do "Fazer agora" está no plano, para aprender e confiar sem abrir
outra fonte. O `rationale` não serve como está: é a justificativa técnica e
tem outros donos — nomeia o documento oficial e o anexo do médico, recebe a
divergência da verificação com fonte depois da decisão, entra no SOAP e é o
que o juiz do gabarito lê. Encurtá-lo mudaria tudo isso.

**Decisão.** `COPILOT_WHY_LINE` (padrão `off`; exige v3 ou v4) acrescenta à
decisão o campo `why`: em cada conduta "now", uma frase de até 120 caracteres
em linguagem simples, sem dose, com termo de especialista explicado; `null`
em "depends". O prompt é o da v3 (ou v4) com a regra da linha depois das
instruções aprovadas, o campo no formato e o mesmo exemplo com as linhas; o
JSON Schema ganha `why`. Com a flag desligada, prompt, schema e saída ficam
byte a byte os de antes. A linha nunca pede retry sozinha (um retry custa
cerca de 27 s): acima do teto ela sai da resposta, sem corte com reticências;
faltando, fica o `rationale`; os dois achados viram aviso, ou entram no
feedback quando outra regra já vai pedir o retry. Dose sem fonte na linha
conta como dose na conduta. Na tela, "Por quê" abre a linha; sem ela, o
`rationale` de sempre (que continua aparecendo quando a fonte oficial
diverge, porque é ele que diz no quê).

**Medição (pendente).** Liberar só depois de rodar o gabarito com
`claude-opus-5-5-v3-modelo` e `claude-opus-5-5-v3-por-que` (iguais exceto pela
flag): sem aumento de erro crítico nem de latência acima de 10%. A história
chama esta variante de "prompt v3.1"; não confundir com o "Pendente (v3.1)"
acima, que virou a v4.
