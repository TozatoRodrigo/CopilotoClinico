# ADR-015: Hash canônico da trilha de auditoria — jsonb não guarda o texto hasheado

**Status:** Aceito
**Data:** 2026-10-12
**Relaciona:** ADR-002 (hash encadeado — esta ADR emenda a fórmula), ADR-005
(auditoria do loop de decisão)

## Contexto

Desde 12/10/2026 02:00 o cron diário loga em produção:

```
AUDIT CHAIN INTEGRITY FAILURE — brokenAt=e72692f0-… count=1 message="afterHash mismatch at record e72692f0-…"
```

`count=1`: o primeiro registro da cadeia já falha. Não é adulteração — o
texto que o escritor hasheava nunca foi o que o banco devolve. São duas
causas, as duas confirmadas contra PostgreSQL real
(`tests/integration/aud-007-…`):

1. **Ordem das chaves.** O hash era `SHA-256(JSON.stringify(evento))` com o
   payload na ordem de inserção. A coluna `payload` é `jsonb`, que guarda as
   chaves ordenadas (mais curta primeiro, depois por byte). O verificador
   relia o payload do banco e serializava de novo, então qualquer objeto com
   2+ chaves fora da ordem do jsonb falhava — `DOCUMENT_CONFIRMED`, por
   exemplo: `{encounterId, confirmedAt, uncertain}` volta como
   `{uncertain, confirmedAt, encounterId}`.
2. **Números reescritos pelo Prisma.** Achado na reprodução. O Prisma 6.19
   grava `Json` passando os números por um parser de float inexato: de 15% a
   40% dos não inteiros (`0.1 + 0.2`, custos somados) ficam até 4 ULPs ao
   lado do original (medido em 80 mil números; o maior desvio foi 4). A
   leitura é exata. Só ordenar as chaves não bastaria: registro com `cost`
   ou `confidence` continuaria falhando.

Os testes de unidade mockavam o Prisma, e AUD-003/AUD-006 só gravavam
payload vazio ou de uma chave.

## Decisão

### 1. Registros novos: versão 2

- **Texto hasheado:** JSON canônico do evento
  `{actorId, action, entity, entityId, payload, timestamp, hashVersion: 2}`
  — chaves ordenadas por unidade UTF-16 em todos os níveis, strings e
  números como no `JSON.stringify`. Para os tipos do JSON é o RFC 8785
  (JCS): qualquer implementação de JCS refaz o texto fora da aplicação.
- **Encadeamento igual ao da ADR-002:** `afterHash = SHA-256(texto)`,
  `beforeHash = SHA-256(afterHash anterior + texto)`.
- **Versão gravada e hasheada:** coluna `audit_log.hash_version SMALLINT`
  (NULL = legado; migration `20261012180000_aud_007_audit_log_hash_version`,
  aditiva). A versão também está dentro do texto, então trocá-la quebra o
  hash.
- **Gravação por SQL, não por `auditLog.create`:** o payload vai como o
  próprio texto canônico para `::jsonb`, que guarda o número exato. Assim
  nada depende de como o Prisma converte números. `created_at` sai em UTC
  explícito (`AT TIME ZONE 'UTC'`), como o Prisma grava.
- **Verificação:** o verificador lê `payload::text`, refaz o texto byte a
  byte e confere os dois hashes. Qualquer diferença é falha.

### 2. Registros legados: reconstruir, nunca reescrever

Nenhum hash existente é alterado — reescrever destruiria a prova, e o
trigger append-only bloqueia. Para cada registro com `hash_version` NULL, o
verificador reconstrói o texto que o escritor antigo hasheou. As chaves de
fora tinham ordem fixa no código; no payload ele testa:

- **todas as ordens das chaves de cada objeto**, começando pela ordem que
  bateu no registro anterior com o mesmo conjunto de chaves;
- **para cada número não inteiro, os doubles a até 4 ULPs.**

Os payloads gravados até hoje têm no máximo 8 chaves e nenhum array de
objetos, o que dá até 8! = 40.320 candidatos — cerca de 130 ms no pior
registro. Com a ordem aprendida, os registros seguintes do mesmo formato
batem na primeira tentativa. O resultado é um destes:

| Resultado | Quando | Efeito |
| --- | --- | --- |
| conferido | um candidato bate | conta em `legacy.verified`; o elo `beforeHash` também é conferido |
| **falha** | todos os candidatos testados, nenhum bate, e o payload só tem inteiros, strings, booleanos ou null | o conteúdo mudou depois do hash — alarme |
| legado não verificável — `key-order-search-limit` | mais de 40.320 candidatos (ordem de chaves perdida no jsonb) | conta em `legacy.unverifiable`, sem alarme |
| legado não verificável — `rewritten-number` | nenhum candidato bate e há número não inteiro | idem: o raio de 4 ULPs é empírico e não prova adulteração |

Mesmo o "legado não verificável" continua preso à cadeia: o `beforeHash`
do registro seguinte é calculado sobre o `afterHash` gravado nele, então
trocar esse hash ainda rompe o elo.

**Registro legado depois do primeiro canônico é falha.** Desde a versão 2 a
aplicação só grava canônico, e só o `copiloto-api` escreve no `audit_log`.
Rebaixar `hash_version` para NULL vira, portanto, legado fora de lugar. Se o
registro rebaixado vier antes de todos os canônicos, ele cai na
reconstrução, onde o texto canônico não bate com nenhuma ordem legada: dá
falha, ou "não verificável" se o payload tiver número não inteiro. Por isso
o total de "legado não verificável" fica congelado depois do deploy e não
pode crescer (runbook).

### 3. Alarme só para falha real

`valid: false` gera `ERROR` no log, como antes, e agora também
`Sentry.captureMessage`, com o id, a contagem e a mensagem — nada do
payload. Antes o `logger.error` ficava só no log. "Legado não verificável"
é um estado conhecido, que não cresce depois do deploy, e aparece só na
linha de sucesso.

## Alternativas consideradas

- **Reescrever os hashes existentes.** Destrói a trilha. Descartada.
- **Só ordenar as chaves (JSON canônico com `auditLog.create`).** Resolve a
  causa 1, mas não a 2: registro novo com `cost` continuaria falhando em
  15–40% dos casos.
- **Todo legado que não bate na ordem do jsonb vira "não verificável".**
  Acaba com o alarme, mas a trilha anterior a 12/10 perde a evidência de
  adulteração. A reconstrução custa pouco e mantém essa evidência.
- **Guardar o texto hasheado numa coluna nova (`hashed_text`).** Tornaria o
  hash trivial de conferir, mas duplica o payload. O verificador ainda
  precisaria provar que o texto corresponde às colunas — e, com o Prisma
  alterando números, essa comparação exigiria tolerância. Descartada: a
  gravação por `::jsonb` dá a mesma reprodutibilidade sem duplicar nada.
- **Âncora ou época** (um registro que marca o corte, ou uma data fixa no
  código). A regra "legado depois do primeiro canônico é falha" dá a mesma
  garantia, sem passo manual no deploy e sem data mágica no código.
- **Arredondar números antes de hashear (ex.: 15 dígitos) e manter o
  `auditLog.create`.** Depende de um detalhe interno do Prisma (o parser de
  float do engine), que pode mudar num upgrade. Descartada.

## Consequências

- Qualquer JCS + SHA-256 refaz o hash de um registro versão 2 a partir das
  colunas e de `payload::text`. `pnpm verify:audit-chain` roda a mesma
  verificação fora da API (só leitura), por exemplo sobre um backup
  restaurado.
- O `audit_log` não é mais gravado pelo Prisma Client. Coluna nova precisa
  entrar no `INSERT` de `AuditService.writeAuditLogEntry`; o objeto devolvido
  é tipado como `AuditLog`, então o `tsc` acusa coluna esquecida.
- Migration que toca `audit_log` pede revisão manual (runbook). Esta só
  adiciona coluna nula: não reescreve a tabela.
- **Limites conhecidos do legado:**
  - Antes do #14 (06/06/2026), o escritor hasheava um `timestamp` diferente
    do `created_at` gravado. Registros dessa época, se existirem em
    produção, aparecem como falha.
  - Também antes do #14 não havia lock, e escritas concorrentes podiam
    bifurcar a cadeia, o que aparece como `beforeHash mismatch`.
  - O runbook manda conferir um backup antes do deploy.
