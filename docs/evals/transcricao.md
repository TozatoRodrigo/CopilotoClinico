# Transcrição: Whisper large-v3 × turbo

O ditado do médico vira texto na Groq. Hoje o modelo é o `whisper-large-v3`
(US$ 0,111 por hora de áudio); o `whisper-large-v3-turbo` custa US$ 0,04 por
hora, cerca de um terço. A CC-205 pergunta se o turbo transcreve tão bem, e
"bem" aqui quer dizer principalmente dose, sinal vital e nome de droga: um
"0,5 mg" que vira "5 mg" importa mais que dez palavras de ligação trocadas.

`pnpm eval:transcription` transcreve uma pasta de ditados com cada modelo,
pelo mesmo cliente da API (`src/modules/audio/whisper.service.ts`), e compara
com a transcrição de referência.

## Onde fica

| Caminho | Conteúdo |
| --- | --- |
| `evals/transcription/audio-local/` | Os ditados e as referências (fora do git) |
| `evals/transcription/out/` | Relatórios de cada execução (fora do git) |
| `evals/transcription/run.ts` | O comando |
| `evals/transcription/vocabulary.ts` | Vocabulário clínico medido (médico pode editar) |
| `evals/transcription/pricing.ts` | Preço por hora de cada modelo |
| `evals/transcription/clinical.ts` | Leitura de números, unidades e termos |
| `evals/transcription/text.ts` | WER e CER |

## Privacidade: antes de gravar

Áudio é dado sensível: a voz identifica quem fala, e o conteúdo é clínico.

- **Só casos fictícios, lidos por médicos.** Nunca áudio de paciente real,
  nunca gravação de plantão. Sem nome, CPF, telefone ou endereço, nem
  inventados: o teste mede a transcrição, não a máscara de dados pessoais.
- Quem grava sabe que a voz vai para a Groq, o mesmo provedor da produção.
- A pasta `audio-local/` está no `.gitignore`. Os áudios ficam só na máquina
  de quem roda: nada de commit, issue, PR ou pasta compartilhada aberta. Apague
  quando a decisão estiver registrada.
- Ids neutros (`ditado-01`, `ditado-02`...): o id aparece no console e no
  relatório.
- O comando não loga texto transcrito. O console mostra ids e métricas; o
  relatório mostra métricas e os números e termos clínicos que divergiram,
  nunca frases. `--save-transcripts` grava as transcrições ao lado do
  relatório para revisão manual, e vem desligado.

## Montar a pasta

```
evals/transcription/audio-local/
  ditado-01.webm
  ditado-01.txt
  ditado-02.m4a
  ditado-02.txt
```

- **Áudio** `<id>.webm`, `<id>.m4a` ou `<id>.wav` (também `.mp4`, `.ogg`,
  `.mp3`, `.flac`), até 10 MB, que é o limite da API.
- **Referência** `<id>.txt`, em UTF-8: exatamente o que o médico leu. Escreva
  como foi falado (se ele disse "doze por oito", é "PA 12 por 8"), números em
  algarismos com vírgula decimal ("0,5 mg", "38,5 graus") e sigla só onde o
  médico falou a sigla. Unidade abreviada ou por extenso conta igual ("mcg/kg/min" =
  "microgramas por quilo por minuto").
- Grave como no plantão: celular ou notebook, voz e ritmo de ditado normais,
  alguns com ruído de fundo. A produção recebe WebM do Chrome e MP4 do Safari;
  a gravação do celular (`.m4a`) também serve.
- Para os 20 ditados: de 30 s a 2 min cada, mais de um médico, e o que mais
  erra em ditado: doses com unidade (mg, mcg/kg/min, UI), sinais vitais,
  idade, drogas parecidas (dopamina e dobutamina, adrenalina e noradrenalina)
  e siglas (IOT, VNI, SpO2).

A pasta é validada inteira antes de qualquer chamada: áudio sem referência,
referência vazia, dois áudios com o mesmo id, formato ou tamanho fora do que
a API aceita, tudo aparece de uma vez.

## Rodar

```bash
brew install ffmpeg                      # uma vez: o ffprobe mede a duração dos áudios
pnpm eval:transcription --dry-run        # confere a pasta, a duração e o custo; não chama a API
pnpm eval:transcription                  # large-v3 e turbo, teto de US$ 0,50
```

A chave vem de `WHISPER_API_KEY` (ambiente, `.env.local` ou `.env`) e o
endereço de `WHISPER_BASE_URL` (padrão: a Groq). Se o `ffprobe` do `PATH` não
roda nesta máquina (por exemplo, um binário Intel num Mac sem Rosetta),
aponte outro: `FFPROBE_PATH=/opt/homebrew/bin/ffprobe pnpm eval:transcription`.

| Opção | Padrão | Para quê |
| --- | --- | --- |
| `--audio-dir <dir>` | `evals/transcription/audio-local` | Outra pasta de ditados |
| `--model <modelo>` | os dois | Repita para escolher (`whisper-large-v3`, `whisper-large-v3-turbo`) |
| `--max-usd <US$>` | `0.50` (máximo 10) | Teto de gasto estimado |
| `--concurrency <n>` | `1` (máximo 3) | Chamadas em paralelo |
| `--out <dir>` | `evals/transcription/out` | Onde gravar o relatório |
| `--save-transcripts` | desligado | Grava as transcrições para revisão manual |
| `--dry-run` | — | Mostra o plano e sai |

Saída: `0` concluído; `1` falha do comando, pasta inválida ou plano acima do
teto; `2` parou antes do fim (o relatório sai assim mesmo, com o que rodou).

Custo esperado: 20 ditados de 1 minuto com os dois modelos dão cerca de
US$ 0,05.

### Freios

- **Teto antes de começar.** O plano soma o custo de cada áudio com cada
  modelo, com o mínimo de 10 s que a Groq cobra por chamada. Acima de
  `--max-usd`, nada é chamado.
- **Teto durante.** Cada chamada reserva o custo antes de sair; nenhuma
  começa se passaria do teto, nem em paralelo.
- **Para no primeiro limite de uso.** HTTP 429 ou 402 (limite de taxa ou de
  cota) e 401 ou 403 (chave recusada) param a execução na hora; o resto fica
  como "não feita" e o relatório diz onde parou. Não há nova tentativa: se a
  chave for a da produção, um 429 aqui quer dizer que a transcrição dos
  médicos também está perto do limite.
- **Pouca concorrência.** Uma chamada por vez, no máximo três.
- A execução vai arquivo por arquivo, com os dois modelos em seguida: se
  parar no meio, os dois ficam com os mesmos arquivos.

## Ler o relatório

`evals/transcription/out/<data>/report.md` tem três partes:

1. **Resumo por modelo**, só com os arquivos que todos os modelos
   transcreveram (comparação justa):
   - **WER** sem acento (o principal), WER com acento e **CER**. Caixa e
     pontuação não contam; "120" e "cento e vinte" contam como palavras
     diferentes aqui. Pode passar de 100% se o modelo inventar texto.
   - **Números certos**: mesmo valor e mesma unidade da referência, por tipo
     (doses e volumes, sinais vitais e medidas, idade e tempo, outros).
     "Cento e vinte por oitenta" vale "120 por 80"; "0,5" sem "mg" e "0,5 mcg"
     no lugar de "0,5 mg" são erro. **Números a mais** são os que a
     transcrição trouxe sem par: número ouvido errado ou inventado.
   - **Termos clínicos certos**, do vocabulário (`vocabulary.ts`): drogas,
     unidades, siglas e termos. Droga trocada aparece como perdida e como
     "a mais" (dobutamina perdida, dopamina a mais).
   - **Latência p50/p90**: tempo de cada chamada visto desta máquina, rede
     incluída. Compare os modelos na mesma execução, não com a produção.
   - **Custo por minuto de áudio**, pelo preço de `pricing.ts` e o mínimo de
     10 s por chamada.
2. **Diferenças por arquivo**: WER, CER, números e termos perdidos e a mais
   em cada ditado, com cada modelo. Dose em negrito.
3. **Termos clínicos que algum modelo errou**, somados.

A transcrição medida é a saída crua do Whisper. Na API, ela ainda passa pela
máscara de dados pessoais antes de chegar ao médico.

## Escolher o modelo de produção

Com 20 ditados, um ou dois erros de diferença estão dentro do ruído: decide a
natureza do erro, não o percentual.

1. **Segurança primeiro.** Em "Diferenças por arquivo", leia com um médico
   cada dose (negrito), unidade e droga que o turbo errou e o large-v3
   acertou. Se algum desses erros mudaria a conduta (dose dez vezes maior ou
   menor, mg no lugar de mcg, droga trocada), fica o `whisper-large-v3`.
2. **Números e termos.** O turbo não pode errar mais doses nem mais drogas
   que o large-v3. Em sinais vitais, idade e siglas, um erro a mais no total
   é aceitável se for do tipo que o médico vê ao revisar o texto.
3. **WER.** Até cerca de 2 pontos percentuais acima do large-v3 (sem acento)
   é aceitável quando 1 e 2 passam: são palavras de ligação, que o médico
   corrige ao revisar.
4. **Latência e custo desempatam.** O turbo custa cerca de 64% menos.

Depois de decidir: registre abaixo, ajuste `WHISPER_MODEL` em
`docker/.env.production` e suba a API (runbook, "Modelo da transcrição"). O
rollback é apagar a linha e subir de novo.

### Decisão

| Data | Ditados | Modelo escolhido | Números do resumo | Revisado por |
| --- | --- | --- | --- | --- |
| — | — | — | — | — |

## Testes

`pnpm exec vitest run evals/transcription` roda com transcritor falso, sem
chamada paga: WER e CER, leitura de números e unidades, termos, agregação e
os freios.
