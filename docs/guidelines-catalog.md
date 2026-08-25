# Catálogo de Diretrizes Clínicas — CopilotoClínico

Versão: 2.0 | Criado: 2026-06-08 | Atualizado: 2026-06-11 | Sprint 4

## Política de uso

- Apenas resumos, paráfrases e extrações de pontos-chave de diretrizes publicadas
- Nenhum texto protegido copiado integralmente
- Cada chunk tem fonte, versão e nível de evidência quando disponível
- Revisão do catálogo a cada 6 meses ou quando nova diretriz major for publicada

---

## Cenários cobertos

### SCA — Síndrome Coronariana Aguda (3 chunks)

| Fonte | Versão | Nível evidência | Cobertura |
|---|---|---|---|
| Diretriz AHA/ACC STEMI | 2013/2022-update | I-A | Reperfusão, antiagregação |
| Diretriz SBC — SCA sem Supra | 2021 | I-A | NSTEMI/AI estratificação |
| Diretriz AHA/ACC SCA | 2022 | I-B | Betabloqueador STEMI |

**Referências:**
- Ibanez B, et al. 2017 ESC Guidelines for STEMI. *Eur Heart J*. 2018;39:119–177.
- Amsterdam EA, et al. 2014 AHA/ACC NSTEMI Guidelines. *JACC*. 2014;64(24):e139–e228.

---

### AVC — Acidente Vascular Cerebral (3 chunks)

| Fonte | Versão | Nível evidência | Cobertura |
|---|---|---|---|
| Diretriz AHA/ASA AVC Isquêmico | 2019 | I-A | Trombólise IV, janela 4.5h |
| Diretriz AHA/ASA Trombectomia | 2019 | I-A | Trombectomia mecânica |
| Diretriz AHA/ASA AVC Hemorrágico | 2022 | I-B | HIC manejo |

**Referências:**
- Powers WJ, et al. 2019 AHA/ASA Guidelines for Early Management of AIS. *Stroke*. 2019;50:e344–e418.

---

### Sepse (3 chunks)

| Fonte | Versão | Nível evidência | Cobertura |
|---|---|---|---|
| Surviving Sepsis Campaign | 2021 | I-B | Bundle 1h, antibióticos |
| Surviving Sepsis Campaign | 2021 | I-A | Choque séptico, vasopressores |
| Surviving Sepsis Campaign | 2021 | I-B | VM na SDRA |

**Referências:**
- Evans L, et al. Surviving Sepsis Campaign: International Guidelines for Management of Sepsis and Septic Shock 2021. *Intensive Care Med*. 2021;47:1181–1247.

---

### Trauma (3 chunks)

| Fonte | Versão | Nível evidência | Cobertura |
|---|---|---|---|
| ATLS | 10ª ed., 2018 | Consenso | Avaliação primária ABCDE |
| ATLS | 10ª ed., 2018 | I-B | Choque hemorrágico, TXA |
| ATLS | 10ª ed., 2018 | Consenso | TCE grave |

**Referências:**
- American College of Surgeons. ATLS: Advanced Trauma Life Support, 10th ed. Chicago: ACS; 2018.
- CRASH-2 Trial Collaborators. Effects of tranexamic acid on death. *Lancet*. 2010;376:23–32.

---

### Crise Asmática (3 chunks)

| Fonte | Versão | Nível evidência | Cobertura |
|---|---|---|---|
| GINA | 2023 | I-A | SABA, ipratrópio, O2 |
| GINA | 2023 | I-A | Corticoide sistêmico |
| GINA | 2023 | I-B | Status asmaticus, MgSO4 |

**Referências:**
- Global Initiative for Asthma (GINA). Global Strategy for Asthma Management and Prevention. 2023. ginasthma.org.

---

### Outros cenários (7 chunks)

| Cenário | Fonte | Versão |
|---|---|---|
| IC aguda e crônica | Diretriz AHA/ACC IC | 2022 |
| Fibrilação atrial | Diretriz ESC FA | 2020 |
| Choque (geral) | UpToDate | 2023 |
| PCR (BLS/ACLS) | AHA BLS/ACLS Guidelines | 2020 |
| Cetoacidose diabética | ADA Standards of Care | 2024 |

---

## Adições futuras planejadas

- [x] AVC — classificação isquêmico x hemorrágico x AIT (ver KB-003 abaixo — motivado pelo caso de demo em que o Copiloto divergiu de Open Evidence/Volts por falta exatamente desse conteúdo)
- [x] Hemorragia subaracnóidea (ver KB-003 abaixo)
- [x] Dissecção aórtica (ver KB-003 abaixo)
- [ ] Hipertensão emergência (Sprint 6+)
- [ ] Anafilaxia
- [ ] TEP (tromboembolismo pulmonar)
- [ ] Manejo de dor aguda
- [ ] Antibioticoterapia empírica (pneumonia, ITU, celulite)
- [ ] Demais capítulos do IBCC ainda não mapeados (ver nota de escopo em KB-003)

---

## Protocolos executáveis (PROT-003)

> **Status: rascunho técnico aguardando curadoria clínica.** Os 4 protocolos
> piloto abaixo foram convertidos para o formato `ProtocolNode`/`ProtocolEdge`
> (engine PROT-002) em `prisma/seeds/data/pilot-protocols.ts` e seedados via
> `npm run seed:protocols`. Cada nó de ação/desfecho carrega a citação da
> diretriz-fonte. **Nenhum dos quatro tem ainda registro de validação clínica
> assinada (nome + CRM + data) pelo Dr. João** — pendente da sessão de
> curadoria descrita no escopo da PROT-003. Não usar em atendimento real até
> essa validação ser concluída e registrada nesta seção.

### Síndrome gripal no PS

| Campo | Valor |
|---|---|
| Especialidade | `emergencia` |
| Fontes | Protocolo MS — Síndrome Gripal (2023); Diretriz SBI — Síndrome Gripal (2022) |
| Fluxo | tempo de sintomas (>48h?) → imunossuprimido/gestante/grupo de risco? → critérios de SRAG → conduta (oseltamivir / sintomáticos / internação) |
| Validação clínica | ⏳ pendente (Dr. João — nome, CRM, data) |

### Sepse — bundle 1ª hora

| Campo | Valor |
|---|---|
| Especialidade | `medicina_intensiva` |
| Fontes | Surviving Sepsis Campaign 2021 |
| Fluxo | triagem (qSOFA/NEWS) → lactato + hemoculturas → antibiótico em 1h → cristaloide 30mL/kg → reavaliação → vasopressor se refratário |
| Validação clínica | ⏳ pendente (Dr. João — nome, CRM, data) |

### Dor torácica no PS

| Campo | Valor |
|---|---|
| Especialidade | `cardiologia` |
| Fontes | Diretriz AHA/ACC STEMI (2013/2022-update); Diretriz AHA/ACC SCA (2022); Diretriz SBC — SCA sem Supra (2021) |
| Fluxo | ECG em 10min → supra de ST? → tempo porta-balão/trombólise → estratificação HEART/TIMI + troponina seriada |
| Validação clínica | ⏳ pendente (Dr. João — nome, CRM, data) |

### AVC agudo — classificação isquêmico x hemorrágico x AIT

> Adicionado como parte P2 do plano de correção do incidente de demo (ver
> KB-003 acima): a classificação de subtipo tem conduta oposta a depender do
> resultado, e é exatamente o tipo de decisão onde uma árvore determinística
> reduz o risco de o modelo "escolher" um caminho sem justificar — a mesma
> classe de erro que gerou o incidente. Percorre déficit flutuante x fixo →
> (se flutuante) resolvido agora ou ainda sintomático → (se fixo) TC mostrou
> hemorragia? → janela de trombólise (4,5h) → suspeita de grande vaso/janela
> estendida (24h) → manejo fora de janela. 16 nós, todos testados
> automaticamente (`pilot-protocols.spec.ts`): grafo acíclico, nó inicial
> único, toda pergunta booleana cobre true/false, todo caminho termina em
> outcome, todo nó de ação/desfecho tem citação.

| Campo | Valor |
|---|---|
| Especialidade | `neurologia` |
| Fontes | IBCC — AIS, ICH, Approach to focal neurologic deficit (Farkas J., EMCrit); AHA/ASA AVC Isquêmico (2019); AHA/ASA Trombectomia (2019) |
| Fluxo | déficit flutuante/reversível (isquemia/AIT) x fixo (checar hemorragia) → resolvido agora (AIT + ABCD2) ou sintomático → janela de trombólise (4,5h) → grande vaso/janela estendida (24h) → manejo fora de janela |
| Validação clínica | ⏳ pendente (Dr. João — nome, CRM, data) |

**Pendências para fechar a PROT-003:**
- [ ] Sessão de curadoria com Dr. João (validar cada nó/condição/conduta) e registrar a ata como fonte.
- [ ] Preencher "Validação clínica" das 4 tabelas acima (nome, CRM, data).
- [ ] Demo gravada do caso "gripe >48h + imunossuprimido" percorrendo o protocolo até a conduta.
- [ ] Demo gravada do caso de AVC da demo original (déficit flutuante-reversível, ASPECTS 10) percorrendo o novo protocolo até "AIT" ou "isquêmico dentro de janela" — nunca até o ramo hemorrágico, dado o padrão temporal descrito.
- [ ] Walkthrough com 2 médicos externos (ex.: Dr. Bruno).

---
## Pacote de Curadoria KB-001 — Top 20 queixas de PS

> **Status: rascunho técnico para ingestão via KB-002.** O pacote em
> `docs/guidelines/drafts/kb-001-top20-ps/` foi preparado para revisão do
> Dr. João antes de qualquer aprovação em produção. Cada arquivo já inclui os
> metadados `cenario` e `red_flags`, usados pelo pipeline de ingestão e pelo
> prompt de decisão para perguntas realmente decisoras.

### Cenários incluídos no pacote

| # | Cenário | Arquivo |
|---|---|---|
| 1 | Síndrome gripal / IVAS | `01-sindrome-gripal-ivas.md` |
| 2 | Dor torácica | `02-dor-toracica.md` |
| 3 | Dispneia / DPOC exacerbado | `03-dispneia-dpoc.md` |
| 4 | Dor abdominal aguda | `04-dor-abdominal-aguda.md` |
| 5 | Cefaleia | `05-cefaleia.md` |
| 6 | Lombalgia | `06-lombalgia.md` |
| 7 | ITU / pielonefrite | `07-itu-pielonefrite.md` |
| 8 | Pneumonia comunitária | `08-pneumonia-comunitaria.md` |
| 9 | Celulite / erisipela | `09-celulite-erisipela.md` |
| 10 | Gastroenterite / desidratação | `10-gastroenterite-desidratacao.md` |
| 11 | Crise hipertensiva | `11-crise-hipertensiva.md` |
| 12 | Hipoglicemia / hiperglicemia | `12-hipoglicemia-hiperglicemia.md` |
| 13 | Crise convulsiva | `13-crise-convulsiva.md` |
| 14 | Intoxicação exógena | `14-intoxicacao-exogena.md` |
| 15 | Anafilaxia / urticária | `15-anafilaxia-urticaria.md` |
| 16 | Vertigem | `16-vertigem.md` |
| 17 | Febre sem foco no adulto | `17-febre-sem-foco-adulto.md` |
| 18 | TVP / TEP suspeito | `18-tvp-tep-suspeito.md` |
| 19 | Cólica renal | `19-colica-renal.md` |
| 20 | Transtorno de ansiedade / agitação no PS | `20-ansiedade-agitacao-ps.md` |

### Como usar este pacote

1. Revisar os 20 arquivos com o Dr. João e ajustar linguagem clínica.
2. Ingerir o diretório com `pnpm ingest:guidelines docs/guidelines/drafts/kb-001-top20-ps`.
3. Aprovar/rejeitar os chunks pendentes via endpoints de curadoria do KB-002.
4. Registrar nesta seção a validação clínica assinada por cenário (nome, CRM e data).

### Pendências para fechar KB-001

- [ ] Registrar validação clínica assinada dos 20 cenários no catálogo.
- [ ] Rodar ingestão em ambiente com banco/embeddings disponíveis.
- [ ] Aprovar os chunks relevantes em curadoria humana.
- [ ] Executar suíte de avaliação sintética após ingestão aprovada.
- [ ] Confirmar retrieval top-3 do caso canônico “gripe >48h” em ambiente integrado.

---
## Pacote de Curadoria KB-003 — Cannot-miss (fonte: IBCC)

> **Status: rascunho técnico para ingestão via KB-002, aguardando curadoria clínica
> do Dr. João.** Origem: revisão do caso de demo em que o Copiloto recomendou
> conduta de AVC hemorrágico para um quadro de déficit focal flutuante e
> reversível — padrão clássico de isquemia/AIT — enquanto Open Evidence e
> Volts foram para isquêmico. A causa raiz identificada foi ausência, na base,
> de conteúdo que ensine a **diferenciar** subtipos com conduta oposta antes
> de citar o chunk de tratamento (os 3 chunks de AVC já seedados — trombólise,
> trombectomia, HIC — assumem o subtipo já definido; nenhum ensina a
> classificar). Este pacote fecha esse tipo de gap para os cenários de maior
> risco quando a classificação errada muda a conduta em direção oposta.

### Fonte e método de curadoria

Conteúdo extraído do **Internet Book of Critical Care** (IBCC — Farkas J.,
EMCrit, emcrit.org/ibcc), capítulos individuais listados por arquivo abaixo.
Cada arquivo é **paráfrase e síntese de pontos-chave** — números, escores e
limiares clínicos foram conferidos contra o capítulo de origem, mas nenhum
texto do IBCC foi copiado literalmente, na mesma política já aplicada ao
KB-001 (ver "Política de uso" no topo deste documento). Onde o IBCC cita uma
diretriz primária identificável (ex.: AHA/ASA para AVC), a diretriz primária
é referenciada junto da síntese.

### Cenários incluídos no pacote

| # | Cenário | Arquivo | Por que este e não outro capítulo do IBCC |
|---|---|---|---|
| 1 | AVC agudo — isquêmico x hemorrágico x AIT | `01-avc-agudo-isquemico-hemorragico-ait.md` | Causa raiz direta do caso de demo; nenhum chunk de classificação existia antes |
| 2 | Hemorragia subaracnóidea | `02-hemorragia-subaracnoidea.md` | Cannot-miss já sinalizado em `05-cefaleia.md` (trovoada) mas sem fluxo diagnóstico próprio |
| 3 | Dissecção aórtica | `03-dissecao-aortica.md` | Mesma classe de erro do caso de demo (mimetizador com conduta oposta), aplicada a dor torácica |

### Nota de escopo — por que não "todo o IBCC"

O IBCC tem centenas de capítulos, boa parte deles de terapia intensiva
(ECMO, balão intra-aórtico, CAR-T, ventilação mecânica avançada) fora do
escopo de um copiloto de triagem/PS. Este pacote prioriza deliberadamente os
capítulos onde (a) existe um mimetizador cannot-miss com conduta oposta à
hipótese mais óbvia, e (b) o cenário já está presente ou é adjacente a um dos
20 cenários do KB-001. A extensão para outras áreas do IBCC (ex.: sepse,
cetoacidose, intoxicações) deve seguir o mesmo critério, priorizada por
frequência real dos casos reportados pelos médicos piloto — não por
cobertura exaustiva do índice do IBCC.

### Como usar este pacote

1. Revisar os 3 arquivos com o Dr. João, com atenção especial aos limiares
   numéricos (janelas de trombólise/trombectomia, tempos de status
   epilepticus, sensibilidade de TC por horário em HSA) antes de aprovar.
2. Ingerir com `pnpm ingest:guidelines docs/guidelines/drafts/kb-003-ibcc-cannot-miss`.
3. Aprovar/rejeitar os chunks pendentes via endpoints de curadoria do KB-002.
4. Rodar o caso de demo (déficit focal flutuante-reversível, ASPECTS 10) como
   caso de regressão após aprovação, para confirmar que o retrieval agora
   inclui `avc_agudo` e que o modelo justifica a classificação isquêmica pelo
   padrão temporal em vez de citar só o chunk hemorrágico.
5. Registrar nesta seção a validação clínica assinada (nome, CRM, data).

### Reforços aplicados ao KB-001 existente (mesma curadoria)

Os arquivos abaixo do KB-001 foram estendidos com um parágrafo adicional
com achados do IBCC, sem alterar `cenario` nem remover conteúdo aprovado
anteriormente — apenas somando red flags e critérios que faltavam:

- `02-dor-toracica.md` — diferenciadores de dissecção aórtica (dor em rasgão, migratória, assimetria de PA entre braços).
- `05-cefaleia.md` — trovoada definida por tempo (pico <1min), sensibilidade da TC por janela horária, convulsão como achado de HSA.
- `13-crise-convulsiva.md` — limiares de tempo de status epilepticus (5min para intervir, 30min para risco de lesão) e sequência de drogas.
- `16-vertigem.md` — padrão flutuante-recorrente como possível AVC de fossa posterior, não só causa periférica benigna.

### Pendências para fechar KB-003

- [ ] Validação clínica assinada dos 3 cenários (Dr. João — nome, CRM, data).
- [ ] Rodar ingestão em ambiente com banco/embeddings disponíveis.
- [ ] Confirmar retrieval do caso de demo (AVC flutuante-reversível) em ambiente integrado, citando `avc_agudo` com justificativa de classificação no `reasoning`.
- [x] Guardrail de "classificação mutuamente exclusiva" — implementado (S21-CLIN-01): `output-validator.ts` (`findUnresolvedSubtypeAmbiguity`) bloqueia e força retry quando os chunks recuperados cobrem ≥2 subtipos do mesmo `cenario` e a resposta cita um sem diferencial nem menção ao outro no `reasoning`; regra correspondente em `prompt-builder.ts` (SUBTYPE / MUTUALLY-EXCLUSIVE CLASSIFICATION RULE). Testado com o caso literal da demo + um par cenário/subtipo sintético (prova de que não é específico de AVC) em `output-validator.spec.ts`.
- [x] Árvore de decisão estruturada como alternativa ao RAG livre para este cenário — `AVC_AGUDO_CLASSIFICACAO` em `prisma/seeds/data/pilot-protocols.ts` (PROT-003, ver seção acima). Ainda pendente de curadoria clínica antes de rodar em produção.

---
## Pacote de Curadoria KB-004 — Dicotomias cannot-miss de plantão (fonte: IBCC)

> **Status: rascunho técnico para ingestão via KB-002, aguardando curadoria
> clínica do Dr. João.** Origem: pergunta direta após o caso de AVC — "isso
> só foi corrigido para esse caso, ou serve para mais cenários que aparecem
> num plantão de verdade?". Este pacote generaliza o mesmo padrão de erro
> (duas classificações mutuamente exclusivas, conduta oposta, modelo escolhe
> uma sem justificar) para 5 dicotomias de alta frequência em pronto-socorro
> brasileiro, além do AVC já coberto em KB-003.

### Correção de pipeline necessária para isto funcionar (S21-CLIN-01)

Antes deste pacote, o campo `subtipo` só existia no seed hardcoded
(`prisma/seeds/guidelines-seed.ts`) — o pipeline real de curadoria
(`front-matter.ts` → `chunking.ts` → `guidelines.service.ts` →
`scripts/ingest-batch.ts`) **descartava silenciosamente** qualquer
`subtipo:` escrito no front-matter de um arquivo `.md`. Ou seja: mesmo
aprovando conteúdo novo com essa dicotomia, o guardrail de coerência
diagnóstica nunca teria os dois subtipos para comparar. Corrigido nesta
mesma rodada — `subtipo` agora percorre o pipeline inteiro até a metadata
persistida no banco (testado em `front-matter.spec.ts`, `chunking.spec.ts`
e `guidelines.service.spec.ts`).

### Cenários incluídos no pacote

| # | Dicotomia | Cenário (reutiliza KB-001 quando existe) | Arquivos | Erro se invertido |
|---|---|---|---|---|
| 1 | Hipoglicemia x Cetoacidose/hiperosmolar | `hipoglicemia_hiperglicemia` | `01-hipoglicemia.md`, `02-cetoacidose-hiperosmolar.md` | Dar insulina a paciente hipoglicêmico, ou insulina sem checar potássio na CAD |
| 2 | Anafilaxia x Alergia simples | `anafilaxia_urticaria` | `03-anafilaxia.md`, `04-alergia-simples.md` | Atrasar adrenalina IM em anafilaxia real (morte em minutos) |
| 3 | Choque cardiogênico x séptico/hipovolêmico | `choque_indiferenciado` (novo — não fazia parte do KB-001) | `05-choque-cardiogenico.md`, `06-choque-septico-hipovolemico.md` | Volume agressivo no cardiogênico (edema pulmonar) ou volume restrito no séptico (hipoperfusão) |
| 4 | Emergência x pseudocrise hipertensiva | `crise_hipertensiva` | `07-crise-hipertensiva-emergencia.md`, `08-crise-hipertensiva-pseudocrise.md` | Baixar PA agressivamente sem lesão de órgão-alvo (hipoperfusão) |
| 5 | Agitação por causa orgânica x psiquiátrica primária | `ansiedade_agitacao_ps` | `09-agitacao-causa-organica.md`, `10-agitacao-causa-psiquiatrica.md` | Sedar sem investigar mascara causa orgânica reversível (hipóxia, hipoglicemia, infecção) |

Cada arquivo tem `subtipo` no front-matter; todo `cenario` do pacote tem
exatamente 2 subtipos distintos — pré-requisito para o guardrail de
coerência diagnóstica ter algo para comparar (testado em
`kb-004-dichotomies-pack.spec.ts`).

### Por que estes 5 e não outros

Mesmo critério do KB-003: mimetizador cannot-miss + conduta oposta +
frequência real em plantão de PS brasileiro (não cobertura exaustiva de
todo o IBCC — ver nota de escopo em KB-003). Candidatos considerados e
adiados por menor urgência ou já cobertos parcialmente: abdome agudo
cirúrgico x clínico (já tem discriminadores em `04-dor-abdominal-aguda.md`
do KB-001, sem par de subtipo dedicado ainda), TEP hemodinamicamente
instável x estável, meningite bacteriana x viral.

### Como usar este pacote

1. Revisar os 10 arquivos com o Dr. João — mesma atenção a limiares
   numéricos que no KB-003 (ex.: potássio mínimo antes de insulina, dose e
   repetição de adrenalina, meta de queda de PAM).
2. Ingerir com `pnpm ingest:guidelines docs/guidelines/drafts/kb-004-dicotomias-plantao`.
3. Aprovar/rejeitar os chunks pendentes via endpoints de curadoria do KB-002.
4. Rodar os 5 casos de regressão (um por dicotomia) como parte da suíte
   antes de qualquer novo piloto — hoje representados em
   `output-validator.spec.ts` com fixtures sintéticas/de conteúdo real;
   idealmente também como casos de ponta a ponta contra o banco depois da
   aprovação, no mesmo espírito do `test:kb-001:integration`.
5. Registrar nesta seção a validação clínica assinada por dicotomia (nome,
   CRM, data).

### Pendências para fechar KB-004

- [ ] Validação clínica assinada das 5 dicotomias (Dr. João — nome, CRM, data).
- [ ] Rodar ingestão em ambiente com banco/embeddings disponíveis.
- [ ] Confirmar que a busca híbrida realmente retorna os 2 subtipos juntos para um caso ambíguo real (hoje comprovado só a nível de guardrail/unit test, não de retrieval fim a fim).
- [ ] Avaliar se `choque_indiferenciado` (cenário novo, fora do KB-001 original) deveria ser formalmente incorporado à lista de "top 20 queixas" ou tratado como categoria à parte de emergências de UTI/PS.
- [ ] Priorizar os próximos candidatos adiados (abdome agudo cirúrgico x clínico, TEP instável x estável, meningite bacteriana x viral) com o Dr. João antes de expandir mais.

---
## Processo de revisão

1. Verificar se novas diretrizes das sociedades-fonte foram publicadas
2. Criar PR com novos chunks no seed
3. Atualizar versão neste documento
4. Para pacotes em curadoria, ingerir via `pnpm ingest:guidelines <diretório>`
5. Rodar `npx ts-node prisma/seeds/guidelines-seed.ts` em staging apenas para seeds auto-aprovados

**Próxima revisão:** Dezembro 2026
