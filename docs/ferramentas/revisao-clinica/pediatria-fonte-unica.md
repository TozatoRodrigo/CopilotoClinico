# Fonte única das doses pediátricas — reconciliação para assinatura (CC-321)

**Status:** preparação pronta; **aguarda decisão e assinatura do Dr. Gustavo Moreira**.
**História:** CC-321 (épico E3). Alimenta CC-319 e CC-320.
**Data da preparação:** 2026-10-15.
**CSV com as mesmas linhas:** [`pediatria-fonte-unica.csv`](./pediatria-fonte-unica.csv).

Este documento não decide nada. Ele põe lado a lado, por id de droga, o que as
quatro fontes pediátricas do ANY dizem e marca cada divergência. A coluna
**Decisão do Gustavo** está vazia de propósito. Assinado, ele vira a fonte
canônica do motor do Copiloto. A engenharia só troca o dado; o motor e a tela
não mudam.

Até a assinatura, o Copiloto mostra as doses do **PedGuide v4**, que é o que o
ANY mostra hoje, e a tela de Pediatria avisa: _"Doses aguardando assinatura da
fonte única (CC-321)"_.

## Fontes comparadas

| Fonte | Onde está no ANY | Revisão | O que cobre |
| --- | --- | --- | --- |
| **PedGuide v4** | `v2/src/pages/PedGuide.tsx` (conteúdo inline no componente) | branch `v4`, `95c8fba` | 65 drogas em bolus, 16 infusões em 3 faixas, Broselow, cenários, PCR, fluidos, transfusão e sinais vitais. É o que está no app hoje e o que o Copiloto portou. |
| **HETRIN Ped v1.1.7** | `v2/public/hetrinped/index.html` (HTML único, offline, institucional) | branch `v4`, `95c8fba` | As mesmas 65 drogas e 16 infusões, mais peso estimado pela idade e pelo comprimento, acessos e drenos por peso, e 9 cenários. É a versão publicada. |
| **HETRIN Ped v1.2.0** | o mesmo arquivo, só no branch `handoff/v2-pre-launch` | `052d659` (04/09/2026) | Igual à 1.1.7 na estrutura, com as doses alinhadas ao Guia da Criança Grave v1.1. Não chegou ao `v4`. |
| **CLAUDE.md §17** | "Diluição padrão pediátrica (Ped Guide)" | branch `v4`, `95c8fba` | Só as diluições das infusões contínuas nas 3 faixas de peso. Não cobre bolus. |

## Como ler as tabelas

- As colunas Dose/kg, Teto, Concentração, Diluição/volume e Selos trazem o
  **PedGuide v4**.
- As colunas do HETRIN trazem **só o que difere** do PedGuide v4. `=` quer
  dizer igual em tudo. `só texto` quer dizer números e selos iguais, com o texto
  da instrução diferente.
- **Diverge?** marca com ⚠ o atributo que muda número ou selo em pelo menos uma
  fonte. "10 kg" quer dizer que a conta dá outro resultado numa criança de
  10 kg, e a coluna da fonte mostra esse resultado.
- **Teto** é o teto que a conta aplica de fato. Teto escrito só no texto, sem
  efeito na conta, aparece na lista de divergências abaixo.
- Nas infusões, "Teto" é o fim da faixa de dose. O ANY só avisa "fora do
  range" e calcula mesmo assim. O Copiloto recusa a dose fora da faixa
  (ADR-017).
- Em "Concentração" das infusões, o número entre parênteses é o valor exato
  usado na conta (mcg/mL, mU/mL ou mg/mL).

## Resumo

- **Bolus (65 ids):** 35 iguais nas três fontes; 6 diferem só no texto; 24 com
  divergência de número ou de selo, todas entre o HETRIN 1.1.7 e as outras duas.
- **Infusões (16 ids × 3 faixas = 48 linhas):** 28 iguais; 20 com divergência,
  quase todas entre o código e o §17.
- **O PedGuide v4 e o HETRIN 1.2.0 têm os mesmos números em todas as linhas.**
  Só o texto da cetamina de indução difere. Na prática há duas posições: a do
  HETRIN 1.1.7, que é a versão publicada, e a do PedGuide v4/HETRIN 1.2.0. O §17
  é uma terceira posição, só para diluição de infusão, e parece desatualizado.

## Divergências que mudam número (decisão pedida)

As oito primeiras eram as já conhecidas; as demais apareceram na comparação
linha a linha.

1. **Midazolam na IOT (`midazolam`): teto 5 mg × 10 mg.** HETRIN 1.1.7: faixa
   0,1–0,4 mg/kg, calcula 0,3 mg/kg, teto 5 mg (a partir de 16,7 kg a dose para
   de subir). PedGuide v4 e HETRIN 1.2.0: faixa 0,1–0,3 mg/kg, teto 10 mg. Numa
   criança de 30 kg, 5 mg × 9 mg.
2. **Rocurônio (`rocuronio`): 1 × 1,2 mg/kg.** HETRIN 1.1.7: faixa 0,9–1,2,
   calcula 1 mg/kg. PedGuide v4 e HETRIN 1.2.0: 1,2 mg/kg. Teto de 100 mg nas três.
   Numa criança de 20 kg, 20 mg × 24 mg.
3. **Adrenalina IM (`epinefrina-im`): teto 0,3/0,5 × 0,5 mg.** HETRIN 1.1.7
   escreve "0,3 mg (criança) / 0,5 mg (adolescente)" e corta em 0,3 mg abaixo de
   30 kg. Mas 0,01 mg/kg só passa de 0,3 mg acima de 30 kg, então **o corte de
   0,3 mg nunca atua** e a conta dá o mesmo número nas três fontes. A diferença
   é de texto e de intenção: decidir se o teto da criança é 0,3 mg (como no
   autoinjetor de 0,3) ou 0,5 mg.
4. **Glicose (`glicose-g10`, `glicose-g25`, `glicose`): G50 diluída × G10/G25
   prontas.** HETRIN 1.1.7: "Glicose 50% → G10%" (1 mL/kg de G50 até 40 mL,
   mais 4 vezes esse volume de diluente, até 150 mL), "G50% → G25%" (1:1) e,
   nas emergências, "Glicose 50%"
   com 1 mL/kg de G50 até 50 mL. PedGuide v4 e HETRIN 1.2.0: G10% 5 mL/kg, G25%
   2 mL/kg e, nas emergências, G10% 5 mL/kg, sem teto (250 mL de G10 a 50 kg) e
   com o alerta "evitar G50% sem diluição em crianças". Numa criança de 10 kg o
   HETRIN 1.1.7 manda preparar 10 mL de G50 + 40 mL; o v4 mostra 50 mL de G10.
5. **Dobutamina (`dobutamina`, < 15 kg e 15–40 kg): 1800 × 1785 mcg/mL.** O
   §17 escreve 1800 mcg/mL e a fórmula "peso × dose × 0,033". A diluição do
   próprio §17 (10 mL de 12,5 mg/mL + 60 mL = 70 mL) dá 1785,7 mcg/mL, que é o
   que o código usa. A diferença na vazão é de 0,8%.
6. **Epinefrina em infusão (`epinefrina_inf`): 32,5 × 32,3 mcg/mL, e uma
   segunda diluição.** < 15 kg: o §17 escreve 32,5 mcg/mL para 1 mL + 30 mL; a
   conta dá 32,26, e o código usa 32,3. O §17 traz ainda, nas três faixas, uma
   segunda diluição de 62,5 mcg/mL ("peso × dose") que não existe no código. Em
   < 15 kg e 15–40 kg essa linha escreve a apresentação como "10 mg/mL"; a
   conta de 62,5 mcg/mL só fecha com a ampola de 1 mg/mL.
7. **Nitroprussiato (`nitroprussiato`): 600 × 610 mcg/mL.** §17 (0,6 mg/mL,
   "peso × dose / 10") e HETRIN 1.1.7 usam 600; PedGuide v4 e HETRIN 1.2.0 usam
   610, que é a conta exata de 1 mL de 25 mg/mL em 41 mL (609,8). Diferença de
   1,6% na vazão. O comentário no código do v4 diz que 600 "confere com o
   protocolo" e o dado usa 610.
8. **Midazolam em infusão, 15–40 kg (`midazolam_inf`).** O §17 traz duas
   linhas: 20 mL + 80 mL escrita como "1,9 mg/mL" (a conta dá 1 mg/mL) e 30 mL +
   50 mL a 1,9 mg/mL (a conta dá 1,875). O código usa 20 + 80 = 1 mg/mL. Se a
   bomba for montada a 1,9 mg/mL, como o §17 escreve, a vazão que a tela
   calcula (para 1 mg/mL) entrega quase o dobro da dose escolhida.
9. **Propofol em infusão, < 15 kg (`propofol_inf`).** HETRIN 1.1.7: 20 mL +
   20 mL = 5 mg/mL. PedGuide v4 e HETRIN 1.2.0: 20 mL puro = 10 mg/mL. O §17 traz
   as duas ("Propofol 2% 50 + 50 = 10 mg/mL" e "Propofol 20 mL + 20 mL = 5 mg/mL").
   Em > 40 kg o §17 dilui propofol 2% (50 + 50) e o código usa propofol 1% puro;
   a concentração final é a mesma (10 mg/mL).
10. **Vasopressina (`vasopressina`).** O §17 traz 1 + 49 mL (< 15 kg), 2 + 98 mL
    (15–40) e 3 + 147 mL (> 40), todas a 0,4 U/mL. O código usa 2 + 98 mL nas
    três faixas. O comentário no código registra que isso foi confirmado pelo
    Gustavo em 22/08/2026; falta só registrar aqui e corrigir o §17.
11. **Dexmedetomidina (`dexmedetomidina`, 15–40 e > 40 kg).** §17: 4 + 95 mL e
    8 + 190 mL; código: 4 + 96 mL e 8 + 192 mL (exatamente 4 mcg/mL). Mesma
    concentração na conta.
12. **Amiodarona em infusão (`amiodarona_inf`, 15–40 e > 40 kg).** O §17
    arredonda para 3 mg/mL; o código usa a conta exata (2970 e 3020 mcg/mL).
13. **Fentanil e midazolam em infusão (< 15 e 15–40 kg).** O §17 traz linhas
    alternativas (fentanil 13 e 14 mcg/mL; midazolam "10 + 30 / 1,3") que não
    existem no código.
14. **Glucagon (`glucagon-tox`): 0,8 × 0,08 mg/mL.** HETRIN 1.1.7 escreve 4 mg em
    50 mL como "0,8 mg/mL" e calcula o volume com esse número: o volume sai 10
    vezes menor (10 kg: 0,63 mL × 6,25 mL). O PedGuide v4 e o HETRIN 1.2.0
    corrigiram (commit `f6e64f1` do ANY). **A versão publicada (1.1.7) ainda tem o
    erro de fator 10.**
15. **Atropina em organofosforado (`atropina-tox`).** HETRIN 1.1.7: 0,02 mg/kg,
    teto de 2 mg na dose inicial. PedGuide v4 e HETRIN 1.2.0: faixa 0,02–0,05
    mg/kg, mínimo 0,1 mg, sem teto ("não há dose cumulativa máxima").
16. **Bicarbonato em intoxicação (`bicarbonato-tox`).** HETRIN 1.1.7: 1 mL/kg.
    PedGuide v4 e HETRIN 1.2.0: 1–2 mEq/kg, teto 250 mEq nas duas pontas.
17. **Emulsão lipídica (`emulsao-lipidica`).** As três dão bolus de 1,5 mL/kg
    até 100 mL. PedGuide v4 e HETRIN 1.2.0 acrescentam a infusão de 0,25
    mL/kg/min (mostrada em mL/h, sem teto: 750 mL/h a 50 kg) e "total sugerido
    até 12 mL/kg", que a conta não aplica.
18. **Insulina em alta dose (`insulina-tox`).** HETRIN 1.1.7: infusão 1 UI/kg/h.
    PedGuide v4 e HETRIN 1.2.0: 0,5–1 UI/kg/h.
19. **Salbutamol (`salbutamol-anaf`, `salbutamol-resp`).** HETRIN 1.1.7: 1 jato a
    cada 2 kg, até 10. PedGuide v4 e HETRIN 1.2.0: 4–10 jatos fixos.
20. **Ipratrópio (`ipratropio-mdi`, `ipratropio-gotas`).** HETRIN 1.1.7: 2–4
    jatos; 20–40 gotas. PedGuide v4 e HETRIN 1.2.0: 4 jatos; nebulização 0,25 mg
    abaixo de 20 kg e 0,5 mg a partir de 20 kg.
21. **Prednisolona (`prednisolona`).** HETRIN 1.1.7: 2 mg/kg. PedGuide v4 e
    HETRIN 1.2.0: 1–2 mg/kg, calcula a 2 mg/kg. Mesmo número na conta.
22. **Anti-histamínicos por idade (`loratadina`, `cetirizina`).** HETRIN 1.1.7:
    loratadina só pelo peso (até 30 kg, 5 mg) e mostra o volume; cetirizina a
    partir de 6 meses (2,5 mg abaixo de 2 anos). PedGuide v4 e HETRIN 1.2.0:
    loratadina 5 mg de 2 a 5 anos **ou** até 30 kg; cetirizina só a partir de 2
    anos.
23. **Selos "não rotineiro" (5 drogas) e alerta neonatal.** PedGuide v4 e HETRIN
    1.2.0 marcam como não rotineiros bicarbonato e gluconato e cloreto de cálcio
    na PCR, hidrocortisona e difenidramina na anafilaxia, e mostram o alerta
    "Neonato — seguir protocolo específico de reanimação neonatal" abaixo de 3
    kg. O HETRIN 1.1.7 não tem nenhum dos dois.

Também sem efeito na conta, mas para registro: a cetamina de indução tem dois
textos ("pode preservar ventilação espontânea sem BNM; após bloqueio
neuromuscular, o paciente estará apneico" no v4 × "mantém VA e drive
respiratório" nos dois HETRIN). O texto do HETRIN pode passar segurança
indevida após o BNM.

## Tabela 1 — Drogas em bolus (65 ids, PedGuide v4 como base)

| id | Droga | Dose/kg | Teto | Concentração | Diluição / volume | Selos | Diverge? | HETRIN 1.1.7 (onde difere) | HETRIN 1.2.0 (onde difere) | §17 | Decisão do Gustavo |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **PCR** | | | | | | | | | | | |
| `epinefrina-iv` | EPINEFRINA IV/IO | 0,01 mg/kg | 1,00 mg | 0,1 mg/mL — solução final (antiga 1:10.000) | da solução 0,1 mg/mL · preparo: Aspirar 1 mL de Epinefrina 1:1.000 (1 mg/mL) + Adicionar 9 mL de Água Destilada | — | ⚠ teto, concentração, diluição/volume | teto: sem teto no cálculo; concentração: 1 mg/mL (1:1.000); diluição/volume: da sol. 1:10.000 · preparo: Aspirar 1 mL de Epinefrina 1:1.000 (1 mg/mL) + Adicionar 9 mL de Água Destilada | = | não cobre | |
| `amiodarona` | AMIODARONA | 5 mg/kg | 300 mg | 50 mg/mL | — | — | — | = | = | não cobre | |
| `bicarbonato` | BICARBONATO DE SÓDIO 8,4% | 1 mEq/kg | 250 mEq | 1 mEq/mL | + igual vol. AD | não rotineiro | ⚠ selos | selos: — | = | não cobre | |
| `atropina` | ATROPINA | 0,02 mg/kg | 1,00 mg | 0,5 mg/mL | — | — | — | = | = | não cobre | |
| `calcio` | GLUCONATO DE CÁLCIO 10% | 60-100 mg/kg · calcula a 60 mg/kg (piso da faixa) | 2000 mg | 100 mg/mL | — | não rotineiro | ⚠ selos | selos: — | = | não cobre | |
| `cloreto-calcio` | CLORETO DE CÁLCIO 10% | 20 mg/kg | 1000 mg | 100 mg/mL | — | não rotineiro | ⚠ selos | selos: — | = | não cobre | |
| `lidocaina` | LIDOCAÍNA 1% | 1 mg/kg | 100 mg | 10 mg/mL | — | — | — | = | = | não cobre | |
| `insulina-hiperk` | INSULINA REGULAR (Hipercalemia) | 0,1 UI/kg | 10,0 UI | 100 UI/mL | em seringa de insulina, com glicose associada | — | — | = | = | não cobre | |
| `magnesio-pcr` | SULFATO DE MAGNÉSIO 10% | 50 mg/kg | 2000 mg | 100 mg/mL | — | — | — | = | = | não cobre | |
| `glicose-g10` | GLICOSE 10% | 0,5 g/kg | sem teto no cálculo | 100 mg/mL | 5 mL/kg EV/IO | — | ⚠ teto, concentração, diluição/volume, 10 kg | teto: 40 mL G50%; concentração: 500 mg/mL; diluição/volume: mL de G50% + mL de AD/SF; 10 kg: 10 mL G50% · 40 mL | = | não cobre | |
| `glicose-g25` | GLICOSE 25% | 0,5 g/kg | sem teto no cálculo | 250 mg/mL | 2 mL/kg EV/IO | — | ⚠ teto, concentração, diluição/volume, 10 kg | teto: 40 mL G50%; concentração: 500 mg/mL; diluição/volume: mL de G50% + mL de AD/SF (1:1); 10 kg: 10 mL G50% · 10 mL | = | não cobre | |
| **IOT/ISR** | | | | | | | | | | | |
| `cetamina` | CETAMINA | 1-2 mg/kg · calcula a 2 mg/kg (topo da faixa) | 100 mg | 50 mg/mL | — | — | só texto | só texto | só texto | não cobre | |
| `midazolam` | MIDAZOLAM | 0,1-0,3 mg/kg · calcula a 0,3 mg/kg | 10,0 mg | 5 mg/mL | — | — | ⚠ dose/kg, teto | dose/kg: 0,1-0,4 mg/kg · calcula a 0,3 mg/kg; teto: 5,0 mg | = | não cobre | |
| `fentanil` | FENTANIL | 1-2 mcg/kg · calcula a 2 mcg/kg (topo da faixa) | 100 mcg | 50 mcg/mL | — | — | — | = | = | não cobre | |
| `propofol` | PROPOFOL | 1-2,5 mg/kg · calcula a 2,5 mg/kg (topo da faixa) | 200 mg | 10 mg/mL | — | — | — | = | = | não cobre | |
| `etomidato` | ETOMIDATO | 0,2-0,4 mg/kg · calcula a 0,3 mg/kg | 20,0 mg | 2 mg/mL | — | — | — | = | = | não cobre | |
| `rocuronio` | ROCURÔNIO | 1,2 mg/kg | 100 mg | 10 mg/mL | — | — | ⚠ dose/kg, 10 kg | dose/kg: 0,9-1,2 mg/kg · calcula a 1 mg/kg; 10 kg: 10 mg · 1,0 mL | = | não cobre | |
| `succinil` | SUCCINILCOLINA | 1-2 mg/kg · calcula a 1,5 mg/kg | 100 mg | 10 mg/mL | — | — | só texto | só texto | = | não cobre | |
| `cisatracurio` | CISATRACÚRIO | 0,1-0,15 mg/kg · calcula a 0,15 mg/kg (topo da faixa) | sem teto no cálculo | 2 mg/mL | — | — | só texto | só texto | = | não cobre | |
| **Emergência** | | | | | | | | | | | |
| `epinefrina-im` | EPINEFRINA IM (Anafilaxia) | 0,01 mg/kg | 0,50 mg | 1 mg/mL - SEM DILUIR | — | — | só texto | só texto | = | não cobre | |
| `adenosina` | ADENOSINA | 0,1 - 0,2 mg/kg | 6,0 / 12,0 mg | 3 mg/mL | — | — | — | = | = | não cobre | |
| `glicose` | GLICOSE 10% | 0,5 g/kg | sem teto no cálculo | 100 mg/mL | 5 mL/kg EV/IO | — | ⚠ dose/kg, concentração, diluição/volume, 10 kg | dose/kg: 0,5-1 g/kg · calcula a 0,5 g/kg (piso da faixa); concentração: 500 mg/mL; diluição/volume: —; 10 kg: 5,0 g · 10 mL | = | não cobre | |
| `naloxona` | NALOXONA | 0,1 mg/kg | 2,00 mg | 0,4 mg/mL | — | — | — | = | = | não cobre | |
| `tranexamico` | ÁCIDO TRANEXÂMICO | 15 mg/kg | 1000 mg | 50 mg/mL | — | — | — | = | = | não cobre | |
| `hidrocortisona` | HIDROCORTISONA | 2-4 mg/kg · calcula a 4 mg/kg (topo da faixa) | 200 mg | 100 mg/2mL | — | não rotineiro | ⚠ selos | selos: — | = | não cobre | |
| `difenidramina` | DIFENIDRAMINA | 1-1,25 mg/kg · calcula a 1,25 mg/kg (topo da faixa) | 50 mg | 50 mg/mL | — | não rotineiro | ⚠ selos | selos: — | = | não cobre | |
| `salbutamol-anaf` | SALBUTAMOL MDI | 4-10 jatos | dose fixa | 100 mcg/jato | jatos com espaçador | — | ⚠ dose/kg, teto, 10 kg | dose/kg: 100 mcg/2 kg; teto: 10 jatos; 10 kg: 5 jatos · -- mL | = | não cobre | |
| `octreotide-hda` | OCTREOTIDE (HDA) | 1-2 mcg/kg | 50 / 50 mcg | 0,1 mg/mL | EV bolus | — | — | = | = | não cobre | |
| `omeprazol-hda` | OMEPRAZOL (HDA) | 1 mg/kg | 40 mg | 4 mg/mL (amp. 40 mg + 10 mL diluente) | — | — | — | = | = | não cobre | |
| **Anticonvulsivantes** | | | | | | | | | | | |
| `diazepam` | DIAZEPAM | 0,3 mg/kg | 5,0 mg | 5 mg/mL | — | — | — | = | = | não cobre | |
| `midazolam-conv` | MIDAZOLAM (Status) | 0,3 IM · 0,1 EV mg/kg | 10,0 / 5,0 mg | 5 mg/mL | IM / EV | — | — | = | = | não cobre | |
| `fenitoina` | FENITOINA | 20 mg/kg | 1500 mg | 50 mg/mL | — | — | — | = | = | não cobre | |
| `fenobarbital` | FENOBARBITAL | 20 mg/kg | 1000 mg | 100 mg/mL | — | — | — | = | = | não cobre | |
| `levetiracetam` | LEVETIRACETAM | 40-60 mg/kg · calcula a 60 mg/kg (topo da faixa) | 3000 mg | 100 mg/mL | — | — | — | = | = | não cobre | |
| **Neuro** | | | | | | | | | | | |
| `manitol` | MANITOL 20% | 0,25-1 g/kg · calcula a 0,5 g/kg | sem teto no cálculo | 200 mg/mL | — | — | — | = | = | não cobre | |
| `nacl` | NaCl 3% (Salina Hipertônica) | 2-5 mL/kg · calcula a 3 mL/kg | sem teto no cálculo | 0,513 mEq Na/mL | preparo: Aspirar 15 mL de NaCl 20% + Adicionar 85 mL de Água Destilada | — | — | = | = | não cobre | |
| **Analgesia/sedação** | | | | | | | | | | | |
| `cetamina-dor` | CETAMINA | 1 EV · 4 IM mg/kg | 100 / 200 mg | 50 mg/mL | EV / IM | — | — | = | = | não cobre | |
| `fentanil-dor` | FENTANIL | 1 EV · 1,5 IN mcg/kg | 100 / 100 mcg | 50 mcg/mL | EV / IN | — | — | = | = | não cobre | |
| `midazolam-dor` | MIDAZOLAM | 0,1 EV · 0,4 IN mg/kg | 5,0 / 10,0 mg | 5 mg/mL | EV / IN | — | — | = | = | não cobre | |
| `morfina-dor` | MORFINA | 0,1 mg/kg | 5,0 mg | 10 mg/mL | — | — | — | = | = | não cobre | |
| `propofol-dor` | PROPOFOL | 1 mg/kg | 100 mg | 10 mg/mL | — | — | — | = | = | não cobre | |
| **Respiratório** | | | | | | | | | | | |
| `salbutamol-resp` | SALBUTAMOL MDI | 4-10 jatos | dose fixa | 100 mcg/jato | jatos com espaçador | — | ⚠ dose/kg, teto, 10 kg | dose/kg: 100 mcg/2 kg; teto: 10 jatos; 10 kg: 5 jatos · -- mL | = | não cobre | |
| `ipratropio-mdi` | IPRATRÓPIO MDI | 80 mcg (4 jatos) | dose fixa | 20 mcg/jato | jatos com espaçador | — | ⚠ dose/kg, diluição/volume, 10 kg | dose/kg: 40-80 mcg; diluição/volume: jatos com espaçador, de 20/20 min; 10 kg: 2 - 4 jatos · -- mL | = | não cobre | |
| `ipratropio-gotas` | IPRATRÓPIO — nebulização | 0,25-0,5 mg | 0,50 mg | 0,25 mg/mL | menos de 20 kg — em nebulização | — | ⚠ teto, concentração, diluição/volume, 10 kg | teto: dose fixa; concentração: 0,25 mg/mL (1 mL = 20 gotas); diluição/volume: gotas em nebulização, de 20/20 min; 10 kg: 20 - 40 gotas · -- mL | = | não cobre | |
| `prednisolona` | PREDNISOLONA | 1-2 mg/kg · calcula a 2 mg/kg (topo da faixa) | 40 mg | 3 mg/mL | VO 1x/dia | — | ⚠ dose/kg | dose/kg: 2 mg/kg | = | não cobre | |
| `metilprednisolona` | METILPREDNISOLONA SUCCINATO | 1 mg/kg | 80 mg | -- | em 20-50 mL de SF, EV em 20 min | — | — | = | = | não cobre | |
| `magnesio10-resp` | SULFATO DE MAGNÉSIO 10% | 50 mg/kg | 2000 mg | 100 mg/mL | diluir em 50 mL de SF | — | — | = | = | não cobre | |
| `magnesio50-resp` | SULFATO DE MAGNÉSIO 50% | 50 mg/kg | 2000 mg | 500 mg/mL | completar até 50 mL de SF | — | — | = | = | não cobre | |
| **Anti-histamínicos** | | | | | | | | | | | |
| `loratadina` | LORATADINA | 5 mg ou 10 mg | por idade (sem dose/kg) | 1 mg/mL — xarope | VO 1x/dia | depende da idade | ⚠ dose/kg, concentração, 10 kg | dose/kg: por idade/peso; concentração: 1 mg/mL xarope; 10 kg: 5 mg · 5 mL | = | não cobre | |
| `cetirizina` | CETIRIZINA | 2,5-10 mg | por idade (sem dose/kg) | 1 mg/mL — solução oral | VO 1x/dia (2 a 5 anos) | depende da idade | ⚠ dose/kg, concentração, diluição/volume, 10 kg | dose/kg: por idade; concentração: VO; diluição/volume: VO; 10 kg: 5,0 mg · -- mL | = | não cobre | |
| **Tox/antídotos** | | | | | | | | | | | |
| `atropina-tox` | ATROPINA (organofosforados) | 0,02-0,05 mg/kg | sem teto no cálculo | 0,5 mg/mL | — | — | ⚠ dose/kg, teto, 10 kg | dose/kg: 0,02 mg/kg; teto: 2,00 mg; 10 kg: 0,20 mg · 0,40 mL | = | não cobre | |
| `bicarbonato-tox` | BICARBONATO DE SÓDIO 8,4% | 1-2 mEq/kg | 250 mEq | 1 mEq/mL | — | — | ⚠ dose/kg, teto, 10 kg | dose/kg: 1 mL/kg; teto: 250 mEq; 10 kg: 10 mEq · 10 mL | = | não cobre | |
| `emulsao-lipidica` | EMULSÃO LIPÍDICA 20% | 1,5 mL/kg | 100,0 mL | Pronta para uso | bolus mL / infusão mL/h (0,25 mL/kg/min) | — | ⚠ concentração, diluição/volume, 10 kg | concentração: --; diluição/volume: —; 10 kg: 15,0 mL · 15,0 mL | = | não cobre | |
| `glicose10-tox` | GLICOSE — suporte à insulina em alta dose | bolus 0,5-1 g/kg; 0,5 g/kg/h | 90 mL/h | G10% ou concentração ajustada ao acesso | mL/h EV | — | ⚠ dose/kg, concentração | dose/kg: manutenção; concentração: SG 10% 500 mL + NaCl 20% 20 mL | = | não cobre | |
| `glucagon-tox` | GLUCAGON (Betabloqueador/BCC) | 0,05 mg/kg | 10,00 mg | 1 mg/mL | da solução 0,08 mg/mL | — | ⚠ diluição/volume, 10 kg | diluição/volume: da solução 0,8 mg/mL; 10 kg: 0,50 mg · 0,63 mL | = | não cobre | |
| `gluconato-tox` | GLUCONATO DE CÁLCIO 10% | 60 mg/kg | 2000 mg | 100 mg/mL | — | — | — | = | = | não cobre | |
| `hidroxicobalamina` | HIDROXICOBALAMINA | 70 mg/kg | 5000 mg | 5 g/200 mL | — | — | — | = | = | não cobre | |
| `insulina-tox` | INSULINA EM ALTA DOSE (BB/BCC) | bolus 1 UI/kg; 0,5-1 UI/kg/h | sem teto no cálculo | 100 UI/mL | bolus UI / infusão mL/h | — | ⚠ dose/kg, 10 kg | dose/kg: 1 UI/kg; 10 kg: 10 UI · 10 mL | = | não cobre | |
| `naloxona-tox` | NALOXONA | 0,1 mg/kg | 0,40 - 2,00 mg | 0,4 mg/mL | — | — | só texto | só texto | = | não cobre | |
| `octreotide-tox` | OCTREOTIDE (Sulfonilureias) | 1-2 mcg/kg | 50 / 50 mcg | 0,1 mg/mL | — | — | — | = | = | não cobre | |
| `vitamina-k` | VITAMINA K | 0,03 mg/kg | 5,00 mg | 10 mg/mL | — | — | — | = | = | não cobre | |
| `nac-fase1` | N-ACETILCISTEÍNA — Fase 1 (1ª hora) | 150 mg/kg | 15000 mg | 100 mg/mL | diluir em 50 mL de SF | — | — | = | = | não cobre | |
| `nac-fase2` | N-ACETILCISTEÍNA — Fase 2 (4 h) | 50 mg/kg | 5000 mg | 100 mg/mL | diluir em 50 mL de SF | — | — | = | = | não cobre | |
| `nac-fase3` | N-ACETILCISTEÍNA — Fase 3 (16 h) | 100 mg/kg | 10000 mg | 100 mg/mL | diluir em 100 mL de SF | — | — | = | = | não cobre | |
| `nac-alternativo` | N-ACETILCISTEÍNA — Infusão única (alternativo) | 15 mg/kg/h | 1500 mg/h | 15 g + SF 350 mL (30 mg/mL) | mg/h = mL/h da solução 30 mg/mL | — | só texto | só texto | = | não cobre | |

## Tabela 2 — Infusões contínuas (16 ids × 3 faixas)

| id | Faixa | Droga | Dose (faixa) | Teto | Concentração | Diluição | Diverge? | HETRIN 1.1.7 (onde difere) | HETRIN 1.2.0 (onde difere) | §17 (CLAUDE.md) | Decisão do Gustavo |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `dobutamina` | < 15 kg | DOBUTAMINA | 2,5–20 mcg/kg/min (inicia em 5) | 20 mcg/kg/min (fim da faixa) | 1,8 mg/mL (1785) | 10 mL de 12,5 mg/mL + 60 mL = 70 mL | ⚠ §17 concentração | = | = | Dobutamina: 10 mL + 60 mL → 1800 mcg/mL (Peso x dose x 0,033) | |
| `dobutamina` | 15–40 kg | DOBUTAMINA | 2,5–20 mcg/kg/min (inicia em 5) | 20 mcg/kg/min (fim da faixa) | 1,8 mg/mL (1785) | 20 mL de 12,5 mg/mL + 120 mL = 140 mL | ⚠ §17 concentração | = | = | Dobutamina: 20 mL + 120 mL → 1800 mcg/mL (Peso x dose x 0,033) | |
| `dobutamina` | > 40 kg | DOBUTAMINA | 2,5–20 mcg/kg/min (inicia em 5) | 20 mcg/kg/min (fim da faixa) | 2,5 mg/mL (2500) | 50 mL de 12,5 mg/mL + 200 mL = 250 mL | — | = | = | Dobutamina: 50 mL + 200 mL → 2500 mcg/mL (Peso x dose x 0,025) | |
| `dopamina` | < 15 kg | DOPAMINA | 2–20 mcg/kg/min (inicia em 5) | 20 mcg/kg/min (fim da faixa) | 2,0 mg/mL (2000) | 20 mL de 5 mg/mL + 30 mL = 50 mL | — | = | = | Dopamina: 20 mL + 30 mL → 2000 mcg/mL (Peso x dose x 0,03) | |
| `dopamina` | 15–40 kg | DOPAMINA | 2–20 mcg/kg/min (inicia em 5) | 20 mcg/kg/min (fim da faixa) | 2,0 mg/mL (2000) | 40 mL de 5 mg/mL + 60 mL = 100 mL | — | = | = | Dopamina: 40 mL + 60 mL → 2000 mcg/mL (Peso x dose x 0,03) | |
| `dopamina` | > 40 kg | DOPAMINA | 2–20 mcg/kg/min (inicia em 5) | 20 mcg/kg/min (fim da faixa) | 2,0 mg/mL (2000) | 100 mL de 5 mg/mL + 150 mL = 250 mL | — | = | = | Dopamina: 100 mL + 150 mL → 2000 mcg/mL (Peso x dose x 0,03) | |
| `epinefrina_inf` | < 15 kg | EPINEFRINA | 0,01–1 mcg/kg/min (inicia em 0,1) | 1 mcg/kg/min (fim da faixa) | 32,3 mcg/mL (32,3) | 1 mL de 1 mg/mL + 30 mL = 31 mL | ⚠ §17 concentração | = | = | Epinefrina: 1 mL + 30 mL → 32,5 mcg/mL (Peso x dose x 2) / Epinefrina: 3 mL + 45 mL → 62,5 mcg/mL (Peso x dose) | |
| `epinefrina_inf` | 15–40 kg | EPINEFRINA | 0,01–1 mcg/kg/min (inicia em 0,1) | 1 mcg/kg/min (fim da faixa) | 32,3 mcg/mL (32,3) | 5 mL de 1 mg/mL + 150 mL = 155 mL | ⚠ §17 com linha a mais | = | = | Epinefrina: 5 mL + 150 mL → 32,3 mcg/mL (Peso x dose x 2) / Epinefrina: 6 mL + 90 mL → 62,5 mcg/mL (Peso x dose) | |
| `epinefrina_inf` | > 40 kg | EPINEFRINA | 0,01–1 mcg/kg/min (inicia em 0,1) | 1 mcg/kg/min (fim da faixa) | 29,1 mcg/mL (29,1) | 6 mL de 1 mg/mL + 200 mL = 206 mL | ⚠ §17 com linha a mais | = | = | Epinefrina: 6 mL + 200 mL → 29,1 mcg/mL (Peso x dose x 2) / Epinefrina: 10 mL + 150 mL → 62,5 mcg/mL (Peso x dose) | |
| `norepinefrina` | < 15 kg | NOREPINEFRINA | 0,05–2 mcg/kg/min (inicia em 0,1) | 2 mcg/kg/min (fim da faixa) | 62,5 mcg/mL (62,5) | 4 mL de 1 mg/mL + 60 mL = 64 mL · Diluir em SG 5% | — | = | = | Norepinefrina: 4 mL + 60 mL → 62,5 mcg/mL (Peso x dose; Diluir em SG 5%) | |
| `norepinefrina` | 15–40 kg | NOREPINEFRINA | 0,05–2 mcg/kg/min (inicia em 0,1) | 2 mcg/kg/min (fim da faixa) | 62,5 mcg/mL (62,5) | 8 mL de 1 mg/mL + 120 mL = 128 mL · Diluir em SG 5% | — | = | = | Norepinefrina: 8 mL + 120 mL → 62,5 mcg/mL (Peso x dose; Diluir em SG 5%) | |
| `norepinefrina` | > 40 kg | NOREPINEFRINA | 0,05–2 mcg/kg/min (inicia em 0,1) | 2 mcg/kg/min (fim da faixa) | 60 mcg/mL (60) | 16 mL de 1 mg/mL + 250 mL = 266 mL · Diluir em SG 5% | — | = | = | Norepinefrina: 16 mL + 250 mL → 60 mcg/mL (Peso x dose; Diluir em SG 5%) | |
| `vasopressina` | < 15 kg | VASOPRESSINA | 0,2–2 mU/kg/min (inicia em 0,5) | 2 mU/kg/min (fim da faixa) | 400 mU/mL (400) | 2 mL de 20 U/mL + 98 mL = 100 mL | ⚠ §17 diluição/volume | = | = | Vasopressina: 1 mL + 49 mL → 0,4 U/mL ((Peso x dose) / 0,4) | |
| `vasopressina` | 15–40 kg | VASOPRESSINA | 0,2–2 mU/kg/min (inicia em 0,5) | 2 mU/kg/min (fim da faixa) | 400 mU/mL (400) | 2 mL de 20 U/mL + 98 mL = 100 mL | — | = | = | Vasopressina: 2 mL + 98 mL → 0,4 U/mL ((Peso x dose) / 0,4) | |
| `vasopressina` | > 40 kg | VASOPRESSINA | 0,2–2 mU/kg/min (inicia em 0,5) | 2 mU/kg/min (fim da faixa) | 400 mU/mL (400) | 2 mL de 20 U/mL + 98 mL = 100 mL | ⚠ §17 diluição/volume | = | = | Vasopressina: 3 mL + 147 mL → 0,4 U/mL ((Peso x dose) / 0,4) | |
| `nitroprussiato` | < 15 kg | NITROPRUSSIATO | 0,5–10 mcg/kg/min (inicia em 1) | 10 mcg/kg/min (fim da faixa) | 610 mcg/mL (610) | 1 mL de 25 mg/mL + 40 mL = 41 mL · Diluir em SG 5%. Proteger da luz. | ⚠ concentração, §17 concentração | concentração: 600 mcg/mL (600) | = | Nitroprussiato: 1 mL + 40 mL → 0,6 mg/mL (Peso x dose / 10; Diluir em SG 5%) | |
| `nitroprussiato` | 15–40 kg | NITROPRUSSIATO | 0,5–10 mcg/kg/min (inicia em 1) | 10 mcg/kg/min (fim da faixa) | 610 mcg/mL (610) | 1 mL de 25 mg/mL + 40 mL = 41 mL · Diluir em SG 5%. Proteger da luz. | ⚠ concentração, §17 concentração | concentração: 600 mcg/mL (600) | = | Nitroprussiato: 1 mL + 40 mL → 0,6 mg/mL (Peso x dose / 10; Diluir em SG 5%) | |
| `nitroprussiato` | > 40 kg | NITROPRUSSIATO | 0,5–10 mcg/kg/min (inicia em 1) | 10 mcg/kg/min (fim da faixa) | 610 mcg/mL (610) | 2 mL de 25 mg/mL + 80 mL = 82 mL · Diluir em SG 5%. Proteger da luz. | ⚠ concentração, §17 concentração | concentração: 600 mcg/mL (600) | = | Nitroprussiato: 2 mL + 80 mL → 0,6 mg/mL (Peso x dose / 10; Diluir em SG 5%) | |
| `milrinona` | < 15 kg | MILRINONA | 0,25–0,75 mcg/kg/min (inicia em 0,5) | 0,75 mcg/kg/min (fim da faixa) | 200 mcg/mL (200) | 10 mL de 1 mg/mL + 40 mL = 50 mL | — | = | = | Milrinona: 10 mL + 40 mL → 200 mcg/mL (Peso x dose x 0,3) | |
| `milrinona` | 15–40 kg | MILRINONA | 0,25–0,75 mcg/kg/min (inicia em 0,5) | 0,75 mcg/kg/min (fim da faixa) | 200 mcg/mL (200) | 20 mL de 1 mg/mL + 80 mL = 100 mL | — | = | = | Milrinona: 20 mL + 80 mL → 200 mcg/mL (Peso x dose x 0,3) | |
| `milrinona` | > 40 kg | MILRINONA | 0,25–0,75 mcg/kg/min (inicia em 0,5) | 0,75 mcg/kg/min (fim da faixa) | 200 mcg/mL (200) | 30 mL de 1 mg/mL + 120 mL = 150 mL | — | = | = | Milrinona: 30 mL + 120 mL → 200 mcg/mL (Peso x dose x 0,3) | |
| `amiodarona_inf` | < 15 kg | AMIODARONA | 5–15 mcg/kg/min (inicia em 10) | 15 mcg/kg/min (fim da faixa) | 3,0 mg/mL (3000) | 3 mL de 50 mg/mL + 47 mL = 50 mL · Diluir em SG 5% | — | = | = | Amiodarona: 3 mL + 47 mL → 3 mg/mL (Peso x dose x 0,02; Diluir em SG 5%) | |
| `amiodarona_inf` | 15–40 kg | AMIODARONA | 5–15 mcg/kg/min (inicia em 10) | 15 mcg/kg/min (fim da faixa) | 3,0 mg/mL (2970) | 6 mL de 50 mg/mL + 95 mL = 101 mL · Diluir em SG 5% | ⚠ §17 concentração | = | = | Amiodarona: 6 mL + 95 mL → 3 mg/mL (Peso x dose x 0,02; Diluir em SG 5%) | |
| `amiodarona_inf` | > 40 kg | AMIODARONA | 5–15 mcg/kg/min (inicia em 10) | 15 mcg/kg/min (fim da faixa) | 3,0 mg/mL (3020) | 9 mL de 50 mg/mL + 140 mL = 149 mL · Diluir em SG 5% | ⚠ §17 concentração | = | = | Amiodarona: 9 mL + 140 mL → 3 mg/mL (Peso x dose x 0,02; Diluir em SG 5%) | |
| `fentanil_inf` | < 15 kg | FENTANIL | 0,5–4 mcg/kg/h (inicia em 1) | 4 mcg/kg/h (fim da faixa) | 10 mcg/mL (10) | 10 mL de 50 mcg/mL + 40 mL = 50 mL | ⚠ §17 com linha a mais | = | = | Fentanil: 10 mL + 40 mL → 10 mcg/mL (Peso x dose / 10) / Fentanil: 10 mL + 30 mL → 13 mcg/mL (Peso x dose / 13) | |
| `fentanil_inf` | 15–40 kg | FENTANIL | 0,5–4 mcg/kg/h (inicia em 1) | 4 mcg/kg/h (fim da faixa) | 10 mcg/mL (10) | 20 mL de 50 mcg/mL + 80 mL = 100 mL | ⚠ §17 com linha a mais | = | = | Fentanil: 20 mL + 80 mL → 10 mcg/mL (Peso x dose / 10) / Fentanil: 20 mL + 50 mL → 14 mcg/mL (Peso x dose / 14) | |
| `fentanil_inf` | > 40 kg | FENTANIL | 0,5–4 mcg/kg/h (inicia em 1) | 4 mcg/kg/h (fim da faixa) | 20 mcg/mL (20) | 60 mL de 50 mcg/mL + 90 mL = 150 mL | — | = | = | Fentanil: 60 mL + 90 mL → 20 mcg/mL (Peso x dose / 20) | |
| `midazolam_inf` | < 15 kg | MIDAZOLAM | 1–18 mcg/kg/min (inicia em 2) | 18 mcg/kg/min (fim da faixa) | 1,0 mg/mL (1000) | 10 mL de 5 mg/mL + 40 mL = 50 mL | ⚠ §17 com linha a mais | = | = | Midazolam: 10 mL + 40 mL → 1 mg/mL (Peso x dose) / Midazolam: 10 mL + 30 mL → 1 mg/mL (Peso x dose / 1,3) | |
| `midazolam_inf` | 15–40 kg | MIDAZOLAM | 1–18 mcg/kg/min (inicia em 2) | 18 mcg/kg/min (fim da faixa) | 1,0 mg/mL (1000) | 20 mL de 5 mg/mL + 80 mL = 100 mL | ⚠ §17 concentração | = | = | Midazolam: 20 mL + 80 mL → 1,9 mg/mL (Peso x dose) / Midazolam: 30 mL + 50 mL → 1,9 mg/mL (Peso x dose / 1,9) | |
| `midazolam_inf` | > 40 kg | MIDAZOLAM | 1–18 mcg/kg/min (inicia em 2) | 18 mcg/kg/min (fim da faixa) | 2,0 mg/mL (2000) | 60 mL de 5 mg/mL + 90 mL = 150 mL | — | = | = | Midazolam: 60 mL + 90 mL → 2 mg/mL (Peso x dose / 2,0) | |
| `cetamina_inf` | < 15 kg | CETAMINA | 5–40 mcg/kg/min (inicia em 10) | 40 mcg/kg/min (fim da faixa) | 5,0 mg/mL (5000) | 6 mL de 50 mg/mL + 54 mL = 60 mL | — | = | = | Ketamina: 6 mL + 54 mL → 5 mg/mL (Peso x dose x 0,012) | |
| `cetamina_inf` | 15–40 kg | CETAMINA | 5–40 mcg/kg/min (inicia em 10) | 40 mcg/kg/min (fim da faixa) | 5,0 mg/mL (5000) | 6 mL de 50 mg/mL + 54 mL = 60 mL | — | = | = | Ketamina: 6 mL + 54 mL → 5 mg/mL (Peso x dose x 0,012) | |
| `cetamina_inf` | > 40 kg | CETAMINA | 5–40 mcg/kg/min (inicia em 10) | 40 mcg/kg/min (fim da faixa) | 5,0 mg/mL (5000) | 20 mL de 50 mg/mL + 180 mL = 200 mL | — | = | = | Ketamina: 20 mL + 180 mL → 5 mg/mL (Peso x dose x 0,012) | |
| `dexmedetomidina` | < 15 kg | DEXMEDETOMIDINA | 0,2–1,4 mcg/kg/h (inicia em 0,5) | 1,4 mcg/kg/h (fim da faixa) | 4 mcg/mL (4) | 2 mL de 100 mcg/mL + 48 mL = 50 mL | — | = | = | Dexmedetomidina: 2 mL + 48 mL → 4 mcg/mL (Peso x dose / 4) | |
| `dexmedetomidina` | 15–40 kg | DEXMEDETOMIDINA | 0,2–1,4 mcg/kg/h (inicia em 0,5) | 1,4 mcg/kg/h (fim da faixa) | 4 mcg/mL (4) | 4 mL de 100 mcg/mL + 96 mL = 100 mL | ⚠ §17 diluição/volume | = | = | Dexmedetomidina: 4 mL + 95 mL → 4 mcg/mL (Peso x dose / 4) | |
| `dexmedetomidina` | > 40 kg | DEXMEDETOMIDINA | 0,2–1,4 mcg/kg/h (inicia em 0,5) | 1,4 mcg/kg/h (fim da faixa) | 4 mcg/mL (4) | 8 mL de 100 mcg/mL + 192 mL = 200 mL | ⚠ §17 diluição/volume | = | = | Dexmedetomidina: 8 mL + 190 mL → 4 mcg/mL (Peso x dose / 4) | |
| `morfina` | < 15 kg | MORFINA | 10–40 mcg/kg/h (inicia em 20) | 40 mcg/kg/h (fim da faixa) | 200 mcg/mL (200) | 1 mL de 10 mg/mL + 49 mL = 50 mL | — | = | = | Morfina: 1 mL + 49 mL → 0,2 mg/mL (Peso x dose / 200) | |
| `morfina` | 15–40 kg | MORFINA | 10–40 mcg/kg/h (inicia em 20) | 40 mcg/kg/h (fim da faixa) | 200 mcg/mL (200) | 2 mL de 10 mg/mL + 98 mL = 100 mL | — | = | = | Morfina: 2 mL + 98 mL → 0,2 mg/mL (Peso x dose / 200) | |
| `morfina` | > 40 kg | MORFINA | 10–40 mcg/kg/h (inicia em 20) | 40 mcg/kg/h (fim da faixa) | 400 mcg/mL (400) | 4 mL de 10 mg/mL + 96 mL = 100 mL | — | = | = | Morfina: 4 mL + 96 mL → 0,4 mg/mL (Peso x dose / 400) | |
| `propofol_inf` | < 15 kg | PROPOFOL 1% | 1–4 mg/kg/h (inicia em 2) | 4 mg/kg/h (fim da faixa) | 10 mg/mL (10) | 20 mL de 10 mg/mL + 0 mL = 20 mL · Não usar em crianças para sedação prolongada | ⚠ concentração, diluição/volume, §17 diluição/volume | concentração: 5 mg/mL (5); diluição/volume: 20 mL de 10 mg/mL + 20 mL = 40 mL · Não usar em crianças para sedação prolongada | = | Propofol 2% (50 mL): 50 mL + 50 mL → 10 mg/mL (Peso x dose / 10) / Propofol (20 mL): 20 mL + 20 mL → 5 mg/mL (Peso x dose / 5) | |
| `propofol_inf` | 15–40 kg | PROPOFOL 1% | 1–4 mg/kg/h (inicia em 2) | 4 mg/kg/h (fim da faixa) | 10 mg/mL (10) | 50 mL de 10 mg/mL + 0 mL = 50 mL · Não usar em crianças para sedação prolongada | — | = | = | Propofol 2% (50 mL): 50 mL + 0 mL → 10 mg/mL (Peso x dose / 10) | |
| `propofol_inf` | > 40 kg | PROPOFOL 1% | 1–4 mg/kg/h (inicia em 2) | 4 mg/kg/h (fim da faixa) | 10 mg/mL (10) | 50 mL de 10 mg/mL + 0 mL = 50 mL · Não usar em crianças para sedação prolongada | ⚠ §17 diluição/volume | = | = | Propofol 2% (50 mL): 50 mL + 50 mL → 10 mg/mL (Peso x dose / 10) | |
| `rocuronio_inf` | < 15 kg | ROCURONIO | 5–15 mcg/kg/min (inicia em 10) | 15 mcg/kg/min (fim da faixa) | 2,0 mg/mL (2000) | 10 mL de 10 mg/mL + 40 mL = 50 mL | — | = | = | Rocurônio: 10 mL + 40 mL → 2 mg/mL (Peso x dose x 0,03) | |
| `rocuronio_inf` | 15–40 kg | ROCURONIO | 5–15 mcg/kg/min (inicia em 10) | 15 mcg/kg/min (fim da faixa) | 2,0 mg/mL (2000) | 20 mL de 10 mg/mL + 80 mL = 100 mL | — | = | = | Rocurônio: 20 mL + 80 mL → 2 mg/mL (Peso x dose x 0,03) | |
| `rocuronio_inf` | > 40 kg | ROCURONIO | 5–15 mcg/kg/min (inicia em 10) | 15 mcg/kg/min (fim da faixa) | 2,0 mg/mL (2000) | 50 mL de 10 mg/mL + 200 mL = 250 mL | — | = | = | Rocurônio: 50 mL + 200 mL → 2 mg/mL (Peso x dose x 0,03) | |
| `cisatracurio_inf` | < 15 kg | CISATRACURIO | 1–4 mcg/kg/min (inicia em 2) | 4 mcg/kg/min (fim da faixa) | 400 mcg/mL (400) | 10 mL de 2 mg/mL + 40 mL = 50 mL | — | = | = | Cisatracúrio: 10 mL + 40 mL → 0,4 mg/mL (Peso x dose x 0,15) | |
| `cisatracurio_inf` | 15–40 kg | CISATRACURIO | 1–4 mcg/kg/min (inicia em 2) | 4 mcg/kg/min (fim da faixa) | 400 mcg/mL (400) | 15 mL de 2 mg/mL + 60 mL = 75 mL | — | = | = | Cisatracúrio: 15 mL + 60 mL → 0,4 mg/mL (Peso x dose x 0,15) | |
| `cisatracurio_inf` | > 40 kg | CISATRACURIO | 1–4 mcg/kg/min (inicia em 2) | 4 mcg/kg/min (fim da faixa) | 400 mcg/mL (400) | 50 mL de 2 mg/mL + 200 mL = 250 mL | — | = | = | Cisatracúrio: 50 mL + 200 mL → 0,4 mg/mL (Peso x dose x 0,15) | |

## Tabela 3 — Outros itens pediátricos que entram na fonte única

Não são dose de droga, mas mudam o que a tela mostra e precisam da mesma
decisão. Estão também no CSV, como `tabela=outro`.

| id | Item | PedGuide v4 | HETRIN 1.1.7 | HETRIN 1.2.0 | Como o Copiloto está hoje | Decisão do Gustavo |
| --- | --- | --- | --- | --- | --- | --- |
| `alerta-neonatal` | Alerta neonatal | Peso > 0 e < 3 kg: "Neonato — seguir protocolo específico de reanimação neonatal". | Ausente. | = PedGuide v4. | Como o v4, em linguagem de sugestão ("considere o protocolo específico de reanimação neonatal"). | |
| `peso-por-comprimento` | Peso pelo comprimento | Comprimento de 46 a 145 cm escolhe a cor Broselow; o peso é o da cor, marcado "estimado pela cor Broselow". | Tabela de 29 faixas, 40 a 160 cm (arredonda o cm). O peso entra como "FONTE", sem a marca de estimado. | = HETRIN 1.1.7. | Tabela de 29 faixas do HETRIN, marcado como estimado (CC-320). A cor Broselow vem do peso estimado. | |
| `peso-por-idade` | Peso pela idade (APLS/Luscombe) | Não estima: a idade não define dose. | Abaixo de 1 ano (meses ÷ 2) + 4; de 1 a 5 anos 2 × idade + 8; acima de 5 anos 3 × idade + 7. Arredonda e limita a 0,5–50 kg. Marcado ESTIMADO; só vale sem peso digitado nem cor escolhida. | = HETRIN 1.1.7. | Como o HETRIN, marcado como estimado. Prioridade: peso aferido, depois cor escolhida, comprimento e idade. | |
| `idade-pela-cor` | Idade estimada pela cor Broselow | Só a da cor escolhida (meses ÷ 12). | A da cor atual, inclusive a que vem do peso aferido, arredondada a 1 casa. | = HETRIN 1.1.7. | Como o v4. | |
| `desfibrilacao` | Desfibrilação e cardioversão | 2 J/kg, 4 J/kg; cardioversão 0,5–1 J/kg, refratária 2 J/kg. Sem teto. | Os mesmos, com teto de 200 J (não atua até 50 kg) e mais "subsequentes 4–10 J/kg, sem passar de 200 J". | = HETRIN 1.1.7. | Como o v4. | |
| `fluidos` | Bolus de cristaloide | 20 mL/kg, sem teto. | 20 mL/kg até 1000 mL (não atua até 50 kg) e mais "bolus cauteloso" de 10 mL/kg até 500 mL. | = HETRIN 1.1.7. | Como o v4. | |
| `crioprecipitado` | Crioprecipitado | 5–10 mL/kg. | 5–10 mL/kg e "≈ 1 U a cada 10 kg". | = HETRIN 1.1.7. | Como o v4. | |
| `cenarios` | Cenários | 7: anafilaxia, status epilepticus, IOT/ISR, choque, choque cardiogênico, pós-PCR/arritmia, sedação pós-IOT. | 9: os 7 e mais crise asmática e intoxicação. | = HETRIN 1.1.7. | Como o v4 (7 cenários). | |
| `cenario-anafilaxia` | Drogas do cenário anafilaxia | Epinefrina IM, hidrocortisona, difenidramina. | As 3 e mais salbutamol, loratadina e cetirizina. | = HETRIN 1.1.7. | Como o v4. | |
| `cenario-isr` | Drogas do cenário IOT/ISR | Cetamina, midazolam, fentanil, rocurônio. | As 8 drogas de IOT (mais propofol, etomidato, succinilcolina, cisatracúrio). | = HETRIN 1.1.7. | Como o v4. | |
| `acessos-drenos` | Acessos e drenos por peso e idade | Ausente. | Cateter venoso central, dreno de tórax, jelco de descompressão, jelco de PA invasiva e sonda vesical, por peso e idade. | = HETRIN 1.1.7. | Como o HETRIN (CC-320), com a origem na tela. | |

## Como a decisão entra no Copiloto

1. A tabela assinada vira o dado de `src/shared/clinical-tools/pediatrics/`
   (`bolus-drugs.ts` e `infusions.ts`). Hoje o dado traz
   `review: { status: 'pendente' }` e a origem "PedGuide v4".
2. Com a assinatura, o dado muda conforme a coluna de decisão, a revisão passa
   para `revisado` com nome, CRM e data, e a versão do conteúdo sobe para
   `2.0.0`. O aviso "Doses aguardando assinatura da fonte única (CC-321)" sai
   sozinho, porque a tela só o mostra enquanto a revisão está pendente.
3. Os testes diferenciais passam a comparar o motor com a tabela assinada
   (este CSV, com a coluna de decisão preenchida) em vez do PedGuide congelado:
   meta de zero divergência entre fonte e motor.
4. Cada linha em que a decisão se afasta do PedGuide v4 fica registrada com o
   motivo na coluna "motivo" do CSV.

## Assinatura

Declaro que revisei as linhas acima e que a coluna "Decisão do Gustavo" é a
fonte canônica das doses pediátricas do Copiloto Clínico.

- Nome: ______________________________
- CRM: _______________________________
- Data: ______________________________
- Versão da fonte resultante: `2.0.0`
- Linhas com decisão diferente do PedGuide v4 (quantidade): ______
