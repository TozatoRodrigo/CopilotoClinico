# Revisão clínica — Emergência pediátrica (CC-319 e CC-320)

**Para:** Dr. Gustavo Moreira (CC-310).
**Porte:** PedGuide do ANY App v4 (`v2/src/pages/PedGuide.tsx`, revisão `95c8fba`), com paridade
conferida por teste diferencial contra a cópia congelada em `tests/any-reference/`.

As doses do Copiloto são as do PedGuide v4 **até a fonte única ser assinada**
([CC-321](./pediatria-fonte-unica.md)). Esta lista não repete as divergências entre o PedGuide, o
HETRIN e o §17, que estão lá; aqui ficam os pontos do próprio PedGuide que parecem problema e as
diferenças de comportamento que o porte introduziu por regra do ADR-017. Nada abaixo mudou dose:
a engenharia não corrige conteúdo clínico.

## Achados no conteúdo do PedGuide v4

1. **Drogas sem teto no cálculo.**
   - Onde: `glicose`, `glicose-g10`, `glicose-g25`, `manitol`, `nacl`, `cisatracurio`.
   - O que o ANY diz: glicose 10% 5 mL/kg (250 mL = 25 g a 50 kg); G25% 2 mL/kg; manitol
     0,5 g/kg (25 g a 50 kg); NaCl 3% 3 mL/kg (150 mL a 50 kg); cisatracúrio 0,15 mg/kg.
   - Por que parece problema: as outras drogas do mesmo grupo têm teto; o HETRIN 1.1.7 limitava a
     glicose a 40 mL de G50% (20 g).
   - Opções: definir teto (ex.: glicose 25 g; manitol 50 g; NaCl 3% 250 mL); ou registrar que o
     teto é o próprio limite de peso de 50 kg.

2. **Teto no cálculo que o texto não menciona.**
   - Onde: `bicarbonato` (250 mEq), `cetamina` de indução (100 mg), `propofol` de indução (200 mg).
   - Por que parece problema: o médico vê a dose parar de subir sem saber por quê.
   - Opções: escrever o teto no texto ("Max: …") ou tirar o teto da conta.

3. **Emulsão lipídica: infusão sem teto e total máximo não aplicado.**
   - Onde: `emulsao-lipidica`.
   - O que o ANY diz: bolus 1,5 mL/kg até 100 mL; infusão 0,25 mL/kg/min (mostrada em mL/h: 750
     mL/h a 50 kg); "total sugerido até 12 mL/kg".
   - Por que parece problema: a conta não limita a infusão nem o total.
   - Opções: teto na infusão; mostrar o total de 12 mL/kg em mL para o peso.
   - No Copiloto o segundo número aparece como **Infusão (mL/h)**; no ANY ficava na caixa
     "Volume", com a explicação só na linha de baixo. A insulina em alta dose (`insulina-tox`)
     segue o mesmo formato.

4. **Volume que arredonda para 0,0 mL no neonato.**
   - Onde: `epinefrina-iv`, `hidrocortisona`, `difenidramina` e `vitamina-k`, com 0,5 a 1 kg.
   - O que o ANY diz: epinefrina IV a 0,5 kg = 0,01 mg e "0,0 mL" (0,05 mL arredondado para uma
     casa).
   - Por que parece problema: a dose aparece e o volume some.
   - Opções: duas casas no volume abaixo de 0,1 mL; ou orientar diluição maior para o neonato.

5. **Naloxona na intoxicação: a ponta menor da faixa.**
   - Onde: `naloxona-tox`.
   - O que o ANY diz: "0,1 mg/kg", conta `min(0,1 × peso; 0,4) – min(0,1 × peso; 2)`.
   - Por que parece problema: o texto fala em titular 0,01 mg/kg na dependência, mas a ponta menor
     calculada é 0,4 mg, sem explicação.
   - Opções: explicar a faixa (0,4 mg = dose inicial com ventilação presente?) ou calcular a
     ponta menor a 0,01 mg/kg.

6. **Cor de Broselow pelo peso no empate.**
   - O que o ANY faz: escolhe a cor de peso mais próximo; no empate fica a mais leve (16 kg vira
     Branco, 14 kg, e não Azul, 18 kg).
   - Opções: manter; ou usar a faixa de comprimento quando houver.

7. **Formatação do checklist de intubação.**
   - O ANY mostra o tubo "e um menor" como "3 e 2,5" mas "3,5 e 3,0" (com e sem casa decimal). O
     Copiloto reproduz; é só texto.

## Diferenças de comportamento do porte (ADR-017)

- **Vírgula decimal sempre.** O PedGuide mostra ponto decimal em 14 drogas ("6.0 mg"), porque usa
  `toFixed` sem trocar o separador. O número é o mesmo.
- **Peso fora de 0,5–50 kg é erro e nada é calculado**, como no ANY; aqui o campo diz a faixa
  aceita e o resumo avisa que nenhuma dose foi calculada.
- **Idade fora de 0–18 anos é erro.** No ANY a idade inválida caía, em silêncio, para a idade
  da cor de Broselow; aqui as drogas por idade pedem a correção.
- **Dose de infusão fora da faixa da droga não vira vazão.** O ANY calculava a vazão e só mostrava
  "Fora do range". A conta inversa (mL/h → dose) continua calculando e avisa "fora da faixa usual".
- **Infusão sem peso não mostra preparo.** O ANY mostrava o preparo da faixa < 15 kg quando não
  havia peso.
- **Alerta de neonato em forma de sugestão:** "Peso abaixo de 3 kg: considere o protocolo
  específico de reanimação neonatal" (o ANY: "seguir protocolo…").
- **"Não rotineiro" ganhou uma linha de aviso** além do selo: "Sem indicação de rotina: considere
  só na indicação específica descrita abaixo". O texto da droga é o do ANY.
- **Nomes e textos das drogas ficaram como no ANY** (inclusive caixa alta e "ROCURONIO" e
  "CISATRACURIO" sem acento nas infusões), porque são a chave da reconciliação da fonte única.

## Achados do porte dos cenários e da estimativa de peso (CC-320)

8. **Peso pelo comprimento: duas regras no ANY.**
   - O que o ANY diz: o PedGuide v4 usa o comprimento (46–145 cm) só para escolher a cor de
     Broselow, e o peso é o da cor (100 cm → Branco → 14 kg). O HETRIN Ped e o Ped Guide legado
     usam uma tabela de 29 faixas, 40–160 cm (100 cm → 16 kg), e o HETRIN põe esse peso como
     "FONTE", sem a marca de estimado.
   - O que o Copiloto faz: a tabela de 29 faixas (pedido da CC-320), com o peso **marcado como
     estimado**; a cor de Broselow vem do peso estimado.
   - Opções: manter as 29 faixas; ou voltar à regra do PedGuide (comprimento → cor → peso da cor).

9. **Peso pela idade (APLS/Luscombe) limitado a 50 kg.**
   - O que o HETRIN diz: abaixo de 1 ano (meses ÷ 2) + 4; de 1 a 5 anos 2 × idade + 8; acima de 5
     anos 3 × idade + 7; arredondado e limitado a 0,5–50 kg.
   - Por que parece problema: a partir de cerca de 14,2 anos a estimativa encosta em 50 kg e para de
     subir (um adolescente de 16 anos sai com 50 kg, sem aviso de que bateu no limite). Entre 5 e 6
     anos usa a fórmula de Luscombe (5,5 anos → 24 kg; pela de 1–5 anos daria 19 kg).
   - Opções: avisar quando a estimativa bate no limite; ou restringir a estimativa a 0–12 anos,
     como o APLS.

10. **Prioridade entre as fontes de peso.**
    - O que o HETRIN faz: a última entrada manda (digitar o comprimento troca o peso digitado).
    - O que o Copiloto faz: vale a melhor fonte — peso aferido, cor escolhida, comprimento, idade —
      e a fonte preenchida fora da faixa é erro, sem cair para a próxima em silêncio.

11. **Idade estimada pela cor.** O PedGuide v4 só usa a idade da cor quando a cor foi escolhida;
    o HETRIN usa a idade da cor também quando ela vem do peso aferido. O Copiloto segue o v4: com
    peso aferido e sem idade digitada, as drogas por idade, a PAS mínima e os acessos e drenos
    pedem a idade.

12. **Acessos e drenos (cateter venoso central, dreno de tórax, jelco, sonda vesical).** Só existem
    no HETRIN. Foram portados com a origem escrita na tela e revisão pendente.

13. **Cenários do HETRIN que o PedGuide v4 não tem.** Crise asmática e intoxicação existem no
    HETRIN (9 cenários) e não no v4 (7). Anafilaxia e IOT/ISR mostram menos drogas no v4 (3 e 4) do
    que no HETRIN (6 e 8). O Copiloto segue o v4; está também na
    [tabela 3 da fonte única](./pediatria-fonte-unica.md#tabela-3--outros-itens-pediátricos-que-entram-na-fonte-única).

14. **Desfibrilação e bolus de fluido sem teto no v4.** O HETRIN limita a 200 J e o bolus a
    1000 mL, mas até 50 kg esses tetos nunca atuam (4 J/kg × 50 = 200 J; 20 mL/kg × 50 = 1000
    mL). O HETRIN acrescenta "subsequentes 4–10 J/kg" e "bolus cauteloso 10 mL/kg", que o v4 não
    tem.

15. **Transfusão maciça em forma de sugestão.** O ANY escreve "Quando ativar: perda > 40 mL/kg ou
    > 50% volemia"; o Copiloto escreve "Considere ativar com perda > 40 mL/kg ou > 50% da volemia".

## Testes do branch antigo do ANY

O branch antigo (`claude/update-test-database-M10pD`) só testa a faixa de peso pediátrico (0,5–50
kg), já portada na fundação (`tests/clinical-tools/any-legacy.spec.ts`). Não há teste antigo do
PedGuide.
