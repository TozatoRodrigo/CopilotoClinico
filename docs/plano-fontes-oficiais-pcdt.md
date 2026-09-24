# Plano — Base oficial do MS (PCDT/DDT/DB/PU) no Copiloto

Versão: 2.0 | Criado: 2026-09-24 | Atualizado: 2026-09-24
Decisão: `docs/decisions/ADR-010-official-unreviewed-guidelines.md`

---

## 1. Decisão de produto (24/09/2026)

- **A base oficial inteira entra**: PCDT, DDT (incluindo oncologia), Diretrizes
  Brasileiras e Protocolos de Uso — ~190 documentos.
- **Sem curadoria agora.** Os médicos do piloto usam e fazem as próprias
  validações; a curadoria vem depois, por documento.
- **Fonte "oficial, não revisada"** (status `official_unreviewed`): citável,
  sempre rotulada na interface, **sem** forçar `preliminary`. Nunca é marcada
  `approved` — isso falsificaria a trilha de curadoria (ADR-008).
- **Ligada por padrão** assim que o retrieval estiver pronto (passo 5), atrás de
  `OFFICIAL_GUIDELINES_ENABLED` para desligar sem redeploy.

A versão 1.0 deste plano propunha uma allowlist curada de ~10 documentos. Foi
substituída por esta decisão; os riscos que motivavam a allowlist (vizinho
semântico crônico em caso agudo, volume de curadoria) passam a ser tratados no
retrieval e pela categoria "não revisada".

---

## 2. Fatos verificados (24/09/2026)

### Fonte

| Fonte | Situação |
|---|---|
| Dataset "PCDT" do Portal de Dados Abertos | `metadata_modified` 09/09/2025 — um ano atrasado. Não usado. |
| Páginas da Conitec (PCDT, DDT, DB, PU) | "Modificado em 14/09/2026". HTML estático, uma tabela por lista. **Fonte de verdade.** |

A lista traz "Anexo alterado em dd/mm/aaaa": o PCDT muda sem portaria nova.
Por isso a mudança é detectada pelo **SHA-256 do PDF**.

### Base inteira, processada de ponta a ponta sem gravar

| | |
|---|---|
| Documentos listados | 190 (PCDT 132, DDT 16, DB 22, PU 20) |
| PDFs processados | 188 — os 2 restantes são PUs que apontam para página HTML do bvsms |
| Estrutura de seções reconhecida | 179 |
| Texto integral (sem estrutura) | 9 — os 5 capítulos de agrotóxicos (formato de recomendações), dermatite atópica, transmissão vertical e 2 PUs curtos |
| Texto bruto → texto ingerido | 28,4 MB → 9,1 MB (32%) |
| Chunks | ~10 mil (maior documento: Assistência ao Parto Normal, 814) |

Sem o recorte por seção, ~2/3 dos chunks seriam metodologia, apêndice GRADE e
bibliografia. No PCDT de AVC, só 13% do PDF é conteúdo clínico.

### Encaixe com o pronto-socorro

Dos 25 cenários do piloto, só **AVC isquêmico agudo** e **intoxicações**
(ofídicos, escorpiônicos, agrotóxicos) têm documento que orienta diretamente a
conduta; asma, DPOC e Covid hospitalar são parciais. A maior parte da base é de
doença crônica — útil para o médico, mas vizinho semântico perigoso de um caso
agudo. É o risco central do passo 5.

### Licença

PCDT/DDT/DB/PU são anexos de ato oficial (Lei 9.610/98, art. 8º, IV). O
pipeline guarda **texto literal** com atribuição e link, sem paráfrase —
compatível tanto com essa leitura quanto com a CC BY-ND do portal. Pendente:
confirmação jurídica para uso comercial (ver ADR-010).

---

## 3. Como a base é organizada

| Camada | O quê |
|---|---|
| `official_guideline_documents` | Uma linha por **versão**: tipo, portaria, datas, URLs (documento, portaria, resumido), SHA-256, páginas, CIDs, seções reconhecidas, classificação. Índice parcial garante uma versão ativa por documento. |
| Classificação automática | `careSetting` (agudo/crônico/misto/indefinido), população, especialidade e cenários do piloto, pela LLM com vocabulário fechado; heurística conservadora se a LLM falhar. Gravada com origem e justificativa para a curadoria conferir. |
| Recorte por seção | Entram diagnóstico, critérios, casos especiais, tratamento, fármacos, monitorização etc. Ficam fora introdução, metodologia, CID, regulação, termo de esclarecimento, referências e apêndices. Quatro convenções de título reconhecidas (`official-document-sections.ts`). |
| Chunk | Texto literal com cabeçalho de contexto — `[PCDT · Asma · 7. TRATAMENTO]` — e metadata com origem, seção, `careSetting`, cenários e URL. Status `official_unreviewed`, `document_id` apontando a versão. |

---

## 4. Passos

| # | O quê | Efeito nas respostas | Estado |
|---|---|---|---|
| 1 | ADR-010 | nenhum | ✅ |
| 2 | Migration: status `official_unreviewed`, tabela de documentos, `document_id` | nenhum | ✅ (não aplicada em nenhum ambiente ainda) |
| 3 | Coletor: listas, download, SHA-256, recorte, chunks, embeddings, troca atômica de versão, relatório, `--dry-run` | nenhum | ✅ |
| 4 | Classificação automática (agudo/crônico, população, especialidade, cenários) | nenhum | ✅ |
| 5 | Retrieval: pool oficial separado, teto por análise (3) e por documento (2), piso próprio (0,52), penalização de crônico (−0,10), flag | nenhum até o passo 6 (o prompt ainda não lê o pool) | ✅ (calibração preliminar com 5 casos em produção, 24/09/2026) |
| 6 | Prompt: bloco `OFFICIAL_MS_UNREVIEWED` + OFFICIAL MS GUIDELINES RULE (só quando há trechos — flag desligada = prompt idêntico ao anterior); base curada vazia com PCDT deixa de cair no caminho D; citação `official_unreviewed`; divergência curada × oficial vira `preliminary`; cobertura exibida `partial` quando só a base oficial achou algo | **sim** | ✅ |
| 7 | Interface: rótulo "Ministério da Saúde · não revisado pela equipe", portaria e link "Ver documento oficial" no card da recomendação (origem gravada na análise, sobrevive a reload). Catálogo navegável na biblioteca fica para depois | **sim** | ✅ (catálogo pendente) |
| 8 | Medir com os 40 casos sintéticos e os de incidente, flag ligada x desligada | decide | ⏳ |
| 9 | Agendamento mensal do coletor com alerta de falha | nenhum | ⏳ |
| 10 | Curadoria por documento e testes clínicos | promove para `approved` | depois |
| — | **Fase B** — roteamento por documento e afunilamento guiado pelos PCDTs | **sim** | proposta: `docs/decisions/ADR-011-pcdt-document-routing.md` |

Operação do coletor: `docs/runbook.md` → "Sincronizar a base oficial da Conitec".

---

## 4.1 Calibração do passo 8 (24/09/2026, produção)

49 casos — 40 sintéticos do KB-001, 2 de incidente (fi-001, fi-002) e 7 de
referência (ofídico, escorpião, AVC, crise hipertensiva, Guillain-Barré,
organofosforado, asma) — contra a base de produção, lendo a similaridade bruta
dos 30 melhores trechos de cada base, sem cache nem piso.

**Base curada: nenhum piso absoluto funciona.**

- Só **11 dos 49** casos têm o cenário na base aprovada: o pacote **KB-001
  (20 cenários do PS) nunca foi aprovado em produção** — a base tem só o seed e
  os pacotes IBCC (KB-003/004); KB-005/006 estão em `pending_review`.
- Casos cobertos: melhor trecho certo entre **0,49 e 0,69** (top-1 correto em
  10 de 11).
- Casos sem cobertura: melhor trecho (sem relação) entre **0,41 e 0,64**; 29 de
  38 acima de 0,45, ou seja, reportados como cobertura `full`.
- As faixas se sobrepõem por inteiro. Qualquer piso que corte o ruído corta
  também metade dos acertos. `RETRIEVAL_*` ficam como estão: mudar não ajuda.

**Base oficial: o melhor compromisso é o atual (0,52 / 0,10).**

| Piso / penalização | Casos com trecho útil | Casos com trecho irrelevante |
|---|---|---|
| 0,48 / 0,10 | 10 | 33 |
| **0,52 / 0,10** (produção) | **8** | **17** |
| 0,56 / 0,10 | 7 | 4 |

Subir para 0,56 perde o PCDT de AVC (0,53) e **não** tira o pior ruído: no caso
de dengue, doença falciforme (0,59) e HIV (0,58) pontuam acima do PCDT de AVC
no caso de AVC. Acertos confirmados: DPOC em DPOC exacerbado (0,72),
agrotóxicos em organofosforado (0,62), escorpiônico (0,62), ofídico (0,59),
AVC (0,53). Falhas: Guillain-Barré não aparece nem no top-30 para o caso de
referência; o caso de asma traz o PCDT de DPOC, não o de asma.

**Conclusão.** Similaridade de embedding separa bem o documento certo quando
ele existe, mas não diz quando **nenhum** documento se aplica — é relativa ao
caso, não absoluta. O que falta é um **julgamento de relevância** entre a busca
e o prompt, nas duas bases: exatamente a etapa de roteamento da ADR-011
("nenhum" como resposta válida). Até lá, a proteção contra trecho irrelevante é
a regra do prompt, que manda checar a relevância antes de citar.

**Prioridades que saem daqui:**

1. Curadoria e aprovação do **KB-001** e dos **KB-005/006** — é a maior lacuna
   de cobertura e não depende de código.
2. Julgamento de relevância por LLM entre busca e prompt (antecipar o B2 da
   ADR-011), para as duas bases.
3. Correção da colisão de chave do cache.

## 5. Pendências conhecidas

- **Piso da base CURADA não discrimina com este modelo de embedding**
  (achado na calibração de 24/09/2026 em produção): nos 5 casos de referência a
  base curada reportou cobertura `full` com trechos sem relação — AVC e
  dissecção num caso de picada de cobra, agitação psicomotora no caso de
  dengue. Com `text-embedding-3-small`, texto clínico sem relação pontua acima
  de 0,45 (`RETRIEVAL_STRONG_SEMANTIC_SCORE`), e o piso de 0,30 não corta nada.
  A proteção contra o vizinho semântico (KB-005/KB-006) na prática não atua.
  Calibrar `RETRIEVAL_*` no passo 8, junto com os `OFFICIAL_*`.
- **Cache da busca com colisão de chave** (achado no mesmo teste): a chave usa
  só os ~48 primeiros caracteres do caso; casos com o mesmo início recebem a
  mesma evidência por 60 s. Correção em tarefa própria.
- ~~**`text_tsv` nunca é preenchido**~~ — resolvido: virou coluna gerada
  (migration `20260924180000_f9_guideline_chunks_text_tsv_generated`; ver
  `docs/runbook.md` → "Busca lexical (`text_tsv`) — F9"). A busca lexical do
  retrieval continua restrita a `approved`, então a base oficial (passo 5)
  segue só semântica; estendê-la é decisão da medição do passo 8, porque CID e
  nome de medicamento são exatamente o tipo de termo que a busca lexical resgata.
- **`ingestForReview()` supersede na ingestão, não na aprovação**
  (`guidelines.service.ts`). Não afeta a base oficial (que não passa pela
  curadoria), mas cria lacuna quando uma diretriz curada ganha versão nova.
  Corrigir antes da curadoria do passo 10.
- Os 9 documentos em texto integral e os 4 com recorte abaixo de 5% (HIV 2017
  adulto e criança, endoprótese de aorta, stents) saem marcados no relatório
  para revisão.
- Linhas de Cuidado (linhasdecuidado.saude.gov.br) e manuais da SVSA (ex.:
  dengue) ficam fora deste coletor: não estão nas listas da Conitec.
