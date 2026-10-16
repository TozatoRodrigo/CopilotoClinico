# ADR-020: De-identificação com modelo local em serviço Python separado

**Status:** Aceito — sem efeito até `DEID_MODE=model` e o serviço `copiloto-deid` no ar
**Data:** 2026-10-15
**Relaciona:** CC-201/CC-202/CC-206 (regex por contexto e epônimos protegidos), CC-203, CC-204

## Contexto

A máscara de PII de hoje é regex: pega CPF, telefone, prontuário pelo rótulo e
nome depois de "Dona"/"Seu", mas não nome solto, parente nem endereço. O DPO e
o Dr. Luiz pediram nome, endereço e prontuário fora do texto antes de qualquer
chamada de IA e de gravar no banco.

O PR #172 mediu o OpenMed PII Portuguese SuperClinical Small 44M (DeBERTa-v3,
6 camadas, vocabulário de 128 mil) em CPU: com o filtro de entidades de
identidade, regex + modelo mascara 90% dos nomes e 98% dos endereços. A VPS é
compartilhada e tem ~2,5 GB livres; a história pede p95 ≤ 300 ms e ≤ 400 MB.

O modelo em fp32 tem 565 MB só de pesos (dois terços são a tabela de
embeddings), então rodar como está não cabe.

## Decisão

**Serviço Python (FastAPI + onnxruntime) no compose, não onnxruntime-node na API.**

- A API roda em `node:22-alpine`; o onnxruntime-node não tem binário para musl.
  Trocar a imagem da API por glibc para caber o modelo mexe em tudo o que já
  está em produção.
- O tokenizador do modelo é Unigram de 128 mil peças; em Node exigiria
  transformers.js ou porte próprio. Em Python é o `tokenizers` oficial, e o
  pós-processamento é o mesmo `openmed_redact.py` já medido.
- Isolamento: o modelo morre por memória no container dele, com `mem_limit`, e
  a API segue com a regex. Na API, o mesmo OOM derrubaria as análises.

**Modelo:** ONNX exportado no build a partir da revisão
`e74186eb0bd7800ea68d9ee9442e8621cb2a4928`, com sha256 dos pesos conferido
(`services/deid/export_onnx.py`). Quantização dinâmica int8 de MatMul e
Gather (565 → 166 MB), grafo otimizado uma vez no build (nível EXTENDED) e
pesos em `model.onnx.data` alinhados a 64 KiB, que o onnxruntime mapeia do
disco em vez de copiar. A sessão roda sem reotimizar, sem pré-empacotar pesos
e sem arena de memória. Texto longo vai em janelas de 256 tokens com 32 de
sobreposição, uma por vez.

**Pipeline** (`DeidentificationService`, ponto único para caso, resposta,
anexo, transcrição e consulta de diretrizes):

1. regex (`maskPII`, como antes);
2. com `DEID_MODE=model`, o texto já mascarado vai ao serviço, que devolve só
   trechos de identidade (nome, endereço, telefone, e-mail, documento,
   nascimento) com score ≥ 0,5, em palavra inteira e offsets UTF-16;
3. a API completa o nome que o modelo marcou pela metade (sobrenome depois,
   prenome antes, fora do começo de frase) e tira dos trechos os epônimos
   protegidos (`protectClinicalTerms`, CC-202) antes de mascarar.

Serviço fora do ar, lento (`DEID_TIMEOUT_MS` a cada 2.000 caracteres) ou com
resposta fora do contrato: segue só com a regex e loga `DEID_FALLBACK
stage=... reason=...`, sem texto. A análise nunca falha por causa dele.

## Medições (15/10/2026, Docker Desktop arm64, limite de 400 MB)

| | 1 CPU (`DEID_THREADS=1`) | 2 CPUs (`DEID_THREADS=2`) |
|---|---|---|
| 100 relatos do corpus (~160 caracteres) — p95 | 46 ms | 25 ms |
| 100 relatos de ~1.000 caracteres — p50 / p95 | 248 / 270 ms | 134 / 180 ms |
| anexo de 21 mil caracteres | 6,5 s | — |
| RSS depois dos 100 relatos longos | 337 MB (172 MB heap + modelo mapeado) | 334 MB |
| pico do cgroup (inclui cache do arquivo do modelo) | 392 MB | 391 MB |

Sem as escolhas de memória acima (pesos copiados, pré-empacotamento, arena), o
mesmo serviço passava de 470 MB só para carregar e era morto no limite de
400 MB. O tokenizador sozinho ocupa ~105 MB.

`pnpm eval:deid --deid-url` (222 relatos sintéticos, pipeline inteiro contra o
container Linux):

| | regex | regex → modelo → epônimos |
|---|---|---|
| nome do paciente | 42% | 98% |
| parente / médico | 1% / 100% | 100% / 100% |
| endereço | 0% | 95% |
| prontuário, telefone, CPF, CNS, nascimento | 100% | 100% |
| termos clínicos intactos | 100% | 100% |
| relatos sem identificador | 24% | 97% |

O que sobra: logradouro que o modelo não reconhece ("Travessa São José"),
apelido fora da lista ("Pituca") e nome que o modelo não marca em parte nenhuma.

## Consequências

- **Build fora da VPS.** O estágio de exportação passa de 3 GB de RAM (a
  quantização). A imagem é construída para `linux/amd64` numa máquina com
  folga e carregada na VPS com `docker save | docker load` (runbook). O compose
  de produção não tem `build:` para esse serviço e o sobe só com
  `--profile deid`.
- **CPU muda o resultado da quantização.** O int8 concorda com o modelo
  original em 94% a 97% dos tokens, conforme a CPU e as otimizações (no Linux
  arm64, 94%, e foi aí que o nome composto começou a escapar e o completamento
  de nome entrou). Nada foi medido em x86. Antes de ligar `DEID_MODE=model`,
  rodar `bench.py` e `eval:deid --deid-url` contra a imagem amd64 na VPS
  (runbook).
- **Critério 4 da CC-203 ainda em aberto:** a meta (nomes ≥ 95%, termos
  clínicos 100%) vale para os relatos escritos por médicos (CC-204), que ainda
  não existem. No corpus sintético, 98% e 100%.
- **Texto mascarado a mais:** o completamento de nome mascara palavra com
  forma de nome colada ao nome marcado (fora de epônimo protegido). Um termo
  clínico capitalizado e fora da lista, logo depois de um nome, sairia junto.
- Anexo longo custa segundos de CPU do serviço; as janelas vão uma por vez, e
  o relato que chega no meio entra entre duas janelas.
