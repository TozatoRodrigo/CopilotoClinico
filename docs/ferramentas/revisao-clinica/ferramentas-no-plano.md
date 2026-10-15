# Revisão clínica — Ferramenta certa no plano do Copiloto (CC-332)

Mapeamento "caso → ferramenta" que o plano usa para sugerir uma calculadora ou
um roteiro já preenchido com o caso, para a revisão do **Dr. Ripardo**.

**Como funciona.** Nada de IA: regras fixas do motor
(`src/shared/clinical-tools/case-suggestions.ts`) leem o entendimento do caso
(síndrome de PS, sinais vitais, idade, achados, hipóteses) e as condutas do
plano. Há dois tipos de regra:

- **Regras de dado**: valem em qualquer síndrome e vêm primeiro, nesta ordem
  de prioridade.
- **Decisão por síndrome**: toda síndrome do catálogo de PS tem uma
  (ferramenta ou "nenhuma, e por quê"); o código não compila sem ela.

O plano mostra no máximo 3 sugestões, sem repetir ferramenta. Ferramenta de
adulto não aparece para criança (idade < 18 anos) e a Pediatria não aparece
para adulto; idade não informada conta como adulto.

Versão atual do mapeamento: **1.0.0** (`CASE_TOOL_MAPPING_PROVENANCE`), revisão
**pendente**. Cada mudança decidida aqui sobe a versão e o teste
`case-suggestions.spec.ts` registra o novo comportamento.

Na tabela, "hipóteses" são as hipóteses graves e prováveis do entendimento; a
menção negada na mesma frase ("sem hipotensão", "nega febre") não conta.

## 1. Regras de dado (qualquer síndrome)

| #   | Quando                                                                                                                                                                                                                                                     | Ferramenta                         | Público | Pergunta para o revisor                                                                                                 |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------- |
| 1.1 | Achados ou instabilidade com parada (PCR, assistolia, AESP, FV, TV sem pulso, RCP, RCE). "PCR" sozinho não conta (proteína C-reativa)                                                                                                                      | ACLS                               | Adulto  | Sugerir ACLS também no pós-RCE (cuidados pós-parada)?                                                                   |
| 1.2 | Idade < 18 anos                                                                                                                                                                                                                                            | Emergência pediátrica              | Criança | O corte de 18 anos (teto da Pediatria) serve? Adolescente com ≥ 40 kg deveria receber as ferramentas de adulto?         |
| 1.3 | Plano ou achados com IOT, intubação, sequência rápida, via aérea definitiva (paciente ainda não intubado)                                                                                                                                                  | Intubação e via aérea difícil      | Adulto  | Sugerir quando a IOT aparece só como conduta condicional ("se piorar, IOT")?                                            |
| 1.4 | Achados com paciente intubado ou em ventilação mecânica                                                                                                                                                                                                    | Ventilação mecânica                | Adulto  | Confirmar.                                                                                                              |
| 1.5 | Sepse (síndrome febre com hipotensão, ou sepse nas hipóteses/achados) **e** hipotensão (PAS < 90, PAM < 65, síndrome de choque, ou "hipotensão"/"choque" nos achados)                                                                                      | Choque séptico (ANDROMEDA-SHOCK 2) | Adulto  | Os cortes de PAS < 90 e PAM < 65 servem como "sepse com hipotensão"? Incluir lactato ≥ 4 mmol/L quando o caso trouxer?  |
| 1.6 | TEP nas hipóteses                                                                                                                                                                                                                                          | TEP (Wells → PERC → D-dímero)      | Adulto  | Basta o TEP estar entre as hipóteses graves, ou só quando estiver entre as prováveis?                                   |
| 1.7 | Plano cita noradrenalina, vasopressina, dobutamina, dopamina, milrinona, nitroglicerina ou nitroprussiato (abre na droga), ou "droga vasoativa"/"DVA"/"vasopressor" (abre a lista de vasopressores). Adrenalina fica de fora (no PS aparece mais em bolus) | Infusões contínuas                 | Adulto  | Confirmar a exclusão da adrenalina. Incluir sedação contínua (midazolam, fentanil, propofol) quando o plano for de IOT? |
| 1.8 | CAD, cetoacidose, EHH ou estado hiperosmolar nas hipóteses ou nos achados                                                                                                                                                                                  | CAD e EHH                          | Adulto  | Confirmar.                                                                                                              |
| 1.9 | Dengue ou arbovirose nas hipóteses ou nos achados                                                                                                                                                                                                          | Dengue                             | Adulto  | O roteiro de dengue usa peso adulto (40–200 kg). Para criança, a Pediatria entra pela idade: basta?                     |

## 2. Decisão por síndrome de PS

| Síndrome                    | Decisão                                                                                                                  | Pergunta para o revisor                                                              |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| agitação psicomotora        | Sedação procedimental e agitação (manejo do agitado)                                                                     | Confirmar.                                                                           |
| cefaleia                    | Regra de Ottawa para HSA, quando a HSA está nas hipóteses                                                                | Sugerir sempre que a cefaleia for súbita, mesmo sem HSA nas hipóteses?               |
| choque                      | Choque indiferenciado (VNERi, gap CO₂, VTI), quando não há sinal de sepse; com sepse, a regra 1.5 leva ao Choque séptico | Confirmar.                                                                           |
| crise convulsiva            | Nenhuma no adulto (não há roteiro adulto de estado de mal no ANY)                                                        | Faz falta um roteiro adulto de estado de mal?                                        |
| déficit neurológico focal   | NIHSS                                                                                                                    | Confirmar.                                                                           |
| diarreia e vômitos          | Nenhuma                                                                                                                  | Confirmar.                                                                           |
| distúrbio glicêmico         | CAD e EHH quando glicemia ≥ 200 mg/dL (critério D do próprio roteiro); hipoglicemia, nenhuma                             | O corte de 200 serve, ou 250 (o mais usado na prática)?                              |
| dispneia                    | Nenhuma pela síndrome (TEP, IOT e VM entram pelas regras de dado)                                                        | Sugerir algo para SDRA/IRpA (ROX, HACOR em Ventilação)?                              |
| dor abdominal               | Escore de Alvarado, quando apendicite está nas hipóteses                                                                 | Confirmar.                                                                           |
| dor lombar ou no flanco     | Nenhuma                                                                                                                  | Confirmar.                                                                           |
| dor torácica                | HEART quando SCA nas hipóteses; ADD-RS quando dissecção de aorta nas hipóteses                                           | Confirmar os dois. TEP entra pela regra 1.6.                                         |
| febre                       | Nenhuma pela síndrome (sepse com hipotensão e dengue entram pelas regras de dado)                                        | Sugerir qSOFA/NEWS2 na febre sem hipotensão?                                         |
| febre com hipotensão        | Choque séptico                                                                                                           | Confirmar.                                                                           |
| infecção respiratória       | CURB-65, quando pneumonia/PAC está nas hipóteses ou nos achados                                                          | Confirmar.                                                                           |
| intoxicação                 | Intoxicações e antídotos (adulto e criança)                                                                              | Confirmar.                                                                           |
| pele e partes moles         | Nenhuma                                                                                                                  | Confirmar.                                                                           |
| pressão arterial elevada    | Nenhuma (vasodilatador em infusão no plano entra pela regra 1.7)                                                         | Confirmar.                                                                           |
| reação alérgica             | Nenhuma no adulto (adrenalina IM sem cálculo); criança: Pediatria (cenário de anafilaxia) pela idade                     | Confirmar.                                                                           |
| rebaixamento de consciência | Escala de Coma de Glasgow                                                                                                | Confirmar. O FOUR (paciente intubado) faria mais sentido em algum caso?              |
| sintomas urinários          | Nenhuma                                                                                                                  | Confirmar.                                                                           |
| vertigem                    | HINTS+                                                                                                                   | Sugerir sempre, ou só na síndrome vestibular aguda (vertigem contínua com nistagmo)? |
| outro                       | Nenhuma pela síndrome (só as regras de dado)                                                                             | Confirmar.                                                                           |

## 3. Preenchimento com o caso

O que o caso preenche (`src/shared/clinical-tools/case-prefill.ts`). Todo campo
preenchido aparece "vindo do caso" até o médico trocar. O preenchimento nunca
fecha um escore nem avança um roteiro sozinho.

| #    | Ferramenta                    | Preenche                                                                                                                                                                                                           | Pergunta para o revisor                                                                                       |
| ---- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| 3.1  | Roteiros adultos              | Peso, quando o texto diz o peso ("peso 70 kg", "pesando 72,5 kg") e ele cabe em 40–200 kg. Dois pesos diferentes no texto: nenhum. Abrir pelo caso sem peso **apaga** o peso que estava na aba (de outro paciente) | Confirmar que apagar é o certo (o médico redigita o peso do mesmo paciente se tinha digitado antes).          |
| 3.2  | Pediatria                     | Peso aferido (0,5–50 kg) e idade                                                                                                                                                                                   | Confirmar.                                                                                                    |
| 3.3  | PERC (calculadora e no TEP)   | Idade ≥ 50, FC ≥ 100 (Sim ou Não); SpO₂ < 95% **só Sim**                                                                                                                                                           | O Não da SpO₂ exigiria saber que a medida foi em ar ambiente, e um PERC negativo afasta TEP. Manter só o Sim? |
| 3.4  | Wells TEP (no roteiro de TEP) | FC > 100 (Sim ou Não)                                                                                                                                                                                              | Confirmar.                                                                                                    |
| 3.5  | CURB-65                       | FR ≥ 30, idade ≥ 65 (Sim ou Não); PA: Sim com PAS < 90 ou PAD ≤ 60; Não só com as duas pressões conhecidas e normais                                                                                               | Confirmar.                                                                                                    |
| 3.6  | HEART                         | Faixa de idade (< 45, 45–64, ≥ 65)                                                                                                                                                                                 | Confirmar.                                                                                                    |
| 3.7  | Ottawa HSA                    | Idade ≥ 40 (Sim ou Não)                                                                                                                                                                                            | Confirmar.                                                                                                    |
| 3.8  | Alvarado                      | Temperatura ≥ 37,3 °C (Sim ou Não)                                                                                                                                                                                 | A temperatura do caso é a da chegada; febre referida antes da chegada fica de fora. Serve?                    |
| 3.9  | Índice de choque              | FC e PAS                                                                                                                                                                                                           | Confirmar.                                                                                                    |
| 3.10 | NIHSS, GCS, HINTS+, ADD-RS    | Nada (exame à beira do leito)                                                                                                                                                                                      | Confirmar.                                                                                                    |
