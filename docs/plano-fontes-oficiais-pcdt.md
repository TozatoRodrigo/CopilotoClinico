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
| 5 | Retrieval: pool oficial separado, teto por análise (3) e por documento (2), piso próprio (0,35), penalização de crônico (−0,05), flag | nenhum até o passo 6 (o prompt ainda não lê o pool) | ✅ (limiares não calibrados) |
| 6 | Prompt: bloco `OFFICIAL_MS_UNREVIEWED` + OFFICIAL MS GUIDELINES RULE (só quando há trechos — flag desligada = prompt idêntico ao anterior); base curada vazia com PCDT deixa de cair no caminho D; citação `official_unreviewed`; divergência curada × oficial vira `preliminary`; cobertura exibida `partial` quando só a base oficial achou algo | **sim** | ✅ |
| 7 | Interface: rótulo "Ministério da Saúde · não revisado pela equipe", portaria e link "Ver documento oficial" no card da recomendação (origem gravada na análise, sobrevive a reload). Catálogo navegável na biblioteca fica para depois | **sim** | ✅ (catálogo pendente) |
| 8 | Medir com os 40 casos sintéticos e os de incidente, flag ligada x desligada | decide | ⏳ |
| 9 | Agendamento mensal do coletor com alerta de falha | nenhum | ⏳ |
| 10 | Curadoria por documento e testes clínicos | promove para `approved` | depois |
| — | **Fase B** — roteamento por documento e afunilamento guiado pelos PCDTs | **sim** | proposta: `docs/decisions/ADR-011-pcdt-document-routing.md` |

Operação do coletor: `docs/runbook.md` → "Sincronizar a base oficial da Conitec".

---

## 5. Pendências conhecidas

- **`text_tsv` nunca é preenchido** em `guideline_chunks` (achado desta
  rodada): a busca por palavra-chave do retrieval e da biblioteca não retorna
  nada hoje, para nenhuma fonte. Por isso a busca da base oficial (passo 5) é
  só semântica. Tratar antes da medição do passo 8, porque CID e nome de
  medicamento são exatamente o tipo de termo que a busca lexical resgata.
- **`ingestForReview()` supersede na ingestão, não na aprovação**
  (`guidelines.service.ts`). Não afeta a base oficial (que não passa pela
  curadoria), mas cria lacuna quando uma diretriz curada ganha versão nova.
  Corrigir antes da curadoria do passo 10.
- Os 9 documentos em texto integral e os 4 com recorte abaixo de 5% (HIV 2017
  adulto e criança, endoprótese de aorta, stents) saem marcados no relatório
  para revisão.
- Linhas de Cuidado (linhasdecuidado.saude.gov.br) e manuais da SVSA (ex.:
  dengue) ficam fora deste coletor: não estão nas listas da Conitec.
