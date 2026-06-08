# Catálogo de Diretrizes Clínicas — CopilotoClínico

Versão: 1.0 | Criado: 2026-06-08 | Sprint 4

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

## Processo de revisão

1. Verificar se novas diretrizes das sociedades-fonte foram publicadas
2. Criar PR com novos chunks no seed
3. Atualizar versão neste documento
4. Rodar `npx ts-node prisma/seeds/guidelines-seed.ts` em staging para validar

**Próxima revisão:** Dezembro 2026
