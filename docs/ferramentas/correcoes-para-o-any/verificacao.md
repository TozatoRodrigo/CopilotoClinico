# Verificação das correções para o ANY (CC-016)

Cada patch foi aplicado numa cópia temporária dos arquivos do ANY, fora do
repositório, e conferido rodando a **própria conta do ANY** antes e depois. Os
scripts estão em [`verificacao/`](./verificacao/); nenhum é importado por `src/`
nem por `web/`, e nenhum importa `tests/any-reference/` (o `preparar.mjs` só lê
a referência como texto, confere o sha256 e grava a cópia).

## Como rodar

```bash
# da raiz do repositório; <tmp> fora do repositório
node docs/ferramentas/correcoes-para-o-any/verificacao/preparar.mjs <tmp> [<clone do ANY, branch v4>]
node docs/ferramentas/correcoes-para-o-any/verificacao/verificar.mjs <tmp>
rm -rf <tmp>
```

O `preparar.mjs` monta `<tmp>/antes` com os arquivos do ANY exatamente como na
revisão `95c8fba` (confere o sha256 de cada um). O `sw.js` do HETRIN não está na
referência congelada: ele vem do clone do ANY, se o caminho for passado (sem ele,
a verificação 02 falha de propósito). O `verificar.mjs` aplica cada patch
sozinho (`patch -p1`) numa cópia de `antes` e roda a verificação dele; depois
aplica os 18 juntos e confere cada um de novo como "todos menos ele" × "todos".
Sai com código 1 se algum patch não aplicar ou alguma conferência falhar.

**Resultado da última rodada (15/10/2026):** 18 patches aplicados e conferidos, sozinhos e juntos. 73 conferências OK, nenhuma falha.
Os 18 também passam em `git apply --check` juntos, sobre a mesma cópia (o jeito de
aplicar que o README sugere).

## Patch 01 — HETRIN Ped: volume do glucagon (glucagon-tox)

**Como conferi:** Recorta as drogas do `<script>` do HETRIN e roda o `calc` do glucagon em vários pesos, antes e depois. Compara, de 0,5 a 50 kg (passo 0,1), com o mesmo `calc` do PedGuide v4, que o ANY já corrigiu.

Script: [`verificacao/01-hetrinped-glucagon.mjs`](./verificacao/01-hetrinped-glucagon.mjs). Saída:

```text
peso  | dose (mg) | antes                        | depois                         | PedGuide v4
3 kg  | 0,15      | 0,19 mL da solução 0,8 mg/mL | 1,88 mL da solução 0,08 mg/mL  | 1,88 mL
10 kg | 0,50      | 0,63 mL da solução 0,8 mg/mL | 6,25 mL da solução 0,08 mg/mL  | 6,25 mL
20 kg | 1,00      | 1,25 mL da solução 0,8 mg/mL | 12,50 mL da solução 0,08 mg/mL | 12,50 mL
30 kg | 1,50      | 1,88 mL da solução 0,8 mg/mL | 18,75 mL da solução 0,08 mg/mL | 18,75 mL
50 kg | 2,50      | 3,13 mL da solução 0,8 mg/mL | 31,25 mL da solução 0,08 mg/mL | 31,25 mL

OK     10 kg: antes 0,63 mL, depois 6,25 mL
OK     depois: volume × 0,08 mg/mL = dose, de 0,5 a 50 kg
OK     depois: igual ao PedGuide v4 em todos os pesos de 0,5 a 50 kg (passo 0,1)
OK     depois: instrução diz 0,08 mg/mL
```

## Patch 02 — HETRIN Ped: a versão nova chega a quem já instalou (service worker)

**Como conferi:** Roda o `sw.js` num ambiente de mentira (caches, janelas e `Request` simulados): instala e ativa como num aparelho que já tinha a v1.1.7 e como numa primeira visita, e conta o que ele apaga e recarrega. Confere no `index.html` a busca de versão nova ao voltar do segundo plano. Falta o teste num celular de verdade (Android e iPhone): ver "Teste manual" abaixo.

Script: [`verificacao/02-hetrinped-service-worker.mjs`](./verificacao/02-hetrinped-service-worker.mjs). Saída:

```text
                                                       | antes                           | depois
CACHE_NAME                                             | hetrinped-v1.1.7                | hetrinped-v1.1.8
rodapé                                                 | Ped Guide v1.1.7                | Ped Guide v1.1.8
caches depois de ativar (aparelho com versão anterior) | hetrinped-v1.1.7                | hetrinped-v1.1.8
janelas abertas recarregadas na atualização            | 0                               | 1
janelas recarregadas na primeira instalação            | —                               | 0
pedidos do pré-cache                                   | default,default,default,default | reload,reload,reload,reload

OK     CACHE_NAME mudou (o navegador instala o sw novo)
OK     versão do rodapé acompanha o CACHE_NAME
OK     atualização: apaga o cache antigo e assume as janelas
OK     atualização: recarrega a janela aberta (antes não recarregava)
OK     primeira instalação: não recarrega
OK     pré-cache busca na rede (cache: reload)
OK     página procura versão nova ao voltar do segundo plano
```

**Teste manual no celular (antes de publicar para todos):** publicar numa URL de
teste do Netlify; abrir a v1.1.7 instalada; publicar a v1.1.8; voltar ao app
(sem fechar) e conferir que ele recarrega e mostra "Ped Guide v1.1.8" no rodapé
e 6,25 mL no glucagon a 10 kg. No Chrome, DevTools → Application → Service
Workers mostra o `hetrinped-v1.1.8` ativo e um cache só.

## Patch 03 — VM Guide: índice ROX com a FiO₂ em fração

**Como conferi:** Carrega o `vmData.ts` inteiro e roda `calcROX` e `interpretROX` nos exemplos, compara com a fórmula de Roca e procura o maior ROX possível antes do patch.

Script: [`verificacao/03-vm-guide-rox.mjs`](./verificacao/03-vm-guide-rox.mjs). Saída:

```text
entrada                   | antes                                   | depois
SpO₂ 94%, FiO₂ 0,5, FR 22 | 0,09 (alto risco — considere intubação) | 8,55 (baixo risco)
SpO₂ 94%, FiO₂ 50, FR 22  | 0,09 (alto risco — considere intubação) | 8,55 (baixo risco)
SpO₂ 96%, FiO₂ 0,4, FR 20 | 0,12 (alto risco — considere intubação) | 12,00 (baixo risco)
SpO₂ 88%, FiO₂ 0,6, FR 30 | 0,05 (alto risco — considere intubação) | 4,89 (baixo risco)
SpO₂ 90%, FiO₂ 0,8, FR 35 | 0,03 (alto risco — considere intubação) | 3,21 (alto risco — considere intubação)

Maior ROX possível antes (SpO₂ 70–100, FiO₂ 0,21–1,0, FR ≥ 2): 2,38 — todo paciente caía em "alto risco".

OK     SpO₂ 94%, FiO₂ 0,5, FR 22: antes 0,09; depois 8,55
OK     depois: igual à fórmula de Roca nos casos
OK     depois: FiO₂ digitada em % (50) dá o mesmo que em fração (0,5)
OK     antes: nunca passava de 3,85 (sempre "alto risco")
OK     faixas (4,88 e 3,85) não mudaram
```

## Patch 04 — Bloqueios: dose máxima de anestésico local com teto absoluto

**Como conferi:** Roda as expressões da própria tela (`{fmt(…)} mg` e `mL`) com o dado `anesthetics` de cada versão, em 5 pesos.

Script: [`verificacao/04-bloqueios-teto.mjs`](./verificacao/04-bloqueios-teto.mjs). Saída:

```text
peso   | anestésico  | antes: sem / com epi (mg) | depois: sem / com epi (mg) | depois: volume na maior concentração
50 kg  | Lidocaína   | 225 / 350                 | 225 / 350                  | 11,3 mL (2%) / 17,5 mL (2%)
50 kg  | Bupivacaína | 125 / 150                 | 125 / 150                  | 25,0 mL (0,5%) / 30,0 mL (0,5%)
50 kg  | Ropivacaína | 150 / 175                 | 150 / 175                  | 30,0 mL (0,5%) / 35,0 mL (0,5%)
70 kg  | Lidocaína   | 315 / 490                 | 300 / 490                  | 15,0 mL (2%) / 24,5 mL (2%)
70 kg  | Bupivacaína | 175 / 210                 | 175 / 210                  | 35,0 mL (0,5%) / 42,0 mL (0,5%)
70 kg  | Ropivacaína | 210 / 245                 | 210 / 245                  | 42,0 mL (0,5%) / 49,0 mL (0,5%)
100 kg | Lidocaína   | 450 / 700                 | 300 / 500                  | 15,0 mL (2%) / 25,0 mL (2%)
100 kg | Bupivacaína | 250 / 300                 | 175 / 225                  | 35,0 mL (0,5%) / 45,0 mL (0,5%)
100 kg | Ropivacaína | 300 / 350                 | 300 / 350                  | 60,0 mL (0,5%) / 70,0 mL (0,5%)
150 kg | Lidocaína   | 675 / 1050                | 300 / 500                  | 15,0 mL (2%) / 25,0 mL (2%)
150 kg | Bupivacaína | 375 / 450                 | 175 / 225                  | 35,0 mL (0,5%) / 45,0 mL (0,5%)
150 kg | Ropivacaína | 450 / 525                 | 450 / 525                  | 90,0 mL (0,5%) / 105,0 mL (0,5%)
200 kg | Lidocaína   | 900 / 1400                | 300 / 500                  | 15,0 mL (2%) / 25,0 mL (2%)
200 kg | Bupivacaína | 500 / 600                 | 175 / 225                  | 35,0 mL (0,5%) / 45,0 mL (0,5%)
200 kg | Ropivacaína | 600 / 700                 | 600 / 700                  | 120,0 mL (0,5%) / 140,0 mL (0,5%)

OK     lidocaína 100 kg: 300 mg sem e 500 mg com epinefrina (antes 450 e 700)
OK     bupivacaína 100 kg: 175 mg sem e 225 mg com epinefrina
OK     volume em mL acompanha o teto (lidocaína 2%, 100 kg: 15 mL sem epi)
OK     ropivacaína sem teto absoluto (sem valor proposto): igual ao antes
OK     abaixo de 66,7 kg nada muda
```

## Patch 05 — Ped Guide e HETRIN: volume e dose do neonato sem sumir nem dobrar no arredondamento

**Como conferi:** Roda o `calc` de todas as drogas em bolus dos dois sites, de 0,5 a 50 kg, e compara o volume mostrado com o volume exato (o mesmo `calc` com o arredondamento desligado). Confere também que de 3 a 50 kg nenhum número muda além de ganhar casa decimal.

Script: [`verificacao/05-pediatria-volume.mjs`](./verificacao/05-pediatria-volume.mjs). Saída:

```text
site       | droga          | peso   | antes (dose · volume) | depois          | volume exato
any.app.br | epinefrina-iv  | 0,5 kg | 0,01 · 0,0 mL         | 0,005 · 0,05 mL | 0,050 mL
any.app.br | amiodarona     | 0,5 kg | 3 · 0.1 mL            | 3 · 0,05 mL     | 0,050 mL
any.app.br | hidrocortisona | 0,5 kg | 2 · 0.0 mL            | 2 · 0,04 mL     | 0,040 mL
any.app.br | difenidramina  | 1 kg   | 1 · 0.0 mL            | 1 · 0,03 mL     | 0,025 mL
any.app.br | vitamina-k     | 1 kg   | 0,03 · 0,00 mL        | 0,03 · 0,003 mL | 0,0030 mL
any.app.br | bicarbonato    | 0,5 kg | 1 · 1 mL              | 0,50 · 0,50 mL  | 0,50 mL
HETRIN     | epinefrina-iv  | 0,5 kg | 0,01 · 0,1 mL         | 0,005 · 0,05 mL | 0,050 mL
HETRIN     | amiodarona     | 0,5 kg | 3 · 0,1 mL            | 3 · 0,05 mL     | 0,050 mL
HETRIN     | hidrocortisona | 0,5 kg | 2 · 0,0 mL            | 2 · 0,04 mL     | 0,040 mL
HETRIN     | difenidramina  | 1 kg   | 1 · 0,0 mL            | 1 · 0,03 mL     | 0,025 mL
HETRIN     | vitamina-k     | 1 kg   | 0,03 · 0,00 mL        | 0,03 · 0,003 mL | 0,0030 mL
HETRIN     | bicarbonato    | 0,5 kg | 1 · 1 mL              | 0,50 · 0,50 mL  | 0,50 mL

any.app.br, ainda com erro ≥ 20% depois: bicarbonato (1,3, 1,4, 1,5, 1,6, 2,5 kg); glicose-g10 (0,5 kg); glicose-g25 (0,7, 0,8 kg); epinefrina-im (1,3, 1,4, 1,5, 1,6 kg); glicose (0,5 kg); difenidramina (0,5, 0,6 kg); manitol (0,5, 0,6, 1 kg); nacl (0,5 kg); morfina-dor (1,3, 1,4, 1,5, 1,6 kg); vitamina-k (0,5, 4,2, 4,3, 4,4, 4,5, 4,6, 4,7, 4,8, 4,9, 5, 5,1, 5,2, 5,3, 5,4, 5,5 kg).
HETRIN, ainda com erro ≥ 20% depois: bicarbonato (1,3, 1,4, 1,5, 1,6, 2,5 kg); glicose-g25 (1,3, 1,4, 1,5, 1,6, 2,5 kg); epinefrina-im (1,3, 1,4, 1,5, 1,6 kg); glicose (1,3, 1,4, 1,5, 1,6, 2,5 kg); difenidramina (0,5, 0,6 kg); manitol (0,5, 0,6, 1 kg); nacl (0,5 kg); morfina-dor (1,3, 1,4, 1,5, 1,6 kg); bicarbonato-tox (1,3, 1,4, 1,5, 1,6, 2,5 kg); insulina-tox (1,3, 1,4, 1,5, 1,6, 2,5 kg); vitamina-k (0,5, 4,2, 4,3, 4,4, 4,5, 4,6, 4,7, 4,8, 4,9, 5, 5,1, 5,2, 5,3, 5,4, 5,5 kg).

OK     any.app.br: pesos×drogas com volume 0 ou erro ≥ 20% — antes 187, depois 38
OK     any.app.br: nenhum volume "0" com dose > 0 depois
OK     any.app.br: de 3 a 50 kg, nenhum número muda além da casa decimal a mais
OK     HETRIN: pesos×drogas com volume 0 ou erro ≥ 20% — antes 222, depois 54
OK     HETRIN: nenhum volume "0" com dose > 0 depois
OK     HETRIN: de 3 a 50 kg, nenhum número muda além da casa decimal a mais
OK     any.app.br, epinefrina IV 0,5 kg: antes "0,0 mL", depois "0,05 mL"
```

## Patch 06 — CAD e EHH (KetoPath): calculadora de insulina travada com potássio < 3,5

**Como conferi:** Renderiza o passo de insulina da própria tela do ANY (`PassoInsulina`) com um React de mentira e lê o texto da calculadora de velocidade, com potássio de 3,0 a 4,2.

Script: [`verificacao/06-ketopath-insulina.mjs`](./verificacao/06-ketopath-insulina.mjs). Saída:

```text
potássio e peso | aviso "Insulina bloqueada" | calculadora antes                          | calculadora depois
K 3, peso 70    | sim                        | 7,0 U/h                                    | Velocidade não calculada: insulina bloqueada enquanto o potássio estiver abaixo de 3,5 mEq/L.
K 3,4, peso 70  | sim                        | 7,0 U/h                                    | Velocidade não calculada: insulina bloqueada enquanto o potássio estiver abaixo de 3,5 mEq/L.
K 3,5, peso 70  | não                        | 7,0 U/h                                    | 7,0 U/h
K 4,2, peso 70  | não                        | 7,0 U/h                                    | 7,0 U/h
K 3, peso —     | sim                        | Informe o peso para calcular a velocidade. | Velocidade não calculada: insulina bloqueada enquanto o potássio estiver abaixo de 3,5 mEq/L.

OK     K 3,0 e 70 kg: antes mostrava 7,0 U/h abaixo do bloqueio; depois não mostra velocidade
OK     K 4,2: velocidade igual antes e depois (7,0 U/h)
OK     K 3,5 exato: segue liberado como no ANY (borda não mudou)
```

## Patch 07 — Heparina (SCA): ajuste sem dose atual parte da infusão inicial real

**Como conferi:** Roda as contas da tela de heparina (de `const modo` até a vazão) na fase de ajuste, com e sem dose atual.

Script: [`verificacao/07-heparina-ajuste.mjs`](./verificacao/07-heparina-ajuste.mjs). Saída:

```text
caso                                    | infusão inicial | novo ritmo antes | novo ritmo depois
SCA, 100 kg, TTPa 1,3, dose atual vazia | 1000 UI/h       | 1400 UI/h        | 1200 UI/h
SCA, 120 kg, TTPa 1,0, dose atual vazia | 1000 UI/h       | 1920 UI/h        | 1480 UI/h
SCA, 100 kg, TTPa 1,3, dose atual 10    | 1000 UI/h       | 1200 UI/h        | 1200 UI/h
SCA, 70 kg, TTPa 1,3, dose atual vazia  | 840 UI/h        | 980 UI/h         | 980 UI/h
TEP, 100 kg, TTPa 1,3, dose atual vazia | 1800 UI/h       | 2000 UI/h        | 2000 UI/h

OK     SCA 100 kg, TTPa 1,3, sem dose atual: antes 1.400 UI/h, depois 1.200 UI/h (1.000 + 2 UI/kg/h)
OK     com a dose atual digitada, nada muda
OK     SCA 70 kg (teto não atua) e TEP: nada muda
```

## Patch 08 — ACLS: card "Agora" sugere amiodarona após o 3º e o 5º choque

**Como conferi:** Recorta `getGuide()` (card "Agora") e roda com 1 a 6 choques registrados.

Script: [`verificacao/08-acls-amiodarona.mjs`](./verificacao/08-acls-amiodarona.mjs). Saída:

```text
choques registrados         | card "Agora" antes                     | card "Agora" depois
1 choque(s)                 | RCP de alta qualidade + prepare choque | RCP de alta qualidade + prepare choque
2 choque(s)                 | Considere amiodarona 300 mg IV         | RCP de alta qualidade + prepare choque
3 choque(s)                 | Considere amiodarona 300 mg IV         | Considere amiodarona 300 mg IV
4 choque(s), 300 mg já dada | Considere amiodarona 150 mg IV         | RCP de alta qualidade + prepare choque
5 choque(s), 300 mg já dada | Considere amiodarona 150 mg IV         | Considere amiodarona 150 mg IV
6 choque(s), 300 mg já dada | Considere amiodarona 150 mg IV         | Considere amiodarona 150 mg IV

OK     amiodarona 300 mg: antes a partir do 2º choque, depois a partir do 3º
OK     amiodarona 150 mg: antes a partir do 4º choque, depois a partir do 5º
OK     ritmo não chocável: card igual
```

## Patch 09 — NEWS2: 3 pontos em um único parâmetro pedem resposta urgente

**Como conferi:** Carrega o `calculatorData.ts` e pontua o NEWS2 como a tela do ANY pontua (soma das opções e `interpret(score, seleções)`), a partir de sinais vitais.

Script: [`verificacao/09-calc-news2.mjs`](./verificacao/09-calc-news2.mjs). Saída:

```text
caso                           | NEWS2 | antes                                                                                                               | depois
tudo normal                    | 0     | Baixo risco — Monitoramento de rotina (mínimo a cada 12h). Manter vigilância clínica.                               | Baixo risco — Monitoramento de rotina (mínimo a cada 12h). Manter vigilância clínica.
FR 7 (o resto normal)          | 3     | Baixo risco — Monitoramento de rotina (mínimo a cada 12h). Manter vigilância clínica.                               | Risco baixo-médio (3 pontos em um parâmetro) — Monitoramento mínimo a cada 1h. Considere revisao medica urgente.
confusão nova (o resto normal) | 3     | Baixo risco — Monitoramento de rotina (mínimo a cada 12h). Manter vigilância clínica.                               | Risco baixo-médio (3 pontos em um parâmetro) — Monitoramento mínimo a cada 1h. Considere revisao medica urgente.
PAS 88 (o resto normal)        | 3     | Baixo risco — Monitoramento de rotina (mínimo a cada 12h). Manter vigilância clínica.                               | Risco baixo-médio (3 pontos em um parâmetro) — Monitoramento mínimo a cada 1h. Considere revisao medica urgente.
FC 95 e T 38,5 °C              | 2     | Baixo risco — Monitoramento de rotina (mínimo a cada 12h). Manter vigilância clínica.                               | Baixo risco — Monitoramento mínimo a cada 4-6h. Manter vigilância clínica.
FR 22, SpO₂ 93%, FC 95         | 5     | Risco médio — Monitoramento a cada 4-6h. Considere revisao medica urgente.                                          | Risco médio — Monitoramento mínimo a cada 1h. Considere revisao medica urgente.
FR 26, SpO₂ 91%, FC 112        | 8     | Alto risco — Emergência clínica. Revisao medica imediata. Considere transferência para UTI. Monitoramento contínuo. | Alto risco — Emergência clínica. Revisao medica imediata. Considere transferência para UTI. Monitoramento contínuo.

OK     FR 7 isolada (NEWS2 3): antes "Baixo risco", depois resposta urgente
OK     confusão nova e PAS 88 isoladas também viram resposta urgente
OK     soma igual antes e depois (os pontos não mudaram)
OK     NEWS2 ≥ 7 continua "Alto risco"
```

## Patch 10 — CIWA-Ar: náusea, tremor, sudorese, ansiedade e agitação de 0 a 7

**Como conferi:** Pontua o CIWA-Ar a partir das notas de 0 a 7 que o médico daria; na versão de hoje, a nota cai na opção "(1-3)" ou "(4-6)" que a cobre.

Script: [`verificacao/10-calc-ciwa-ar.mjs`](./verificacao/10-calc-ciwa-ar.mjs). Saída:

```text
notas (Sullivan 1989, 0–7 por item)                | antes                     | depois
tremor 1 (o resto 0)                               | 2 — Abstinência leve      | 1 — Abstinência leve
nota 1 nos cinco itens                             | 10 — Abstinência moderada | 5 — Abstinência leve
nota 3 nos cinco itens + cefaleia 3 + orientação 2 | 15 — Abstinência moderada | 20 — Abstinência grave
nota 4 nos cinco itens                             | 25 — Abstinência grave    | 20 — Abstinência grave
nota 6 nos cinco itens                             | 25 — Abstinência grave    | 30 — Abstinência grave

OK     depois: os cinco itens têm as notas 0,1,2,3,4,5,6,7
OK     nota 1 nos cinco itens: antes 10 (moderada, sugere benzodiazepínico), depois 5 (leve)
OK     nota 3 nos cinco + cefaleia 3 + orientação 2: antes 15 (moderada), depois 20 (grave)
OK     depois: total = soma das notas dadas
```

## Patch 11 — HELLP (Mississippi): TGO ≥ 70 nas classes 1 e 2, ≥ 40 na classe 3, com LDH

**Como conferi:** Pontua a HELLP a partir de plaquetas, LDH e TGO, nas duas versões do item TGO.

Script: [`verificacao/11-calc-hellp.mjs`](./verificacao/11-calc-hellp.mjs). Saída:

```text
exames                        | antes                                     | depois
plaq 40 mil, LDH 900, TGO 150 | HELLP — Mississippi Classe 1 (mais grave) | HELLP — Mississippi Classe 1 (mais grave)
plaq 40 mil, LDH 900, TGO 45  | HELLP — Mississippi Classe 1 (mais grave) | HELLP incompleta
plaq 80 mil, LDH 300, TGO 120 | HELLP — Mississippi Classe 2              | HELLP incompleta
plaq 120 mil, LDH 700, TGO 55 | HELLP — Mississippi Classe 3              | HELLP — Mississippi Classe 3
plaq 120 mil, LDH 700, TGO 30 | HELLP — Mississippi Classe 3              | HELLP incompleta
plaq 120 mil, LDH 400, TGO 30 | HELLP incompleta                          | HELLP incompleta

OK     plaq 40 mil, LDH 900, TGO 150: Classe 1 nas duas versões
OK     plaq 40 mil, LDH 900, TGO 45: antes Classe 1 ("considere parto imediato"); depois incompleta
OK     plaq 80 mil, sem LDH, TGO 120: antes Classe 2; depois incompleta
OK     plaq 120 mil, LDH 700, TGO 55: Classe 3 nas duas (TGO ≥ 40 basta na classe 3)
OK     plaq 120 mil, LDH 700, TGO 30: antes Classe 3; depois incompleta
```

## Patch 12 — Paliativos: matriz de compatibilidade da hipodermóclise com a diagonal no lugar

**Como conferi:** Monta a matriz como a tela mostra (roda a expressão das células da própria tela sobre o `paliaData`) e conta pares discordantes, a coluna DEX e a diagonal.

Script: [`verificacao/12-paliativos-matriz.mjs`](./verificacao/12-paliativos-matriz.mjs). Saída:

```text
Pares discordantes (A×B ≠ B×A): antes 37, depois 12.
Coluna DEX: antes "(vazio)(vazio)(vazio)(vazio)(vazio)(vazio)(vazio)(vazio)(vazio)(vazio)(vazio)(vazio)(vazio)(vazio)—", depois "IIIIIIIIIIIIII—".
Diagonal (droga com ela mesma): antes "CCCCCCCCCICICI(vazio)", depois "———————————————".
Discordâncias que ficam depois (precisam da fonte, Azevedo e Barbosa): CEF×OCT I/C; CRO×OCT I/C; DIP×OCT I/C; ESC×OCT I/C; FUR×OCT I/C; HAL×OCT I/C; LEV×OCT I/C; MTC×OCT I/C; MDZ×OCT I/C; MOR×OCT I/C; MOR×TRA C/I; OCT×OND C/I.

Matriz como fica na tela depois do patch:
       CEF CRO DIP ESC FUR HAL LEV MTC MDZ MOR OCT OND RAN TRA DEX
CEF    —   C   C   C   C   C   C   C   C   C   I   C   I   C   I
CRO    C   —   C   C   C   C   C   C   C   C   I   C   I   C   I
DIP    C   C   —   C   C   C   C   C   C   C   I   C   I   C   I
ESC    C   C   C   —   C   C   C   C   C   C   I   C   I   C   I
FUR    C   C   C   C   —   C   C   I   I   I   I   C   I   C   I
HAL    C   C   C   C   C   —   C   C   C   C   I   C   I   C   I
LEV    C   C   C   C   C   C   —   C   C   C   I   C   I   C   I
MTC    C   C   C   C   I   C   C   —   C   C   I   C   I   C   I
MDZ    C   C   C   C   I   C   C   C   —   C   I   C   C   C   I
MOR    C   C   C   C   I   C   C   C   C   —   I   C   C   C   I
OCT    C   C   C   C   C   C   C   C   C   C   —   C   I   I   I
OND    C   C   C   C   C   C   C   C   C   C   I   —   I   C   I
RAN    I   I   I   I   I   I   I   I   C   C   I   I   —   C   I
TRA    C   C   C   C   C   C   C   C   C   I   I   C   C   —   I
DEX    I   I   I   I   I   I   I   I   I   I   I   I   I   I   —

OK     antes: 37 pares discordantes (o número que o teste do Copiloto trava)
OK     depois: 12 pares discordantes, todos com octreotide ou tramadol
OK     depois: coluna DEX toda "I" (como diz o aviso da própria tela)
OK     depois: diagonal sem "I" (droga incompatível com ela mesma)
OK     dado (paliaData.ts) não mudou
```

## Patch 13 — Tox Path: dose de NAC com peso de dose limitado a 100 kg

**Como conferi:** Recorta o `useMemo` da calculadora de NAC da tela e roda com vários pesos.

Script: [`verificacao/13-toxpath-nac.mjs`](./verificacao/13-toxpath-nac.mjs). Saída:

```text
peso   | antes (1ª etapa | total)                                        | depois
60 kg  | 9.0 g (9000 mg) em 200 mL SF | Dose total: 18.0 g em 21 horas   | 9.0 g (9000 mg) em 200 mL SF | Dose total: 18.0 g em 21 horas
100 kg | 15.0 g (15000 mg) em 200 mL SF | Dose total: 30.0 g em 21 horas | 15.0 g (15000 mg) em 200 mL SF | Dose total: 30.0 g em 21 horas
120 kg | 18.0 g (18000 mg) em 200 mL SF | Dose total: 36.0 g em 21 horas | 15.0 g (15000 mg) em 200 mL SF | Dose total: 30.0 g em 21 horas (calculada para 100 kg)
150 kg | 22.5 g (22500 mg) em 200 mL SF | Dose total: 45.0 g em 21 horas | 15.0 g (15000 mg) em 200 mL SF | Dose total: 30.0 g em 21 horas (calculada para 100 kg)
250 kg | 37.5 g (37500 mg) em 200 mL SF | Dose total: 75.0 g em 21 horas | 15.0 g (15000 mg) em 200 mL SF | Dose total: 30.0 g em 21 horas (calculada para 100 kg)

OK     150 kg: antes 22,5 g na 1ª etapa e 45 g no total; depois 15 g e 30 g
OK     depois: acima de 100 kg a tela avisa "calculada para 100 kg"
OK     até 100 kg nada muda
OK     faixa aceita (20–250 kg) não mudou
```

## Patch 14 — Tox Path: carvão ativado em criança sem o mínimo de 25 g

**Como conferi:** Recorta a linha da dose de carvão da tela e roda com vários pesos.

Script: [`verificacao/14-toxpath-carvao.mjs`](./verificacao/14-toxpath-carvao.mjs). Saída:

```text
peso   | antes            | depois
5 kg   | 25 g (5,0 g/kg)  | 5 g (1,0 g/kg)
10 kg  | 25 g (2,5 g/kg)  | 10 g (1,0 g/kg)
15 kg  | 25 g (1,7 g/kg)  | 15 g (1,0 g/kg)
20 kg  | 25 g (1,3 g/kg)  | 20 g (1,0 g/kg)
25 kg  | 25 g (1,0 g/kg)  | 25 g (1,0 g/kg)
40 kg  | 40 g (1,0 g/kg)  | 40 g (1,0 g/kg)
70 kg  | 70 g (1,0 g/kg)  | 70 g (1,0 g/kg)
120 kg | 100 g (0,8 g/kg) | 100 g (0,8 g/kg)

OK     10 kg: antes 25 g (2,5 g/kg), depois 10 g (1 g/kg)
OK     a partir de 25 kg nada muda (inclusive o teto de 100 g)
OK     depois: nenhum peso de 1 a 300 kg passa de 1 g/kg (arredondado) nem de 100 g
```

## Patch 15 — APACHE II: pontos de cada faixa como na tabela de Knaus (1985)

**Como conferi:** Compara, valor a valor (131 valores nas 7 variáveis), os pontos de cada versão com a tabela de Knaus escrita no script, e pontua um paciente de exemplo.

Script: [`verificacao/15-calc-apache-ii.mjs`](./verificacao/15-calc-apache-ii.mjs). Saída:

```text
Valores em que o ANY de hoje pontua diferente de Knaus (variável, valor, antes, depois, Knaus):
variável | valor | antes | depois | Knaus
temp     | 30    | 4     | 3      | 3
temp     | 31    | 4     | 3      | 3
temp     | 31,9  | 4     | 3      | 3
temp     | 32    | 3     | 2      | 2
temp     | 33    | 3     | 2      | 2
temp     | 33,9  | 3     | 2      | 2
rr_val   | 6     | 3     | 2      | 2
rr_val   | 8     | 3     | 2      | 2
rr_val   | 9     | 3     | 2      | 2
ph       | 7,25  | 1     | 2      | 2
ph       | 7,3   | 1     | 2      | 2
ph       | 7,32  | 1     | 2      | 2
na_val   | 150   | 2     | 1      | 1
na_val   | 152   | 2     | 1      | 1
na_val   | 154   | 2     | 1      | 1
na_val   | 155   | 3     | 2      | 2
na_val   | 157   | 3     | 2      | 2
na_val   | 159   | 3     | 2      | 2
na_val   | 160   | 4     | 3      | 3
na_val   | 170   | 4     | 3      | 3
na_val   | 179   | 4     | 3      | 3
k_val    | 2,5   | 3     | 2      | 2
k_val    | 2,7   | 3     | 2      | 2
k_val    | 2,9   | 3     | 2      | 2
ht_val   | 46    | 2     | 1      | 1
ht_val   | 48    | 2     | 1      | 1
ht_val   | 49,9  | 2     | 1      | 1
ht_val   | 50    | 4     | 2      | 2
ht_val   | 55    | 4     | 2      | 2
ht_val   | 59,9  | 4     | 2      | 2
wbc_val  | 15    | 2     | 1      | 1
wbc_val  | 17    | 2     | 1      | 1
wbc_val  | 19,9  | 2     | 1      | 1
wbc_val  | 20    | 3     | 2      | 2
wbc_val  | 30    | 3     | 2      | 2
wbc_val  | 39,9  | 3     | 2      | 2

Paciente (T 33 °C, FR 8, pH 7,30, Na 152, K 2,7, Ht 48%, leucócitos 17 mil; o resto normal):
antes 16 (APACHE II 15-19, Mortalidade estimada ~25%.) → depois 11 (APACHE II 10-14, Mortalidade estimada ~15%.)

OK     depois: as 7 variáveis pontuam como Knaus em 131 valores testados (antes: 36 diferentes)
OK     paciente do exemplo: antes 16 (~25%), depois 11 (~15%)
```

## Patch 16 — MELD-Na: ajuste pelo sódio só com MELD > 11 (OPTN/UNOS)

**Como conferi:** Roda a `formula` do MELD-Na nos exemplos e em 2.000 combinações, separando MELD ≤ 11 e > 11.

Script: [`verificacao/16-calc-meld-na.mjs`](./verificacao/16-calc-meld-na.mjs). Saída:

```text
exames                          | MELD (sem Na) | MELD-Na antes | MELD-Na depois
bili 1, INR 1, Cr 1, Na 125     | 6             | 19            | 6
bili 1, INR 1, Cr 1, Na 137     | 6             | 6             | 6
bili 1,5, INR 1,2, Cr 1, Na 128 | 10            | 19            | 10
bili 2, INR 1,3, Cr 1, Na 128   | 12            | 20            | 20
bili 2, INR 1,5, Cr 1,1, Na 128 | 15            | 22            | 22
bili 3, INR 1,8, Cr 1,5, Na 128 | 21            | 27            | 27

OK     bili 1, INR 1, Cr 1, Na 125: antes 19, depois 6
OK     MELD > 11: igual ao antes (2.000 combinações)
OK     MELD ≤ 11: MELD-Na = MELD, sem ajuste (2.000 combinações)
```

## Patch 17 — Bonacini: pontuação do escore original (ALT/AST, plaquetas 0–6, corte ≥ 8)

**Como conferi:** Pontua o Bonacini a partir de ALT, AST, plaquetas e INR (a versão de hoje pede AST/ALT; a corrigida, ALT/AST).

Script: [`verificacao/17-calc-bonacini.mjs`](./verificacao/17-calc-bonacini.mjs). Saída:

```text
exames                                | antes                              | depois
ALT 80, AST 40, plaq 350 mil, INR 1   | 0 — Baixa probabilidade de cirrose | 0 — Baixa probabilidade de cirrose
ALT 60, AST 66, plaq 150 mil, INR 1,2 | 5 — Probabilidade intermediária    | 7 — Probabilidade intermediária
ALT 50, AST 50, plaq 100 mil, INR 1,5 | 5 — Probabilidade intermediária    | 8 — Alta probabilidade de cirrose
ALT 40, AST 80, plaq 90 mil, INR 1,3  | 7 — Alta probabilidade de cirrose  | 9 — Alta probabilidade de cirrose
ALT 30, AST 90, plaq 30 mil, INR 1,6  | 9 — Alta probabilidade de cirrose  | 11 — Alta probabilidade de cirrose

OK     depois: escore vai de 0 a 11
OK     ALT 50, AST 50, plaq 100 mil, INR 1,5: antes 5 (intermediária), depois 8 (alta)
OK     depois: 7 é intermediária e 8 é alta
```

## Patch 18 — GRACE: referência da tabela de pontos (Granger 2003, mortalidade intra-hospitalar)

**Como conferi:** Compara a citação e roda a `formula` e o `interpret` em 1.000 combinações para garantir que só o texto mudou.

Script: [`verificacao/18-calc-grace.mjs`](./verificacao/18-calc-grace.mjs). Saída:

```text
Referência antes: Fox KA et al. Prediction of risk of death and myocardial infarction in the six months after presentation with acute coronary syndrome: prospective multinational observational study (GRACE). BMJ. 2006;333(7578):1091.
Referência depois: Granger CB et al. Predictors of hospital mortality in the Global Registry of Acute Coronary Events. Arch Intern Med. 2003;163(19):2345-53.
Cortes da faixa (iguais): ≤ 108 baixo; 109–140 intermediário; > 140 alto (mortalidade intra-hospitalar).

OK     referência passa a ser Granger 2003 (Arch Intern Med)
OK     pontos e faixas iguais em 1.000 combinações
```

## Sem patch — Ped Guide (sem patch): drogas sem teto no cálculo, no maior peso aceito (50 kg)

**Como conferi:** Lê o PedGuide de hoje (sem patch) e mostra as doses no maior peso aceito.

Script: [`verificacao/info-pediatria-drogas-sem-teto.mjs`](./verificacao/info-pediatria-drogas-sem-teto.mjs). Saída:

```text
droga        | dose/kg        | dose a 50 kg | volume a 50 kg
glicose      | 0,5 g/kg       | 25,0 g       | 250 mL
glicose-g10  | 0,5 g/kg       | 25,0 g       | 250 mL
glicose-g25  | 0,5 g/kg       | 25,0 g       | 100 mL
manitol      | 0,25-1 g/kg    | 25.0 g       | 125 mL
nacl         | 2-5 mL/kg      | 77.0 mEq     | 150 mL
cisatracurio | 0,1-0,15 mg/kg | 7.50 mg      | 3.75 mL

OK     a 50 kg as doses são de adulto: glicose 25 g, manitol 25 g, NaCl 3% 150 mL, cisatracúrio 7,5 mg
```
