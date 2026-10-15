# Revisão clínica — Toxicologia (CC-323)

Achados do porte do roteiro de Toxicologia do ANY App v4 (revisão `95c8fba`):
o conteúdo do `v2/src/data/toxData.ts` e a regra que morava na tela
`v2/src/pages/ToxPath.tsx` (árvore, descontaminação, destino, carvão, NAC e
atropina). São para a revisão clínica do CC-310, a cargo do Dr. Gustavo
Moreira.

**Regra do porte (ADR-017):** doses, limiares, critérios e destinos ficaram
**iguais ao ANY**. O teste diferencial
(`tests/clinical-tools/toxicology-differential.spec.ts`) roda o próprio
`ToxPath.tsx` congelado e confere todos os 18 caminhos da árvore, os 18 da
descontaminação, 1.000 pesos de carvão, 1.000 combinações de critérios de
destino, 1.000 pesos de NAC, 1.000 casos do nomograma e 1.000 doses de
atropina, além do texto de todo o conteúdo. Nada abaixo foi corrigido no
código: cada item espera uma decisão. A coluna "Opções" sugere caminhos; a
escolha é clínica.

Toda mudança decidida aqui sobe a versão do conteúdo
(`TOX_PATH_PROVENANCE.version` em
`src/shared/clinical-tools/toxicology/provenance.ts`) e entra no teste
diferencial como diferença declarada.

Nenhum teste do branch antigo do ANY (`claude/update-test-database-M10pD`)
cobre Toxicologia; não houve teste antigo a portar.

## 1. Telefones (confirmar que ainda valem)

| #   | Onde                                                                              | O que o ANY diz                                     | Por que conferir                                                                                       | Opções                                                                           |
| --- | --------------------------------------------------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| 1.1 | Banner da tela inicial, botão "ligar" de cada seção e abertura da descontaminação | **Disque-Intoxicação 0800 722 6001**, "Plantão 24h" | Copiado exatamente como no ANY (`tel:08007226001`). O Copiloto não tem como saber se o número mudou.   | Confirmar o número e o nome.                                                     |
| 1.2 | "Outros contatos" da tela inicial                                                 | **CIATox Goiás 0800 646 4350**                      | Idem (`tel:08006464350`). O Copiloto não é só de Goiás: o médico de outro estado vê o CIATox de Goiás. | (a) manter; (b) lista de CIATox por estado (Renaciat); (c) só o número nacional. |

## 2. Disponibilidade dos antídotos

| #   | Onde                                      | O que o ANY diz                                                                                                                                                   | Por que parece problema                                                                                                                                                     | Opções                                                                                                                               |
| --- | ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| 2.1 | Guia de antídotos e texto das toxíndromes | 11 "Disponíveis" e 4 "Não disponíveis"; "Considere NALOXONA — Disponível", "ATROPINA — Disponível (Pralidoxima NÃO disponível)", "Fisostigmina (não disponível)". | A disponibilidade é a de um serviço (o de origem do ANY). No Copiloto, usado em outros hospitais, "disponível" vira afirmação falsa onde o antídoto não existe na farmácia. | (a) manter; (b) trocar por "confira a disponibilidade no serviço"; (c) disponibilidade configurável por instituição (história nova). |
| 2.2 | Glucagon                                  | Listado em "Não disponíveis", mas o texto diz "Disponibilidade limitada"; a tabela de ECG diz "Glucagon (se disponível)".                                         | Três afirmações diferentes sobre o mesmo antídoto.                                                                                                                          | Escolher uma.                                                                                                                        |
| 2.3 | Fomepizol / Etanol                        | Marcado como disponível, com a seção "Fomepizol (se disponível)".                                                                                                 | Idem 2.2.                                                                                                                                                                   | Confirmar.                                                                                                                           |

## 3. Árvore de toxíndromes (11 perguntas, 8 toxíndromes)

| #   | Onde                                                                        | O que o ANY diz                                                                                                        | Por que parece problema                                                                                                                                                                                                           | Opções                                                                                                                                    |
| --- | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| 3.1 | Rebaixado → "Midríase ou normais" (perg. 10) → sem hipersecreção (perg. 12) | Resultado: **Sedativo-hipnótico**.                                                                                     | Coma com midríase é o quadro típico do anticolinérgico grave e da intoxicação por tricíclico (ADT). A árvore não tem caminho de "rebaixado" para anticolinérgico; o resultado aponta flumazenil e não lembra o bicarbonato (QRS). | (a) pergunta extra no ramo rebaixado (pele seca? QRS > 100 ms?); (b) texto do sedativo-hipnótico citando ADT/anticolinérgico; (c) manter. |
| 3.2 | Barra de progresso                                                          | 20% por resposta, até 95% antes do fim; no resultado mostra `respostas × 20%` (ex.: 40% num resultado de 2 respostas). | Só de tela: a barra não chega a 100% no resultado curto. Mantida igual ao ANY pela paridade.                                                                                                                                      | Mostrar 100% no resultado (não muda conteúdo).                                                                                            |
| 3.3 | Seta dos sinais vitais                                                      | Pele "Úmida" sem seta no simpaticomimético e no colinérgico, mas "Úmida/Ruborizada" com ↑ no serotoninérgico.          | Critério da seta inconsistente para o mesmo achado.                                                                                                                                                                               | Uniformizar.                                                                                                                              |

## 4. Descontaminação gastrointestinal (5 passos)

| #   | Onde                          | O que o ANY diz                                                                          | Por que parece problema                                                                                                               | Opções                                                                                  |
| --- | ----------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| 4.1 | Dose de carvão ativado        | 1 g/kg, mínimo 25 g, máximo 100 g ("Goldfrank 11ª ed.").                                 | Abaixo de 25 kg o mínimo passa de 1 g/kg: 10 kg recebe 25 g (2,5 g/kg). A dose pediátrica usual é 0,5–1 g/kg.                         | (a) mínimo de 25 g só a partir de certo peso; (b) regra pediátrica própria; (c) manter. |
| 4.2 | Passo 2, "Mais de 2 horas"    | Encerra como "não indicado".                                                             | Liberação prolongada e anticolinérgicos (esvaziamento gástrico lento) são as exceções clássicas à janela de 1–2 h.                    | (a) citar as exceções no texto; (b) pergunta sobre liberação prolongada; (c) manter.    |
| 4.3 | Abertura e subtítulo da seção | "Carvão ativado e lavagem gástrica"; "decisão sobre carvão ativado ou lavagem gástrica". | O fluxo só termina em carvão; lavagem gástrica não aparece em nenhum resultado.                                                       | (a) tirar "lavagem gástrica"; (b) escrever quando considerá-la.                         |
| 4.4 | Peso do carvão                | Aceitava de 0 a 300 kg (e usava o peso compartilhado entre as ferramentas do ANY).       | Faixa do porte: **0,5 a 300 kg** (mínimo pediátrico do ADR-017, teto do ANY). Fora dela não calcula. O peso é pedido no próprio card. | Confirmar a faixa.                                                                      |

## 5. Critérios de destino (13 de UTI, 4 de enfermaria)

| #   | Onde                                          | O que o ANY diz                                                                                           | Por que parece problema                                                                                                       | Opções                                         |
| --- | --------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| 5.1 | "Ingestão de bomba-relógio tóxica" (UTI)      | Critério de **UTI**. Na aba Bombas-relógio: "assintomático com bomba-relógio = **internar** e monitorar". | As duas telas sugerem destinos diferentes para o mesmo paciente.                                                              | Escolher UTI ou internação monitorada.         |
| 5.2 | QRS                                           | Destino: UTI se "QRS > 120 ms"; tabelas e bicarbonato: "QRS > 100 ms".                                    | Limiares diferentes para coisas diferentes (destino × tratamento), mas lado a lado confundem.                                 | Confirmar ou explicar no texto.                |
| 5.3 | Exemplo do critério de avaliação psiquiátrica | "Todos os pacientes com ingestão intencional **devem** ter avaliação psiquiátrica antes da alta".         | Frase de ordem; mantida (não começa por verbo de ordem).                                                                      | Manter ou "considere avaliação psiquiátrica…". |
| 5.4 | Nome da seção                                 | "Critérios de disposição", "Alta vs. Enfermaria vs. UTI".                                                 | "Disposição" é decalque do inglês. Virou **"Critérios de destino"**, "Alta, enfermaria ou UTI" (só o nome; critérios iguais). | Confirmar o nome.                              |

## 6. Antídotos e contas

| #   | Onde                           | O que o ANY diz                                                                                                                                                                       | Por que parece problema                                                                                                                                                                                                                                                                                        | Opções                                                                                     |
| --- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| 6.1 | NAC, peso                      | Calcula de 20 a 250 kg, sem teto de peso de dose.                                                                                                                                     | Muitos protocolos limitam a dose ao peso de 100 kg (150 mg/kg × 100 kg = 15 g na 1ª etapa). Com 150 kg o ANY dá 22,5 g.                                                                                                                                                                                        | (a) teto de 100 kg; (b) manter.                                                            |
| 6.2 | NAC, volumes                   | 200, 500 e 1.000 mL de SF para qualquer peso de 20 a 250 kg.                                                                                                                          | Volume de adulto para criança de 20–40 kg (sobrecarga hídrica, hiponatremia). Protocolos pediátricos ajustam o volume por peso.                                                                                                                                                                                | (a) volumes por peso abaixo de 40 kg; (b) aviso para criança; (c) faixa a partir de 40 kg. |
| 6.3 | NAC, indicação × doses tóxicas | Card da NAC: "ingestão > 150 mg/kg". Tabela de doses tóxicas (CC-324): paracetamol, dose tóxica 75 mg/kg.                                                                             | Dois números diferentes para o paracetamol em telas vizinhas (limiar de tratamento × dose tóxica de referência).                                                                                                                                                                                               | Explicar a diferença nos textos ou alinhar.                                                |
| 6.4 | Nomograma no card da NAC       | O ToxPath tinha uma segunda cópia da conta, que comparava o nível com a linha **sem arredondar**; texto "Recomenda-se iniciar NAC imediatamente" / "NAC não indicado pelo nomograma". | O Copiloto usa a calculadora `nomograma-rumack` inteira (conta única em `rumack-matthew.ts`; linha arredondada a 0,1, ver `calculadoras.md`). No limite os dois discordam (o teste mostra a faixa estreita). O texto passou a ser o da calculadora, que cita também o protocolo oral de 72 h, ausente do card. | Confirmar o texto; decidir se o card descreve o protocolo oral.                            |
| 6.5 | Atropina, manutenção           | "Infusão contínua: 20% da dose de ataque/hora", ampolas de 0,25 mg arredondadas para cima.                                                                                            | Literatura cita 10–20% da dose de ataque por hora. O ANY aceitava qualquer dose > 0; faixa do porte: **0,01 a 1.000 mg** (o card diz "centenas de mg").                                                                                                                                                        | Confirmar 20% e a faixa.                                                                   |
| 6.6 | Flumazenil                     | "Máximo: 3-5 mg".                                                                                                                                                                     | Confirmar o teto (a reversão de sedação costuma usar até 1 mg).                                                                                                                                                                                                                                                | Confirmar.                                                                                 |

## 7. Linguagem (mudanças de texto do porte)

O texto do ANY teve só a acentuação corrigida ("intóxicação" → "intoxicação",
"escopolâmina" → "escopolamina", "hidroxocobalâmina" → "hidroxocobalamina",
"1a etapa" → "1ª etapa", "40C" → "40 °C") e caixa-alta de título reduzida. Além
disso, pela regra de sugestão do ADR-017 (lista em `TEXT_EDITS` do teste
diferencial):

| Onde                                | ANY                                                                           | Copiloto                                                                              |
| ----------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Descontaminação, substância incerta | "Recomenda-se contatar o CIATox"; "entre em contato com o Disque-Intoxicação" | "Considere contatar o CIATox"; "considere entrar em contato com o Disque-Intoxicação" |
| Tabelas, pupilas (macete)           | "Miose + depressão respiratória = OPIOIDE (dar naloxona!)"                    | "… = OPIOIDE (considere naloxona)"                                                    |
| Tabelas, bombas-relógio (regra)     | "… = INTERNAR e monitorar!"                                                   | "… = considere internar e monitorar."                                                 |
| Toxíndrome "misto"                  | "poliintóxicação"                                                             | "poli-intoxicação"                                                                    |
| Antídotos, busca do flumazenil      | "benzodiazep��nico" (caractere quebrado)                                      | "benzodiazepínico"                                                                    |

Textos de protocolo no infinitivo ("Repetir…", "NÃO usar rotineiramente",
"Usar ATROPINA como pilar") foram mantidos. Revisar se alguma troca
enfraqueceu uma urgência que deveria continuar explícita.

## 8. O que mudou na tela, sem mudar conteúdo

- **Cores** (ADR-017): sem o degradê por toxíndrome nem a cor por seção do
  checklist. Destino: UTI vermelho, enfermaria laranja, observação cinza (o
  verde do ANY vira cinza). Linhas de tabela: vermelho e amarelo do ANY viram
  vermelho e laranja; as linhas em verde (tratamento, exame) e na cor de
  destaque viram negrito, sem cor.
- **Doses tóxicas**: no ANY era uma aba das Tabelas; no Copiloto é seção
  própria (CC-324).
- **Botão de voltar**: o ANY só tinha "Pergunta anterior" na árvore; a
  descontaminação também ganhou "Passo anterior".
- **Copiar para o prontuário** no resultado da árvore, da descontaminação, do
  destino, da NAC e da atropina (sem dado de paciente).
- **Calculadoras de toxicologia** (CIWA-Ar, PSS, Rumack-Matthew, QTc,
  intervalo osmolar) listadas na tela inicial do roteiro; o CIWA-Ar ganhou o
  link "Abrir no roteiro".

## 9. Defeitos do ANY que não foram portados

- **Resto de ponto flutuante na NAC**: com 70,1 kg o ANY mostrava "3504.9999999999995 mg"
  na 2ª etapa; o Copiloto mostra "3505 mg" (gramas iguais: 3,5 g).
- **Conta do nomograma duplicada** no ToxPath (ver 6.4).
- **Vírgula decimal**: os campos do ANY eram `type="number"` e recusavam
  vírgula; no Copiloto aceitam vírgula ou ponto e recusam fora da faixa.
