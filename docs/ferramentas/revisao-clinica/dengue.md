# Revisão clínica — Dengue (CC-325)

Achados do porte do DenguePath do ANY App (v4, revisão `95c8fba`,
`v2/src/pages/DenguePath.tsx` e `calcDengueHydration` em
`v2/src/utils/calculations.ts`) para a revisão clínica do CC-310, a cargo do
Dr. Gustavo Moreira.

**Regra do porte (ADR-017):** sinais, critérios, volumes, doses, limiares e
textos clínicos ficaram **iguais ao ANY**. O que confere:

- `tests/clinical-tools/dengue-differential.spec.ts` roda a própria página do
  ANY e compara: volumes em 1.000 pesos (sem tolerância), cada número de cada
  tela com peso, as 65.536 combinações de sinais na classificação, 1.000 pares
  de Ht e 1.000 sequências de toques no roteiro;
- `tests/clinical-tools/dengue-content-parity.spec.ts` confere que todo texto
  de cada tela do ANY está no conteúdo do porte (a menos de acento e caixa).

Nada abaixo foi corrigido no código: cada item espera uma decisão. Toda mudança
decidida aqui sobe `DENGUE_PROVENANCE.version` em
`src/shared/clinical-tools/dengue/content.ts` e entra no teste de paridade como
diferença registrada.

## 1. Conteúdo clínico (decisão do revisor)

| #    | Onde                 | O que o ANY diz                                                                                                                                                                                                        | Por que parece problema                                                                                                                                                                                                                                                                      | Opções                                                                                                                                                                           |
| ---- | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1.1  | Ferramenta inteira   | "Ferramenta para adultos (≥15 anos)"; volumes só com peso de 40 a 200 kg.                                                                                                                                              | Não há conduta pediátrica, mas o conteúdo cita criança: "<2 anos" como condição de risco (Grupo B e classificação direta), prova do laço "em crianças, considere 3 minutos" e a referência é o manual "adulto e criança". Adolescente ≥ 15 anos ou idoso com menos de 40 kg fica sem volume. | (a) manter só adulto e tirar as menções a criança; (b) módulo pediátrico com o peso pediátrico (0,5–50 kg) e a hidratação pediátrica do MS; (c) baixar o piso de peso da dengue. |
| 1.2  | Condições de risco   | Três listas diferentes: trilha (5 itens, com "Plaquetopenia <100.000/mm³"), manejo do Grupo B (12 itens) e passo 3 da classificação direta (texto corrido: gestante, <2 ou >65 anos, sete comorbidades, risco social). | A trilha não tem doença ácido-péptica, doença autoimune, anticoagulante nem "<2 anos", que o Grupo B lista. O mesmo paciente pode ser B por uma lista e A pela outra.                                                                                                                        | Unificar numa lista só (a do MS 2024) e usar nos três lugares.                                                                                                                   |
| 1.3  | Grupo B, critério    | A trilha não tem "sangramento de pele espontâneo (petéquias) ou induzido (prova do laço positiva)".                                                                                                                    | Pelo manual do MS esse é critério do Grupo B; na trilha, prova do laço positiva sem outra condição dá Grupo A.                                                                                                                                                                               | Confirmar no MS 6ª ed. e, se for o caso, incluir como condição da trilha.                                                                                                        |
| 1.4  | Plaquetopenia        | "Plaquetopenia <100.000/mm³" é condição de risco (trilha) e "critério de risco — Grupo B" (exames).                                                                                                                    | Confirmar a fonte: a lista de condições do Grupo B do MS não parece trazer plaquetopenia isolada (verificar na 6ª ed.).                                                                                                                                                                      | Confirmar ou retirar da lista de risco.                                                                                                                                          |
| 1.5  | Sinal de alarme      | "Hematócrito em ascensão (aumento ≥20% do valor basal)".                                                                                                                                                               | O MS fala em "aumento progressivo do hematócrito"; os 20% são o critério de hemoconcentração da OMS.                                                                                                                                                                                         | Confirmar a redação.                                                                                                                                                             |
| 1.6  | Calculadora de Ht    | Lista "Classificação: <20%: variação normal", mas a interpretação ao lado mostra 10–20% como "Elevação moderada — monitorizar" (laranja).                                                                              | As duas leituras se contradizem na mesma tela.                                                                                                                                                                                                                                               | Escolher uma: tirar a faixa 10–20% ou reescrever a lista.                                                                                                                        |
| 1.7  | Albumina             | Grupo D: albumina "se Ht em ascensão após 3 expansões"; "Ht em queda + choque → hemotransfusão". Calculadoras: "Indicação: choque refratário a cristaloide + **Ht em queda**".                                         | A tela de calculadoras indica albumina com Ht em queda, o cenário em que o Grupo D sugere hemorragia e hemotransfusão.                                                                                                                                                                       | Corrigir a indicação das calculadoras para Ht em ascensão (se for o caso).                                                                                                       |
| 1.8  | Número de expansões  | Grupo C: "Se falhar 2ª vez → manejar como Grupo D"; UTI: "Choque refratário a 2 expansões". Calculadoras: "repetir expansão (máximo 3 expansões)".                                                                     | 2 ou 3 expansões antes de escalar?                                                                                                                                                                                                                                                           | Alinhar com o MS 6ª ed.                                                                                                                                                          |
| 1.9  | Expansão do Grupo C  | "10 mL/kg/h por 2 horas" (= "20 mL/kg em 2h" nas calculadoras).                                                                                                                                                        | Confirmar com a 6ª edição (2024) a dose e o tempo da fase de expansão e da reavaliação.                                                                                                                                                                                                      | Confirmar.                                                                                                                                                                       |
| 1.10 | Manutenção           | "25 mL/kg em 6h, depois 25 mL/kg em 8h".                                                                                                                                                                               | Não diz a solução (o MS especifica a composição da manutenção).                                                                                                                                                                                                                              | Incluir a solução, se desejado.                                                                                                                                                  |
| 1.11 | E-FASD               | A história CC-325 fala em "8 janelas"; o ANY mostra 9 janelas numeradas (a 9 é a subcostal, pericárdio).                                                                                                               | Confirmar com Tambelli et al., JBMEDE 2024 se o protocolo tem 8 ou 9 janelas.                                                                                                                                                                                                                | Confirmar e ajustar a história ou o conteúdo.                                                                                                                                    |
| 1.12 | Mensagem ao paciente | "Pelo menos 2 a 3 litros por dia".                                                                                                                                                                                     | Na mesma ferramenta a conta é 60 mL/kg/dia (4,2 L para 70 kg); para adulto mais pesado, 2–3 L fica abaixo.                                                                                                                                                                                   | (a) manter; (b) "cerca de 60 mL por kg por dia" (sem pôr o peso na mensagem); (c) faixa por peso.                                                                                |
| 1.13 | Mensagem ao paciente | "Retorno: Conforme orientação médica para reavaliação."                                                                                                                                                                | Vago: o MS recomenda retorno para reavaliação em dia definido (ex.: no dia da melhora da febre, fase crítica). A mensagem é a mesma para A e B.                                                                                                                                              | Texto de retorno por grupo, sem dado do paciente.                                                                                                                                |
| 1.14 | Sinais de retorno    | Listas parecidas mas não iguais: "agitação" × "agitação intensa"; passo 4 do Grupo A × tela de alta × mensagem ("Vômitos que não param", "Pele fria, pálida ou suada").                                                | Pequenas diferenças de texto do mesmo conteúdo.                                                                                                                                                                                                                                              | Unificar.                                                                                                                                                                        |
| 1.15 | Antieméticos         | Ondansetrona "ampola 4 mg/2 mL" (passo 4) e "4 mg/2 mL ou 8 mg/4 mL" (Grupo A).                                                                                                                                        | Diferença menor de apresentação.                                                                                                                                                                                                                                                             | Unificar.                                                                                                                                                                        |
| 1.16 | Classificação direta | Passo 2: "Há sinais de alarme? (use o checklist acima)". A resposta é um botão, independente das caixas marcadas.                                                                                                      | O médico pode marcar um sinal de alarme e responder "Não → Próximo"; a tela não avisa.                                                                                                                                                                                                       | (a) manter; (b) avisar quando há alarme marcado e a resposta é "Não"; (c) responder sozinho pelo checklist.                                                                      |

## 2. Linguagem (ADR-017)

O ADR-017 pede sugestão em vez de ordem na conduta do médico. Mudou um texto:

| Onde                  | ANY                                                                                                          | Porte                                                                                                               |
| --------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| Grupo D, "Emergência" | "Iniciar reposição volêmica agressiva imediatamente. Acesso venoso calibroso (dois acessos). Considere UTI." | "Considere iniciar reposição volêmica agressiva sem demora. Acesso venoso calibroso (dois acessos). Considere UTI." |

Ficaram como no ANY, para decisão:

- infinitivos de protocolo ("Solicitar hemograma…", "Repetir expansão…",
  "Classificar como pelo menos Grupo C. Iniciar hidratação IV.") — a regra do
  ADR só barra imperativo ("Inicie", "Faça") e "imediatamente";
- "imediatamente" nas orientações de retorno ao paciente ("Orientar o paciente
  a retornar **imediatamente**…", "Retornar **imediatamente** se sinais de
  alarme"): a urgência ali é do paciente, não ordem de conduta.

Também mudou (sem efeito clínico): acentuação ("petéquias", "após", "até",
"Fórmula", "3º e 7º", "6ª edição", "mm³", "38,5 °C") e caixa-alta virou caixa
normal ("GRUPO C" → "Grupo C", "SINAIS DE ALARME" → "sinais de alarme").

## 3. Faixas de entrada definidas no porte (o ANY não tinha)

| Campo               | Faixa no porte | Observação                                                                                          |
| ------------------- | -------------- | --------------------------------------------------------------------------------------------------- |
| Peso                | 40–200 kg      | Faixa adulta do próprio ANY (a dengue do ANY só calculava nela). Peso comum às ferramentas adultas. |
| Ht basal e Ht atual | 10–80%         | O ANY aceitava qualquer número positivo. Faixa escolhida pela engenharia: **confirmar**.            |

## 4. Diferenças de tela em relação ao ANY

Não mudam conteúdo clínico; registradas para a revisão da tela final.

- **Classificação ao vivo.** No ANY o grupo só aparecia ao tocar
  "Classificar" e ficava desatualizado se o médico marcasse um sinal depois
  (marcar choque depois de classificar mantinha "Grupo A" na tela). No
  Copiloto o grupo acompanha as marcações (ADR-017, sem botão "Calcular").
- **Navegar não apaga marcação.** No ANY, voltar ao passo 1 apagava os sinais
  de alarme e voltar ao passo 3 apagava gravidade e risco. Com o resultado ao
  vivo isso trocaria o grupo sem o médico pedir; no Copiloto só apagam
  "Reavaliar classificação" (gravidade e risco, como no ANY) e "Novo paciente".
- **Botões de reclassificação no passo 4.** O ANY dizia "Use os botões de
  reclassificação" no passo 4 dos Grupos C e D, mas não havia botões ali. O
  porte mostra os mesmos botões do manejo do grupo (mesmas transições:
  A → B, C; B → A, C; C → B, D; D → C).
- **Contagem dos passos.** O ANY mostrava "Passo 1 de 3" nos passos 1–3 e
  "Passo 4 de 5" depois; o porte usa "de 5" em todos.
- **Mensagem de alta.** Texto igual ao ANY, com a data e a hora de emissão. A
  linha de assinatura "Dengue Path — ANY App — Medicina de Emergência" virou
  "Dengue — Copiloto Clínico". A mensagem não leva nenhum dado do paciente
  (nem peso, grupo ou Ht): a entrada do gerador é só a hora
  (`tests/clinical-tools/dengue-patient-message.spec.ts`). Decidir se a data e
  a hora de emissão devem continuar.
- **Grupo atual.** O porte guarda, na aba, o grupo atribuído (pela trilha,
  pela classificação direta ou por reclassificação) e a hora, e mostra
  "Grupo atual do paciente desde as 14:32" no manejo e no início. O ANY não
  tinha.
- **Copiar para o prontuário.** Novo: grupo, sinais marcados, volumes do peso,
  variação do Ht e a sequência de grupos, sem horário nem dado de
  identificação.
