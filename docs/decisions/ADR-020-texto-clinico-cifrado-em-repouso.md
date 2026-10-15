# ADR-020: Texto clínico cifrado em repouso — extensão do Prisma e leitura dupla

**Status:** Proposto
**Data:** 2026-10-15
**Relaciona:** CC-207 (épico E2, privacidade), ADR-004 (`patientRef` opaco),
ADR-015 (hash canônico da trilha), selo do documento (`contentHash`, ADR-012
e #143), IAM-005 (CryptoService, segredo do MFA)

## Contexto

O texto clínico gravado — já mascarado de PII — ficava em claro no banco: o
caso (`ai_interactions.input_redacted`, `case_intakes.case_text_redacted`), a
saída do modelo (`raw_output`), a conversa, os anexos, as transcrições, os
documentos e as notas do médico. Um dump vazado expunha os casos inteiros. O
`CryptoService` (AES-256-GCM, chave `FIELD_ENCRYPTION_KEY`) já cifrava o
segredo do MFA e o áudio.

Requisitos (CC-207): num dump lido sem a chave, nenhum campo de texto clínico
em claro; a aplicação lê e grava normalmente; os registros antigos são
cifrados em lote; o deploy não quebra o que já está gravado e tem rollback.

## Decisão

### 1. Formato

`enc:v1:<id da chave>:<base64(iv ‖ authTag ‖ ciphertext)>` — AES-256-GCM, IV
aleatório de 12 bytes, tag de 16. A chave é a mesma `FIELD_ENCRYPTION_KEY` do
MFA e do áudio; o id é o começo (8 hex) do SHA-256 da chave e diz qual chave
abre o valor durante uma rotação. As primitivas ficam em
`src/shared/crypto/field-cipher.ts`, usadas também pelo `CryptoService` (que
mantém o formato legado `iv:tag:ct` do MFA e do áudio).

Coluna `Json`: o valor inteiro vira UMA string JSON (`"enc:v1:…"` no jsonb),
cifrando o `JSON.stringify` do valor. Os números voltam exatos — o caminho em
claro do Prisma altera até 4 ULPs de parte dos não inteiros (ADR-015).

### 2. Onde: extensão do Prisma no `PrismaService`

`src/config/clinical-text/clinical-text.extension.ts`, aplicada no
construtor do `PrismaService` (o Nest recebe o cliente estendido):

- **Leitura** (`result`): cada campo do inventário vira um campo computado
  com o mesmo nome e tipo, que decifra valor `enc:v1:` e devolve texto em
  claro como está. Vale também em `include`/`select` aninhados e em
  transações. Só os campos selecionados passam pela cifra.
- **Gravação** (`query`): `create`, `createMany`, `update`, `updateMany`,
  `upsert` (e escritas aninhadas) cifram os campos do inventário quando
  `CLINICAL_TEXT_ENCRYPTION=on`, flag lida a cada gravação.
- **Guarda:** filtro, ordenação, `distinct` ou `groupBy` pelo conteúdo de um
  campo cifrado lança `ClinicalTextQueryError` antes de ir ao banco — sobre
  texto cifrado o resultado seria errado em silêncio. `null`/`not: null`
  continuam valendo.

Os serviços não mudam. A alternativa — cifrar e decifrar em cada serviço —
exigiria tocar em cerca de 20 pontos de leitura (exportação LGPD, fila de
triagem, documentos, funil, conversa, avaliação clínica…), e um ponto
esquecido mostraria `enc:v1:…` ao médico ou mandaria o texto cifrado ao
modelo. Vários PRs abertos leem estas colunas; com a extensão eles continuam
funcionando sem saber da cifra.

### 3. Inventário

Fonte única: `CLINICAL_TEXT_FIELDS` em
`src/config/clinical-text/clinical-text-fields.ts`, checado pelo compilador
contra o schema.

| Tabela | Colunas cifradas |
| --- | --- |
| `ai_interactions` | `input_redacted`, `uncertainty_reason`, `raw_output`, `citations`, `answered_questions` |
| `case_intakes` | `case_text_redacted`, `reading`, `questions`, `answers` |
| `encounter_attachments` | `text` |
| `audio_captures` | `transcribed_text` |
| `encounters` | `chief_complaint` (VARCHAR(140) → TEXT, migration `20261015180000_cc207_chief_complaint_text`) |
| `documents` | `content`, `physician_edits` |
| `recommendation_decisions` | `note` |
| `copilot_feedback` | `comment`, `triage_note` |
| `protocol_runs` | `answers` (há perguntas de texto livre), `abandon_reason` |

Ficam em claro, de propósito (`PLAINTEXT_BY_DESIGN`, com o motivo de cada
coluna):

- `encounters.patient_ref` — identificador opaco (ADR-004), não texto
  clínico. A busca do Plantão usa `contains`/`insensitive`; sobre texto
  cifrado ela não acharia nada. Alternativa se um dia for preciso: índice
  cego (HMAC do valor) para busca exata, perdendo a busca parcial.
- `ai_interactions.params` — metadados (caso de demonstração, ids das red
  flags, cobertura, modelos, rastro da pesquisa). O funil filtra por
  `params.demoCase` (caminho JSON), o que não funcionaria cifrado.
- `encounters.context`, `case_intakes.context`/`red_flags`/`demo_case` —
  booleanos e ids.
- `encounter_attachments.filename` — nome do arquivo; aparece na lista e na
  trilha (pendência: mascarar PII no nome).
- `documents.content_hash` — o selo, calculado sobre o texto em claro.
- `audio_captures.encrypted_content` — já cifrado pelo `CryptoService`.
- `ai_calls` — só metadados, por desenho.
- `audit_log.payload` — append-only (o trigger bloqueia `UPDATE`) e coberto
  pelo hash da trilha: não dá para cifrar no lugar. Entradas antigas guardam
  texto livre (comentário do `COPILOT_FEEDBACK`, `uncertaintyReason` do
  `DOCUMENT_CONFIRMED`); o #147 tira esse texto das entradas novas.
- `guideline_chunks.text` e demais tabelas de diretriz — conteúdo público;
  a busca lexical usa a coluna gerada `text_tsv`, que precisa do texto.

**Marcador do sistema em claro.** Em `uncertainty_reason`, o texto fixo
`Output validation failed` (linha de falha de validação, gravada para a
trilha CFM) não é texto clínico e fica em claro (`PLAINTEXT_MARKERS`): é o
que separa análise de falha ao buscar "a última análise"
(`uncertaintyReason not 'Output validation failed'`). Igualdade com esse
valor continua filtrável; o motivo escrito pelo modelo é cifrado.

Um teste (`clinical-text-fields.spec.ts`) falha quando uma coluna String/Json
de tabela ligada a um atendimento não está em nenhuma das duas listas: tabela
nova com texto do caso precisa ser classificada antes de entrar.

### 4. Leitura dupla e flag

A leitura abre os dois formatos sempre; a flag só decide a gravação. Isso
permite: deploy do código com a flag desligada (nada muda), ligar a flag,
cifrar o legado em lote e, em qualquer momento, desligar a flag como
rollback sem perder a leitura do que já foi cifrado. Valor com o prefixo que
não abre (chave errada, valor alterado) lança `SealedValueError` — nunca
devolve o texto cifrado no lugar do clínico. As mensagens de erro citam o
campo e o id da chave, nunca o conteúdo.

### 5. Migração dos registros antigos

`pnpm crypto:encrypt-clinical-text [--batch 500] [--dry-run] [--verify]`
(`scripts/encrypt-clinical-text.ts`). Não é migration SQL: a chave não pode
ir para o banco nem para o histórico de comandos do Postgres.

- Lê, por coluna, só o que não está cifrado com a chave atual, em lotes por
  id; é idempotente e retomável (rodar de novo continua de onde parou).
- Grava cada linha com compare-and-set (`UPDATE … WHERE col = <valor lido>`):
  uma edição concorrente da API nunca é sobrescrita; a linha fica para a
  rodada seguinte.
- `--verify` conta, por coluna, o que está em claro, cifrado com a chave
  atual, com a anterior ou com chave desconhecida, e abre cada valor cifrado.
  Sai com 2 se sobrou algo em claro ou que não abre.
- `--decrypt` é o caminho de volta, só para voltar a API a uma versão
  anterior ao CC-207 (que não lê `enc:v1:`). Com a versão atual, desligar a
  flag basta.
- Só contagens e ids na saída; nenhum texto.

### 6. Selo do documento e trilha de auditoria

Nenhum hash é calculado sobre texto cifrado. O `contentHash` é calculado na
geração sobre o conteúdo em memória e, na confirmação, sobre o conteúdo lido
— que a extensão entrega em claro. A trilha (ADR-015) recebe os valores em
claro que o serviço montou (ex.: `uncertaintyReason` no `DOCUMENT_CONFIRMED`)
e é gravada por SQL, fora da extensão. O teste de integração prova: mesmo
`contentHash` com e sem a cifra, igual ao hash do conteúdo, e cadeia íntegra.

### 7. Rotação da chave

1. `FIELD_ENCRYPTION_KEY` = nova, `FIELD_ENCRYPTION_KEY_PREVIOUS` = antiga;
   reiniciar a API. Lê os dois, grava com a nova.
2. `pnpm crypto:encrypt-clinical-text` — refaz com a nova tudo o que estava
   com a antiga (`rotacionados` no relatório).
3. `--verify` com `chaveAnterior = 0` em todas as colunas.
4. O segredo do MFA e o áudio (formato legado, sem id de chave) também abrem
   com a anterior, mas o script não os refaz: manter a chave anterior até
   refazer esses dois (pendência), ou o login com MFA quebra.

## Alternativas consideradas

- **Cifrar no banco (pgcrypto).** A chave passaria pelo SQL — logs do
  Postgres, `pg_stat_statements`, histórico. Descartada.
- **Só disco cifrado.** Protege o disco, não o `pg_dump` nem o backup
  copiado — que é o vazamento do CC-207. Complementar, não substitui.
- **Cifra explícita em cada serviço.** Ver a seção 2: pontos esquecidos
  mostrariam texto cifrado ao médico. Descartada.
- **Biblioteca pronta (prisma-field-encryption).** Dependência nova, outro
  formato e outra gestão de chave ao lado do `CryptoService`. Descartada.
- **Dados associados (AAD) com tabela/coluna/id.** Impediria trocar valores
  cifrados entre linhas, mas o id nem sempre existe antes do `create` e a
  ameaça aqui é a confidencialidade do dump. Não adotado.

## Consequências

- SQL direto sobre estas colunas (ex.: `raw_output->'recommendations'` numa
  análise) deixa de enxergar o conteúdo. `$queryRaw` não passa pela
  extensão: quem ler estas colunas por SQL precisa usar `openText`/`openJson`.
- Linhas destes modelos voltam do Prisma como proxy (campos computados). O
  JSON da resposta é o mesmo; teste contra banco real deve comparar campos,
  não o objeto inteiro com `toEqual` (o proxy expõe um símbolo de inspect).
- Coluna nova com texto do caso precisa entrar no inventário; o teste de
  classificação falha até isso acontecer.
- O funil de produto (endpoint de admin) decifra todas as interações do
  período para contar perguntas e respostas. A lista do Plantão passou a ler
  o `raw_output` só da interação mais recente de cada caso.
- Valores cifrados ocupam ~1,35× o texto + ~60 bytes. A cifra (AES-GCM) custa
  muito menos que o `JSON.parse` que o Prisma já fazia.
- Perder `FIELD_ENCRYPTION_KEY` é perder o texto clínico cifrado: a chave
  precisa de cópia fora do servidor.
- Backups feitos antes da migração em lote continuam em claro: seguem a
  política de retenção de backups.
