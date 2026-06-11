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

- [ ] Hipertensão emergência (Sprint 6+)
- [ ] Anafilaxia
- [ ] TEP (tromboembolismo pulmonar)
- [ ] Manejo de dor aguda
- [ ] Antibioticoterapia empírica (pneumonia, ITU, celulite)

---

## Protocolos executáveis (PROT-003)

> **Status: rascunho técnico aguardando curadoria clínica.** Os 3 protocolos
> piloto abaixo foram convertidos para o formato `ProtocolNode`/`ProtocolEdge`
> (engine PROT-002) em `prisma/seeds/data/pilot-protocols.ts` e seedados via
> `npm run seed:protocols`. Cada nó de ação/desfecho carrega a citação da
> diretriz-fonte. **Nenhum dos três tem ainda registro de validação clínica
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

**Pendências para fechar a PROT-003:**
- [ ] Sessão de curadoria com Dr. João (validar cada nó/condição/conduta) e registrar a ata como fonte.
- [ ] Preencher "Validação clínica" das 3 tabelas acima (nome, CRM, data).
- [ ] Demo gravada do caso "gripe >48h + imunossuprimido" percorrendo o protocolo até a conduta.
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
## Processo de revisão

1. Verificar se novas diretrizes das sociedades-fonte foram publicadas
2. Criar PR com novos chunks no seed
3. Atualizar versão neste documento
4. Para pacotes em curadoria, ingerir via `pnpm ingest:guidelines <diretório>`
5. Rodar `npx ts-node prisma/seeds/guidelines-seed.ts` em staging apenas para seeds auto-aprovados

**Próxima revisão:** Dezembro 2026
