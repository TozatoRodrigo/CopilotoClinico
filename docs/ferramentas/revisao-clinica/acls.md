# Revisão clínica — Parada cardiorrespiratória (ACLS) (CC-313 e CC-314)

Achados do porte do `AclsGuide` e do `MetronomeContext` do ANY App (v4,
revisão `95c8fba`) para a revisão clínica do CC-310, a cargo do Dr. Gustavo
Moreira.

**Regra do porte (ADR-017):** tempos, doses, limiares e textos clínicos ficaram
**iguais ao ANY**. O teste diferencial (`tests/clinical-tools/acls-differential.spec.ts`)
roda o próprio reducer e as funções do `AclsGuide` congelado em 1.000 paradas
aleatórias e confere, a cada toque, contadores, epinefrina, amiodarona, linha do
tempo, card "Agora", lembretes e fração de compressão. Nada abaixo foi corrigido
no código, salvo o que está na seção 3: cada item espera uma decisão.

Toda mudança decidida aqui sobe `ACLS_PROVENANCE.version` em
`src/shared/clinical-tools/acls/content.ts` e atualiza o teste diferencial,
que passa a registrar a diferença de propósito.

## 1. Conteúdo clínico (decisão do revisor)

| #   | Onde                                         | O que o ANY faz                                                                                                                 | Por que parece problema                                                                                                                                                                                     | Opções                                                                                                                                              |
| --- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1.1 | Card "Agora", amiodarona 300 mg              | Aparece "Considere amiodarona 300 mg IV — Após 3º choque sem sucesso" a partir do **2º** choque registrado (`shockCount >= 2`). | O card se chama "Agora", mas o texto e a AHA falam em amiodarona depois do 3º choque. Lido como instrução imediata, adianta a droga em um ciclo. A história pede "após o 3º choque", e o porte segue o ANY. | (a) manter como aviso antecipado; (b) passar para `>= 3`; (c) manter o limiar e trocar o texto para "Prepare amiodarona 300 mg (após o 3º choque)". |
| 1.2 | Card "Agora", amiodarona 150 mg              | Aparece a partir do **4º** choque, se a dose de 300 mg foi registrada.                                                          | Mesmo descompasso do 1.1 (a 2ª dose vem depois do 5º choque na sequência da AHA).                                                                                                                           | Decidir junto com o 1.1 (`>= 4` ou `>= 5`).                                                                                                         |
| 1.3 | Checagem de ritmo, botão "Chocável — choque" | Escolher "Chocável" não registra choque; o choque é o botão próprio da tela.                                                    | O rótulo sugere que o choque foi registrado. Se o time esquecer o botão, a contagem de choques fica baixa e a sugestão de amiodarona atrasa.                                                                | (a) manter; (b) rótulo só "Chocável"; (c) registrar o choque junto, com desfazer.                                                                   |
| 1.4 | Fim da parada antes dos 2 min                | Só dá para registrar RCE ou óbito na checagem de ritmo, ao fim do ciclo.                                                        | RCE percebido no meio do ciclo (curva de PA invasiva, ETCO2 que sobe) espera até 2 min para ser registrado, e o horário do RCE fica atrasado no relatório.                                                  | (a) manter; (b) botão "Checar ritmo agora" que abre a mesma checagem.                                                                               |
| 1.5 | Lidocaína                                    | "Lidocaína 100 mg IV — Alternativa: 1-1,5 mg/kg".                                                                               | Dose fixa ao lado de dose por peso, sem campo de peso. 100 mg corresponde a 67–100 kg.                                                                                                                      | (a) manter; (b) só "1-1,5 mg/kg"; (c) pedir peso.                                                                                                   |
| 1.6 | Bicarbonato                                  | "Bicarbonato de sódio 1 mEq/kg IV", registrado assim na linha do tempo.                                                         | O relatório não diz a dose total dada.                                                                                                                                                                      | (a) manter; (b) pedir a dose ao registrar.                                                                                                          |
| 1.7 | 1ª epinefrina no ritmo chocável              | Lembrete só depois do 1º ciclo completo (no não chocável, desde o início).                                                      | Coerente com a AHA (epinefrina depois do 2º choque), mas o lembrete depende de o ciclo fechar, não do choque.                                                                                               | Confirmar.                                                                                                                                          |
| 1.8 | Metrônomo                                    | 110/min fixo; com via aérea avançada, ventilação a cada 6 s (10/min).                                                           | Dentro da AHA (100–120/min; 1 a cada 6 s).                                                                                                                                                                  | Confirmar.                                                                                                                                          |
| 1.9 | Epinefrina                                   | Intervalo 3, 4 (sugerido) ou 5 min.                                                                                             | Dentro da AHA (3–5 min).                                                                                                                                                                                    | Confirmar.                                                                                                                                          |

## 2. Faixas de entrada definidas no porte (o ANY não tinha)

| Campo                                 | Faixa no porte | Observação                                                                                                                                                                                 |
| ------------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| ETCO2 na checagem de ritmo (opcional) | 0–100 mmHg     | No ANY o campo aceitava qualquer número. A faixa só barra erro de digitação; fora dela os botões da checagem ficam travados até corrigir ou apagar o valor. `ETCO2_RANGE` em `content.ts`. |

## 3. Defeitos do ANY que não foram portados

Correções de registro e de tela, sem mudança de tempo, dose ou limiar.

| #   | No ANY                                                                                                                                                                                          | No Copiloto                                                                                                                                                     |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 3.1 | Cada checagem de ritmo gravava o ritmo duas vezes na linha do tempo ("Ritmo chocável" e, pelo `SET_RHYTHM`, "FV/TV sem pulso"), contra o próprio comentário do código ("sem evento duplicado"). | Um registro por checagem ("Ritmo chocável" / "Ritmo não chocável"). O teste diferencial descarta só esse evento duplicado.                                      |
| 3.2 | Contagem regressiva do ciclo e da epinefrina por `setInterval` de 1 s: com a aba em segundo plano o navegador atrasa o timer e o relógio anda devagar.                                          | Tempo sempre calculado a partir do horário de início (`now - cycleStartedAt`); o ciclo vencido entra na linha do tempo no horário em que venceu.                |
| 3.3 | Metrônomo por `setInterval` de 545 ms: cada atraso do timer entra no ritmo.                                                                                                                     | Batidas marcadas à frente no relógio do Web Audio; atraso do laço não acumula (teste com relógio falso: deriva < 2% em 20 min, inclusive com o laço atrasando). |
| 3.4 | O alerta de fim de ciclo criava o áudio na hora; no iPhone, sem toque do usuário, o áudio não toca.                                                                                             | O áudio é destravado no toque de "Iniciar código" (e no primeiro toque depois de recarregar).                                                                   |
| 3.5 | A opção "Registrar pausas (FCT)" nas configurações não mudava nada (o botão de pausa aparecia sempre).                                                                                          | Opção removida; o botão de pausa continua sempre visível.                                                                                                       |
| 3.6 | O estado da parada vivia na tela: sair do ACLS perdia tudo.                                                                                                                                     | O estado fica acima das rotas e no aparelho; ir a outra ferramenta e voltar não perde nada (faixa "Parada em andamento" no topo).                               |

## 4. Comportamentos novos pedidos pela história (não existiam no ANY)

| Onde                       | O que mudou                                                                                                | Por quê                                                                                          |
| -------------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Epinefrina vencida         | Além do lembrete na tela, dois bipes graves e vibração (padrão 300-100-300 ms, diferente do fim de ciclo). | Critério 1 do CC-313: o timer de adrenalina avisa por som e vibração, mesmo em outra tela.       |
| Checagem de ritmo, "Óbito" | Pede confirmação antes de encerrar.                                                                        | Toque errado encerrava a parada sem volta. O ANY tinha a função de confirmação, mas não a usava. |
| Descartar parada           | Botão próprio, com confirmação.                                                                            | No ANY, "Iniciar" no menu flutuante descartava a parada em curso.                                |

## 5. Mudanças de linguagem (só texto)

Imperativo trocado por sugestão ou infinitivo (regra do ADR-017) e ordinal
corrigido. O teste diferencial aplica esta mesma tabela ao comparar.

| No ANY                                   | No Copiloto                                         |
| ---------------------------------------- | --------------------------------------------------- |
| RCP de alta qualidade + prepare choque   | RCP de alta qualidade + preparar choque             |
| Mantenha epinefrina a cada N min         | Epinefrina a cada N min                             |
| Priorize acesso IV. IO se IV não viável. | Considere priorizar acesso IV; IO se IV não viável. |
| Após 3° choque sem sucesso               | Após 3º choque sem sucesso                          |
| 1ª dose (após 3° choque)                 | 1ª dose (após 3º choque)                            |
| Epinefrina AGORA                         | Considere epinefrina agora                          |
| Próxima epi em m:ss                      | Próxima epinefrina em m:ss                          |
| CHOQUE                                   | Registrar choque                                    |
