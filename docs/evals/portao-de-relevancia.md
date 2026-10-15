# Portão de relevância dos cartões: bake-off (CC-407)

O portão decide se um cartão revisado que a busca achou **se aplica** ao caso (ou à pergunta rápida). Ele existe por causa do erro que motivou o plano de confiabilidade: conduta do cenário errado — dengue conduzida como sepse. Cartão do cenário errado na decisão vem com dose liberada; por isso um falso positivo (cartão errado que entra) é pior que um falso negativo (cartão certo que fica de fora, e a análise segue como antes dos cartões).

Há três portões, escolhidos pela flag `CARD_RELEVANCE_GATE` (ver o runbook, "Portão de relevância dos cartões"):

| Portão | Como decide | Escore |
| --- | --- | --- |
| `threshold` (padrão) | similaridade da busca ≥ `REVIEWED_CARDS_MIN_SIMILARITY` e mesma síndrome ou tema nas hipóteses | similaridade (não é probabilidade) |
| `jev` | pergunta sim/não ao Jev da TypeSafe: "este cartão se aplica a esta situação?" | probabilidade calibrada de "sim" |
| `reranker` | cross-encoder local (`bge-reranker-v2-m3` no text-embeddings-inference) | escore 0–1, não calibrado |

O bake-off roda os três sobre **100 pares (situação, cartão) rotulados por médicos** e mostra precisão, revocação, F1, calibração, latência e custo de cada um, com o limiar que cada portão precisaria. Meta da CC-407: **precisão ≥ 90% com revocação ≥ 80%**.

## Onde fica

| Caminho | Conteúdo |
| --- | --- |
| `evals/cards/gate-pairs.json` | Os pares rotulados pelos médicos (é o que o médico edita) |
| `evals/cards/gate-pairs.seed.json` | Semente sintética de 20 pares, **não rotulada por médico** — só para o harness rodar nos testes |
| `evals/cards/gate-cards.seed.json` | Os 2 cartões de teste da semente |
| `evals/cards/gate-pairs.ts` | Formato dos pares (validado ao carregar) |
| `evals/cards/gate.ts` | O comando (`pnpm eval:card-gate`) |
| `evals/cards/runs/` | Relatórios gerados (fora do git) |

---

## Para médicos: rotular os 100 pares

Cada par é uma pergunta só: **"eu usaria este cartão neste paciente, agora, como ele está escrito?"**

- **Sim → `relevant`**: o cartão trata do mesmo cenário (mesma doença ou apresentação), a população bate (adulto/criança, gestante, comorbidade que muda conduta) e a conduta e a dose dele servem para este paciente.
- **Não → `irrelevant`**: outro cenário, outra população, ou só parecido. Exemplos: cartão de meningite num caso de hemorragia subaracnóidea (rigidez de nuca sem febre); cartão de adrenalina IM numa urticária isolada sem critério de anafilaxia; cartão de sepse num caso de dengue com sinais de alarme.
- **Na dúvida, `irrelevant`**, e escreva o porquê em `note`. Um cartão que "quase serve" é exatamente o que o portão precisa barrar.

Rotule olhando a situação **como o portão a vê** (o entendimento escrito, a síndrome e as hipóteses), não o caso que você imagina por trás dela.

### Como montar os 100 pares

- **Situações:** umas 40, cada uma com 2 a 3 cartões candidatos. Comece pelos casos do gabarito clínico (`evals/clinical/cases`) e por perguntas rápidas reais do plantão reescritas; umas 25% devem ser perguntas rápidas.
- **Equilíbrio:** pelo menos 40 relevantes e 40 irrelevantes. Entre os irrelevantes, priorize os **difíceis**: mesma síndrome, outro cenário (o cartão que a busca acharia parecido). Irrelevante óbvio (cartão de anafilaxia num caso de meningite) mede pouco.
- **Cartões:** só cartões **publicados e dentro da validade** — o bake-off lê os cartões do banco pelo `cardId` (na tela do cartão, o id está na URL `/cartoes/<id>`).
- **Dois rotuladores nos difíceis:** quando os dois discordarem, conversem e grave o rótulo de consenso, com o motivo em `note`.
- **Nenhum dado de paciente.** O texto vai para o arquivo versionado e, no portão `jev`, para a TypeSafe (EUA). Escreva a situação como síntese clínica, sem nome, data, documento, telefone ou endereço. O arquivo é recusado se a máscara de PII achar algo.

### O formato

```json
{
  "pairs": [
    {
      "id": "dengue-alarme-x-sepse",
      "situation": {
        "kind": "case",
        "text": "Febre há 4 dias com dor abdominal intensa, vômitos persistentes e plaquetas baixas.",
        "syndrome": "febre",
        "hypotheses": ["Dengue com sinais de alarme", "Sepse"]
      },
      "cardId": "<id do cartão de sepse>",
      "label": "irrelevant",
      "labeler": { "kind": "physician", "id": "AS CRM-SP" },
      "similarity": null,
      "note": "Mesma síndrome, outro cenário: hidratação de dengue, não pacote de sepse."
    },
    {
      "id": "pergunta-adrenalina-x-anafilaxia",
      "situation": { "kind": "quick_question", "text": "Dose de adrenalina IM na anafilaxia em criança de 20 kg?" },
      "cardId": "<id do cartão de anafilaxia>",
      "label": "relevant",
      "labeler": { "kind": "physician", "id": "AS CRM-SP" }
    }
  ]
}
```

| Campo | O que significa |
| --- | --- |
| `id` | Nome do par: letras minúsculas, números e hífens, sem repetir. |
| `situation.kind` | `case` (o entendimento de um caso) ou `quick_question` (uma pergunta rápida). |
| `situation.text` | Caso: a síntese do problema, como a Etapa 1 escreve ("Adulto com febre, cefaleia e rigidez de nuca há 12 h"). Pergunta rápida: a pergunta como o médico digitaria. Sem dado de paciente. |
| `situation.syndrome` | Só em `case`: a síndrome de pronto-socorro da lista de `src/shared/contracts/clinical.ts` (`febre`, `dor-toracica`, `reacao-alergica`…), ou `null`. |
| `situation.hypotheses` | Só em `case`: as hipóteses que a Etapa 1 listaria (até 8). Na pergunta rápida, a própria pergunta faz esse papel. |
| `cardId` | O id do cartão candidato. |
| `label` | `relevant` (o cartão se aplica) ou `irrelevant`. |
| `labeler` | `{ "kind": "physician", "id": "<iniciais ou CRM/UF>" }`. A semente usa `{ "kind": "seed" }` — par sem rótulo de médico, que o relatório marca e não serve para decidir. |
| `similarity` | Opcional: a similaridade que a busca deu ao par. Só o portão `threshold` usa; sem ela, ele não julga o par (os outros julgam). A engenharia preenche. |
| `note` | Opcional: por que o rótulo. |

---

## Para engenharia: rodar o bake-off

Antes de qualquer rodada com o Jev: **DPA da TypeSafe assinado e registrado** (critério 3 da CC-407 — o texto das situações e os cartões vão para os EUA), acesso antecipado confirmado e o contrato da API conferido (`src/modules/jev/jev-client.ts`).

```bash
# 1. Estimativa de tokens e custo, sem chamar nada
pnpm eval:card-gate --dry-run

# 2. Os portões locais (sem custo): limiar e reranker (TEI no ar, CARD_RERANKER_URL)
pnpm eval:card-gate --gates threshold,reranker

# 3. O Jev, com teto de gasto (JEV_API_KEY no ambiente)
pnpm eval:card-gate --gates jev --max-usd 0.10

# Tudo de uma vez, com JSON por par para análise
pnpm eval:card-gate --json evals/cards/runs/gate.json
```

Sem `evals/cards/gate-pairs.json`, o comando roda a semente com os cartões de teste — útil para ver o harness funcionando, sem valor para decidir. Com o arquivo dos médicos, os cartões vêm do banco de `DATABASE_URL` (só leitura).

| Opção | Padrão | O que faz |
| --- | --- | --- |
| `--pairs <arquivo>` | `gate-pairs.json`, ou a semente | Pares rotulados |
| `--cards <arquivo>` | cartões do banco (a semente usa `gate-cards.seed.json`) | Cartões em JSON, no formato de `gate-cards.seed.json` |
| `--gates <lista>` | `threshold,jev,reranker` | Portões a medir |
| `--min-precision <0–1>` | `0.9` | Precisão mínima para sugerir limiar |
| `--max-usd <valor>` | `0.50` | Teto de gasto somado dos portões |
| `--out <arquivo.md>` | `evals/cards/runs/gate-<data>.md` | Relatório |
| `--json <arquivo>` | — | Escores por par e métricas |
| `--dry-run` | — | Só a estimativa |

**Freios de gasto.** Antes de cada chamada o harness estima os tokens (≈ 3 caracteres por token, para cima) e para o portão se o gasto somado passaria de `--max-usd`. Um HTTP 429 ou 402 do provedor (limite de uso ou de taxa) para o portão na hora, sem insistir; três falhas seguidas também. O relatório diz onde e por que parou; os pares não julgados ficam fora das métricas daquele portão (a coluna "Julgados" mostra quantos). Ao preço anunciado do Jev (US$ 0,042 por milhão de tokens de entrada), 100 pares custam menos de um centavo de dólar; o reranker local não tem custo por token.

### Ler o relatório

- **Classificação:** precisão, revocação e F1 no limiar de hoje (o do ambiente) e no **limiar sugerido** — o que maximiza F1 entre os que mantêm a precisão mínima — com intervalo de confiança de 95% (Wilson). Com 100 pares o intervalo é largo: uma diferença de poucos pontos entre portões é empate.
- **Calibração:** Brier (0 é perfeito; 0,25 é chutar 0,5 para tudo) e a curva por faixa de escore: com calibração boa, a fração de relevantes em cada faixa acompanha o escore médio. Só o Jev promete probabilidade; para o reranker e a similaridade, a curva é referência.
- **Latência:** uma chamada do portão por situação, com os cartões rotulados dela — como numa análise. O Jev anuncia 70–500 ms.
- **Erros por par:** os ids dos falsos positivos e falsos negativos no limiar atual e no sugerido — é por eles que os médicos revisam rótulo e cartão.

### Decidir e ligar

1. Vence o portão que **atinge a meta** (precisão ≥ 90% e revocação ≥ 80%) no limiar sugerido. Entre os que atingem, a maior revocação; empate dentro do intervalo de confiança desempata por privacidade e operação (o reranker local não manda nada para fora; o Jev exige o DPA).
2. Nenhum atinge: fica o `threshold`, com o `REVIEWED_CARDS_MIN_SIMILARITY` sugerido, e os erros por par voltam para os médicos (rótulo, cartão ou situação).
3. Ligar: `CARD_RELEVANCE_GATE=<vencedor>` e a variável do limiar com o valor sugerido (`CARD_GATE_JEV_MIN_PROBABILITY`, `CARD_GATE_RERANKER_MIN_SCORE` ou `REVIEWED_CARDS_MIN_SIMILARITY`). As flags são lidas a cada análise: não precisa de deploy. Sem chave ou serviço, o portão cai no `threshold` sozinho (`CARD_GATE_FALLBACK` no log).
4. Trocou a pergunta do Jev (`JEV_CARD_GATE_QUESTION`), o texto que o portão lê (`card-gate-input.ts`) ou o modelo do reranker: rode o bake-off de novo — o limiar muda junto.
