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

## Testes do branch antigo do ANY

O branch antigo (`claude/update-test-database-M10pD`) só testa a faixa de peso pediátrico (0,5–50
kg), já portada na fundação (`tests/clinical-tools/any-legacy.spec.ts`). Não há teste antigo do
PedGuide.
