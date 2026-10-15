# Revisão clínica — Sedação procedimental e paciente agitado (CC-328)

Achados do porte do SedaPath do ANY App (v4, revisão `95c8fba`,
`v2/src/pages/SedaPath.tsx`) para a revisão clínica do CC-310, a cargo do
Dr. Gustavo Moreira.

**Regra do porte (ADR-017):** doses, vias, limiares, critérios e textos
clínicos ficaram **iguais ao ANY**. O teste diferencial
(`tests/clinical-tools/sedation-differential.spec.ts`) roda a própria página
do ANY, congelada em `tests/any-reference/SedaPath.tsx`, e compara tela,
trilha, opções (com o tom), medicações com via e dose, quadros de regime,
avisos, pergunta das 4 h e doses em: todos os 23 caminhos de grau de
colaboração × urgência × acesso IV × sedação recente × medicação, passo a
passo e em 6 pesos de referência; cetamina IM (urgente e combativo) e
cetofol (padrão e reduzido) em 1.000 pesos sorteados; e 1.000 sequências de
toques (inclusive voltar, checklists, red flags e reinício). O teste de
paridade de texto (`sedation-content-parity.spec.ts`) confere que todo texto
de cada tela do ANY está no porte e que o porte não tem número que o ANY não
mostre.

Nada da seção 1 foi corrigido no código: cada item espera uma decisão. A
coluna "Opções" sugere caminhos; a escolha é clínica. Toda mudança decidida
aqui sobe a versão do conteúdo (`SEDATION_PROVENANCE` em
`src/shared/clinical-tools/sedation/content.ts`) e atualiza o teste
diferencial, que passa a registrar a diferença de propósito.

## 1. Conteúdo clínico (decisão do revisor)

| #    | Onde                                    | O que o ANY diz                                                                                                                                                                                                                                                                                                                 | Por que parece problema                                                                                                                                              | Opções                                                                                                                      |
| ---- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| 1.1  | Cetofol depois de medicação IM          | Escalonar para cetofol depois de haloperidol + prometazina IM ("Precisa complementar"), de cetamina IM ou de midazolam + haloperidol + prometazina IM ("Preciso de sedação IV adicional") não conta como sedação prévia. A pergunta "recebeu sedação nas últimas 4 h?" vem "Não"; só a VO insuficiente reduz o cetofol sozinha. | O paciente acabou de receber sedativo no mesmo roteiro e o cetofol sai com a dose cheia (0,5 mg/kg de cada) se o médico não mudar a resposta.                        | (a) marcar "Sim" sozinho ao escalar depois de IM; (b) aviso no preparo IV citando a medicação dada; (c) manter.             |
| 1.2  | Sedação recente × doses IM              | "Sedação nas últimas 4 h" só reduz o cetofol. Pouco colaborativo com "Sim" segue para cetamina 5 mg/kg IM, midazolam 7,5 mg IM ou haloperidol 5 mg + prometazina 50 mg IM, sem mudança nem aviso.                                                                                                                               | Dose cheia de IM sobre sedação recente.                                                                                                                              | (a) aviso de dose reduzida também no IM; (b) dose IM específica; (c) confirmar que não muda.                                |
| 1.3  | VO "Suficiente"                         | Leva à tela "Procedimento sem sedação — Paciente colaborativo — sedação não necessária".                                                                                                                                                                                                                                        | O paciente recebeu midazolam ou clonazepam VO; a tela diz que não houve sedação e não traz monitorização nem alta.                                                   | (a) desfecho próprio "sedação VO suficiente" com monitorização e alta; (b) levar a "Durante" e "Pós-sedação".               |
| 1.4  | Midazolam IM                            | "Onset: imediato" (IM urgente e combativo: "Onset midazolam: imediato").                                                                                                                                                                                                                                                        | O início de ação do midazolam IM costuma ser descrito em minutos, não imediato. A escolha entre cetamina (3–5 min) e midazolam pode ser feita por esse dado.         | Confirmar o início de ação a mostrar.                                                                                       |
| 1.5  | Cetamina IM 5 mg/kg                     | Sem teto e sem peso de dose: 70 kg → 350 mg (7,0 mL de 50 mg/mL); 200 kg → 1.000 mg (20,0 mL).                                                                                                                                                                                                                                  | Volume grande para um sítio IM (7 mL a 70 kg) e dose absoluta alta em obesos, sem aviso.                                                                             | (a) dose máxima absoluta; (b) peso ideal/ajustado em obesos; (c) orientar dividir o volume em mais de um sítio; (d) manter. |
| 1.6  | Haloperidol                             | "Pode repetir haloperidol em 30 min (máx. 40 mg/dia)".                                                                                                                                                                                                                                                                          | Confirmar o teto diário adotado para o uso IM em agitação; referências variam.                                                                                       | Confirmar ou ajustar o teto.                                                                                                |
| 1.7  | Prometazina                             | "Em gestantes: prometazina máx. 100 mg/dia". Não há teto geral nem regra de repetição da prometazina.                                                                                                                                                                                                                           | O teto aparece só para gestante; quem repete o haloperidol não sabe se repete a prometazina.                                                                         | (a) teto e repetição para todos; (b) confirmar que vale só para gestante.                                                   |
| 1.8  | Preparo do cetofol                      | Cetamina 50 mg/mL 2 mL (100 mg) + propofol 1% 10 mL (100 mg) + **água destilada** 8 mL = 20 mL, 5 mg/mL de cada.                                                                                                                                                                                                                | A diluição do propofol costuma ser indicada em glicose 5%; água destilada deixa a mistura hipotônica.                                                                | Confirmar o diluente (SG 5%, SF 0,9% ou água).                                                                              |
| 1.9  | Arredondamento das doses                | Dose mostrada inteira; volume calculado da dose sem arredondar. Ex.: 45 kg com sedação prévia → manutenção 5,6 mg mostrada "6 mg de cada" e "1,1 mL" (= 5,5 mg); cetamina 72,5 kg → "363 mg" e "7,3 mL" (= 365 mg).                                                                                                             | Dose e volume da mesma linha não batem exatamente; em peso baixo a diferença relativa cresce.                                                                        | (a) dose com uma casa; (b) volume a partir da dose mostrada; (c) manter.                                                    |
| 1.10 | Durante a sedação, "Agitação emergente" | "Dose adicional de cetofol". A tela "Durante" também é aberta depois da cetamina ou do midazolam IM, sem acesso IV.                                                                                                                                                                                                             | A cetamina é causa frequente de reação de emergência; e depois de IM sem acesso a orientação IV não se aplica.                                                       | (a) conduta específica (ex.: benzodiazepínico ou propofol isolado); (b) intercorrências próprias do caminho IM.             |
| 1.11 | Sinais vitais depois da contenção       | Pós-contenção: "Sinais vitais a cada 1 hora". Não urgente: "a cada 15–30 min". Durante a sedação: "PA e FC a cada 3–5 minutos".                                                                                                                                                                                                 | Depois de cetamina 5 mg/kg IM ou de midazolam + haloperidol + prometazina IM, 1 hora parece longo, e mais espaçado que no paciente não urgente.                      | Definir o intervalo após contenção química (ex.: mais curto na primeira hora).                                              |
| 1.12 | Espera da VO                            | Colaborativo: "Aguardar 20–30 minutos" para midazolam ou clonazepam. Pouco colaborativo: clonazepam, "aguardar 30 minutos".                                                                                                                                                                                                     | O clonazepam VO costuma ter início mais lento que o midazolam; a mesma espera para os dois pode levar a escalar cedo.                                                | Tempos por droga, ou confirmar.                                                                                             |
| 1.13 | Contraindicações                        | Só o midazolam tem contraindicações listadas (intoxicação alcoólica, risco respiratório, gestante). Cetamina e haloperidol aparecem sem cuidados.                                                                                                                                                                               | "Escolha a medicação conforme indicação e contraindicações", mas só uma droga as mostra (ex.: QT longo e Parkinson no haloperidol; cuidados conhecidos da cetamina). | Listar contraindicações e cuidados de cada opção, ou confirmar que fica de fora.                                            |
| 1.14 | VO no pouco colaborativo                | Só clonazepam 0,5–1 mg VO; o colaborativo oferece midazolam 7,5–15 mg ou clonazepam.                                                                                                                                                                                                                                            | Pode ser intencional (meia-vida maior), mas não está dito.                                                                                                           | Confirmar ou oferecer as duas.                                                                                              |
| 1.15 | Monitorização obrigatória               | SpO2 contínua, PA e FC a cada 3–5 min, nível de consciência.                                                                                                                                                                                                                                                                    | Não cita capnografia, recomendada em sedação moderada a profunda por diretrizes de sedação procedimental.                                                            | Incluir capnografia (quando disponível) ou confirmar.                                                                       |
| 1.16 | Todo o roteiro                          | Nenhuma referência bibliográfica.                                                                                                                                                                                                                                                                                               | As calculadoras têm citação; o roteiro não. A tela mostra só a procedência (ANY v4).                                                                                 | Indicar referências (ex.: diretriz de sedação procedimental, consenso de agitação, protocolo institucional).                |

## 2. Faixas de entrada definidas no porte (o ANY não tinha)

O ADR-017 exige faixa em todo campo: fora dela a tela mostra erro e não
calcula. A faixa abaixo **precisa de confirmação**.

| Campo | No ANY                                                                                                                                                                   | No porte                                                                                                    | Observação                                            |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| Peso  | Três campos separados (cetamina no urgente, cetamina no combativo, cetofol), começando vazios; qualquer valor positivo calcula (`parseFloat`), inclusive 5 kg ou 500 kg. | Um campo só, 40–200 kg, o peso adulto comum às ferramentas (a mesma chave da Via aérea, Infusões e Dengue). | Faixa adulta do ADR-017. Sem peso válido não há dose. |

## 3. Defeitos e diferenças de tela do ANY

Correções de tela, sem mudança de dose, via, limiar ou critério. Ficam
registradas para o revisor saber onde a tela do Copiloto difere da do ANY;
as três primeiras têm teste próprio no fim do teste diferencial.

| #   | Onde                                 | No ANY                                                                                                                                                                                                                            | No Copiloto                                                                                                |
| --- | ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| 3.1 | "Voltar" do cetofol e do pós-sedação | Abriam uma tela nova em vez de voltar: voltar duas vezes a partir do cetofol caía de novo no cetofol (laço preparo IV ↔ cetofol), e o pós-sedação do combativo contido ("Contenção suficiente") voltava para "Durante a sedação". | "Voltar" sempre volta para a tela anterior do caminho.                                                     |
| 3.2 | Pergunta "sedação nas últimas 4 h"   | A do pouco colaborativo e a do preparo IV eram campos separados: mudar a resposta no preparo IV deixava o pouco colaborativo mostrando a antiga. A dose do cetofol já usava a última resposta.                                    | Uma resposta só, nas duas telas; a dose do cetofol é a mesma do ANY.                                       |
| 3.3 | Peso                                 | Três campos (ver seção 2): o peso digitado na cetamina do combativo não chegava ao cetofol.                                                                                                                                       | Um peso só, guardado na aba e comum às ferramentas adultas.                                                |
| 3.4 | Base da dose do cetofol              | "Dose padrão" ou "Considere doses reduzidas (50%)" só aparecia depois do peso.                                                                                                                                                    | Aparece ao abrir a tela; as doses, com o peso.                                                             |
| 3.5 | Red flags do preparo IV              | Bloco recolhido "Red Flags — clique para expandir".                                                                                                                                                                               | Visíveis, como caixas de marcar; marcar mostra o alerta do item.                                           |
| 3.6 | Avaliação da resposta                | "Após 20–30 / 20–40 minutos — avalie a resposta" ficava num bloco recolhido, com as opções escondidas.                                                                                                                            | Opções visíveis na tela, com o mesmo título.                                                               |
| 3.7 | Atalho para a via aérea              | "Abrir Airway Guide →" no red flag de via aérea difícil e "Airway Guide →" no item "Via aérea" dos materiais.                                                                                                                     | Atalho só no red flag, e só quando a Via aérea estiver disponível no Copiloto (CC-315).                    |
| 3.8 | Menu flutuante e estado              | "Reiniciar Fluxo" no menu; sair da página perdia tudo.                                                                                                                                                                            | "Novo paciente" na própria tela (limpa respostas e peso); o estado fica na aba por 30 minutos.             |
| 3.9 | Prontuário                           | Não havia.                                                                                                                                                                                                                        | "Copiar para o prontuário": caminho, respostas, medicação com dose e peso, sem dado do paciente (ADR-017). |

## 4. Texto

- Acentuação corrigida ("intoxicação", "hemodinamicamente",
  "risco-benefício", "máx.", "4 h").
- "Ketamina" e "Ketofol" viraram "Cetamina" e "Cetofol" (nome da DCB, o mesmo
  da Via aérea). A busca acha a ferramenta por "ketamina" e "ketofol".
- Recomendações no imperativo passaram para sugestão: "Mantenha comunicação
  clara… Explique cada etapa." → "Considere manter comunicação clara… e
  explicar cada etapa."; "Reduza estímulos" → "Considere reduzir estímulos";
  "Evitar Midazolam se:" → "Considere evitar midazolam se:"; "→ Usar apenas
  Ketamina IM" → "→ considere apenas cetamina IM"; "Otimize antes da
  sedação…" e "Otimize proteção de via aérea" → "Considere otimizar…". Passos
  de conduta no infinitivo ("Reunir equipe e definir papéis", "Liberar
  contenção torácica") descrevem o procedimento e ficaram como no ANY.
- "Red Flags — clique para expandir" → "Red flags"; "Clique nas condições
  presentes…" → "Marque as condições presentes…" (ver 3.5).
- A lista completa, com o motivo, está em `REPHRASED`
  (`tests/clinical-tools/sedation-content-walk.ts`); o teste de paridade
  confere que o texto antigo saiu e o novo entrou.

## 5. Testes do branch antigo do ANY

O branch antigo (`claude/update-test-database-M10pD`, revisão `649d2ae`) não
tem teste do SedaPath: os seus testes cobrem cálculos de infusão, drogas,
formatadores e tipos. O único usado pela sedação é o do `fmt`, já portado na
fundação (`tests/clinical-tools/any-legacy.spec.ts`). Nada a portar.

## 6. Casos de referência

Enquanto não chegam os casos do Dr. Gustavo, as doses-chave da história
viraram teste (`src/shared/clinical-tools/sedation/doses.spec.ts`), todas
iguais ao ANY:

| Caso                                    | Resultado                                                                                                                                                                  |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cetamina IM, 70 kg                      | 350 mg = 7,0 mL (50 mg/mL)                                                                                                                                                 |
| Cetamina IM, 40 kg e 200 kg             | 200 mg = 4,0 mL; 1.000 mg = 20,0 mL                                                                                                                                        |
| Cetofol, 70 kg, sem sedação prévia      | indução 35 mg de cada = 7,0 mL; manutenção 18 mg de cada = 3,5 mL                                                                                                          |
| Cetofol, 70 kg, sedação nas últimas 4 h | indução 18 mg de cada = 3,5 mL; manutenção 9 mg de cada = 1,8 mL                                                                                                           |
| Regimes fixos                           | midazolam 7,5–15 mg VO ou clonazepam 0,5–1 mg VO; midazolam 7,5 mg IM; haloperidol 5 mg + prometazina 50 mg IM; midazolam 7,5 mg + haloperidol 5 mg + prometazina 50 mg IM |
