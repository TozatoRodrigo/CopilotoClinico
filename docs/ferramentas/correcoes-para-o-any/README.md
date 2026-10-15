# Correções propostas para o ANY App e o HETRIN Ped (CC-016)

**Para:** Dr. Gustavo Moreira, dono do ANY App (any.app.br) e do HETRIN Ped (hetrinped.netlify.app).
**De:** equipe do Copiloto Clínico. **Data:** 15/10/2026.
**Base:** ANY App, branch `v4`, revisão `95c8fba` (a mesma copiada, sem alteração, em `tests/any-reference/`).

Ao portar as ferramentas do ANY para o Copiloto, os testes que comparam as duas
contas mostraram erros que estão hoje no ar. Este pacote junta, num lugar só,
os que mais pesam para o paciente, cada um com uma **proposta** de correção
pronta para aplicar.

**Nada aqui é decisão.** Toda mudança de dose, limiar ou critério é decisão
médica sua. Cada achado tem um campo para você marcar _confirmo_, _descarto_ ou
_outra correção_. Nada foi aplicado nos sites, e o Copiloto continua igual ao
ANY até a sua decisão.

## Como usar

1. Leia o achado, confira a fonte e marque a decisão.
2. Para os confirmados, aplique o `.patch` na raiz do repositório do ANY (branch `v4`):
   `git apply --check NN-….patch` e depois `git apply NN-….patch`. Cada patch é
   independente; aplicados todos juntos, também funcionam (conferido).
3. Publique como de costume (README do ANY): any.app.br por `npm run build` em
   `v2/` e `netlify deploy`; o HETRIN copiando `v2/public/hetrinped/` e
   publicando a pasta. **No HETRIN, aplique também o patch 02**, para a correção
   chegar a quem já instalou o app (seção "Service worker" abaixo).

Cada patch foi conferido rodando a própria conta do ANY, antes e depois, com o
exemplo numérico do achado. O passo a passo e a saída estão em
[`verificacao.md`](./verificacao.md).

**Confiança** diz quanto a correção proposta se apoia em fonte verificável:
_alta_ (a fonte está citada no próprio ANY, ou o erro é de conta e o próprio ANY
já mostra o valor certo em outro lugar); _média_ (fonte citada, mas a
correção envolve uma escolha que só você pode fazer); _baixa_ (não há fonte
citada nos arquivos de achados nem no ANY; o que falta está dito no achado).

**Porte no Copiloto** diz se, quando você confirmar, o Copiloto também precisa
mudar, e onde. Até lá ele reproduz o ANY (regra do ADR-017).

## Resumo, por risco ao paciente

| #   | Ferramenta e site                       | Achado                                                               | Risco         | Confiança | Patch                                                                                              |
| --- | --------------------------------------- | -------------------------------------------------------------------- | ------------- | --------- | -------------------------------------------------------------------------------------------------- |
| 1   | HETRIN Ped (hetrinped.netlify.app)      | Glucagon com volume 10 vezes menor                                   | muito alto    | alta      | [01](./01-hetrinped-glucagon-volume.patch) + [02](./02-hetrinped-service-worker-atualizacao.patch) |
| 2   | Ventilação mecânica (any.app.br)        | ROX 100 vezes menor: todo paciente em CNAF sai "considere intubação" | alto          | alta      | [03](./03-vm-guide-rox-fio2-em-fracao.patch)                                                       |
| 3   | Bloqueios regionais (any.app.br)        | Dose máxima de anestésico local sem teto em mg                       | alto          | baixa     | [04](./04-bloqueios-teto-absoluto-anestesico-local.patch)                                          |
| 4   | Pediatria (any.app.br e HETRIN)         | Volume do neonato some (0,0 mL) ou dobra no arredondamento           | alto          | alta      | [05](./05-pediatria-volume-neonatal-arredondamento.patch)                                          |
| 5   | CAD e EHH (any.app.br)                  | Velocidade de insulina calculada com potássio < 3,5                  | médio-alto    | alta      | [06](./06-ketopath-insulina-com-potassio-baixo.patch)                                              |
| 6   | Heparina, infusões (any.app.br)         | Ajuste na SCA parte de 12 UI/kg/h sem o teto de 1.000 UI/h           | médio-alto    | média     | [07](./07-heparina-ajuste-sem-dose-atual.patch)                                                    |
| 7   | ACLS (any.app.br)                       | Amiodarona sugerida um choque antes                                  | médio         | alta      | [08](./08-acls-amiodarona-apos-3o-e-5o-choque.patch)                                               |
| 8   | Calculadoras: NEWS2 (any.app.br)        | 3 pontos num parâmetro sai "baixo risco"                             | médio         | alta      | [09](./09-calculadoras-news2-parametro-unico.patch)                                                |
| 9   | Calculadoras: CIWA-Ar (any.app.br)      | Cinco itens só aceitam 0, 2, 5 e 7                                   | médio         | alta      | [10](./10-calculadoras-ciwa-ar-itens-0-a-7.patch)                                                  |
| 10  | Calculadoras: HELLP (any.app.br)        | Classe de Mississippi sem LDH e TGO juntos                           | médio         | média     | [11](./11-calculadoras-hellp-tgo-mississippi.patch)                                                |
| 11  | Paliativos, hipodermóclise (any.app.br) | Matriz de compatibilidade desalinhada                                | médio         | média     | [12](./12-paliativos-matriz-hipodermoclise-diagonal.patch)                                         |
| 12  | Toxicologia (any.app.br)                | NAC sem teto de peso                                                 | médio-baixo   | média     | [13](./13-toxpath-nac-teto-100-kg.patch)                                                           |
| 13  | Toxicologia (any.app.br)                | Carvão ativado: mínimo de 25 g na criança pequena                    | baixo-médio   | baixa     | [14](./14-toxpath-carvao-crianca-sem-minimo-25-g.patch)                                            |
| 14  | Calculadoras: APACHE II (any.app.br)    | Pontos diferentes da tabela de Knaus                                 | baixo         | alta      | [15](./15-calculadoras-apache-ii-pontos-knaus.patch)                                               |
| 15  | Calculadoras: MELD-Na (any.app.br)      | Ajuste pelo sódio também com MELD ≤ 11                               | baixo         | média     | [16](./16-calculadoras-meld-na-ajuste-acima-de-11.patch)                                           |
| 16  | Calculadoras: Bonacini (any.app.br)     | Pontuação diferente do escore original                               | baixo         | média     | [17](./17-calculadoras-bonacini-escore-original.patch)                                             |
| 17  | Calculadoras: GRACE (any.app.br)        | Referência não é a da tabela usada                                   | baixo (texto) | alta      | [18](./18-calculadoras-grace-referencia-granger.patch)                                             |
| 18  | Pediatria (any.app.br)                  | Drogas sem teto no cálculo                                           | muito baixo   | baixa     | sem patch                                                                                          |

---

## 1. HETRIN Ped — glucagon com volume 10 vezes menor

- **Ferramenta e site:** HETRIN Ped v1.1.7, droga `glucagon-tox` (cenário Intoxicação), em hetrinped.netlify.app.
- **Hoje × deveria:** a dose está certa (0,05 mg/kg); o **volume** sai 10 vezes menor. Criança de 10 kg: dose 0,50 mg, a tela manda **0,63 mL** "da solução 0,8 mg/mL"; o certo é **6,25 mL** da solução de 0,08 mg/mL. Com 20 kg, 1,25 mL × 12,50 mL. Quem seguir a tela dá 1/10 da dose.
- **Fonte:** a própria instrução da tela: 4 mg de glucagon em 50 mL (4 mL + SG 5% 46 mL) dão 0,08 mg/mL, não 0,8. O ANY já corrigiu a mesma conta no PedGuide v4 de any.app.br (commit `f6e64f1`) e no HETRIN 1.2.0 (branch `handoff/v2-pre-launch`), mas essas versões não foram publicadas no HETRIN.
- **Onde:** `v2/public/hetrinped/index.html`, linhas 648–649:
  ```js
  instruction:'Diluir 4 mg (4 mL) em SG 5% 46 mL (0,8 mg/mL). …',
  calc:p => { const d=Math.min(p*0.05,10); return { …, ml:fN(d/0.8,2), mlLabel:'da solução 0,8 mg/mL', … }; } },
  ```
- **Correção proposta:** 0,8 → 0,08 na instrução, na conta e no rótulo (o mesmo valor do PedGuide v4). Nenhuma dose muda.
- **Patch:** [`01-hetrinped-glucagon-volume.patch`](./01-hetrinped-glucagon-volume.patch), junto com o [`02`](./02-hetrinped-service-worker-atualizacao.patch) para chegar a quem já instalou.
- **Confiança:** alta. É erro de conta, e o próprio ANY já mostra o valor certo em any.app.br.
- **Porte no Copiloto:** não muda. O Copiloto portou o PedGuide v4, que já usa 0,08 mg/mL (`src/shared/clinical-tools/pediatrics/bolus-drugs.ts`).
- **Decisão do Gustavo:** ☐ confirmo ☐ descarto ☐ outra correção: …………………………

## 2. Ventilação mecânica — ROX 100 vezes menor

- **Ferramenta e site:** VM Guide, calculadora "Índice ROX (cateter nasal de alto fluxo)", em any.app.br.
- **Hoje × deveria:** SpO₂ 94%, FiO₂ 0,5, FR 22: a tela mostra **ROX 0,09 — "Alto risco de falha — considere intubação"** e o botão "Abrir Airway Guide"; o ROX é **8,55 — baixo risco**. Com qualquer FR a partir de 2 ipm o ROX do ANY nunca passa de 2,38: **todo paciente em CNAF sai "alto risco — considere intubação"**.
- **Fonte:** Roca O, et al. Am J Respir Crit Care Med. 2019;199(11):1368-76, já citado nas referências do próprio VM Guide: ROX = (SpO₂ ÷ FiO₂) ÷ FR, com a FiO₂ em fração. Cortes 4,88 e 3,85 do mesmo artigo.
- **Onde:** `v2/src/data/vmData.ts`, linhas 272–275:
  ```ts
  const fio2Pct = fio2 <= 1 ? fio2 * 100 : fio2;
  return spo2 / fio2Pct / freq;
  ```
- **Correção proposta:** usar a FiO₂ em fração (se digitada em %, dividir por 100). As faixas não mudam.
- **Patch:** [`03-vm-guide-rox-fio2-em-fracao.patch`](./03-vm-guide-rox-fio2-em-fracao.patch)
- **Confiança:** alta.
- **Porte no Copiloto:** muda `src/shared/clinical-tools/ventilation/calculations.ts` (`ROX_INDEX.compute`). O achado 1.1 de `ventilacao-mecanica.md` recomenda não ligar `NEXT_PUBLIC_FERRAMENTAS` com o ROX como está.
- **Decisão do Gustavo:** ☐ confirmo ☐ descarto ☐ outra correção: …………………………

## 3. Bloqueios regionais — dose máxima de anestésico local sem teto em mg

- **Ferramenta e site:** Block Path, calculadora de dose máxima, em any.app.br.
- **Hoje × deveria:** a conta é só mg/kg × peso. Paciente de 100 kg: lidocaína **450 mg** sem epinefrina (22,5 mL a 2%) e **700 mg** com; bupivacaína **250 mg** sem e **300 mg** com. Com 200 kg, lidocaína com epinefrina 1.400 mg. Os tetos usuais em mg (lidocaína 300 mg sem e 500 mg com epinefrina; bupivacaína 175 mg sem e 225 mg com) passam a ser ultrapassados a partir de 66,7 kg (lidocaína sem epinefrina), 70 kg (bupivacaína sem), 71,4 kg (lidocaína com) e 75 kg (bupivacaína com). Risco de intoxicação sistêmica por anestésico local (LAST).
- **Fonte:** o arquivo de achados (`bloqueios.md`, 1.1) traz os valores como "referências usuais", **sem citação**. O Block Path não tem referência bibliográfica (achado 1.14).
- **Onde:** `v2/src/pages/BlockPath.tsx`, linhas 626–628 (dado) e 864–879 (tela):
  ```tsx
  { name: 'Lidocaína', noEpi: 4.5, withEpi: 7, … },
  <div …>{fmt(calcWeight * a.noEpi, 0)} mg</div>
  ```
- **Correção proposta:** teto absoluto em mg por anestésico (lidocaína 300/500 mg; bupivacaína 175/225 mg), aplicado à dose e aos mL; o rótulo mostra o teto ("4,5 mg/kg, máx 300 mg"). **Ropivacaína ficou sem teto:** não há valor no arquivo de achados; falta você definir. Abaixo de 66,7 kg nada muda.
- **Patch:** [`04-bloqueios-teto-absoluto-anestesico-local.patch`](./04-bloqueios-teto-absoluto-anestesico-local.patch)
- **Confiança:** baixa. **O que falta:** a bula ou a referência que você adota para os tetos em mg (e o teto da ropivacaína). Os valores do patch são os usuais de bula; confira antes de confirmar.
- **Porte no Copiloto:** muda `src/shared/clinical-tools/blocks/doses.ts` (`maxMgPerKg`, hoje sem teto em mg).
- **Decisão do Gustavo:** ☐ confirmo ☐ descarto ☐ outra correção: …………………………

## 4. Pediatria — volume do neonato some ou dobra no arredondamento

- **Ferramenta e site:** Ped Guide de any.app.br e HETRIN Ped, drogas em bolus.
- **Hoje × deveria:** o volume é arredondado para 1 casa (às vezes 0) mesmo quando é menor que 1 mL. Exemplos:
  - epinefrina IV, 0,5 kg: any.app.br mostra **0,01 mg · 0,0 mL**; o HETRIN mostra **0,01 mg · 0,1 mL** (o dobro); o certo é 0,005 mg · **0,05 mL**;
  - amiodarona, 0,5 kg: **0,1 mL** nos dois sites, para 0,05 mL (o dobro);
  - hidrocortisona 0,5 kg, difenidramina 1 kg e vitamina K 1 kg: **0,0 mL** (ou 0,00), com a dose na tela.

  Varrendo de 0,5 a 50 kg, há 187 combinações peso × droga em any.app.br e 222 no HETRIN em que o volume some ou erra 20% ou mais; todas abaixo de 7 kg.

- **Fonte:** é arredondamento, não dose. O próprio HETRIN já mostra a vazão de infusão com 2 casas abaixo de 0,1 (`rate < 0.1 ? fN(rate,2) : fN(rate,1)`).
- **Onde:** o formatador `fN` (`v2/src/pages/PedGuide.tsx`, linha 62; `v2/public/hetrinped/index.html`, linha 491) e 13 drogas do PedGuide que arredondam o volume com `toFixed(1)` direto (ex.: hidrocortisona, `ml: (d / 50).toFixed(1)`).
- **Correção proposta:** abaixo de 1, pelo menos 2 casas (3 abaixo de 0,01): 0,05 mL aparece "0,05". No PedGuide, as 13 linhas passam a usar o mesmo `fN`. De 3 a 50 kg nenhum número muda além de ganhar uma casa decimal (conferido). Depois do patch, sobram 38 e 54 combinações com erro ≥ 20%, todas abaixo de 3 kg: volumes de 1 a 3 mL mostrados sem casa decimal (bicarbonato a 1,5 kg: "2 mL" para 1,5 mL) e volumes de 0,01–0,02 mL. **Para decidir:** uma casa nos volumes que hoje saem inteiros, ou orientar diluição maior no neonato.
- **Patch:** [`05-pediatria-volume-neonatal-arredondamento.patch`](./05-pediatria-volume-neonatal-arredondamento.patch) (os dois sites).
- **Confiança:** alta para o defeito; a regra de casas é de exibição e não muda dose.
- **Porte no Copiloto:** muda `src/shared/clinical-tools/pediatrics/bolus.ts` (`formatDecimal(…, rule.decimals)`) e as casas de cada droga em `pediatrics/bolus-drugs.ts`.
- **Decisão do Gustavo:** ☐ confirmo ☐ descarto ☐ outra correção: …………………………

## 5. CAD e EHH — velocidade de insulina calculada com potássio < 3,5

- **Ferramenta e site:** KetoPath, passo de insulina, em any.app.br.
- **Hoje × deveria:** com K 3,0 mEq/L e 70 kg, a tela mostra o alerta vermelho **"Insulina bloqueada"** e, logo abaixo, a calculadora com **"Insulina 7,0 U/h · 7,0 mL/h"**. O texto bloqueia e a conta libera. Deveria não mostrar velocidade enquanto o K estiver abaixo de 3,5.
- **Fonte:** o próprio conteúdo do KetoPath (`ketoData`, marcado [ADA]/[UTD]): adiar a insulina e repor potássio até o K ultrapassar 3,5 mEq/L.
- **Onde:** `v2/src/components/clinical/KetoManejo.tsx`, linha 418:
  ```tsx
  const velocidade = peso ? insulinaVelocidade(peso, taxa) : null;
  ```
- **Correção proposta:** sem velocidade quando o bloqueio está ativo; no lugar do número, "Velocidade não calculada: insulina bloqueada enquanto o potássio estiver abaixo de 3,5 mEq/L". A borda continua a do ANY (K = 3,5 libera); o descompasso com o texto "ultrapasse 3,5" é o achado 2.2 de `cad-ehh.md`, para decidir à parte.
- **Patch:** [`06-ketopath-insulina-com-potassio-baixo.patch`](./06-ketopath-insulina-com-potassio-baixo.patch)
- **Confiança:** alta.
- **Porte no Copiloto:** muda `src/shared/clinical-tools/cad-ehh/roteiro.ts` (a `insulinRate` é calculada mesmo com a insulina bloqueada) e a tela `web/src/app/(app)/ferramentas/cad-ehh/_components/potassium-insulin.tsx`.
- **Decisão do Gustavo:** ☐ confirmo ☐ descarto ☐ outra correção: …………………………

## 6. Heparina — ajuste na SCA parte de 12 UI/kg/h sem o teto

- **Ferramenta e site:** protocolo de heparina (Infusões), fase "Ajuste", indicação SCA, em any.app.br.
- **Hoje × deveria:** na SCA o início respeita o teto de 1.000 UI/h. No ajuste, se a dose atual não for digitada, a conta parte de 12 UI/kg/h **sem** o teto. Paciente de 100 kg que está a 1.000 UI/h, TTPa/R 1,3 (↑ 2 UI/kg/h): a tela sugere **1.400 UI/h**; partindo do que está correndo, seriam **1.200 UI/h**. Com 120 kg e TTPa/R 1,0: 1.920 × 1.480 UI/h.
- **Fonte:** o teto da SCA é o do próprio ANY (12 UI/kg/h, máx. 1.000 UI/h). O nomograma ("v1, verbatim") não diz de onde parte o ajuste sem a dose atual.
- **Onde:** `v2/src/components/clinical/HeparinCalculator.tsx`, linha 85:
  ```tsx
  ? Math.max(0, (!isNaN(doseAtual) ? doseAtual : modo.infusaoPorKg) + linha.ajuste)
  ```
- **Correção proposta:** sem dose atual, partir da infusão inicial real (com o teto). Com a dose atual digitada, nada muda; abaixo de 83 kg e no TEP, nada muda. Fica de fora a outra opção do achado (aplicar o teto também no ajuste).
- **Patch:** [`07-heparina-ajuste-sem-dose-atual.patch`](./07-heparina-ajuste-sem-dose-atual.patch)
- **Confiança:** média: é a leitura mais provável do protocolo, mas a escolha é sua.
- **Porte no Copiloto:** muda `src/shared/clinical-tools/infusions/heparin.ts` (`currentDosePerKg ?? …infusionPerKg`).
- **Decisão do Gustavo:** ☐ confirmo ☐ descarto ☐ outra correção: …………………………

## 7. ACLS — amiodarona sugerida um choque antes

- **Ferramenta e site:** ACLS, card "Agora", ritmo chocável, em any.app.br.
- **Hoje × deveria:** depois do **2º** choque registrado o card já diz "Considere amiodarona 300 mg IV — Após 3° choque sem sucesso"; depois do **4º**, "Considere amiodarona 150 mg IV". Na sequência da AHA, 300 mg vem após o 3º choque e 150 mg após o 5º.
- **Fonte:** algoritmo de PCR no adulto da AHA e o próprio texto do ANY ("1ª dose (após 3° choque)"). Achados 1.1 e 1.2 de `acls.md`.
- **Onde:** `v2/src/pages/AclsGuide.tsx`, linhas 542 e 545:
  ```tsx
  if (state.shockCount >= 2 && !state.amio300Given) {
  if (state.shockCount >= 4 && state.amio300Given && !state.amio150Given) {
  ```
- **Correção proposta:** `>= 3` e `>= 5`. Alternativa do achado, se a intenção for avisar antes: manter o limiar e trocar o texto para "Prepare amiodarona 300 mg (após o 3º choque)".
- **Patch:** [`08-acls-amiodarona-apos-3o-e-5o-choque.patch`](./08-acls-amiodarona-apos-3o-e-5o-choque.patch)
- **Confiança:** alta.
- **Porte no Copiloto:** muda `src/shared/clinical-tools/acls/content.ts` (`AMIODARONE_GUIDE_THRESHOLDS`: 2 → 3 e 4 → 5).
- **Decisão do Gustavo:** ☐ confirmo ☐ descarto ☐ outra correção: …………………………

## 8. NEWS2 — 3 pontos em um único parâmetro sai "baixo risco"

- **Ferramenta e site:** Calculadoras, NEWS2, em any.app.br.
- **Hoje × deveria:** FR 7 com o resto normal (NEWS2 = 3): **"Baixo risco — monitoramento de rotina (mínimo a cada 12h)"**. Pela regra do NEWS2, 3 pontos em um parâmetro pedem resposta urgente. O mesmo vale para confusão nova isolada e PAS 88 isolada.
- **Fonte:** Royal College of Physicians, NEWS2 (2017), citado pelo ANY; a pérola da própria calculadora diz "3 em parâmetro único: considere revisão médica urgente".
- **Onde:** `v2/src/data/calculatorData.ts`, linhas 2822–2825 (a faixa só olha a soma).
- **Correção proposta:** faixa "Risco baixo-médio (3 pontos em um parâmetro) — monitoramento mínimo a cada 1h; considere revisão médica urgente". **No mesmo patch**, as frequências de monitoramento da tabela de resposta do RCP: soma 1–4, mínimo a cada 4–6 h (hoje 12 h); 5–6, mínimo a cada 1 h (hoje 4–6 h). Se quiser só a regra do parâmetro, marque "outra correção".
- **Patch:** [`09-calculadoras-news2-parametro-unico.patch`](./09-calculadoras-news2-parametro-unico.patch)
- **Confiança:** alta para a regra do parâmetro; média para as frequências (conferir na tabela do relatório do RCP).
- **Porte no Copiloto:** muda `src/shared/clinical-tools/calculators/news2.ts`.
- **Decisão do Gustavo:** ☐ confirmo ☐ descarto ☐ outra correção: …………………………

## 9. CIWA-Ar — cinco itens só aceitam 0, 2, 5 e 7

- **Ferramenta e site:** Calculadoras (e Tox Path), CIWA-Ar, em any.app.br.
- **Hoje × deveria:** náusea, tremor, sudorese, ansiedade e agitação têm 4 opções: "(1-3)" vale 2 e "(4-6)" vale 5. No CIWA-Ar cada item vai de 0 a 7. Nota 1 nos cinco: hoje **10, "moderada — considere benzodiazepínico"**; o certo é **5, leve**. Nota 3 nos cinco, cefaleia 3 e orientação 2: hoje **15, moderada**; o certo é **20, grave**.
- **Fonte:** Sullivan JT, et al. Br J Addict. 1989;84(11):1353-7, citado pelo ANY; os próprios rótulos do ANY dizem "(1-3)" e "(4-6)".
- **Onde:** `v2/src/data/calculatorData.ts`, linhas 1724–1743.
- **Correção proposta:** as 8 notas (0 a 7) em cada um dos cinco itens; os textos do ANY ficam nas âncoras 0, 1, 4 e 7. Faixas de interpretação iguais.
- **Patch:** [`10-calculadoras-ciwa-ar-itens-0-a-7.patch`](./10-calculadoras-ciwa-ar-itens-0-a-7.patch)
- **Confiança:** alta.
- **Porte no Copiloto:** muda `src/shared/clinical-tools/calculators/ciwa-ar.ts`.
- **Decisão do Gustavo:** ☐ confirmo ☐ descarto ☐ outra correção: …………………………

## 10. HELLP — classe de Mississippi sem LDH e TGO juntos

- **Ferramenta e site:** Calculadoras, critérios de HELLP (Mississippi), em any.app.br.
- **Hoje × deveria:** a classe sai com LDH > 600 **ou** TGO > 70, e a TGO tem um corte só. Plaquetas 40 mil, LDH 900, TGO 45: hoje **"Classe 1 — considere parto imediato"**; pela classificação de Mississippi falta a TGO ≥ 70 e o quadro é HELLP parcial. Plaquetas 80 mil, LDH 300, TGO 120: hoje **Classe 2**; falta o LDH.
- **Fonte:** Martin JN Jr, et al. Am J Obstet Gynecol. 1999;180(6 Pt 1):1373-84, citado pelo ANY; cortes do achado em `calculadoras.md`: classes 1 e 2 pedem TGO ≥ 70; a classe 3, TGO ≥ 40; HELLP parcial é ter 1 ou 2 dos 3 critérios.
- **Onde:** `v2/src/data/calculatorData.ts`, linhas 3108–3115:
  ```ts
  { id: 'tgo', label: 'TGO > 70 U/L', options: [{ label: 'Não', value: 0 }, { label: 'Sim', value: 1 }] }
  if (ldh === 0 && tgo === 0) return interp('HELLP incompleta', …)
  ```
- **Correção proposta:** TGO em três faixas (< 40, 40–69, ≥ 70); a classe exige LDH e a TGO da classe; sem os dois, "HELLP incompleta (parcial)". O corte do LDH ficou "> 600" como no ANY (Martin usa ≥ 600).
- **Patch:** [`11-calculadoras-hellp-tgo-mississippi.patch`](./11-calculadoras-hellp-tgo-mississippi.patch)
- **Confiança:** média: confira as definições no artigo.
- **Porte no Copiloto:** muda `src/shared/clinical-tools/calculators/hellp.ts`.
- **Decisão do Gustavo:** ☐ confirmo ☐ descarto ☐ outra correção: …………………………

## 11. Paliativos — matriz de compatibilidade da hipodermóclise desalinhada

- **Ferramenta e site:** PaliaPath, hipodermóclise, aba "Compatibilidade", em any.app.br.
- **Hoje × deveria:** são 15 colunas e 14 valores por linha. A tela põe os 14 valores nas 14 primeiras colunas e deixa a coluna DEX vazia. Resultado: 37 pares discordantes (A × B ≠ B × A), droga incompatível com ela mesma (morfina, ondansetrona, tramadol) e midazolam + morfina incompatível numa direção e compatível na outra.
- **Achado novo deste preparo:** cada linha parece trazer as **outras** 14 drogas, sem a própria (a diagonal). Pondo a diagonal no lugar, sem mudar nenhum valor: os discordantes caem de 37 para 12; a coluna DEX fica toda "I", como diz o aviso da própria tela ("Dexametasona: incompatível com TODOS"); midazolam + morfina fica compatível nas duas direções. Os 12 que sobram são 10 da linha do octreotide (a linha diz C, a coluna diz I; a lista de medicações diz "sítio exclusivo"), morfina × tramadol e octreotide × ondansetrona.
- **Fonte:** "Azevedo e Barbosa", citada na tela; não temos o original para conferir os 12 pares que sobram.
- **Onde:** `v2/src/pages/PaliaPath.tsx`, linha 942 (`{row.compat.map((c, j) => (`); dado em `v2/src/data/paliaData.ts`, linhas 671–687.
- **Correção proposta:** a tela insere "—" na diagonal de cada linha; o dado não muda. Os 12 pares que sobram ficam para você decidir com a fonte (inclusive se a linha do octreotide é toda "I").
- **Patch:** [`12-paliativos-matriz-hipodermoclise-diagonal.patch`](./12-paliativos-matriz-hipodermoclise-diagonal.patch)
- **Confiança:** média: a explicação fecha com os dados e com o aviso da tela, mas falta conferir na fonte.
- **Porte no Copiloto:** muda `src/shared/clinical-tools/palliative/hypodermoclysis.ts` (`COMPATIBILITY_MATRIX`, hoje com a coluna DEX "sem dado") e o teste que trava os 37 discordantes (`compatibilityDisagreements`).
- **Decisão do Gustavo:** ☐ confirmo ☐ descarto ☐ outra correção: …………………………

## 12. Toxicologia — NAC sem teto de peso

- **Ferramenta e site:** Tox Path, calculadora de doses de N-acetilcisteína, em any.app.br.
- **Hoje × deveria:** a conta aceita 20 a 250 kg sem teto. Com 150 kg: **22,5 g + 7,5 g + 15 g = 45 g**; com o peso de dose limitado a 100 kg, **15 g + 5 g + 10 g = 30 g**.
- **Fonte:** o próprio ANY: o PedGuide e o HETRIN limitam a NAC a 15.000, 5.000 e 10.000 mg, isto é, 150, 50 e 100 mg/kg × 100 kg. Achado 6.1 de `toxicologia.md` ("muitos protocolos limitam a 100 kg").
- **Onde:** `v2/src/pages/ToxPath.tsx`, linhas 699–707.
- **Correção proposta:** peso de dose = mín(peso, 100 kg) e o aviso "(calculada para 100 kg)". Até 100 kg nada muda. Os volumes de diluição (achado 6.2, criança de 20–40 kg) ficam para decisão à parte.
- **Patch:** [`13-toxpath-nac-teto-100-kg.patch`](./13-toxpath-nac-teto-100-kg.patch)
- **Confiança:** média: há protocolos com outro teto de peso; confirme o que você adota.
- **Porte no Copiloto:** muda `src/shared/clinical-tools/toxicology/antidote-doses.ts`.
- **Decisão do Gustavo:** ☐ confirmo ☐ descarto ☐ outra correção: …………………………

## 13. Toxicologia — carvão ativado com mínimo de 25 g na criança pequena

- **Ferramenta e site:** Tox Path, descontaminação, dose de carvão ativado, em any.app.br.
- **Hoje × deveria:** 1 g/kg com mínimo de 25 g: criança de 10 kg recebe **25 g (2,5 g/kg)**; de 5 kg, 25 g (5 g/kg). A dose pediátrica usual citada no achado é 0,5–1 g/kg. Proposta: **10 g (1 g/kg)**.
- **Fonte:** o achado 4.1 de `toxicologia.md` não cita fonte; o comentário do ANY cita o Goldfrank (11ª ed.) para "1 g/kg, mínimo 25 g".
- **Onde:** `v2/src/pages/ToxPath.tsx`, linha 79:
  ```tsx
  const dose = Math.min(100, Math.max(25, Math.round(weight * 1)));
  ```
- **Correção proposta:** tirar o mínimo de 25 g (1 g/kg, máximo 100 g). A partir de 25 kg nada muda. Outras opções do achado: mínimo só acima de certo peso, ou regra pediátrica própria.
- **Patch:** [`14-toxpath-carvao-crianca-sem-minimo-25-g.patch`](./14-toxpath-carvao-crianca-sem-minimo-25-g.patch)
- **Confiança:** baixa. **O que falta:** a referência pediátrica que você adota para o carvão.
- **Porte no Copiloto:** muda `src/shared/clinical-tools/toxicology/decontamination.ts` (`ACTIVATED_CHARCOAL.minGrams` e `CHARCOAL_RULE_TEXT`).
- **Decisão do Gustavo:** ☐ confirmo ☐ descarto ☐ outra correção: …………………………

## 14. APACHE II — pontos diferentes da tabela de Knaus

- **Ferramenta e site:** Calculadoras, APACHE II, em any.app.br.
- **Hoje × deveria:** em sete variáveis o ANY juntou faixas simétricas com o ponto da mais grave. Paciente com T 33 °C, FR 8, pH 7,30, Na 152, K 2,7, Ht 48% e leucócitos 17 mil (o resto normal): hoje **16 (mortalidade ~25%)**; pela tabela original, **11 (~15%)**. Dos 131 valores testados nas sete variáveis, 36 pontuam diferente.
- **Fonte:** Knaus WA, et al. Crit Care Med. 1985;13(10):818-29, citado pelo ANY; tabela em `calculadoras.md`.
- **Onde:** `v2/src/data/calculatorData.ts`, linhas 3219–3273 (temperatura, FR, pH, sódio, potássio, hematócrito, leucócitos).
- **Correção proposta:** os pontos de Knaus em cada faixa (faixas de mesmo ponto continuam juntas, como no ANY). As outras variáveis e as faixas de mortalidade não mudam.
- **Patch:** [`15-calculadoras-apache-ii-pontos-knaus.patch`](./15-calculadoras-apache-ii-pontos-knaus.patch)
- **Confiança:** alta.
- **Porte no Copiloto:** muda `src/shared/clinical-tools/calculators/apache-ii.ts`.
- **Decisão do Gustavo:** ☐ confirmo ☐ descarto ☐ outra correção: …………………………

## 15. MELD-Na — ajuste pelo sódio também com MELD ≤ 11

- **Ferramenta e site:** Calculadoras, MELD-Na, em any.app.br.
- **Hoje × deveria:** o ajuste pelo sódio entra sempre. Bilirrubina 1, INR 1, creatinina 1, sódio 125: hoje **19**; pela regra da OPTN/UNOS, que só ajusta com MELD > 11, **6**. Bilirrubina 1,5, INR 1,2, sódio 128: 19 × 10.
- **Fonte:** regra da OPTN/UNOS (2016), no achado de `calculadoras.md`. O ANY cita Kim 2008, que aplica o ajuste sempre: as duas leituras existem. Desde 2023 a UNOS usa o MELD 3.0 (outra opção do achado).
- **Onde:** `v2/src/data/calculatorData.ts`, linha 1108.
- **Correção proposta:** ajustar só com MELD > 11. Com MELD > 11 nada muda (2.000 combinações conferidas). Note o salto na borda, que é da própria regra: MELD 11 com Na 125 fica 11; MELD 12 com o mesmo sódio vai a 23.
- **Patch:** [`16-calculadoras-meld-na-ajuste-acima-de-11.patch`](./16-calculadoras-meld-na-ajuste-acima-de-11.patch)
- **Confiança:** média: a escolha entre Kim 2008, OPTN 2016 e MELD 3.0 é sua.
- **Porte no Copiloto:** muda `src/shared/clinical-tools/calculators/meld-na.ts`.
- **Decisão do Gustavo:** ☐ confirmo ☐ descarto ☐ outra correção: …………………………

## 16. Bonacini — pontuação diferente do escore original

- **Ferramenta e site:** Calculadoras, Bonacini, em any.app.br.
- **Hoje × deveria:** o ANY usa AST/ALT em 3 faixas, plaquetas de 0 a 5 sem a faixa > 340 mil e corte ≥ 7 (escore até 9). No original: ALT/AST em 4 faixas (> 1,7 = 0 … < 0,6 = 3), plaquetas de 0 (> 340 mil) a 6 (< 40 mil), escore de 0 a 11, cirrose ≥ 8. ALT 50, AST 50, plaquetas 100 mil, INR 1,5: hoje **5 (intermediária)**; no original, **8 (alta)**.
- **Fonte:** Bonacini M, et al. Am J Gastroenterol. 1997;92(8):1302-4, citado pelo ANY; estrutura do escore no achado de `calculadoras.md`.
- **Onde:** `v2/src/data/calculatorData.ts`, linhas 1130–1152.
- **Correção proposta:** os itens e o corte do original; a faixa intermediária passa a 4–7.
- **Patch:** [`17-calculadoras-bonacini-escore-original.patch`](./17-calculadoras-bonacini-escore-original.patch)
- **Confiança:** média: confira as faixas no artigo.
- **Porte no Copiloto:** muda `src/shared/clinical-tools/calculators/bonacini.ts`.
- **Decisão do Gustavo:** ☐ confirmo ☐ descarto ☐ outra correção: …………………………

## 17. GRACE — referência não é a da tabela usada

- **Ferramenta e site:** Calculadoras, GRACE (aproximação), em any.app.br.
- **Hoje × deveria:** a tela cita Fox 2006 (morte ou IAM em 6 meses), mas a tabela de pontos e os cortes 108/140 são os do modelo de mortalidade intra-hospitalar (Granger 2003). A conta não muda.
- **Fonte:** achado de `calculadoras.md`.
- **Onde:** `v2/src/data/calculatorData.ts`, linha 196.
- **Correção proposta:** citar Granger CB, et al. Arch Intern Med. 2003;163(19):2345-53. O texto do aviso de versão ("aproximação") continua para você decidir (pedido do CC-307).
- **Patch:** [`18-calculadoras-grace-referencia-granger.patch`](./18-calculadoras-grace-referencia-granger.patch)
- **Confiança:** alta.
- **Porte no Copiloto:** muda `src/shared/clinical-tools/calculators/grace-score.ts` (só a citação).
- **Decisão do Gustavo:** ☐ confirmo ☐ descarto ☐ outra correção: …………………………

## 18. Pediatria — drogas sem teto no cálculo (sem patch)

- **Ferramenta e site:** Ped Guide de any.app.br: glicose 10% e 25%, manitol, NaCl 3% e cisatracúrio.
- **Hoje:** sem teto na conta. Mas o peso pediátrico é limitado a 50 kg, e a 50 kg as doses já são de adulto: glicose 25 g (250 mL de G10%), manitol 25 g, NaCl 3% 150 mL, cisatracúrio 7,5 mg. Um teto só passaria a atuar se a faixa de peso mudar.
- **Por que sem patch:** os valores sugeridos no achado (glicose 25 g, manitol 50 g, NaCl 3% 250 mL) não têm fonte citada e não mudariam nenhum número na faixa aceita. O HETRIN 1.1.7 limitava a glicose a 40 mL de G50% (20 g): a escolha entra na fonte única (CC-321).
- **Confiança:** baixa (falta a fonte dos tetos).
- **Porte no Copiloto:** quando decidido, `src/shared/clinical-tools/pediatrics/bolus-drugs.ts`.
- **Decisão do Gustavo:** ☐ manter sem teto ☐ definir tetos: …………………………

---

## Service worker do ANY e do HETRIN: a correção chegar a quem já instalou

**HETRIN (hetrinped.netlify.app).** O `sw.js` guarda o app no aparelho
(cache-first, `CACHE_NAME = 'hetrinped-v1.1.7'`) e já tem `skipWaiting` e
`clients.claim`. Quem já instalou abre **a versão guardada**: na primeira
abertura depois da publicação ainda vê o glucagon errado; o app atualiza o
cache em segundo plano e só mostra a correção na abertura seguinte. Um app
deixado aberto no celular não recarrega sozinho e fica na versão antiga até
ser fechado. O patch [`02`](./02-hetrinped-service-worker-atualizacao.patch):

1. sobe `CACHE_NAME` para `hetrinped-v1.1.8` e o rodapé para "v1.1.8" (o README
   do ANY já pede os dois a cada publicação): o navegador instala o `sw.js` novo
   e apaga o cache antigo;
2. o pré-cache busca na rede (`cache: 'reload'`), sem pegar o HTML do cache
   HTTP do navegador;
3. na ativação, **se havia cache antigo** (é atualização), recarrega as janelas
   abertas: quem estiver com o HETRIN aberto passa para a versão corrigida sem
   precisar fechar o app. Na primeira instalação não recarrega;
4. a página procura versão nova toda vez que o app volta do segundo plano
   (`reg.update()` no `visibilitychange`).

O recarregamento no item 3 é deliberado por causa do fator 10: um médico com a
tela aberta perde o peso digitado e precisa digitar de novo. Se preferir um aviso
("Versão nova — toque para atualizar") em vez de recarregar, marque "outra
correção". Em navegadores sem `navigate` no service worker (conferir no iPhone),
a correção chega na abertura seguinte.

**ANY App (any.app.br).** Não há service worker: o `manifest.webmanifest`
permite instalar na tela inicial, mas cada abertura busca o HTML no servidor.
Quem fecha e abre o app recebe a correção. O risco é o app **deixado aberto**:
ele continua com o código antigo na memória, e as telas carregadas sob demanda
(todas as ferramentas e as calculadoras) podem falhar ao abrir depois da
publicação, porque os arquivos antigos deixam de existir. Sugestão, sem patch
(o arquivo não está na referência): em `v2/src/main.tsx`, recarregar a página no
evento `vite:preloadError` (falha ao carregar uma tela) e conferir, ao voltar do
segundo plano, se há versão nova (ex.: um `version.json` gerado no build),
mostrando "Versão nova — toque para atualizar".

No Copiloto o cache das ferramentas já é versionado por build e só troca
depois de baixado inteiro (`web/public/sw.js`, CC-322); as correções que você
confirmar chegam por esse caminho.

## Achados novos encontrados no preparo

- **Matriz de compatibilidade:** a explicação da diagonal (achado 11) é nova; o
  arquivo de achados testou só "uma coluna faltando igual em todas as linhas".
- **Arredondamento no neonato é mais amplo que as 4 drogas listadas** (achado 4):
  amiodarona, epinefrina IV no HETRIN e bicarbonato também dobram ou somem
  abaixo de 2 kg.
- **NEWS2, frequência de monitoramento** (achado 8): diferente da tabela de
  resposta do RCP também fora da regra do parâmetro único.
- **Três achados de alto risco que não estavam na lista do CC-016**, tirados dos
  arquivos de revisão: teto dos anestésicos locais (3), insulina com K < 3,5 (5)
  e heparina no ajuste (6).
- **README do ANY** diz que o HETRIN publicado é a v1.1.5; o rodapé e o
  `CACHE_NAME` dizem 1.1.7.

## O que fica de fora deste pacote

Os demais itens dos arquivos de revisão clínica
([`../revisao-clinica/`](../revisao-clinica/)) continuam esperando decisão lá,
com as opções descritas: a fonte única das doses pediátricas
([`pediatria-fonte-unica.md`](../revisao-clinica/pediatria-fonte-unica.md), 23
divergências entre o PedGuide v4, o HETRIN 1.1.7 e o 1.2.0), as faixas de entrada
definidas no porte e os textos e cores de cada ferramenta. Este pacote só traz o
que tem conta errada ou critério trocado com efeito direto no paciente.
