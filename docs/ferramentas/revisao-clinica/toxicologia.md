# Revisão clínica — Toxicologia (CC-323 e CC-324)

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
  própria, com as 242 entradas do legado (seção 10).
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

## 10. Doses tóxicas (CC-324)

A tabela vem do Tox Path legado do ANY (`tools/tox-path/index.html`, dados
ToxBase): **242 entradas**, copiadas como estão para
`src/shared/clinical-tools/toxicology/toxic-doses.ts`. O ANY v2 tinha só 74
delas, todas iguais às do legado (mesma dose, meia-vida e sinônimos; o v2 só
tirou o acento de 6 nomes, como "Acido Valproico"). O teste diferencial
(`tests/clinical-tools/toxic-doses-differential.spec.ts`) confere as 242
campo a campo e roda a conta do legado (`calculateDose`) e a aba do v2 em
1.000 casos cada.

**A história pede "242 entradas revisadas pelo Gustavo".** Cada entrada tem a
sua revisão (`review`), e todas estão `pendente`. A tela mostra "revisão
clínica pendente" no card de cada medicamento e no texto do prontuário. Para
marcar uma entrada como revisada, troque o `review` dela por
`{ status: 'revisado', reviewer, crm, reviewedAt }` e suba a versão de
`TOXIC_DOSES_PROVENANCE`. A lista completa para a revisão está no fim desta
seção.

A conta é a do ANY: dose ingerida (mg/kg) = quantidade ÷ peso; razão = dose
ingerida ÷ dose tóxica. Abaixo de 50%, "abaixo da dose tóxica" (verde no ANY,
cinza aqui); de 50% a menos de 100%, "próximo" (laranja); a partir de 100%,
"acima" (vermelho), com "(N,Nx)".

| #     | Onde                                                | O que o ANY diz                                                                                                                          | Por que parece problema                                                                                                                                                                                                                                          | Opções                                                            |
| ----- | --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| 10.1  | Fonte                                               | "Fonte: ToxBase".                                                                                                                        | ToxBase é a base britânica do NPIS, de acesso por assinatura. Confirmar se o uso dos números no Copiloto está coberto (licença) e se a fonte deve aparecer na tela.                                                                                              | Confirmar com o jurídico; manter ou trocar a fonte.               |
| 10.2  | Entradas repetidas                                  | "Carbonato de Lítio" e "Lítio" (50 mg/kg, 24 hs); "Metilfenidato" e "Ritalina" (1 mg/kg, 2 hs).                                          | Duas entradas para o mesmo fármaco; Ritalina é nome comercial. Mantidas para a contagem de 242 bater com o legado.                                                                                                                                               | Fundir (nome comercial vira sinônimo) e passar a 240.             |
| 10.3  | Lítio                                               | 50 mg/kg para "Carbonato de Lítio" e para "Lítio".                                                                                       | Não diz se é o sal (carbonato) ou o lítio elementar; a diferença é de ~5,3×.                                                                                                                                                                                     | Especificar.                                                      |
| 10.4  | Fármacos fora do mercado brasileiro ou veterinários | Ex.: Imepitoin (anticonvulsivante veterinário), Carprofeno (AINE de uso veterinário), Dipipanona, Cetobemidona, Meptazinol, Lofepramina. | A tabela é britânica/europeia; parte não existe no Brasil e entra na busca.                                                                                                                                                                                      | (a) manter; (b) marcar "não comercializado no Brasil"; (c) tirar. |
| 10.5  | Meia-vida                                           | "hs" para horas; "15 hs\*" na Glibenclamida, sem nota; "3,5/11 hs", "6/20 hs", "12/20 hs", "22/45 hs".                                   | O asterisco não tem explicação; as meias-vidas duplas são de liberação imediata/prolongada só nas três marcadas "liberação retardada" (o Olodaterol "22/45 hs" não está marcado).                                                                                | Explicar o asterisco e as duplas; corrigir "hs" para "h" (texto). |
| 10.6  | Oximetazolina                                       | Meia-vida "8 dias".                                                                                                                      | A meia-vida descrita na literatura é de horas; parece erro de unidade.                                                                                                                                                                                           | Conferir.                                                         |
| 10.7  | Paracetamol                                         | Dose tóxica 75 mg/kg.                                                                                                                    | O card da NAC indica tratamento com ingestão > 150 mg/kg (ver 6.3). Um paciente com 100 mg/kg aparece "acima da dose tóxica (1,3x)" e fora da indicação de NAC por dose.                                                                                         | Explicar a diferença na tela ou alinhar.                          |
| 10.8  | Faixa "abaixo"                                      | Abaixo de 50% da dose tóxica em verde ("abaixo da dose tóxica").                                                                         | A tabela não considera via, formulação de liberação prolongada, ingestão crônica nem coingestão; "abaixo" pode tranquilizar demais. Aqui o verde já virou cinza (ADR-017).                                                                                       | (a) aviso fixo sobre o que a tabela não considera; (b) manter.    |
| 10.9  | Faixas de entrada                                   | Qualquer peso > 0 e quantidade > 0.                                                                                                      | Faixas do porte: peso **0,5 a 300 kg** (a do roteiro), quantidade **0,0001 a 1.000.000 mg**. Fora delas não calcula.                                                                                                                                             | Confirmar.                                                        |
| 10.10 | Busca                                               | Nome ou sinônimo contendo o texto, com acento e caixa, a partir de 2 letras, 10 primeiros na ordem da tabela.                            | Aqui: sem acento ("valproico" acha "Ácido Valpróico"), nome que começa com o texto primeiro. A ordem da tabela do legado não é alfabética em 4 pontos (Aceclofenaco/Acebutolol, Clemastina/Ciclobenzaprina, Eslicarbazepina/Enalapril, Valsartana/Valaciclovir). | Sem decisão clínica; registro.                                    |

### Lista para revisão (242 entradas, todas pendentes)

Dose tóxica e meia-vida exatamente como no legado. Marque "Revisado" na
tarefa do CC-324 ou devolva as correções; cada correção sobe a versão da
tabela.

| #   | Medicamento        | Dose tóxica (mg/kg) | Meia-vida     | Lib. retardada | Sinônimos                        | Revisado |
| --- | ------------------ | ------------------- | ------------- | -------------- | -------------------------------- | -------- |
| 1   | AAS                | 100                 | 30 hs         |                | aspirina, acido acetilsalicilico | ☐        |
| 2   | Aceclofenaco       | 15                  | 4 hs          |                |                                  | ☐        |
| 3   | Acebutolol         | 25                  | 10 hs         |                |                                  | ☐        |
| 4   | Acemetacina        | 8,5                 | 11 hs         |                |                                  | ☐        |
| 5   | Aciclovir          | 300                 | 3 hs          |                |                                  | ☐        |
| 6   | Ácido Nalidíxico   | 150                 | 7 hs          |                |                                  | ☐        |
| 7   | Ácido Tiaprofênico | 40                  | 2 hs          |                |                                  | ☐        |
| 8   | Ácido Valpróico    | 200                 | 20 hs         |                | valproato, depakene              | ☐        |
| 9   | Alprazolam         | 0,05                | 15 hs         |                | frontal                          | ☐        |
| 10  | Amilorida          | 1,5                 | 9 hs          |                |                                  | ☐        |
| 11  | Amitriptilina      | 3                   | 25 hs         |                | tryptanol                        | ☐        |
| 12  | Amlodipina         | 0,2                 | 50 hs         |                | norvasc                          | ☐        |
| 13  | Amobarbital        | 4                   | 25 hs         |                |                                  | ☐        |
| 14  | Amoxicilina        | 250                 | 1,5 hs        |                |                                  | ☐        |
| 15  | Ampicilina         | 550                 | 1,5 hs        |                |                                  | ☐        |
| 16  | Atenolol           | 5                   | 7 hs          |                |                                  | ☐        |
| 17  | Avanafil           | 6                   | 17 hs         |                |                                  | ☐        |
| 18  | Azapropazona       | 50                  | 14 hs         |                |                                  | ☐        |
| 19  | Azilsartana        | 5                   | 11 hs         |                |                                  | ☐        |
| 20  | Azitromicina       | 20                  | 4 dias        |                |                                  | ☐        |
| 21  | Bambuterol         | 1,5                 | 21 hs         |                |                                  | ☐        |
| 22  | Barbital           | 20                  | 48 hs         |                |                                  | ☐        |
| 23  | Benazepril         | 0,5                 | 22 hs         |                |                                  | ☐        |
| 24  | Bendroflumetiazida | 0,4                 | 8,5 hs        |                |                                  | ☐        |
| 25  | Betaxolol          | 1                   | 22 hs         |                |                                  | ☐        |
| 26  | Bisoprolol         | 0,7                 | 12 hs         |                |                                  | ☐        |
| 27  | Bromazepam         | 0,7                 | 20 hs         |                | lexotan                          | ☐        |
| 28  | Bronfenaco         | 10                  | 4 hs          |                |                                  | ☐        |
| 29  | Bronfeniramina     | 3,5                 | 25 hs         |                |                                  | ☐        |
| 30  | Bumetanida         | 0,1                 | 3 hs          |                |                                  | ☐        |
| 31  | Buprenorfina       | 0,01                | 7 hs          |                |                                  | ☐        |
| 32  | Butobarbital       | 6                   | 42 hs         |                |                                  | ☐        |
| 33  | Candesartana       | 0,6                 | 9 hs          |                |                                  | ☐        |
| 34  | Captopril          | 3,5                 | 2 hs          |                |                                  | ☐        |
| 35  | Carbamazepina      | 20                  | 20 hs         |                | tegretol                         | ☐        |
| 36  | Carbonato de Lítio | 50                  | 24 hs         |                | litio, carbolitium               | ☐        |
| 37  | Carprofeno         | 20                  | 27 hs         |                |                                  | ☐        |
| 38  | Carteolol          | 0,7                 | 12 hs         |                |                                  | ☐        |
| 39  | Carvedilol         | 2,5                 | 6 hs          |                |                                  | ☐        |
| 40  | Celiprolol         | 14                  | 6 hs          |                |                                  | ☐        |
| 41  | Cetobemidona       | 0,4                 | 2,5 hs        |                |                                  | ☐        |
| 42  | Cetoprofeno        | 10                  | 4 hs          |                |                                  | ☐        |
| 43  | Cetorolaco         | 2                   | 5,5 hs        |                |                                  | ☐        |
| 44  | Cetotifeno         | 0,3                 | 21 hs         |                |                                  | ☐        |
| 45  | Ciclizina          | 5                   | 20 hs         |                |                                  | ☐        |
| 46  | Ciclobarbital      | 8                   | 12 hs         |                |                                  | ☐        |
| 47  | Cilazapril         | 0,2                 | 9 hs          |                |                                  | ☐        |
| 48  | Cinarizina         | 12                  | 6 hs          |                |                                  | ☐        |
| 49  | Ciprofloxacino     | 70                  | 5 hs          |                |                                  | ☐        |
| 50  | Ciproheptadina     | 2                   | 9 hs          |                |                                  | ☐        |
| 51  | Citalopram         | 2                   | 36 hs         |                |                                  | ☐        |
| 52  | Claritromicina     | 70                  | 5 hs          |                |                                  | ☐        |
| 53  | Clemastina         | 0,3                 | 21 hs         |                |                                  | ☐        |
| 54  | Ciclobenzaprina    | 1,5                 | 32 hs         |                |                                  | ☐        |
| 55  | Clobazam           | 1,5                 | 79 hs         |                |                                  | ☐        |
| 56  | Clomipramina       | 4                   | 36 hs         |                | anafranil                        | ☐        |
| 57  | Clonazepam         | 0,6                 | 40 hs         |                | rivotril                         | ☐        |
| 58  | Clonidina          | 0,01                | 24 hs         |                |                                  | ☐        |
| 59  | Clopamida          | 1,4                 | 10 hs         |                |                                  | ☐        |
| 60  | Clordiazepóxido    | 2                   | 78 hs         |                |                                  | ☐        |
| 61  | Clorfeniramina     | 0,85                | 43 hs         |                |                                  | ☐        |
| 62  | Clorpromazina      | 6                   | 40 hs         |                | amplictil                        | ☐        |
| 63  | Clorprotixeno      | 6                   | 12 hs         |                |                                  | ☐        |
| 64  | Clortalidona       | 3,5                 | 50 hs         |                |                                  | ☐        |
| 65  | Clozapina          | 10                  | 12 hs         |                | leponex                          | ☐        |
| 66  | Codeína            | 2,5                 | 4 hs          |                |                                  | ☐        |
| 67  | Dapoxetina         | 4                   | 19 hs         |                |                                  | ☐        |
| 68  | Dapsona            | 5                   | 30 hs         |                |                                  | ☐        |
| 69  | Desipramina        | 3                   | 27 hs         |                |                                  | ☐        |
| 70  | Desvenlafaxina     | 3                   | 15 hs         |                |                                  | ☐        |
| 71  | Dexcetoprofeno     | 5                   | 4 hs          |                |                                  | ☐        |
| 72  | Dexibuprofeno      | 60                  | 3,5 hs        |                |                                  | ☐        |
| 73  | Diazepam           | 0,7                 | 48 hs         |                | valium                           | ☐        |
| 74  | Diclofenaco        | 7                   | 2 hs          |                | voltaren, cataflan               | ☐        |
| 75  | Difenidramina      | 7,5                 | 9,5 hs        |                | dramin                           | ☐        |
| 76  | Diflunisal         | 50                  | 12 hs         |                |                                  | ☐        |
| 77  | Digoxina           | 0,02                | 40 hs         |                |                                  | ☐        |
| 78  | Dihidrocodeína     | 0,4                 | 3,5 hs        |                |                                  | ☐        |
| 79  | Diltiazem          | 5                   | 48 hs         |                |                                  | ☐        |
| 80  | Dipipanona         | 1,5                 | 3,5 hs        |                |                                  | ☐        |
| 81  | Dipirona           | 100                 | indeterminada |                | metamizol, novalgina             | ☐        |
| 82  | Disopiramida       | 15                  | 11 hs         |                |                                  | ☐        |
| 83  | Doxepina           | 4                   | 80 hs         |                |                                  | ☐        |
| 84  | Doxilamina         | 5                   | 10 hs         |                |                                  | ☐        |
| 85  | Duloxetina         | 5                   | 18 hs         |                | cymbalta                         | ☐        |
| 86  | Eslicarbazepina    | 30                  | 20 hs         |                |                                  | ☐        |
| 87  | Enalapril          | 0,7                 | 11 hs         |                |                                  | ☐        |
| 88  | Eplerenona         | 7                   | 5 hs          |                |                                  | ☐        |
| 89  | Eprosartana        | 40                  | 9 hs          |                |                                  | ☐        |
| 90  | Eritromicina       | 70                  | 2 hs          |                |                                  | ☐        |
| 91  | Escitalopram       | 1                   | 33 hs         |                | lexapro                          | ☐        |
| 92  | Espironolactona    | 10                  | 11,5 hs       |                |                                  | ☐        |
| 93  | Estazolam          | 0,2                 | 24 hs         |                |                                  | ☐        |
| 94  | Etizolam           | 0,1                 | 8 hs          |                |                                  | ☐        |
| 95  | Etodolaco          | 30                  | 7 hs          |                |                                  | ☐        |
| 96  | Famciclovir        | 50                  | 2 hs          |                |                                  | ☐        |
| 97  | Felodipina         | 0,2                 | 25 hs         |                |                                  | ☐        |
| 98  | Fenbufeno          | 40                  | 17 hs         |                |                                  | ☐        |
| 99  | Fenilefrina        | 1                   | 3 hs          |                |                                  | ☐        |
| 100 | Feniramina         | 3,5                 | 19 hs         |                |                                  | ☐        |
| 101 | Fenitoína          | 20                  | 230 hs        |                | hidantal                         | ☐        |
| 102 | Fenobarbital       | 4                   | 5 dias        |                | gardenal                         | ☐        |
| 103 | Fenoprofeno        | 85                  | 3 hs          |                |                                  | ☐        |
| 104 | Fentanil           | 0,04                | 8 hs          |                |                                  | ☐        |
| 105 | Ferro              | 20                  | 6 hs          |                | sulfato ferroso                  | ☐        |
| 106 | Flunitrazepam      | 0,05                | 35 hs         |                | rohypnol                         | ☐        |
| 107 | Fluoxetina         | 3                   | 16 dias       |                | prozac                           | ☐        |
| 108 | Flurazepam         | 2                   | 5 dias        |                |                                  | ☐        |
| 109 | Flurbiprofeno      | 85                  | 6 hs          |                |                                  | ☐        |
| 110 | Fluvoxamina        | 15                  | 22 hs         |                |                                  | ☐        |
| 111 | Formoterol         | 0,0015              | 10 hs         |                |                                  | ☐        |
| 112 | Fosinopril         | 1                   | 11,5 hs       |                |                                  | ☐        |
| 113 | Furosemida         | 3                   | indeterminada |                | lasix                            | ☐        |
| 114 | Glibenclamida      | 0,2                 | 15 hs\*       |                |                                  | ☐        |
| 115 | Gliclazida         | 1,3                 | 12/20 hs      | sim            |                                  | ☐        |
| 116 | Glimepirida        | 0,04                | 8 hs          |                |                                  | ☐        |
| 117 | Glipizida          | 0,2                 | 4 hs          |                |                                  | ☐        |
| 118 | Guanfacina         | 0,15                | 18 hs         |                |                                  | ☐        |
| 119 | Haloperidol        | 0,5                 | 35 hs         |                | haldol                           | ☐        |
| 120 | Hidroclorotiazida  | 3,5                 | 15 hs         |                |                                  | ☐        |
| 121 | Hidromorfona       | 0,1                 | 2,5 hs        |                |                                  | ☐        |
| 122 | Hidroxizina        | 10                  | 20 hs         |                | hixizine                         | ☐        |
| 123 | Ibuprofeno         | 100                 | 2,5 hs        |                | advil, alivium                   | ☐        |
| 124 | Imepitoin          | 30                  | 20 hs         |                |                                  | ☐        |
| 125 | Imidapril          | 0,7                 | 24 hs         |                |                                  | ☐        |
| 126 | Imipramina         | 4                   | 19 hs         |                | tofranil                         | ☐        |
| 127 | Indacaterol        | 0,01                | 5 dias        |                |                                  | ☐        |
| 128 | Indapamida         | 0,4                 | 24 hs         |                |                                  | ☐        |
| 129 | Indometacina       | 7                   | 11 hs         |                |                                  | ☐        |
| 130 | Irbesartana        | 10                  | 15 hs         |                |                                  | ☐        |
| 131 | Lacidipina         | 0,15                | 19 hs         |                |                                  | ☐        |
| 132 | Lenalidomida       | 0,7                 | 5 hs          |                |                                  | ☐        |
| 133 | Lercanidipina      | 0,4                 | 10 hs         |                |                                  | ☐        |
| 134 | Levobunolol        | 1                   | 7 hs          |                |                                  | ☐        |
| 135 | Levofloxacino      | 35                  | 8 hs          |                |                                  | ☐        |
| 136 | Levomepromazina    | 6                   | 78 hs         |                | neozine                          | ☐        |
| 137 | Levotiroxina       | 0,02                | 7 dias        |                | puran, euthyrox                  | ☐        |
| 138 | Lisinopril         | 0,7                 | 12,5 hs       |                |                                  | ☐        |
| 139 | Lítio              | 50                  | 24 hs         |                | carbolitium                      | ☐        |
| 140 | Lofepramina        | 4,5                 | 24 hs         |                |                                  | ☐        |
| 141 | Loprazolam         | 0,07                | 14 hs         |                |                                  | ☐        |
| 142 | Lorazepam          | 0,2                 | 20 hs         |                | lorax                            | ☐        |
| 143 | Lormetazepam       | 0,07                | 11 hs         |                |                                  | ☐        |
| 144 | Lornoxicam         | 0,8                 | 4 hs          |                |                                  | ☐        |
| 145 | Losartana          | 3,5                 | 9 hs          |                |                                  | ☐        |
| 146 | Maprotilina        | 3                   | 90 hs         |                |                                  | ☐        |
| 147 | Meclozina          | 5                   | 6 hs          |                |                                  | ☐        |
| 148 | Meloxicam          | 1                   | 20 hs         |                |                                  | ☐        |
| 149 | Meptazinol         | 8,5                 | 4 hs          |                |                                  | ☐        |
| 150 | Metadona           | 0,4                 | 60 hs         |                |                                  | ☐        |
| 151 | Metformina         | 80                  | 6,5 hs        |                | glifage                          | ☐        |
| 152 | Metildopa          | 15                  | indeterminada |                |                                  | ☐        |
| 153 | Metilfenidato      | 1                   | 2 hs          |                | ritalina                         | ☐        |
| 154 | Metolazona         | 0,7                 | 10 hs         |                |                                  | ☐        |
| 155 | Metoprolol         | 10                  | 3,5 hs        |                |                                  | ☐        |
| 156 | Midazolam          | 1                   | 2,5 hs        |                | dormonid                         | ☐        |
| 157 | Misoprostol        | 0,03                | 40 min        |                | cytotec                          | ☐        |
| 158 | Moexipril          | 1                   | 12 hs         |                |                                  | ☐        |
| 159 | Morfina            | 0,4                 | 3 hs          |                |                                  | ☐        |
| 160 | Moxifloxacino      | 25                  | 12 hs         |                |                                  | ☐        |
| 161 | Moxonidina         | 0,02                | 3 hs          |                |                                  | ☐        |
| 162 | Nabumetona         | 70                  | 27 hs         |                |                                  | ☐        |
| 163 | Nadolol            | 11                  | 24 hs         |                |                                  | ☐        |
| 164 | Nafazolina         | 0,1                 | indeterminada |                |                                  | ☐        |
| 165 | Naproxeno          | 35                  | 17 hs         |                | naprosyn, flanax                 | ☐        |
| 166 | Nebivolol          | 0,3                 | 50 hs         |                |                                  | ☐        |
| 167 | Nicardipina        | 3,5                 | 9 hs          |                |                                  | ☐        |
| 168 | Nifedipina         | 1,2                 | 3,5/11 hs     | sim            |                                  | ☐        |
| 169 | Nimodipina         | 6                   | 10 hs         |                |                                  | ☐        |
| 170 | Nitrazepam         | 0,4                 | 24 hs         |                |                                  | ☐        |
| 171 | Norfloxacino       | 50                  | 4 hs          |                |                                  | ☐        |
| 172 | Nortriptilina      | 2,5                 | 26 hs         |                | pamelor                          | ☐        |
| 173 | Ofloxacino         | 25                  | 6 hs          |                |                                  | ☐        |
| 174 | Olmesartana        | 1,5                 | 15 hs         |                |                                  | ☐        |
| 175 | Olodaterol         | 0,00035             | 22/45 hs      |                |                                  | ☐        |
| 176 | Oxazepam           | 3,5                 | 20 hs         |                |                                  | ☐        |
| 177 | Oxcarbazepina      | 40                  | 9,5 hs        |                | trileptal                        | ☐        |
| 178 | Oxicodona          | 0,2                 | 3 hs          |                |                                  | ☐        |
| 179 | Oximetazolina      | 0,4                 | 8 dias        |                |                                  | ☐        |
| 180 | Oxprenolol         | 11                  | 2 hs          |                |                                  | ☐        |
| 181 | Paracetamol        | 75                  | 3 hs          |                | tylenol, acetaminofeno           | ☐        |
| 182 | Paroxetina         | 3                   | 21 hs         |                | paxil, pondera                   | ☐        |
| 183 | Pentazocina        | 2,5                 | 3 hs          |                |                                  | ☐        |
| 184 | Perfenazina        | 0,6                 | 12 hs         |                |                                  | ☐        |
| 185 | Periciazina        | 1                   | indeterminada |                |                                  | ☐        |
| 186 | Perindopril        | 0,3                 | 17 hs         |                |                                  | ☐        |
| 187 | Petidina           | 6                   | 48 hs         |                | meperidina, dolantina            | ☐        |
| 188 | Pimozida           | 0,5                 | 55 hs         |                |                                  | ☐        |
| 189 | Pindolol           | 1                   | 4 hs          |                |                                  | ☐        |
| 190 | Pipotiazina        | 0,2                 | indeterminada |                |                                  | ☐        |
| 191 | Piroxicam          | 1                   | 50 hs         |                |                                  | ☐        |
| 192 | Pomalidomida       | 0,2                 | 9,5 hs        |                |                                  | ☐        |
| 193 | Prazepam           | 2                   | 70 hs         |                |                                  | ☐        |
| 194 | Primidona          | 60                  | 5 dias        |                |                                  | ☐        |
| 195 | Proclorperazina    | 2                   | 9 hs          |                |                                  | ☐        |
| 196 | Promazina          | 12                  | 40 hs         |                |                                  | ☐        |
| 197 | Prometazina        | 3,5                 | 14 hs         |                | fenergan                         | ☐        |
| 198 | Propranolol        | 4,5                 | 6/20 hs       | sim            |                                  | ☐        |
| 199 | Quetiapina         | 15                  | 22 hs         |                | seroquel                         | ☐        |
| 200 | Quinapril          | 1                   | 3 hs          |                |                                  | ☐        |
| 201 | Ramipril           | 0,2                 | 17 hs         |                |                                  | ☐        |
| 202 | Reboxetina         | 0,5                 | 13 hs         |                |                                  | ☐        |
| 203 | Risperidona        | 1                   | 24 hs         |                | risperdal                        | ☐        |
| 204 | Ritalina           | 1                   | 2 hs          |                | metilfenidato                    | ☐        |
| 205 | Salbutamol         | 0,5                 | 6 hs          |                | aerolin                          | ☐        |
| 206 | Salmeterol         | 0,007               | 5,5 hs        |                |                                  | ☐        |
| 207 | Secobarbital       | 4                   | 40 hs         |                |                                  | ☐        |
| 208 | Sertralina         | 7                   | 26 hs         |                | zoloft                           | ☐        |
| 209 | Sibutramina        | 50                  | 18 hs         |                |                                  | ☐        |
| 210 | Sildenafil         | 3                   | 5 hs          |                | viagra                           | ☐        |
| 211 | Sotalol            | 7                   | 20 hs         |                |                                  | ☐        |
| 212 | Sulindaco          | 30                  | 17 hs         |                |                                  | ☐        |
| 213 | Tadalafil          | 1                   | 17 hs         |                | cialis                           | ☐        |
| 214 | Talidomida         | 7                   | 7,5 hs        |                |                                  | ☐        |
| 215 | Tapentadol         | 2                   | 4 hs          |                |                                  | ☐        |
| 216 | Telitromicina      | 100                 | 3 hs          |                |                                  | ☐        |
| 217 | Telmisartana       | 3                   | 24 hs         |                |                                  | ☐        |
| 218 | Temazepam          | 1,5                 | 11 hs         |                |                                  | ☐        |
| 219 | Tenoxicam          | 1,5                 | 81 hs         |                |                                  | ☐        |
| 220 | Terbutalina        | 1                   | 3,5 hs        |                |                                  | ☐        |
| 221 | Timolol            | 1                   | 5 hs          |                |                                  | ☐        |
| 222 | Tioridazina        | 6                   | 10 hs         |                |                                  | ☐        |
| 223 | Tolbutamida        | 30                  | 8 hs          |                |                                  | ☐        |
| 224 | Tolmetino          | 85                  | 5 hs          |                |                                  | ☐        |
| 225 | Topiramato         | 10                  | 21 hs         |                | topamax                          | ☐        |
| 226 | Torasemida         | 0,4                 | 6 hs          |                |                                  | ☐        |
| 227 | Tramadol           | 4                   | 9 hs          |                | tramal                           | ☐        |
| 228 | Triamtereno        | 15                  | 2 hs          |                |                                  | ☐        |
| 229 | Triazolam          | 0,02                | 5,5 hs        |                |                                  | ☐        |
| 230 | Trifluoperazina    | 0,4                 | 22 hs         |                |                                  | ☐        |
| 231 | Trimipramina       | 5                   | 23 hs         |                |                                  | ☐        |
| 232 | Tripelenamina      | 5                   | 5,5 hs        |                |                                  | ☐        |
| 233 | Triprolidina       | 1                   | 5 hs          |                |                                  | ☐        |
| 234 | Valsartana         | 5                   | 9 hs          |                |                                  | ☐        |
| 235 | Valaciclovir       | 200                 | 3 hs          |                |                                  | ☐        |
| 236 | Vardenafil         | 0,5                 | 6 hs          |                | levitra                          | ☐        |
| 237 | Venlafaxina        | 7                   | 15 hs         |                | efexor, venlift                  | ☐        |
| 238 | Verapamil          | 5                   | 8 hs          |                |                                  | ☐        |
| 239 | Vilanterol         | 0,0015              | 11 hs         |                |                                  | ☐        |
| 240 | Xilometazolina     | 0,4                 | indeterminada |                |                                  | ☐        |
| 241 | Xipamida           | 3                   | 8 hs          |                |                                  | ☐        |
| 242 | Zofenopril         | 2                   | 5,5 hs        |                |                                  | ☐        |
