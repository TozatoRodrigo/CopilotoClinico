# Revisão clínica — Tromboembolismo pulmonar (CC-318)

Achados do porte do TepGuide do ANY App (`v2/src/pages/TepGuide.tsx`, branch
v4, revisão `95c8fba`) para a revisão clínica do CC-310, a cargo do Dr.
Gustavo Moreira.

**Regra do porte (ADR-017):** o roteiro, as 12 categorias, as nove
calculadoras, as doses e os limiares ficaram **iguais ao ANY**. O teste
diferencial (`tests/clinical-tools/tep-differential.spec.ts`) roda o próprio
TepGuide congelado, toca em cada botão e compara: todos os caminhos de Q1–Q4 e
do instável chegam à mesma categoria e ao mesmo quadro de conduta; cada
calculadora dá o mesmo valor, faixa e tom em todas as combinações e em 1.000
valores aleatórios; e nenhum trecho de texto clínico do ANY ficou de fora.
Nada abaixo foi corrigido no código: cada item espera uma decisão.

Toda mudança decidida aqui sobe a versão do conteúdo (`TEP_PROVENANCE.version`
em `src/shared/clinical-tools/tep/provenance.ts`) e atualiza o teste
diferencial, que passa a declarar a diferença de propósito.

## 1. Qual diretriz o TEP segue (decisão principal)

| Onde | O que o ANY diz | Por que parece problema | Opções |
| --- | --- | --- | --- |
| Topo da tela (`Header`) e passo 3 | "Tromboembolismo pulmonar agudo — AHA/ACC 2026"; "Classificação AHA/ACC" | — | — |
| Rodapé (`Footer` → `data/guidelines.ts`) | "Baseado em: ESC Guidelines on PE, 2019 (2019)" | O conteúdo segue a AHA/ACC: categorias A–E com modificador R e classes de recomendação "COR 1/2a/2b/3" são notação da AHA/ACC. A ESC 2019 usa classes I/IIa/IIb/III e estratifica em baixo, intermediário-baixo, intermediário-alto e alto risco, que o roteiro não usa. Topo e rodapé citam diretrizes diferentes. | (a) citar só a diretriz AHA/ACC de TEP agudo (referência completa a confirmar) e tirar a ESC 2019; (b) citar as duas e dizer o que vem de cada uma; (c) outra. |

**No Copiloto, até a decisão:** a tela não cita diretriz nenhuma; mostra só a
procedência ("ANY App v4 · TepGuide.tsx (95c8fba) · versão 1.0.0 · revisão
clínica pendente"). O passo 3 continua "Classificação AHA/ACC", como no ANY, e
o texto do prontuário diz "classificação AHA/ACC", sem ano.

## 2. Conteúdo clínico (decisão do revisor)

| # | Onde | O que o ANY diz | Por que parece problema | Opções |
| --- | --- | --- | --- | --- |
| 2.1 | Trombólise: pergunta do instável × referência rápida | Instável: contraindicação absoluta = "AVC hemorrágico, cirurgia SNC **< 3 semanas**, sangramento ativo não compressível, lesão estrutural SNC". Referência: "Cirurgia intracraniana ou espinhal **< 3 meses**", mais AVC isquêmico < 3 meses, trauma craniano < 3 meses, neoplasia intracraniana, diátese hemorrágica. | A pergunta que decide a trombólise no instável usa um prazo diferente da lista completa e omite itens dela. | Alinhar a pergunta com a lista (ou citar a lista inteira na pergunta). |
| 2.2 | Red flags de deterioração (C2 em diante) | "Queda de PAS < 90 mmHg ou MAP < 80 mmHg" | PAM < 80 não é limiar usual de hipotensão/choque (PAM < 65; ou PAS < 90 / queda ≥ 40 mmHg). | Confirmar; ou trocar por PAM < 65 / queda de PAS ≥ 40 mmHg. |
| 2.3 | Paciente instável → E2, E1 ou D | O ANY marca o modificador R sempre (`classifyUnstable` → `hasModR = true`): "E1R", "DR", "E2R", sem perguntar. | O R descreve hipoxemia/taquipneia/O₂; no instável ele é presumido, não avaliado. | (a) perguntar o R também no instável; (b) manter R presumido e dizer isso na tela; (c) tirar o R no instável. |
| 2.4 | Modificador R em todas as categorias | Com ou sem R, a conduta é idêntica: o R só muda o rótulo. | Confirmar se é intencional (ex.: R deveria pesar no destino ou na monitorização). | Confirmar; ou definir o que muda com R. |
| 2.5 | Hestia (baixo risco) | O Hestia é perguntado, mas não muda a categoria (B1/B2) e não aparece no passo 4. B2 diz "Alta (se Hestia neg.) / Observação". | O médico responde o Hestia e não vê o resultado onde decide o destino. No Copiloto o Hestia entra no texto do prontuário. | (a) mostrar o Hestia no quadro de destino; (b) destino de B2 pelo Hestia (negativo → alta; positivo → internação). |
| 2.6 | Categoria D (instável) | "Hipotensão transitória / sinais de hipoperfusão → categoria D", com a ação "Reavaliar e subclassificar em D1 ou D2 quando estabilizado". | Não há caminho para subclassificar D em D1/D2; a tabela de trombólise só fala de D1–D2. | (a) perguntar D1/D2 já no instável; (b) botão "subclassificar" no passo 4 de D; (c) manter. |
| 2.7 | Trombólise × categorias E | E1/E2: "Terapia avançada recomendada (trombólise sistêmica, CDL, MT ou embolectomia)" e "Terapia avançada: Recomendada". Referência: "E1–E2: COR 2a — Razoável se risco de sangramento aceitável". | "Recomendada" (COR 1) × "Razoável" (COR 2a) para a mesma situação. | Alinhar a linguagem com a classe de recomendação. |
| 2.8 | Dose reduzida de alteplase | Instável com risco hemorrágico alto: "Dose reduzida **recomendada**: Alteplase 50 mg IV em 2 h … Dados de MOPETT trial suportam eficácia". Referência: "50 mg … pode ser considerada (COR 2b)". | "Recomendada" × COR 2b; o MOPETT estudou TEP moderado, não o paciente instável. | Alinhar a linguagem e a justificativa. |
| 2.9 | Alteplase na PCR | "Se PCR: 50 mg em bolus (pode repetir em 15 min se necessário)". | Só confirmar a dose e a repetição. | Confirmar. |
| 2.10 | Eco à beira-leito (instável) | Sete achados; gravidade pela contagem: 0 = sem disfunção, 1–2 = "disfunção de VD presente", ≥ 3 = "disfunção grave". | A contagem como gravidade não tem fonte. "Trombo em câmaras direitas" não é disfunção de VD e conta como achado. O checklist (7 itens, VD/VE > 0,9, inclui hipocinesia e trombo) não bate com a referência (6 parâmetros, inclui "TAPSE + VD/VE > 1" combinados). | (a) resumo qualitativo (presente/ausente) sem "grave" por contagem; (b) critérios de gravidade com fonte; (c) separar o trombo em câmaras direitas. |
| 2.11 | PERC: dois textos para a mesma regra | Calculadoras (`calculatorData.ts`): "PERC negativo — TEP excluído". TepGuide: "PERC negativo — se gestalt < 15%, TEP pode ser considerado improvável". | O Copiloto usa uma definição só do PERC (a do catálogo, com o texto "TEP excluído") na lista de calculadoras, no roteiro e na aba Calculadoras do TEP. O texto do TepGuide é mais cauteloso. | Unificar no texto do TepGuide (ou outro). |
| 2.12 | D-dímero no não gestante | O D-dímero ajustado e o YEARS alimentam o mesmo "Resultado do D-dímero"; o último calculado vence. | Os dois podem discordar (ex.: 70 anos, sem critério YEARS, D-dímero 900: ajustado positivo, YEARS negativo) e o roteiro fica com o último. | Escolher uma estratégia por serviço; ou mostrar os dois resultados. |
| 2.13 | Unidade do D-dímero | Campo em "ug/L FEU", sem faixa. | Muitos laboratórios liberam em mg/L FEU ou µg/mL (0,5 = 500 µg/L). No ANY, digitar 0,5 dava "negativo" com qualquer idade. O Copiloto recusa valores < 10 µg/L (ver 3.3), mas um valor como 2,3 (mg/L) seria recusado sem dizer por quê. | (a) seletor de unidade com conversão; (b) manter µg/L e a faixa; (c) frase sobre a unidade na referência. |
| 2.14 | Norepinefrina (referência) | "Dose: 0,1–0,5 mcg/kg/min (titular). Até 15 mcg/min: pouco efeito na RVP." | Mistura dose por kg com dose fixa no mesmo parágrafo. | Confirmar ou padronizar a unidade. |

## 3. Escrito no porte (o ANY não tinha) — conferir

| # | O quê | Onde |
| --- | --- | --- |
| 3.1 | Citação, "por que usar" e "quando usar" das oito calculadoras próprias do TEP (o TepGuide não tinha referência por calculadora): Wells (Wells 2000), D-dímero ajustado (Righini, ADJUST-PE 2014), YEARS (van der Hulle 2017), YEARS na gestação (van der Pol 2019), sPESI (Jiménez 2010), PESI (Aujesky 2005), Bova (Bova 2014), Hestia (Zondag 2011). As pérolas são frases do próprio TepGuide. | `src/shared/clinical-tools/tep/{wells,d-dimer,severity}.ts` |
| 3.2 | Ações das faixas do Bova (o ANY só tinha o rótulo: "baixo/intermediário/elevado risco de complicações") e do eco (frases tiradas do próprio roteiro: anticoagulação empírica e "eco não substitui CTPA"). | `severity.ts`, `echo.ts` |
| 3.3 | Faixas de entrada (o ANY não tinha): idade 18–120 anos (PESI e D-dímero ajustado); D-dímero 10–100.000 µg/L FEU. O mínimo de 10 recusa o valor digitado em µg/mL/mg/L (0,5). | `d-dimer.ts`, `severity.ts` |
| 3.4 | Tons das categorias. ANY: A azul, B verde, C1 amarelo, C2 laranja, C3 laranja-avermelhado (`#FF5722`), D vermelho, E vermelho-escuro. Copiloto (ADR-017): A e B neutros (cinza), C1–C3 atenção (laranja), D e E críticos (vermelho). | `categories.ts` |
| 3.5 | Link "Protocolo de heparina (HNF) em Infusões" no quadro de destino das categorias cuja anticoagulação inclui HNF (D, D1, D2, E1, E2). No ANY o passo 4 só levava à referência; o link existia no instável e na referência. | `categories.ts` (`heparin`), `content.ts` |

## 4. Diferenças deliberadas de comportamento (sem mudar dose, limiar ou critério)

| # | No ANY | No Copiloto | Por quê |
| --- | --- | --- | --- |
| 4.1 | Checklists abriam desmarcados e o resultado aparecia com zero ("Hestia negativo" antes de olhar os critérios). | Cada critério é "Não/Sim" e o resultado espera todas as respostas. | Mesmo padrão das 75 calculadoras: critério não olhado não vira "não". |
| 4.2 | Idade abria em 65 anos (PESI e D-dímero); campo apagado virava 65 (PESI) ou 50 (D-dímero). | Idade abre vazia e é obrigatória. | Um 65 esquecido muda o ponto de corte: paciente de 40 anos com D-dímero 600 sairia "negativo" (corte 650 em vez de 500). |
| 4.3 | No roteiro, o resultado do D-dímero/YEARS só mudava ao digitar o D-dímero; mudar a idade ou os critérios depois deixava o resultado antigo. | O resultado do passo acompanha qualquer mudança que complete a conta. | Resultado velho na tela é pior que nenhum. |
| 4.4 | "Reiniciar pathway" zerava classificação e investigação, mas mantinha o eco e a etapa da trombólise do paciente anterior. | "Reiniciar roteiro" zera tudo. | Não carregar achado de outro paciente. |
| 4.5 | Texto digitado inválido no D-dímero ("abc") caía no "positivo". | Valor inválido ou fora da faixa não calcula (ADR-017). | — |
| 4.6 | Eco num modal com "Confirmar achados". | Lista no próprio passo, resultado ao vivo e guardado no roteiro. | Celular primeiro; o resumo aparece sem passo extra. |
| 4.7 | Linguagem: "Inicie suporte imediatamente", "Documente", "prossiga", "Utilize", "Solicite", "reclassifique", "Internação recomendada" (Hestia). | "Considere iniciar o suporte sem demora", "Considere documentar", "considere D-dímero", "Considere YEARS…", "Considere solicitar…", "considere reclassificar…", "Considere internação". Também "threshold" → "ponto de corte", "MAP" → "PAM", "ug" → "µg", "pathway" → "roteiro" e acentuação. A lista completa está em `LANGUAGE_CHANGES` no teste diferencial. | Regra de linguagem do ADR-017. Revisar se alguma troca enfraqueceu uma urgência que deveria ficar explícita (ex.: a prioridade de reanimação no instável). |
| 4.8 | Links `/infusion?drug=heparina\|noradrenalina\|dobutamina`, `/airway`, `/seda`. | `/ferramentas/infusoes?droga=<droga>`, `/ferramentas/via-aerea`, `/ferramentas/sedacao`. O roteiro fica na sessão da aba (30 min) e volta ao mesmo ponto. | Nesta base Infusões, Via aérea e Sedação ainda estão "em breve": o link abre a página "em breve" da ferramenta (`/ferramentas/[ferramenta]`). Com Infusões no ar (branch `feat/ferramentas-infusoes`), o mesmo endereço abre a droga. |

## 5. Pendência de integração com Infusões (engenharia + revisor)

O link de heparina usa exatamente `/ferramentas/infusoes?droga=heparina` e
**não pré-seleciona a indicação TEP**. O protocolo de heparina de Infusões
começa na indicação SCA (bolus 60 UI/kg, máx. 4.000 UI; infusão 12 UI/kg/h,
máx. 1.000 UI/h); no TEP o ANY usa 80 UI/kg e 18 UI/kg/h, sem teto. Quem chega
do TEP precisa trocar para "TEP" na tela de Infusões. Opções: Infusões aceitar
`&indicacao=tep` e o TEP passar o parâmetro; ou abrir o protocolo na última
indicação usada.
