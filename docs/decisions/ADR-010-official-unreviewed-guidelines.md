# ADR-010: Base oficial do MS (PCDT/DDT/DB/PU) como fonte "oficial, não revisada"

**Status:** Aceito
**Data:** 2026-09-24
**Plano:** `docs/plano-fontes-oficiais-pcdt.md`

## Contexto

A base curada cobre ~25 cenários do piloto. A Conitec publica ~190 documentos
oficiais do Ministério da Saúde — Protocolos Clínicos e Diretrizes
Terapêuticas (PCDT), Diretrizes Diagnósticas e Terapêuticas (DDT, oncologia),
Diretrizes Brasileiras (DB) e Protocolos de Uso (PU) —, todos aprovados por
portaria e publicados no DOU.

O produto quer essa base inteira disponível para o Copiloto **agora**, para que
os médicos do piloto a usem e façam as próprias validações. Os médicos não vão
fazer curadoria chunk a chunk neste momento.

O pipeline de curadoria (ADR-008) exige aprovação humana para um chunk entrar
em retrieval. Marcar ~5 mil chunks como `approved` sem revisão falsificaria a
trilha de auditoria (`reviewed_by`/`reviewed_at`) e apagaria a distinção entre
o que a equipe clínica revisou e o que não revisou.

## Decisão

### Terceira categoria de fonte

Além de **curada** (`approved`) e **anexo do médico** (F4a), passa a existir a
fonte **oficial, não revisada**:

- Novo status `official_unreviewed` em `GuidelineChunkStatus`. Não é
  `approved`: o SQL de retrieval da base curada continua filtrando
  `status = 'approved'` e não enxerga esses chunks.
- Nova tabela `official_guideline_documents`: um registro por **versão** de
  documento, com tipo, portaria, datas, URLs, SHA-256 do PDF, CIDs, seções
  ingeridas e classificação (contexto agudo/crônico, população, cenários do
  piloto). Cada chunk aponta para a versão de onde saiu (`document_id`).
- Citação carrega `origin: 'official_unreviewed'` e a interface mostra
  "Ministério da Saúde · <portaria> · não revisado pela equipe clínica", com
  link para o PDF oficial.
- **Recomendação que cita fonte oficial não é forçada a `preliminary`.** É
  conteúdo normativo do MS; o risco que resta é de encaixe (documento certo
  para o caso), não de confiabilidade do conteúdo — e esse risco é tratado no
  retrieval, abaixo. Diferente do anexo do médico (F4a), que é sempre
  preliminar.

### Organização para busca

- Só as seções clínicas entram (diagnóstico, critérios, casos especiais,
  tratamento, fármacos, monitorização etc.). Introdução, metodologia, CID,
  regulação, referências, termo de esclarecimento e apêndices ficam fora — no
  PCDT de AVC isso é ~80% do PDF.
- Cada chunk leva um cabeçalho de contexto (`[PCDT · <título> · <seção>]`)
  para o embedding e a LLM saberem de onde o trecho veio.
- Texto literal, sem paráfrase: PCDT é anexo de ato oficial (Lei 9.610/98,
  art. 8º, IV) e o literal é o mais fiel ao normativo.

### Versionamento sem curadoria

Mudança detectada por SHA-256 do PDF (a Conitec altera anexos sem nova
portaria). Uma versão nova substitui a anterior **atomicamente**: na mesma
transação a versão nova vira `active` e os chunks da anterior viram
`superseded` — nunca há janela sem o documento, nem duas versões ativas.
Chunks antigos não são apagados, para rastrear qual versão embasou uma análise
passada.

### Ligar e desligar

O uso no retrieval (passo 5 do plano) fica atrás de `OFFICIAL_GUIDELINES_ENABLED`,
**ligado por padrão** por decisão de produto (24/09/2026): os médicos do
piloto começam a usar e validar imediatamente. `false` remove a fonte oficial
do retrieval sem redeploy e sem apagar dados.

### Curadoria posterior

A curadoria, quando acontecer, é por **documento/seção**, não por chunk:
promover uma versão revisada para `approved` com `reviewed_by`/`reviewed_at`
reais. A classificação automática (agudo/crônico, cenários) fica gravada com
sua origem (`llm` ou `heuristic`) para ser conferida na mesma revisão.

## Consequências

### Positivas
- Base oficial inteira disponível sem falsificar a trilha de curadoria.
- A garantia do produto passa a ser: "toda recomendação cita uma fonte, e a
  interface sempre diz se ela foi revisada pela equipe" — a mesma formulação
  adotada em F4a.
- Atualização mensal sem intervenção: a Conitec publica, o coletor detecta pelo
  hash e substitui.

### Negativas / riscos
- **Mudança no contrato clínico.** Conteúdo sem revisão interna passa a
  embasar recomendações não preliminares. Registrado aqui de propósito; o
  documento regulatório (`docs/compliance/REGULATORIO_RDC657.md`) já trata o
  piloto como uso assistido com revisão pendente.
- **Risco de encaixe.** A maioria dos PCDTs é de doença crônica e pode virar
  vizinho semântico de um cenário agudo (o modo de falha dos incidentes
  dengue→sepse e cefaleia→HSA). Mitigado no retrieval: pool separado, teto de
  chunks por análise e por documento, piso de relevância e penalização de
  documento crônico em caso agudo. Medido com os casos sintéticos e de
  incidente antes e depois de ligar.
- A classificação automática pode errar. Ela só pondera o retrieval; nunca
  exclui um documento da base.
- Scraping depende do HTML da Conitec. O coletor aborta (sem alterar a base)
  se o número de itens reconhecidos cair abaixo do piso por lista.
