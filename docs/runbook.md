# Runbook — Copiloto Clínico

**Audiência:** DevOps / Engenharia  
**Versão:** R0

---

## Release — base de contexto (KB-005/KB-006 + F2/F3/F4/F6/F7)

Roteiro completo desta entrega, na ordem. Cada passo tem verificação: **não
avance sem o resultado esperado**. Executar na VPS (Hostinger), no diretório do
`docker-compose.prod.yml`.

> Origem: reportes de campo de 03/09/2026 — caso de dengue conduzido como
> sepse, cefaleia em salvas apontada como hemorragia, e erro ao anexar arquivo.
> Diagnóstico completo em `docs/plano-base-contexto.md`.

### Passo 0 — Pré-voo (antes de tocar em qualquer coisa)

**0.1 — Existe curador?** Sem isso o passo 4 trava, e só se descobre depois da
ingestão. O aprovador precisa das DUAS condições:

```bash
docker compose -f docker-compose.prod.yml exec copiloto-db \
  psql -U "$POSTGRES_OWNER_USER" -d copiloto_clinico -c \
  "SELECT email, role, is_curator FROM physicians WHERE is_curator = true OR role IN ('COMPLIANCE','ADMIN');"
```

Esperado: pelo menos uma linha com `role` em (`COMPLIANCE`,`ADMIN`) **e**
`is_curator = true`. Se faltar:

```bash
docker compose -f docker-compose.prod.yml exec copiloto-db \
  psql -U "$POSTGRES_OWNER_USER" -d copiloto_clinico -c \
  "UPDATE physicians SET is_curator = true, role = 'COMPLIANCE' WHERE email = 'curador@exemplo.com';"
```

**0.2 — Backup do banco.** Esta release tem migration.

```bash
docker compose -f docker-compose.prod.yml exec copiloto-db \
  pg_dump -U "$POSTGRES_OWNER_USER" copiloto_clinico > backup-pre-kb005-$(date +%F-%H%M).sql
```

Confirmar que o arquivo não está vazio antes de seguir.

**0.3 — Chave de IA válida.** A ingestão gera embeddings; sem chave real ela
falha no meio, deixando parte dos chunks criados.

```bash
docker compose -f docker-compose.prod.yml exec copiloto-api \
  sh -c 'test "$AI_API_KEY" != placeholder && echo "AI_API_KEY OK" || echo "FALTA AI_API_KEY"'
```

### Passo 1 — Migration

Ver "Aplicar migrations em produção" em Operações de Rotina: build da imagem
nova primeiro, migration com essa imagem, só depois subir o container.

Verificação — a tabela nova existe e está vazia:

```bash
docker compose -f docker-compose.prod.yml exec copiloto-db \
  psql -U "$POSTGRES_OWNER_USER" -d copiloto_clinico -c \
  "SELECT count(*) FROM encounter_attachments;"
```

Esperado: `0`. Erro de relação inexistente significa que a migration não
aplicou — **pare aqui**.

### Passo 2 — Deploy

```bash
docker compose -f docker-compose.prod.yml up -d --build copiloto-api copiloto-web
```

Verificação:

```bash
curl -fsS https://copiloto.servidortozato.cloud/v1/health && echo " API OK"
```

### Passo 3 — Ingestão dos pacotes

A ordem importa menos que o fato de rodarem **depois** do deploy: o chunking
por fronteira de frase precisa estar no ar, senão os chunks nascem cortados no
meio de frase e seria preciso reingerir.

> ⚠️ **Não roda dentro do `copiloto-api`.** A imagem de runtime (estágio
> `runner` do `Dockerfile.api`) contém apenas `dist/`, `node_modules/` e
> `prisma/` — não tem `docs/`, `scripts/` nem `src/`. Um
> `docker compose exec copiloto-api pnpm ingest:guidelines ...` falha por
> arquivo inexistente. Use o estágio `builder`, que tem o repositório completo.

```bash
cd /home/rodrigo/apps/copiloto-clinico/docker
docker build -f Dockerfile.api --target builder -t copiloto-ingest:tmp ..
```

```bash
set -a; . ./.env.production; set +a
APPDB="postgresql://${POSTGRES_APP_USER}:${POSTGRES_APP_PASSWORD}@copiloto-db:5432/copiloto_clinico?schema=public"
for PACOTE in kb-005-arboviroses-dengue kb-006-cefaleias-primarias; do
  docker run --rm --network docker_copiloto-net \
    -e DATABASE_URL="$APPDB" -e AI_PROVIDER="$AI_PROVIDER" -e AI_API_KEY="$AI_API_KEY" \
    -e AI_MODEL="$AI_MODEL" -e AI_EMBEDDING_MODEL="$AI_EMBEDDING_MODEL" \
    -e AI_BASE_URL="$AI_BASE_URL" -e OPENAI_API_KEY="$OPENAI_API_KEY" \
    -e REDIS_URL="redis://copiloto-redis:6379" \
    --entrypoint sh copiloto-ingest:tmp \
    -c "npx tsx scripts/ingest-batch.ts docs/guidelines/drafts/$PACOTE"
done
```

Use o `DATABASE_URL` da role da aplicação (não a de migration): a ingestão só
faz `INSERT`, e `copiloto_app` tem exatamente esse privilégio.

Ao terminar, remover a imagem auxiliar — ela fica desatualizada na próxima
mudança de código e ocupa espaço:

```bash
docker rmi copiloto-ingest:tmp
```

Verificação — devem existir **28 chunks pendentes**, distribuídos assim:

```bash
docker compose -f docker-compose.prod.yml exec copiloto-db \
  psql -U "$POSTGRES_OWNER_USER" -d copiloto_clinico -c \
  "SELECT metadata->>'cenario' AS cenario, metadata->>'subtipo' AS subtipo, count(*)
     FROM guideline_chunks WHERE status = 'pending_review'
    GROUP BY 1,2 ORDER BY 1,2;"
```

| `cenario` | `subtipo` | chunks |
|---|---|---|
| `cefaleia` | `primaria` | 8 |
| `cefaleia` | `secundaria` | 4 |
| `dengue_arbovirose` | (nulo) | 9 |
| `febre_aguda_indiferenciada` | `dengue_arbovirose` | 4 |
| `febre_aguda_indiferenciada` | `sepse_bacteriana` | 3 |

Total: **28**. Números conferidos rodando `front-matter.ts` → `chunking.ts`
sobre os rascunhos nesta revisão; se o chunking mudar, esta tabela muda.

Número diferente significa que o chunking rodou com código antigo, ou que a
ingestão falhou no meio. Nesse caso, apagar os pendentes e repetir:

```bash
docker compose -f docker-compose.prod.yml exec copiloto-db \
  psql -U "$POSTGRES_OWNER_USER" -d copiloto_clinico -c \
  "DELETE FROM guideline_chunks WHERE status = 'pending_review';"
```

### Passo 4 — Curadoria clínica (médico, não engenharia)

**Este passo não pode ser automatizado nem delegado a quem não é médico.** É a
assinatura de que doses e volumes estão corretos, e é a razão de o pipeline
inteiro existir.

O curador aprova ou rejeita chunk a chunk em `/admin/diretrizes`. Cada chunk é
recuperado sozinho e chega ao modelo sem o resto do arquivo em volta — o
critério de revisão é "este trecho se sustenta isolado e o número está completo
dentro dele?", não "o arquivo está bom?".

Verificação — nenhum pendente restante e 28 aprovados a mais:

```bash
docker compose -f docker-compose.prod.yml exec copiloto-db \
  psql -U "$POSTGRES_OWNER_USER" -d copiloto_clinico -c \
  "SELECT status, count(*) FROM guideline_chunks GROUP BY 1;"
```

Registrar em `docs/guidelines-catalog.md` a validação assinada (nome, CRM,
data) de cada pacote — as pendências já estão listadas lá.

### Passo 5 — Aceite antes de avisar os médicos

Rodar os dois casos de `tests/fixtures/field-incident-cases.ts` pela interface,
como um médico faria:

| Caso | Aceite |
|---|---|
| `fi-001` — dengue, piora na defervescência | Cita `dengue_arbovirose` **e** o `reasoning` nomeia a piora quando a febre cedeu |
| `fi-002` — crises autolimitadas com lacrimejamento | Trata como cefaleia primária, mantém HSA como diferencial, **e** o `reasoning` nomeia o padrão temporal |

**Acertar o rótulo não basta.** Se o raciocínio não nomear o discriminador, o
acerto foi coincidência de retrieval e volta a falhar no próximo caso.

Só depois deste aceite, avisar os médicos.

### Rollback

| Sintoma | Ação |
|---|---|
| Copiloto passou a perguntar demais / diz "não cobre" em casos cobertos | `RETRIEVAL_MIN_SEMANTIC_SCORE=0` em `docker/.env.production`, depois `docker compose --env-file .env.production -f docker-compose.prod.yml up -d copiloto-api`. Desliga o piso sem rebuild e sem tocar no banco. **Só funciona porque o compose repassa a variável** — ver `RETRIEVAL_*` em `docker-compose.prod.yml`; sem esse repasse a variável não chega ao container. |
| Conteúdo novo com problema clínico | Rejeitar os chunks na curadoria, ou `UPDATE guideline_chunks SET status='rejected' WHERE source LIKE '%ABRAMEDE%'`. O retrieval só enxerga `approved`. |
| Falha na aplicação | `docker compose -f docker-compose.prod.yml up -d --build` na tag anterior. A migration é aditiva (só cria tabela nova), então a versão anterior roda sobre o schema novo sem alteração. |

## Operações de Rotina

### Verificar integridade da trilha de auditoria (manual)

```bash
curl -X POST http://localhost:3000/v1/audit/verify-chain \
  -H "x-internal-token: $INTERNAL_SERVICE_TOKEN"
```

Sem a API (só leitura), apontando direto para um banco — por exemplo um
backup restaurado:

```bash
DATABASE_URL=postgresql://... pnpm verify:audit-chain   # sai com 2 se a cadeia está rompida
```

Resposta esperada (cadeia íntegra):
```json
{ "valid": true, "count": 1234,
  "legacy": { "verified": 1180, "unverifiable": 0, "unverifiableSample": [] } }
```

Resposta em caso de cadeia rompida:
```json
{ "valid": false, "count": 45, "brokenAt": "<uuid>", "message": "afterHash mismatch at record ...",
  "legacy": { "verified": 44, "unverifiable": 0, "unverifiableSample": [] } }
```

O cron `AuditChainCronService` faz o mesmo às 02:00 UTC:

- **cadeia rompida:** loga `ERROR` `AUDIT CHAIN INTEGRITY FAILURE` e manda
  alerta ao Sentry (com o id e a contagem, nada do payload);
- **cadeia íntegra:** loga `Audit chain verification PASSED — N records
  verified (legacy: X verified, Y unverifiable)`, sem alarme.

O alarme só dispara com `valid: false`. Antes de 12/10/2026 ele disparava em
todo registro com payload de 2+ chaves — falso alarme, não adulteração
(ADR-015).

#### Como ler o resultado (ADR-015)

- **`hash_version` = 2** — registros a partir do deploy da ADR-015. O hash é
  sobre o JSON canônico e o verificador o refaz byte a byte. Qualquer
  diferença é falha.
- **`hash_version` NULL (legado)** — registros anteriores. O hash usava a
  ordem de inserção das chaves, que o jsonb não guarda, e o Prisma alterou
  parte dos números não inteiros ao gravar. O verificador reconstrói o texto
  original testando as ordens de chave e os doubles vizinhos. Conferidos
  contam em `legacy.verified`.
- **"Legado não verificável"** — `legacy.unverifiable`, com até 20 ids em
  `unverifiableSample`. É um registro legado cujo hash não dá para refazer a
  partir do banco. Não é alarme nem prova de adulteração, e o elo dele com o
  registro seguinte continua conferido. Motivos:

  | `reason` | Significa |
  |---|---|
  | `key-order-search-limit` | Ordem de chaves perdida no jsonb: o payload tem tantas chaves que as ordens possíveis passam de 40.320 (8!). Nenhum payload gravado pela aplicação até 12/10/2026 chega a isso. |
  | `rewritten-number` | Nenhuma ordem bate e o payload tem número não inteiro (ex.: `cost`). O Prisma o gravou mais longe do original do que os 4 ULPs testados. |

- **O total de não verificáveis fica congelado.** Desde a ADR-015 só se grava
  `hash_version` = 2, e um legado depois do primeiro canônico já é falha.
  Anote `legacy.unverifiable` na primeira verificação depois do deploy. Se o
  número crescer, trate como falha: é sinal de `hash_version` rebaixada num
  registro novo.

#### Mensagens de falha

| `message` | Significa | O que olhar |
|---|---|---|
| `afterHash mismatch at record X` | O registro canônico não tem o conteúdo que foi hasheado. | Adulteração: ver "Logs de nível ERROR" abaixo. |
| `afterHash mismatch at record X (legacy hash)` | Registro legado: nenhuma ordem de chaves reproduz o hash, e o payload não tem número não inteiro. | Adulteração — **ou** registro gravado antes do #14 (06/06/2026), quando o hash usava um timestamp diferente do `created_at`. Confira o `created_at` do registro. |
| `beforeHash mismatch at record X — chain link severed` | O elo com o registro anterior está rompido. | Registro removido ou inserido no meio, `after_hash` do anterior trocado, ou cadeia bifurcada por escrita concorrente antes do lock do #14. |
| `legacy hash after the canonical chain started at record X` | Registro sem versão depois do primeiro canônico. | `hash_version` rebaixada, ou gravação fora do `AuditService` (por exemplo, script). |
| `unknown hash_version N at record X` | Versão que o código não conhece. | `hash_version` alterada, ou API antiga (rollback) verificando registros de versão mais nova. |

Para investigar, o registro e os vizinhos na cadeia (só leitura):

```sql
SELECT id, created_at, action, hash_version, before_hash, after_hash, payload::text
FROM audit_log
WHERE created_at BETWEEN (SELECT created_at FROM audit_log WHERE id = '<brokenAt>') - interval '1 minute'
                     AND (SELECT created_at FROM audit_log WHERE id = '<brokenAt>') + interval '1 minute'
ORDER BY created_at, id;
```

#### Deploy da ADR-015 (hash canônico)

1. **Antes, num backup — nunca no banco de produção.** Restaure o dump mais
   recente num PostgreSQL local, aplique as migrations e rode o verificador
   novo:

   ```bash
   docker run -d --name audit-check -e POSTGRES_PASSWORD=check -p 127.0.0.1:55499:5432 pgvector/pgvector:pg16
   psql postgresql://postgres:check@localhost:55499/postgres -c 'CREATE DATABASE copiloto_clinico'
   psql postgresql://postgres:check@localhost:55499/copiloto_clinico < backup.sql   # erros de GRANT a roles inexistentes podem ser ignorados
   DATABASE_URL=postgresql://postgres:check@localhost:55499/copiloto_clinico pnpm prisma migrate deploy
   DATABASE_URL=postgresql://postgres:check@localhost:55499/copiloto_clinico pnpm verify:audit-chain
   ```

   Espera-se `valid: true`. Se vier `false`, leia a tabela de mensagens acima
   antes do deploy, porque o alarme continuaria disparando. Anote
   `legacy.unverifiable`.
2. **Deploy:** a migration `20261012180000_aud_007_audit_log_hash_version`
   antes da API, como em "Aplicar migrations em produção".
3. **Depois:** `POST /v1/audit/verify-chain` deve dar `valid: true`, com
   `legacy.unverifiable` igual ao do backup. Na manhã seguinte, o log das
   02:00 deve ter `Audit chain verification PASSED`.
4. **Rollback do código:** a API antiga não conhece `hash_version` e volta a
   acusar falha, agora já no primeiro registro canônico. Os dados ficam
   corretos e voltar à versão nova resolve. A coluna pode ficar.

### Aplicar migrations em produção

Na VPS, em `~/apps/copiloto-clinico/docker`, **nesta ordem**:

```bash
# 1. Imagem nova (os containers em execução continuam servindo)
docker compose --env-file .env.production -f docker-compose.prod.yml build copiloto-api

# 2. Migration com a imagem NOVA — o container em execução tem a imagem
#    antiga, sem os arquivos da migration nova
docker compose --env-file .env.production -f docker-compose.prod.yml run --rm --no-deps \
  --entrypoint sh copiloto-api \
  -c 'DATABASE_URL="$MIGRATION_DATABASE_URL" npx --no-install prisma migrate deploy'

# 3. Só então subir a API nova
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --no-deps copiloto-api
```

- A imagem de runtime não tem `pnpm` (`sh: pnpm: not found`): use
  `npx --no-install prisma`, que usa o CLI já instalado em `node_modules` e
  nunca baixa nada. Corrigido em 24/09/2026, no deploy da ADR-010.
- Subir a API antes da migration quebra o que depende do schema novo — na
  ADR-010, a busca oficial filtra por um valor de enum que só a migration cria.
- `--env-file .env.production` é obrigatório: sem ele o compose não interpola
  as variáveis e `MIGRATION_DATABASE_URL` sai vazia.
- **Migration que reescreve `guideline_chunks`** (ex.: `DROP/ADD COLUMN`) reconstrói
  o índice ivfflat, que com ~10 mil vetores pede mais que os 64 MB de
  `maintenance_work_mem` e falha com `memory required is 65 MB`. O Postgres
  desfaz tudo, mas o Prisma registra a migration como falha e bloqueia as
  próximas. Recuperação (feita em 24/09/2026 na F9):
  1. `npx --no-install prisma migrate resolve --rolled-back <migration>` (mesmo `run --rm` acima);
  2. aplicar o SQL numa transação com memória local:
     `{ echo "BEGIN;"; echo "SET LOCAL maintenance_work_mem = '256MB';"; cat ../prisma/migrations/<migration>/migration.sql; echo "COMMIT;"; } | docker exec -i copiloto-db psql -v ON_ERROR_STOP=1 -U "$POSTGRES_OWNER_USER" -d copiloto_clinico`;
  3. `npx --no-install prisma migrate resolve --applied <migration>`.
- **Depois de reconstruir o índice vetorial**, conferir `SHOW ivfflat.probes`
  como a role da aplicação: tem que ser `100` (migration
  `20260924220000_ivfflat_probes_exact`). Com `1`, a busca da base oficial volta
  vazia em ~1/3 das consultas.

`MIGRATION_DATABASE_URL` deve apontar para a role owner/admin do banco. A API
deve continuar usando `DATABASE_URL` com o usuário LOGIN membro de
`copiloto_app`, sem privilégios de DDL e sem `DELETE`/`TRUNCATE` em `audit_log`.

⚠️ **ATENÇÃO — audit_log:** Qualquer migration que altere a tabela `audit_log` (ex: adicionar coluna) precisa de revisão manual. O trigger `audit_log_no_update_delete` bloqueia `UPDATE`/`DELETE` mas **não bloqueia DDL**. Verificar que a migration não remove dados existentes. Desde a ADR-015 o `audit_log` é gravado por SQL em `AuditService.writeAuditLogEntry`, não pelo Prisma Client: coluna nova precisa entrar nesse `INSERT`.

### Rodar testes de integração

```bash
# Requer PostgreSQL rodando com migrations aplicadas
DATABASE_URL=postgresql://test:test@localhost:5432/test?schema=public pnpm prisma migrate deploy
DATABASE_URL=postgresql://test:test@localhost:5432/test?schema=public pnpm test:integration
```

### Rodar avaliação do pacote KB-001

Após a curadoria/aprovação dos chunks do pacote `docs/guidelines/drafts/kb-001-top20-ps`,
há duas validações específicas para os critérios de aceite do KB-001:

```bash
# Confere o pack de 40 casos sintéticos (2 por cenário)
pnpm test:kb-001:synthetic

# Valida retrieval do caso canônico "gripe >48h" contra PostgreSQL real
DATABASE_URL=postgresql://test:test@localhost:5432/test?schema=public pnpm prisma migrate deploy
KB001_INTEGRATION=1 DATABASE_URL=postgresql://test:test@localhost:5432/test?schema=public pnpm test:kb-001:integration
```

O teste de integração do KB-001 roda automaticamente no CI e fica `skip` em ambiente
local até que `KB001_INTEGRATION=1` seja informado junto de um PostgreSQL de teste ativo.

Esses dois testes conferem o pacote e o retrieval, não a resposta do modelo. Para medir
a resposta — e para o portão de release de qualquer mudança clínica — use o gabarito
clínico (`pnpm eval:clinical`, ver [docs/evals/gabarito-clinico.md](evals/gabarito-clinico.md)).

### Publicar os pacotes KB-005 (dengue) e KB-006 (cefaleias) em produção

Os dois pacotes existem como rascunho em `docs/guidelines/drafts/` e **não têm
efeito nenhum até serem ingeridos e aprovados** — o retrieval só enxerga chunks
com `status = 'approved'`.

```bash
pnpm ingest:guidelines docs/guidelines/drafts/kb-005-arboviroses-dengue
pnpm ingest:guidelines docs/guidelines/drafts/kb-006-cefaleias-primarias
```

Os chunks entram como `pending_review`. A aprovação é feita por um curador
(médico com `is_curator = true` e papel `COMPLIANCE`/`ADMIN`) no console
`/admin/diretrizes`, ou via `POST /v1/guidelines/chunks/:id/approve`.

Critério de aceite antes de liberar para os médicos do piloto — rodar os dois
casos de incidente de `tests/fixtures/field-incident-cases.ts` no ambiente real:

| Caso | Esperado |
|---|---|
| `fi-001-dengue-como-sepse` | Recupera `dengue_arbovirose` no top-3 e o `reasoning` cita a piora na defervescência |
| `fi-002-cefaleia-em-salvas-como-hemorragia` | Recupera `cefaleia`/`primaria`, trata a crise e mantém HSA como diferencial, nomeando o padrão temporal |

Não basta acertar o rótulo: se o `reasoning` não nomeia o discriminador, o
acerto foi coincidência de retrieval e volta a falhar no próximo caso.

### Ler o feedback dos médicos (F7)

O botão "cenário errado / faltou diretriz / conduta incorreta" na tela de
resultado grava na **trilha de auditoria**, com o rastro técnico anexado. Não
há tabela nova: consulte pela ação.

```sql
SELECT created_at, actor_id, entity_id, payload
FROM audit_log
WHERE action = 'COPILOT_FEEDBACK'
ORDER BY created_at DESC;
```

O `payload` traz `kind`, `comment`, `retrievedChunkIds`, `retrievalCoverage` e
`citedChunkIds` — o suficiente para reproduzir o caso e transformá-lo em
entrada de `tests/fixtures/field-incident-cases.ts`. A distinção que mais
importa na triagem:

| Sinal | Leitura |
|---|---|
| `kind=wrong_scenario` com `retrievalCoverage=full` | A base tinha conteúdo e o modelo citou o cenário errado — problema de prompt/guardrail |
| `kind=wrong_scenario` com `coverage=partial`/`none` | A base não cobre o cenário — problema de curadoria, vira pacote KB novo |
| `kind=helpful` | Contraste positivo, necessário para calibrar o piso de relevância |

### Ferramentas de beira-leito (ADR-017)

A área `/ferramentas` (calculadoras e roteiros do ANY App) fica atrás de
`NEXT_PUBLIC_FERRAMENTAS`, variável de **build** do web: o Next embute o valor
no bundle, então ligar ou desligar exige uma imagem nova. Desligada (padrão),
nada muda para o médico e `/ferramentas` mostra a página 404.

Pré-requisitos para ligar em produção: cessão do ANY assinada pelos três
sócios (CC-301) e revisão clínica das ferramentas publicadas (CC-310). Cada
calculadora mostra no rodapé a origem, a versão e o estado da revisão.

```bash
# deploy só do web, com a área ligada (mesmo roteiro de tag para rollback)
docker build -f docker/Dockerfile.web --build-arg NEXT_PUBLIC_FERRAMENTAS=on \
  -t docker-copiloto-web:<nome> .
```

Desde o ADR-017 a imagem do web também copia `src/shared/clinical-tools` (o
motor das ferramentas, TypeScript puro, sem dependência) e o servidor fica em
`web/server.js` dentro da imagem. Mudança no motor exige rebuild do web, não
só da API. Rollback por tag continua igual: cada imagem traz o próprio `CMD`.

Nada das ferramentas vai para log ou servidor: a conta roda no aparelho, os
favoritos ficam no `localStorage` e o texto copiado para o prontuário não tem
dado de paciente.

**Offline (CC-322).** O `pnpm build` do web gera `public/ferramentas-offline.json`
(páginas de `/ferramentas/**` e os chunks que elas usam, com a versão do
conteúdo); o service worker baixa essa lista na primeira abertura com sinal e
atualiza quando o sinal volta. Para conferir depois de um deploy: abrir uma
ferramenta, ver no rodapé "Disponível sem conexão · versão do conteúdo <hash>",
e o mesmo hash em `curl -s https://<host>/ferramentas-offline.json | jq .version`.
Se o rodapé não sair de "Guardando…", a sessão do médico pode ter vencido (o
pré-cache não guarda o redirect para /login): entrar de novo resolve. Teste
local, sem API: build com a flag ligada e
`pnpm exec playwright test -c playwright.ferramentas.config.ts`.

### Triar sugestões de diretriz enviadas por médicos (F4)

Qualquer médico autenticado pode enviar material pela tela de Diretrizes
("Sugerir uma diretriz"). A sugestão entra como `pending_review` e aparece na
mesma fila de curadoria de `/admin/diretrizes`. Os chunks sugeridos carregam
`metadata.suggestedBy` (id do médico) e `metadata.suggestedAt`.

Sugestão **nunca** supersede conteúdo aprovado — só um curador, via
`ingest-review`, pode marcar versões anteriores como `superseded`. Isso é
deliberado: um endpoint aberto que supersedesse permitiria remover conteúdo
curado do retrieval enviando algo com o mesmo `source` e uma versão nova.

### Calibrar o piso de relevância (KB-005/KB-006)

O piso (`RETRIEVAL_MIN_SEMANTIC_SCORE`, default `0.3`) é o que permite ao
sistema dizer "minha base não cobre este caso" em vez de responder citando o
cenário vizinho. O valor inicial é conservador e **deve ser calibrado com dados
reais** depois da primeira semana de uso.

Cada busca emite uma linha de log:

```
RETRIEVAL_COVERAGE coverage=partial best=0.412 candidates=10 kept=4 discarded=6
```

Procedimento:

1. Colete as linhas `RETRIEVAL_COVERAGE` de uma janela de uso real.
2. Compare a distribuição de `best` entre casos que os médicos consideraram
   bem respondidos e casos reportados como "cenário errado" ou "não cobriu".
3. Escolha o corte que mantém 100% de recall nos casos bem respondidos —
   errar para o lado de perguntar é aceitável; errar para o lado de recomendar
   com evidência do cenário errado não é.
4. Valide contra os 40 casos sintéticos do KB-001 (`pnpm test:kb-001:synthetic`
   confere o pack; a validação de retrieval é o
   `pnpm test:kb-001:integration` contra o banco).

Sinal de alerta: se a proporção de `coverage=none` subir muito, o problema
quase sempre é **falta de cobertura na base**, não o limiar. Baixar o piso
nesse caso só devolve o comportamento antigo — o certo é curar o cenário
faltante.

**Rollback imediato, sem redeploy:** `RETRIEVAL_MIN_SEMANTIC_SCORE=0` desliga
o piso e restaura o comportamento anterior byte a byte.

### Busca lexical (`text_tsv`) — F9

Até a migration `20260924180000_f9_guideline_chunks_text_tsv_generated`, a
coluna `guideline_chunks.text_tsv` ficava NULL em todas as linhas: a busca
"híbrida" do Copiloto era só semântica e a busca textual da biblioteca não
achava nada. Agora é coluna gerada (`to_tsvector('portuguese', text)`) com
índice GIN — o banco preenche sozinho, nenhum caminho de escrita precisa
lembrar dela.

**Isto muda respostas do Copiloto em produção:**

- A busca lexical usa `plainto_tsquery` (todos os termos, AND) sobre o texto
  redigido do caso. Com o caso inteiro como consulta o casamento é raro
  (plano, §F9); onde acontece, o chunk sobe no ranking (RRF) e pode trocar de
  posição com outros.
- Um chunk achado **só** pela busca lexical (fora do `LIMIT` da semântica)
  pode entrar no prompt, mas **só se a similaridade de cosseno dele passar do
  mesmo piso** (`RETRIEVAL_MIN_SEMANTIC_SCORE`). O `ts_rank` decide sozinho
  apenas para chunk sem embedding. Motivo: um hit só lexical tem, por
  construção, similaridade menor que a do pior candidato semântico. Deixá-lo
  passar pelo `ts_rank` reabriria o "vizinho semântico" dos incidentes
  KB-005/KB-006 (ver `semanticScoresForFloor` em `hybrid-search.ts`).
- Na linha `RETRIEVAL_COVERAGE`, `candidates` pode subir e `best` passa a
  considerar também a similaridade dos hits lexicais.
- A base oficial (ADR-010) não muda: a busca lexical só enxerga `approved`.
- Biblioteca de diretrizes: a busca por texto passa a retornar resultados.

**Ordem de release — API nova ANTES da migration** (exceção à ordem padrão de
"Aplicar migrations em produção"). O código anterior julgava hits só lexicais
pelo `ts_rank`, sem piso semântico: qualquer janela com a imagem antiga no ar
e a migration aplicada liga exatamente esse atalho. O código novo roda sem
problema sobre o schema antigo (a busca lexical só volta vazia). Na VPS, em
`~/apps/copiloto-clinico/docker`:

```bash
# 1. Imagem nova e API nova no ar (schema ainda antigo — busca lexical vazia)
docker compose --env-file .env.production -f docker-compose.prod.yml build copiloto-api
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --no-deps copiloto-api

# 2. Só então a migration, com a mesma imagem
docker compose --env-file .env.production -f docker-compose.prod.yml run --rm --no-deps \
  --entrypoint sh copiloto-api \
  -c 'DATABASE_URL="$MIGRATION_DATABASE_URL" npx --no-install prisma migrate deploy'

# 3. Limpar o cache da busca (60 s) para não servir resultado pré-migration
docker exec copiloto-redis sh -c 'redis-cli --scan --pattern "retrieval:*" | xargs -r redis-cli del'
```

Verificação — a coluna está preenchida:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml exec copiloto-db \
  psql -U "$POSTGRES_OWNER_USER" -d copiloto_clinico -c \
  "SELECT count(*) FILTER (WHERE text_tsv IS NULL) AS vazias, count(*) AS total FROM guideline_chunks;"
```

Esperado: `vazias = 0`.

**Depois do release:** comparar a distribuição de `RETRIEVAL_COVERAGE` com a
semana anterior e repetir o aceite `fi-001`/`fi-002` (Passo 5 do release da
base de contexto).

**Rollback:** não há flag só para a busca lexical. Para voltar ao
comportamento anterior, aplicar como nova migration o SQL "Reversível via" do
cabeçalho da migration F9 (a coluna volta a ser comum e NULL, e a busca lexical
volta vazia). **Voltar a imagem da API sem reverter a coluna é pior que as
duas opções:** reativa o atalho do `ts_rank` descrito acima. Atenção também
com `RETRIEVAL_MIN_SEMANTIC_SCORE=0`: desliga o piso inteiro, inclusive para
os hits lexicais.

### Ingestão e revisão de diretrizes (KB-002)

A ingestão em lote de diretrizes clínicas usa um pipeline de curadoria: nenhum
chunk entra em produção (retrieval) sem aprovação humana.

**1. Preparar os arquivos**

Cada arquivo `.md`/`.txt` deve começar com um front-matter `key: value`
delimitado por `---`, com os campos obrigatórios `source`, `sourceVersion`
(ou `version`) e `specialty`, e opcionalmente `evidenceLevel`, `cenario`,
`red_flags` e `institutionId`:

```
---
source: Diretriz Dor Torácica AMB 2026
sourceVersion: 2.0
specialty: cardiologia
evidenceLevel: A
cenario: dor_toracica
red_flags: supra_ST | hipotensao | dor_refrataria
---

Conteúdo da diretriz...
```

**2. Rodar a ingestão em lote**

```bash
pnpm ingest:guidelines ./caminho/para/diretrizes
```

O script processa todos os arquivos `.md`/`.txt` do diretório, gera os
embeddings e grava os chunks com `status = pending_review`. Chunks
`approved`/`pending_review` de versões anteriores da mesma `source` são
marcados como `superseded` (não são apagados — preserva rastreabilidade de
análises antigas). O comando imprime um relatório com os chunks criados por
arquivo e encerra com código de saída não-zero se algum arquivo falhar.

**3. Revisar e aprovar/rejeitar chunks pendentes**

Endpoints restritos a usuários com `isCurator = true` (`Physician.isCurator`,
flag provisória até existir RBAC completo):

```bash
# Listar chunks pendentes de revisão
curl http://localhost:3000/v1/guidelines/pending \
  -H "Authorization: Bearer $ACCESS_TOKEN"

# Aprovar um chunk
curl -X POST http://localhost:3000/v1/guidelines/chunks/$CHUNK_ID/approve \
  -H "Authorization: Bearer $ACCESS_TOKEN"

# Rejeitar um chunk (motivo opcional)
curl -X POST http://localhost:3000/v1/guidelines/chunks/$CHUNK_ID/reject \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"reason": "Texto desatualizado"}'
```

Aprovações e rejeições são registradas na trilha de auditoria
(`GUIDELINE_APPROVED` / `GUIDELINE_REJECTED`) com o id do revisor. Apenas
chunks `approved` aparecem no retrieval do copiloto — `pending_review`,
`rejected` e `superseded` são sempre excluídos.

**4. Conceder permissão de curador**

Como ainda não há RBAC completo, a permissão é concedida diretamente via
banco:

```sql
UPDATE physicians SET is_curator = true WHERE email = 'curador@exemplo.com';
```

### Cartões revisados (CC-402/CC-403/CC-412, ADR-019)

Um cartão é uma situação clínica com pergunta e resposta curta, em que cada
afirmação e cada dose citam um trecho literal de uma diretriz já ingerida
(base curada `approved` ou base oficial `official_unreviewed`). A IA rascunha;
um médico com **CRM verificado** aprova. A decisão do Copiloto só os usa com
`COPILOT_REVIEWED_CARDS` ligada (CC-408, abaixo).

**Rascunho por IA** — desligado por padrão (`KNOWLEDGE_CARDS_DRAFT_ENABLED`):
cada pedido é uma chamada ao modelo (estimativa do CC-403: US$ 0,20–0,30 por
cartão), no mesmo workspace da produção.

```bash
# Um tema; sem --chunks, a consulta de diretrizes escolhe até 8 trechos pelo tema
KNOWLEDGE_CARDS_DRAFT_ENABLED=true pnpm cards:draft --topic "Meningite bacteriana: antibiótico empírico no adulto" --syndrome febre
# A lista priorizada: [{ "topic": "...", "syndrome": "...", "chunkIds": ["..."] }]
KNOWLEDGE_CARDS_DRAFT_ENABLED=true pnpm cards:draft --topics-file temas.json
# Fiação sem custo: AI_PROVIDER=test devolve um cartão que cita o 1º trecho
```

O mesmo serviço atende `POST /v1/admin/knowledge-cards/drafts`
(`{ topic, syndrome?, chunkIds?, institutionId?, submitForReview? }`). Cada
cartão do modelo passa pela checagem determinística de citação (acento,
caixa, espaço e tipografia não contam): trecho que não está no texto da fonte,
trecho com menos de 20 letras, dose da resposta ou da afirmação que não está
no trecho citado, ou campo da dose estruturada fora do trecho da dose — o
cartão é **rejeitado antes da revisão** e o motivo fica em
`knowledge_card_drafts.rejections`. Os aceitos entram `in_review`.

No log: `KNOWLEDGE_CARD_DRAFT` (aceitos, rejeitados, modelo, custo) e
`KNOWLEDGE_CARD_DRAFT_FAILED` (modelo recusou, truncou, saiu do schema ou
erro de provedor — este também no Sentry). Nada do tema ou dos trechos no log.
No rastro, a etapa é `card_draft` em `ai_calls`.

```sql
-- Taxa de aceite da checagem de citação por modelo (métrica do CC-403)
SELECT coalesce(served_model, requested_model) AS model, count(*) AS drafts,
       sum(cards_accepted) AS accepted, sum(cards_rejected) AS rejected,
       round(sum(cost_usd)::numeric, 4) AS usd
FROM knowledge_card_drafts GROUP BY 1 ORDER BY drafts DESC;
```

**Revisão** — `admin/knowledge-cards`, com a mesma barreira da curadoria
(papel COMPLIANCE/ADMIN + `is_curator`). Toda decisão leva a `version` que a
pessoa viu; se outra versão entrou no meio, 409.

| Endpoint | O que faz |
|---|---|
| `GET /v1/admin/knowledge-cards?displayStatus=&syndrome=&institutionId=&importTool=` | Fila, com contagem por status de tela; `importTool` = só os importados de uma ferramenta do ANY |
| `GET /v1/admin/knowledge-cards/:id` | Cartão e todas as versões, com fontes, autor (IA: modelo, hash do prompt, origem) e revisão |
| `POST /v1/admin/knowledge-cards/:id/versions` | "Corrigir": versão nova do médico (`{ basedOnVersion, content }`); mesma checagem de citação, 422 com os problemas |
| `POST /v1/admin/knowledge-cards/:id/submit` | Rascunho → em revisão |
| `POST /v1/admin/knowledge-cards/:id/approve` | **Exige CRM verificado (403 sem ele).** Grava revisor, data, validade (`validityMonths`, padrão 12), comentário e `reviewDurationMs`; a versão vira a publicada |
| `POST /v1/admin/knowledge-cards/:id/reject` | "Descartar" com `reason`: arquiva; numa correção de cartão publicado, só a correção cai |
| `POST /v1/admin/knowledge-cards/:id/archive` | Tira de uso (final) |
| `GET /v1/admin/knowledge-cards/drafts` | Registro dos pedidos de rascunho, com as rejeições |
| `POST /v1/admin/knowledge-cards/import-batches/sign` | CC-405: o revisor indicado assina o lote importado de uma ferramenta do ANY (abaixo) |

Corrigir um cartão publicado não o tira do ar: a versão assinada segue
valendo até a nova ser aprovada. Publicado com a validade vencida aparece como
`needs_review` ("revisar"). Cada transição grava `CARD_DRAFTED`,
`CARD_VERSION_CREATED`, `CARD_SUBMITTED`, `CARD_APPROVED`, `CARD_REJECTED`,
`CARD_ARCHIVED` ou `CARD_IMPORTED` na trilha, com versão e `contentSha256` — comentário e motivo
só como hash. No banco, um trigger impede mudar o conteúdo de uma versão ou
regravar a decisão do revisor, e a role da API não apaga cartão nem versão.

**Importar o conteúdo do ANY (CC-405, emenda de 16/10/2026 à ADR-019)** —
sem IA e sem custo de modelo: cada dose ou protocolo do motor das Ferramentas
(`src/shared/clinical-tools`) vira um cartão "em revisão" por mapeamento
determinístico, com a referência do ANY e a procedência (versão do conteúdo e
commit do ANY) como fonte `clinical_tool`. O cartão passa pela mesma checagem
de citação de todo cartão: a resposta, as afirmações e a dose estruturada
citam linhas do texto do item no motor. Ferramentas: infusões (com heparina e
insulina), pediatria (bolus e infusões), via aérea, sedação, antídotos,
bloqueios (dose máxima e LAST), paliativos (conversor, hipodermóclise e
sintomas), ACLS, dengue e CAD/EHH — hoje 175 cartões.

```bash
pnpm cards:import-any --dry-run                  # sem banco: quantos cartões, doses e achados por ferramenta
pnpm cards:import-any --dry-run --tool acls --print   # cada cartão: pergunta, doses e achados
pnpm cards:import-any                            # grava; revisor indicado = o médico "Gustavo Moreira"
pnpm cards:import-any --tool pediatria --reviewer-crm SP-123456   # uma ferramenta, revisor pelo CRM
```

Roda da raiz do repositório (lê `docs/ferramentas/revisao-clinica/`) e
aponta para o banco do `DATABASE_URL`. Em produção, como a ingestão: **não**
dentro do `copiloto-api` (a imagem não tem `docs/` nem `scripts/`), e sim no
estágio `builder` do `Dockerfile.api`, com o `DATABASE_URL` da role da
aplicação (`copiloto_app` tem INSERT em `knowledge_card_imports`) — ver
"Passo 3 — Ingestão dos pacotes". Sem `--reviewer-crm`, o revisor indicado
é o único médico cadastrado com o nome "Gustavo Moreira"; nenhum ou mais de um
é erro. O CRM dele precisa estar verificado só para assinar, não para
importar. Código 1 quando algum item não passa na checagem (a lista sai no
terminal e em `knowledge_card_imports.rejections`).

Reimportar não duplica (chave `knowledge_cards.source_key`, ex.
`any:infusoes/noradrenalina`): mesmo conteúdo fica como está; conteúdo novo
(o dado do motor mudou, ex. depois de uma decisão da revisão clínica) vira
versão nova, de volta a "em revisão" — a versão publicada segue valendo até a
nova ser assinada; cartão arquivado fica arquivado. Cada versão importada
leva em `review_flags` os achados da revisão clínica do CC-310 que citam o
item (e, na pediatria, a divergência do id na fonte única do CC-321), para o
revisor ver antes de assinar; aparecem em `versions[].reviewFlags` no detalhe
do cartão. Não existe status "aguardando assinatura": o importado entra
`in_review`. Na trilha, `CARD_IMPORTED` por cartão criado ou atualizado; no
log, `KNOWLEDGE_CARD_ANY_IMPORT` só com contagens.

**Assinar o lote de uma ferramenta** — o revisor indicado, com CRM
verificado, publica de uma vez os cartões importados de uma ferramenta:

```http
GET  /v1/admin/knowledge-cards?importTool=acls&displayStatus=in_review&limit=100
POST /v1/admin/knowledge-cards/import-batches/sign
     { "toolId": "acls", "items": [{ "cardId": "…", "version": 1 }, …], "comment"?: "…", "validityMonths"?: 12 }
```

Cada item leva a versão que o revisor viu. Tudo ou nada: CRM não verificado ou
cartão indicado a outro revisor dá 403; cartão de outra ferramenta, fora de
"em revisão" ou com versão nova no meio dá 409 com a lista — nada é gravado.
Assinado, cada cartão grava `CARD_APPROVED` na trilha (versão, hash e o
`batch` de que fez parte), vira publicado e entra no índice (CC-406). O
revisor pode tirar do lote o que não aprova e rejeitar um a um.

```sql
-- Importações: o que entrou, mudou ou ficou de fora
SELECT created_at, tool_id, any_commits, items_total, cards_created, cards_updated,
       cards_unchanged, cards_skipped, jsonb_array_length(rejections) AS recusados
FROM knowledge_card_imports ORDER BY created_at DESC LIMIT 10;
-- Cartões do ANY por ferramenta e status
SELECT split_part(substr(source_key, 5), '/', 1) AS ferramenta, status, count(*)
FROM knowledge_cards WHERE source_key LIKE 'any:%' GROUP BY 1, 2 ORDER BY 1, 2;
```

**Anti-circularidade (CC-412)** — nenhum caso do gabarito pode ter a mesma
origem de rascunho de um cartão (mesmo `draftId` ou mesmo
`sourceContentSha256`). O runner do gabarito confere antes de medir; à mão:

```bash
pnpm cards:check-circularity   # só leitura; código 1 se houver caso circular
```

**Índice semântico (CC-406, emenda de 15/10/2026 à ADR-019)** — tabela
`knowledge_card_index`, uma linha por cartão publicado, aprovado, válido e
assinado por médico com CRM verificado. Aprovar indexa (ou reindexa a versão
nova), arquivar tira, e a varredura diária das 04:00 UTC tira o vencido e
completa o vetor que faltou. A busca confere tudo de novo na consulta: cartão
vencido, arquivado ou de revisor que perdeu a verificação nunca volta, mesmo
antes da varredura.

O vetor vem do provedor de embedding configurado (`EMBEDDING_PROVIDER`,
`AI_EMBEDDING_MODEL`, `EMBEDDING_BASE_URL` — os mesmos das diretrizes). Com
`EMBEDDING_PROVIDER=none` (produção hoje), o cartão entra sem vetor e a busca
não roda. A coluna não fixa dimensão: trocar provedor ou modelo é reindexar.

```bash
pnpm cards:reindex   # indexa o que falta, reembute o que mudou, tira o que venceu
                     # código 1 se algum cartão ficou sem vetor com o provedor ligado
```

No log: `CARD_INDEX_SYNC` (com vetor novo, sem mudança, sem vetor, fora do
índice por motivo, linhas apagadas), `CARD_SEARCH` (consultas, candidatos,
melhor similaridade), `CARD_EMBEDDING_UNAVAILABLE` (provedor falhou — também
no Sentry), `CARD_INDEX_SYNC_FAILED` e `CARD_INDEX_SWEEP_FAILED`. Nada do
texto do cartão ou da consulta.

```sql
-- O que está no índice, por modelo; linhas sem vetor esperam o reindex
SELECT coalesce(embedding_model, '(sem vetor)') AS model, count(*),
       min(valid_until) AS vence_primeiro
FROM knowledge_card_index GROUP BY 1;
```

**Escolher o provedor dos cartões** — `pnpm eval:card-retrieval` mede o
acerto top-1/top-3, o MRR e a latência da consulta com o provedor do
ambiente, embutindo em memória os cartões publicados e as perguntas de
`evals/cards/retrieval-questions.json` (formato em
`retrieval-questions.example.json`: `id`, `question`, `expected` = tema ou id
do cartão). Só leitura; o índice não muda. Código 1 abaixo de 85% no top-3.

```bash
# Base: o provedor atual
pnpm eval:card-retrieval --json openai.json
# Voyage (formato compatível com a API da OpenAI)
EMBEDDING_PROVIDER=openai EMBEDDING_BASE_URL=https://api.voyageai.com/v1 \
  AI_EMBEDDING_MODEL=voyage-3.5 EMBEDDING_API_KEY=$VOYAGE_API_KEY \
  pnpm eval:card-retrieval --json voyage.json
# Qwen3-Embedding na DeepInfra; modelo local pelo text-embeddings-inference
EMBEDDING_PROVIDER=openai EMBEDDING_BASE_URL=https://api.deepinfra.com/v1/openai \
  AI_EMBEDDING_MODEL=Qwen/Qwen3-Embedding-8B EMBEDDING_API_KEY=$DEEPINFRA_API_KEY \
  pnpm eval:card-retrieval --json qwen3.json
EMBEDDING_PROVIDER=openai EMBEDDING_BASE_URL=http://localhost:8080/v1 \
  AI_EMBEDDING_MODEL=BAAI/bge-m3 EMBEDDING_API_KEY=local pnpm eval:card-retrieval --json local.json
```

Escolhido o provedor (critério na ADR-019), ligue-o no ambiente e rode
`pnpm cards:reindex`. Atenção: `EMBEDDING_PROVIDER`/`AI_EMBEDDING_MODEL` são os
mesmos das diretrizes — trocar o modelo com a base interna em uso
(`COPILOT_KNOWLEDGE_SOURCE=internal_kb`) exige reembutir os trechos
(`vector(1536)`) também. Se só os cartões devem mudar, a troca é um
`CardEmbedder` próprio (`CARD_EMBEDDER` no `KnowledgeCardIndexModule`).

**Cartões na decisão (CC-408, `COPILOT_REVIEWED_CARDS`)** — desligada por
padrão. Com ela desligada, nada muda: nenhuma busca de cartão, e prompt e
saída da decisão byte a byte iguais. Ligada, só na decisão em etapas (v2, v3,
v4) e em qualquer `COPILOT_KNOWLEDGE_SOURCE`:

1. com o entendimento do caso, busca no índice pelas `searchQueries` (nunca o
   texto do caso), na instituição do atendimento — **é uma chamada de
   embedding a mais por análise**, inclusive em `model_only`;
2. o portão de relevância aceita o cartão com similaridade ≥
   `REVIEWED_CARDS_MIN_SIMILARITY` (padrão 0,50) e do mesmo tema (mesma
   síndrome, ou o tema do cartão nas hipóteses do caso); até
   `REVIEWED_CARDS_MAX` cartões (padrão 3, até 5);
3. o cartão entra no prompt com "Revisado por Dr(a). X, CRM Y/UF, em data";
   a conduta que o cita pode trazer **só a dose estruturada do cartão**, do
   mesmo fármaco — outra dose vale um retry (`CARD DOSE NOT IN CARD`) e, se
   sobrar, a conduta perde a citação e sai como conhecimento do modelo,
   marcada "Dose sem fonte citada";
4. na tela, a conduta mostra o rótulo verde "Cartão revisado por médico",
   "Revisado por … · CRM … · em …" e "Ver cartão" (`/cartoes/:id`, que lê
   `GET /v1/knowledge-cards/:id`).

Pré-requisitos para ligar: cartões publicados, provedor de embedding ligado
e índice com vetor (`pnpm cards:reindex` sai com código 0), e o gabarito com
a variante de cartões sem aumento de erro crítico (abaixo). Sem embedding, a
flag ligada não quebra nada: a busca não roda e a análise segue sem cartões.

No log: `REVIEWED_CARDS` (status, portão, síndrome, candidatos, aceitos,
rejeitados por motivo, `cardId:versão:similaridade`), `REVIEWED_CARDS_GAP`
(nenhum cartão aplicável — a lacuna da CC-409), `REVIEWED_CARDS_SKIPPED`
(decisão v1 ou sem entendimento), `REVIEWED_CARDS_FAILED` e
`REVIEWED_CARDS_GATE_FAILED` (também no Sentry; a análise segue sem cartões)
e `REVIEWED_CARD_DOSE_DEMOTED` (dose fora do cartão depois do retry). Na
interação: `params.reviewedCards` (o que a busca fez) e
`rawOutput.reviewedCards` (cartão, versão, hash assinado, revisor,
similaridade).

```sql
-- Análises com a flag ligada que receberam cartão (métrica da CC-408)
SELECT count(*) FILTER (WHERE jsonb_array_length(raw_output->'reviewedCards') > 0) AS com_cartao,
       count(*) AS com_flag
FROM ai_interactions WHERE raw_output ? 'reviewedCards';
```

**Medir antes de ligar (critério 3 da CC-408)** — sem chamada paga nos
testes; a rodada é manual, com o banco do gabarito tendo os cartões
publicados e o índice feito:

```bash
pnpm cards:reindex
EMBEDDING_BASE_URL=https://api.openai.com/v1 AI_EMBEDDING_MODEL=text-embedding-3-small \
  EMBEDDING_API_KEY=$OPENAI_API_KEY \
  pnpm eval:clinical --variant claude-opus-5-5-v3-modelo --variant claude-opus-5-5-v3-modelo-cartoes \
  --cases critical --judge anthropic
# caso a caso: nenhum erro crítico novo com cartões
pnpm eval:clinical:compare evals/clinical/runs/<v3-modelo> evals/clinical/runs/<v3-modelo-cartoes>
```

O relatório ganha "… citando cartão revisado (com a dose do cartão)" na
seção "Base das condutas". O workspace da Anthropic é o da produção:
confirme o limite antes de rodar.

**Teste da tese (CC-413)** — modelo barato com cartões contra o Opus sem
cartões. Comandos e pré-requisitos em `docs/evals/gabarito-clinico.md`
("Teste da tese"); a comparação é `pnpm eval:clinical:compare --tese`.

### Sincronizar a base oficial da Conitec (ADR-010)

PCDT, DDT, Diretrizes Brasileiras e Protocolos de Uso (~190 documentos) entram
como `official_unreviewed`: fonte oficial do MS, **não revisada** pela equipe
clínica. Não passam pela fila de curadoria e não são `approved`. Hoje (passos
1–4 do plano) ficam no banco sem entrar no retrieval; o uso pelo Copiloto chega
no passo 5, atrás de `OFFICIAL_GUIDELINES_ENABLED`.

**1. Ensaio sem gravar**

```bash
pnpm sync:official-guidelines --dry-run --json /tmp/official-dry-run.json
```

Baixa as quatro listas e os PDFs (~200 MB), recorta as seções e mostra o que
seria criado. Não chama a LLM nem gera embedding. Em 24/09/2026: 188 PDFs, 179
com seções reconhecidas, 9 em texto integral, ~10 mil chunks.

**2. Sincronizar**

```bash
pnpm sync:official-guidelines                         # tudo
pnpm sync:official-guidelines --only asma             # um documento
pnpm sync:official-guidelines --kind pcdt --limit 10  # um lote
```

Exige `AI_PROVIDER` real: cada documento novo é classificado pela LLM
(agudo/crônico, população, especialidade, cenários do piloto). Se a LLM falhar,
a classificação cai para uma heurística conservadora e o documento entra mesmo
assim. Cada chunk recebe embedding quando há provedor; com
`EMBEDDING_PROVIDER=none` (ou o provedor fora do ar), entra sem vetor e só a
busca textual o encontra — ver "Rodar sem embeddings".

A mudança é detectada pelo **SHA-256 do PDF** — a Conitec altera anexos sem
publicar portaria nova. Versão nova substitui a anterior numa transação só; os
chunks antigos viram `superseded` (não são apagados).

**Em produção (VPS)** a imagem de runtime não tem `scripts/` nem `src/`: use o
estágio `builder`, como na ingestão dos pacotes KB. A carga completa leva ~25
minutos; rodar destacado e guardar o log:

```bash
cd ~/apps/copiloto-clinico/docker
docker build -q -f Dockerfile.api --target builder -t copiloto-ingest:tmp ..
set -a; . ./.env.production; set +a
APPDB="postgresql://${POSTGRES_APP_USER}:${POSTGRES_APP_PASSWORD}@copiloto-db:5432/copiloto_clinico?schema=public"
docker run -d --name copiloto-official-sync --network docker_copiloto-net \
  --env-file .env.production -e DATABASE_URL="$APPDB" -e REDIS_URL=redis://copiloto-redis:6379 \
  --entrypoint sh copiloto-ingest:tmp -c "npx --no-install tsx scripts/sync-official-guidelines.ts"
docker wait copiloto-official-sync
docker logs copiloto-official-sync > ~/backups/copiloto-clinico/official-sync-$(date +%F).log 2>&1
docker rm copiloto-official-sync && docker rmi copiloto-ingest:tmp
```

Primeira carga (24/09/2026): 187 novos + 1 já existente, 2 `not_pdf`, 0 erros;
188 documentos, 10.014 chunks.

**3. Ler o relatório**

| Saída | Significado | Ação |
|---|---|---|
| `new` / `updated` | versão gravada | nenhuma |
| `unchanged` | PDF idêntico ao ativo | nenhuma |
| `not_pdf` | link da lista aponta para página HTML | nenhuma (2 PUs apontam para o bvsms) |
| `SEM SEÇÕES (texto integral)` | estrutura não reconhecida, corpo entrou inteiro até a bibliografia | revisar se o recorte faz sentido |
| `RECORTE BAIXO` | menos de 5% do PDF virou chunk | provável título mal reconhecido em `official-document-sections.ts` |
| `error` | falha no download/extração daquele documento | o resto seguiu; código de saída 1 |
| Aborto com "Lista … com N itens (piso M)" | HTML da Conitec mudou | nada foi gravado; ajustar `conitec-listing.ts` e a fixture em `tests/fixtures/conitec/` |
| "sumiram da lista" | documento ativo não está mais na Conitec | nada é removido; decidir manualmente |

**4. Refazer a classificação**

```bash
pnpm sync:official-guidelines --reclassify
```

Reclassifica documentos sem mudança (ex.: depois de ajustar o prompt em
`official-classification.ts`) e propaga `careSetting`/`cenarios` para a
metadata dos chunks.

**5. Retrieval e válvula de escape**

A busca da base oficial roda em pool separado da curada e loga, a cada
análise:

```
OFFICIAL_RETRIEVAL best=0.612 candidates=18 kept=2 discarded=9 docs=1
```

`kept=0` com `best` alto indica piso ou penalização rígidos demais; `kept`
sempre no teto com `docs=1` indica um PCDT dominando. Limiares em
`.env.example` (`OFFICIAL_*`); valores e dados da calibração de 24/09/2026 no
comentário de `official-search.ts`.

⚠️ O resultado da busca fica 60 s em cache no Redis. Ao recalibrar e testar em
seguida, limpar só essas chaves:
`docker exec copiloto-redis sh -c 'redis-cli --scan --pattern "retrieval:*" | xargs -r redis-cli del'`. Para desligar a base
oficial sem redeploy: `OFFICIAL_GUIDELINES_ENABLED=false` no
`.env.production` e recriar o container da API.

**6. Conferir no banco**

```sql
SELECT kind, care_setting, count(*), sum(chunk_count)
FROM official_guideline_documents WHERE status = 'active'
GROUP BY 1, 2 ORDER BY 1, 2;
```

### Trocar o provider ou o modelo de IA

A troca é só de env, sem rebuild. O gateway (`src/modules/ai-gateway`) fala
com a Anthropic pelo SDK oficial e com a OpenAI (ou API compatível, via
`AI_BASE_URL`) por HTTP:

```bash
# docker/.env.production
AI_PROVIDER=anthropic        # ou openai
AI_MODEL=claude-sonnet-5-5   # ou claude-opus-5-5, gpt-...
AI_API_KEY=...
AI_BASE_URL=                 # vazio = API oficial do provider

docker compose --env-file .env.production -f docker-compose.prod.yml up -d copiloto-api
```

O provider adapta a requisição à família do modelo:

| Modelo | Raciocínio | Structured outputs | Fallback de recusa |
|---|---|---|---|
| `claude-opus-5-5`, `claude-sonnet-5-5` | adaptativo, `AI_EFFORT` | sim | `AI_REFUSAL_FALLBACK` |
| `claude-sonnet-4-20250514` (padrão do compose) | não; `temperature` 0,3 | não | não |
| OpenAI `o1`/`o3`/`o4`/`gpt-5*` | `AI_REASONING_EFFORT` | só com `AI_OPENAI_STRUCTURED_OUTPUT=true` | — |
| OpenAI demais (`gpt-4o`...) | não; `temperature` 0,3 | só com `AI_OPENAI_STRUCTURED_OUTPUT=true` | — |

⚠️ **Armadilha do `temperature`.** Os Claude atuais (4.6+ e 5.x) e a família
de raciocínio da OpenAI respondem HTTP 400 a `temperature` (e `top_p`/`top_k`).
O gateway omite o parâmetro nesses modelos e só o envia aos legados. Código
novo passa `temperature` ao gateway e deixa o provider decidir — nunca monta a
requisição à mão. Pelo mesmo motivo, `budget_tokens` e `thinking: disabled`
não existem no gateway: o Opus 5.5 recusa os dois; a profundidade é `AI_EFFORT`.

#### Um provedor por etapa (perfis)

Além do `AI_PROVIDER`, o gateway fala com os provedores listados em
`AI_PROVIDER_PROFILES`. Cada etapa escolhe o seu pela referência do modelo,
`perfil:modelo`; sem prefixo de perfil, a referência é um modelo do
`AI_PROVIDER`. Exemplo com a Groq na leitura do caso e o Opus na decisão:

```bash
# docker/.env.production
AI_PROVIDER=anthropic
AI_MODEL=claude-opus-5-5
AI_PROVIDER_PROFILES=groq
AI_PROVIDER_GROQ_KIND=openai
AI_PROVIDER_GROQ_API_KEY=...
AI_PROVIDER_GROQ_BASE_URL=https://api.groq.com/openai/v1
AI_PROVIDER_GROQ_STRUCTURED_OUTPUT=json_schema
AI_INTAKE_MODEL=groq:openai/gpt-oss-120b
```

| Variável do perfil `<NOME>` | Valores | Padrão |
|---|---|---|
| `AI_PROVIDER_<NOME>_KIND` | `anthropic`, `openai` | obrigatória |
| `AI_PROVIDER_<NOME>_API_KEY` | chave do host | obrigatória |
| `AI_PROVIDER_<NOME>_BASE_URL` | URL com a versão (`.../v1`) | API oficial do tipo |
| `AI_PROVIDER_<NOME>_STRUCTURED_OUTPUT` | `json_schema`, `json_object`, `off` | `off` |
| `AI_PROVIDER_<NOME>_MAX_TOKENS_PARAM` | `max_completion_tokens`, `max_tokens` | `max_completion_tokens` |
| `AI_PROVIDER_<NOME>_EXTRA_BODY` | objeto JSON somado ao corpo | — |

Perfil listado sem `KIND` ou `API_KEY` derruba a API na subida, de propósito:
a análise iria para o lugar errado. O gpt-oss é tratado como modelo de
raciocínio (`reasoning_effort` vem do esforço da etapa, até `high`), e um
bloco `<think>` no começo da resposta é descartado. Nos provedores compatíveis
com a OpenAI, `AI_REQUEST_TIMEOUT_MS` (padrão 180 s), `AI_STREAM_IDLE_TIMEOUT_MS`
(60 s) e `AI_REQUEST_MAX_RETRIES` (2, em 429, 5xx e falha de rede) evitam que um
host travado segure a análise. O log de erro do host traz só tipo, código e o
começo da mensagem (`AI_PROVIDER_ERROR`), nunca o corpo inteiro, que pode
repetir o caso. A pesquisa web continua só na Anthropic: aponte
`AI_RESEARCH_MODEL` para um modelo Claude (com perfil, se o `AI_PROVIDER` não
for a Anthropic).

O raciocínio conta para o teto de saída (`AI_MAX_OUTPUT_TOKENS`, padrão 16000).
Rollback sem redeploy: `AI_STRUCTURED_OUTPUT=false` desliga o JSON Schema em
todos os providers; `AI_REFUSAL_FALLBACK=off` desliga o fallback (obrigatório
se `AI_BASE_URL` apontar para um proxy que não aceite o beta
`server-side-fallback-2026-07-01`).

Logs para acompanhar depois da troca:

| Log | Significado | Ação |
|---|---|---|
| `Anthropic API error: status=400` | Parâmetro rejeitado pelo modelo | Conferir `AI_MODEL` e as variáveis acima |
| `AI_OUTPUT_TRUNCATED` | Saída bateu no teto (`AiTruncatedError`) | Subir `AI_MAX_OUTPUT_TOKENS` ou baixar `AI_EFFORT` |
| `AI_REFUSAL category=...` | Classificador de segurança recusou (`AiRefusalError`) | Ver o caso; categoria `bio`/`cyber` em caso clínico legítimo é falso positivo |
| `AI_REFUSAL_FALLBACK servedBy=...` | Outro modelo respondeu no lugar | Esperado e raro; o custo usa o modelo que serviu |
| `AI_PROVIDER_RETRY operation=... status=...` | Host compatível com OpenAI respondeu 429/5xx, estourou o prazo ou caiu a rede; nova tentativa | Esporádico: esperado. Contínuo: limite do plano no host ou instabilidade |
| `AI_PROVIDER_ERROR operation=... status=...` | Falha definitiva do host compatível com OpenAI | 400: parâmetro ou schema rejeitado pelo modelo; 401: chave do perfil |

#### Pesquisa web (`COPILOT_KNOWLEDGE_SOURCE=web`)

A pesquisa usa as ferramentas de servidor da Anthropic nas versões básicas
(`web_search_20250305` e `web_fetch_20250910`), restritas à lista de domínios.
A versão `_20260209` (filtragem dinâmica) foi descartada: medida em 11/10/2026,
devolveu os mesmos resultados e nenhuma citação, e sem citação não há evidência.
Antes de ligar:

- web search precisa estar habilitado para a organização no Claude Console
  (senão a API responde 400 e toda pesquisa cai no fallback);
- se a organização restringe domínios no Console, a lista da pesquisa precisa
  ser subconjunto dela (entrada fora dela = 400);
- a pesquisa só recebe o
  entendimento do caso (síndrome, hipóteses, dados que faltam) — nunca o texto
  do caso nem dado do paciente;
- custo: tokens do modelo de pesquisa + US$ 0,01 por busca, somados ao custo
  da análise.

| Log | Significado | Ação |
|---|---|---|
| `WEB_RESEARCH model=... searches=... items=...` | Pesquisa entregou evidência | — |
| `WEB_RESEARCH_FALLBACK` | Erro, recusa, provider sem suporte ou nenhuma citação de fonte permitida; a decisão seguiu só com o modelo | Raro: esperado. Frequente: ver o motivo no log e `params.research` da interação |
| `WEB_RESEARCH_PROVIDER_ERROR` (ERROR, Sentry) | Falha de rede ou da API na pesquisa | 4xx: conferir Console (web search habilitado, domínios); 5xx: status.anthropic.com |
| `WEB_RESEARCH_DOMAINS_REJECTED` | Entrada inválida, repetida ou acima de 64 em `WEB_RESEARCH_ALLOWED_DOMAINS` | Corrigir a lista (hostname puro, sem `https://` nem `*`) |
| `WEB_RESEARCH_CITATION_OUTSIDE_ALLOWLIST` | Citação de domínio fora da lista, descartada | Investigar se repetir |
| `DECISION_V2_CITATION_DEMOTED` | Conduta "source" sem id citável, mostrada como conhecimento do modelo | Acompanhar no gabarito |

O custo gravado em `ai_interactions.cost` considera leitura e escrita de cache
e, desde a Fase 0-B, também as análises em stream (antes gravavam 0).

---

## Multi-tenancy institucional (PROT-004)

Hospitais clientes podem ter protocolos e diretrizes próprios, isolados de
outras instituições e do conteúdo público (`institution_id IS NULL`). Ver
[ADR-009](./decisions/ADR-009-institutional-multi-tenancy.md) para o modelo
completo.

**1. Criar uma instituição**

Endpoint restrito a `InternalServiceGuard`:

```bash
curl -X POST http://localhost:3000/v1/institutions \
  -H "x-internal-token: $INTERNAL_SERVICE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "Hospital Central", "cnes": "1234567", "status": "active"}'
```

**2. Vincular médicos à instituição**

```bash
curl -X POST http://localhost:3000/v1/institutions/$INSTITUTION_ID/physicians \
  -H "x-internal-token: $INTERNAL_SERVICE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"physicianId": "<uuid-do-medico>"}'
```

Um médico pode pertencer a múltiplas instituições (`PhysicianInstitution` é
N:N). Médicos sem vínculo, ou vinculados a mais de uma instituição sem
informar `institutionId` explicitamente, só enxergam conteúdo global
(`institution_id IS NULL`).

**3. Ingerir protocolos/diretrizes institucionais**

Adicionar `institutionId: <uuid>` no front-matter do arquivo (ver seção
KB-002 acima):

```
---
source: Protocolo Sepse Hospital Central
sourceVersion: 1.0
specialty: emergencia
institutionId: <uuid-da-instituicao>
---
```

Sem `institutionId`, o conteúdo é global (visível a todas as instituições).
Re-ingestão de uma nova versão só marca como `superseded` chunks da **mesma**
`institutionId` — versões institucional e global da "mesma" fonte coexistem
sem se invalidar.

**4. Verificar isolamento**

`ProtocolsService.findById`/`findAll` e `RetrievalService.search` filtram por
`institution_id IS NULL OR institution_id = :institutionId` no SQL — não
apenas na resposta. Acesso a um protocolo de outra instituição retorna `404`
(nunca `403`, para não confirmar a existência do recurso).

---

## Migrações

### Histórico de Migrations

| Migration | Descrição |
|---|---|
| `20260605000000_aud_001_audit_log_append_only` | Trigger append-only + REVOKE TRUNCATE |
| `20260605010000_iam_001_crm_verified` | Coluna `crm_verified` em physicians |
| `20260605020000_iam_003_remove_mfa_fields` | Remove `mfa_enabled` e `mfa_secret` (dead code) |
| `20260605030000_aud_002_db_least_privilege` | Role `copiloto_app` com menor privilégio para runtime |
| `20260606111800_perf_001_guideline_embedding_ivfflat` | Índice ivfflat para `guideline_chunks.embedding` |
| `20260613090000_kb_002_guideline_review_pipeline` | Status de revisão (`pending_review`/`approved`/`rejected`/`superseded`) em `guideline_chunks` + `is_curator` em physicians |
| `20260614100000_prot_004_institution_multi_tenancy` | Tabelas `institutions`/`physician_institutions` + `institution_id` em `protocols`/`guideline_chunks`/`encounters` |
| `20260924120000_adr_010_official_guideline_documents` | Status `official_unreviewed`, tabela `official_guideline_documents` (uma linha por versão) e `document_id` em `guideline_chunks` (ADR-010) |
| `20260924180000_f9_guideline_chunks_text_tsv_generated` | `guideline_chunks.text_tsv` vira coluna gerada + índice GIN — liga a busca lexical (ver "Busca lexical (`text_tsv`) — F9") |
| `20260924220000_ivfflat_probes_exact` | `ivfflat.probes = 100` no banco: busca vetorial exata (incidente de 24/09/2026) |
| `20261012180000_aud_007_audit_log_hash_version` | `audit_log.hash_version` (NULL = hash legado, 2 = JSON canônico) — ADR-015; só adiciona coluna nula |
| `20261014120000_cc_402_knowledge_cards` | Cartões revisados (ADR-019): `knowledge_card_drafts`, `knowledge_cards`, `knowledge_card_versions`, trigger que congela o conteúdo assinado e GRANT sem DELETE; só cria tabelas |
| `20261016120000_cc_405_author_kind_import` | Autoria `import` no enum das versões de cartão (CC-405); sozinha porque o valor novo só pode ser usado depois de confirmado |
| `20261016120100_cc_405_any_card_import` | Importação do ANY (CC-405): `knowledge_card_imports`, `knowledge_cards.source_key` (única) e `assigned_reviewer_id`, `knowledge_card_versions.import_id` e `review_flags`, CHECK de autoria e trigger refeitos; só acrescenta colunas nulas ou com padrão — depois do deploy, `pnpm cards:import-any` |
| `20261015120000_cc_406_knowledge_card_index` | Índice semântico dos cartões (CC-406): `knowledge_card_index`, derivado (CASCADE a partir do cartão, GRANT com DELETE), `embedding vector` sem dimensão fixa; só cria tabela — depois do deploy, `pnpm cards:reindex` |

### Rollback de Migration

Prisma não suporta rollback automático. Para reverter:
1. Criar nova migration com o `ALTER TABLE` inverso
2. Aplicar normalmente via `prisma migrate deploy`
3. Nunca deletar migrations já aplicadas em produção

---

## Variáveis de Ambiente Críticas

| Variável | Risco se ausente/errada |
|---|---|
| `JWT_ACCESS_SECRET` | Todos os tokens são inválidos ou forjáveis |
| `JWT_REFRESH_SECRET` | Refresh tokens inválidos |
| `INTERNAL_SERVICE_TOKEN` | Endpoint `/audit/verify-chain` inacessível |
| `AI_API_KEY` | Análise clínica indisponível |
| `DATABASE_URL` | Sistema completamente indisponível ou rodando com privilégios excessivos |
| `MIGRATION_DATABASE_URL` | Migrations indisponíveis ou executadas com usuário incorreto |
| `OFFICIAL_GUIDELINES_ENABLED` | `false` tira PCDT/DDT/DB/PU do retrieval (válvula de escape da ADR-010); ausente = ligada. Os limiares `OFFICIAL_*` estão em `.env.example` |
| `KNOWLEDGE_CARDS_DRAFT_ENABLED` | `true` liga o rascunho de cartões por IA (CC-403: `pnpm cards:draft` e `POST /v1/admin/knowledge-cards/drafts`). Ausente ou irreconhecível = desligado (503). Modelo em `AI_CARD_DRAFT_MODEL` (vazio = `AI_MODEL`; aceita `perfil:modelo`). Não muda a análise do Copiloto |
| `COPILOT_REVIEWED_CARDS` | CC-408: `on` põe os cartões revisados publicados na decisão em etapas (v2/v3/v4), com "Revisado por" e a dose estruturada do cartão liberada. Ausente ou irreconhecível = desligada: nenhuma busca de cartão, prompt e saída iguais. Ligada, uma chamada de embedding a mais por análise; sem embedding, segue sem cartões. Limiares em `REVIEWED_CARDS_MIN_SIMILARITY` (padrão 0,5) e `REVIEWED_CARDS_MAX` (padrão 3). Ver "Cartões na decisão" |
| `UNREVIEWED_SOURCES_PRELIMINARY` | `false` desliga a contenção da ADR-012: PCDT e chunk curado sem assinatura voltam a embasar conduta definitiva. Ausente ou irreconhecível = ligada |
| `COPILOT_REASONING` | `stages` liga o raciocínio em etapas da ADR-013 (entendimento do caso antes da busca, busca dirigida, card "O que eu entendi"); `legacy` (padrão) volta ao pipeline de sempre. Ausente ou irreconhecível = `legacy`. Etapa 1 com `AI_UNDERSTANDING_MODEL` (vazio = `AI_MODEL`) e `AI_UNDERSTANDING_EFFORT` (padrão `low`). Falha da Etapa 1 aparece como `UNDERSTANDING_FAILED`/`UNDERSTANDING_FALLBACK` no log e a análise segue pela busca de sempre |
| `COPILOT_DECISION_PROMPT` | `v2` liga a decisão em duas camadas da ADR-013 ("Fazer agora" × "Depende de…", perguntas que separam hipóteses, conhecimento geral do modelo rotulado e sem dose); `v1` (padrão) é o prompt de sempre. Exige `COPILOT_REASONING=stages`: sem ele fica `v1` e o log mostra `DECISION_PIPELINE_DOWNGRADE`. Regra da v2 que sobra depois do retry vira `OUTPUT_VALIDATION_WARNING`, nunca bloqueio |
| `COPILOT_INTAKE` | `on` liga o Copiloto guiado da ADR-014: antes do plano, a leitura do caso decide se pergunta (no máximo 3 perguntas, uma por vez). `off` (padrão) vai direto ao plano. Ausente ou irreconhecível = `off`. Modelo da leitura em `AI_INTAKE_MODEL` (vazio = o da Etapa 1). No log: `INTAKE_READING` (tempo e perguntas), `INTAKE_STARTED` (caminho: `ask`, `unstable`, `complete`, `reading_failed`, `disabled`), `INTAKE_CLOSED` (motivo) e `INTAKE_READING_TIMEOUT` (leitura passou de 20 s e o caso seguiu direto ao plano). Exige a migration `20261012120000_adr_014_case_intakes` |
| `AI_DECISION_MODEL` / `AI_DECISION_CRITICAL_MODEL` | ADR-016: modelo da decisão no caso comum e no caso grave (instável ou tempo-crítico pela Etapa 1, ou sem entendimento). Vazios = `AI_MODEL` nas duas rotas. Crítico vazio = o comum nas duas. Aceitam `perfil:modelo`. No log: `DECISION_MODEL route=critical\|standard model=...`; a interação grava `params.decisionRoute` |
| `COPILOT_KNOWLEDGE_SOURCE` | `internal_kb` (padrão) é a busca de sempre (embedding na OpenAI); `model_only` não busca nada; `web` pesquisa em fontes oficiais (`AI_RESEARCH_MODEL`, padrão `claude-sonnet-5-5`; `AI_RESEARCH_EFFORT`, padrão `low`; `WEB_RESEARCH_MAX_SEARCHES`, padrão 5; `WEB_RESEARCH_ALLOWED_DOMAINS`, vazio = 32 fontes padrão). `model_only` e `web` nunca chamam o provedor de embedding. `web` exige `stages` e `COPILOT_DECISION_PROMPT=v2` (sem eles vira `model_only`, com `DECISION_PIPELINE_DOWNGRADE` no log) e Anthropic como `AI_PROVIDER`; pesquisa que falha aparece como `WEB_RESEARCH_FALLBACK` e a análise segue só com o conhecimento do modelo |
| `NEXT_PUBLIC_FERRAMENTAS` | Web, variável de build. `on` liga a área Ferramentas do ADR-017 (sidebar, barra inferior no lugar de Buscar, ⌘K e as rotas `/ferramentas`). Ausente ou qualquer outro valor = desligada, `/ferramentas` mostra 404. Ligar exige a cessão do ANY (CC-301) e a revisão clínica (CC-310); na imagem, `--build-arg NEXT_PUBLIC_FERRAMENTAS=on` |

---

## Monitoramento

### Rastro das chamadas de IA (`ai_calls`)

Cada chamada ao modelo grava uma linha em `ai_calls` e uma linha `AI_CALL` no
log: etapa (`intake_reading`, `understanding`, `decision`, `research`,
`verify_attach`, `guideline_classification`, `card_draft`), perfil, provedor, modelo pedido
e servido, esforço, hash do system prompt (a versão do prompt), tokens, custo,
latência e desfecho (`ok`, `refusal`, `truncated`, `error`, `aborted`). Nenhum
texto do caso, do prompt ou da resposta. A resposta HTTP devolve
`x-request-id`; o mesmo id está em `ai_calls.request_id` e em
`ai_interactions.request_id`. Falha ao gravar vira `AI_CALL_LOG_FAILED` (WARN)
e nunca para a análise.

```sql
-- Custo, chamadas e latência por etapa e modelo nos últimos 7 dias
SELECT stage, coalesce(served_model, requested_model) AS model, count(*) AS calls,
       round(sum(cost_usd)::numeric, 4) AS usd,
       percentile_cont(0.5) WITHIN GROUP (ORDER BY latency_ms) AS p50_ms,
       count(*) FILTER (WHERE outcome <> 'ok') AS failures
FROM ai_calls WHERE created_at > now() - interval '7 days'
GROUP BY 1, 2 ORDER BY usd DESC NULLS LAST;

-- Tudo o que uma requisição chamou (o médico ou o suporte citam o x-request-id)
SELECT created_at, stage, served_model, outcome, latency_ms, cost_usd, left(prompt_sha256, 12)
FROM ai_calls WHERE request_id = '<x-request-id>' ORDER BY created_at;
```

### Logs de nível ERROR que exigem atenção imediata

| Log | Causa | Ação |
|---|---|---|
| `AUDIT CHAIN INTEGRITY FAILURE` (também alerta no Sentry) | Cadeia rompida: conteúdo, elo ou versão de hash que não confere (ADR-015). "Legado não verificável" **não** dispara isto. | Ler a mensagem na tabela "Mensagens de falha" (em "Verificar integridade da trilha de auditoria"). Se for adulteração: isolar o sistema, investigar os registros suspeitos e acionar o DPO |
| `Audit chain verification failed with exception` | Erro ao verificar cadeia | Verificar conectividade com banco |
| `Output validation failed` | IA retornou resposta inválida | Verificar provider, possível mudança de modelo |
| `Anthropic API error: status=...` | Falha na API da Anthropic | 4xx: ver "Trocar o provider ou o modelo de IA"; 429/5xx: o SDK já retentou 2x, checar status.anthropic.com |
| `Injection detected` | Possível tentativa de prompt injection | Revisar logs de acesso, bloquear IP se necessário |

---

## Conformidade CFM — Checklist de Auditoria

Para uma auditoria regulatória do CFM, verificar:

- [ ] `audit_log` tem registros para todos os atendimentos (`ENCOUNTER_CREATED`)
- [ ] Todos os documentos confirmados têm `DOCUMENT_CONFIRMED` com `afterHash`
- [ ] Cadeia de hash está íntegra (`POST /audit/verify-chain` → `valid: true`), com `legacy.unverifiable` igual ao anotado no deploy da ADR-015
- [ ] Trigger `audit_log_no_update_delete` está ativo no banco
- [ ] Role runtime não consegue `TRUNCATE`/`DROP TABLE audit_log`
- [ ] Logs de login existem para todos os acessos (`AUTH_LOGIN`)

---

## Contatos

| Área | Contato |
|---|---|
| Engenharia | rodrigo.tozato@strivium.com.br |
| DPO (LGPD) | rodrigo.tozato@strivium.com.br |
| Provider de IA (DPA) | Ver `docs/compliance/DPA_PROVIDER.md` |

## Rodar sem embeddings (`EMBEDDING_PROVIDER=none`)

A Anthropic não tem API de embedding, e a conta da OpenAI ficou sem crédito em
11/10/2026. Com `EMBEDDING_PROVIDER=none` no `docker/.env.production`, o
serviço não faz nenhuma chamada de embedding:

| Funcionalidade | Sem embeddings |
| --- | --- |
| Análise do Copiloto (`COPILOT_KNOWLEDGE_SOURCE=model_only`) | Não usa embedding; nada muda |
| Análise com `internal_kb` | Segue sem trechos da base (cobertura `none`), sem alerta |
| "Consultar diretrizes" | Busca por palavra-chave: todos os termos e, para o caso inteiro, qualquer termo, ordenado por quantos casam |
| Sugerir diretriz, ingestão do curador, sincronização oficial | Trechos gravados sem vetor, só para a busca textual |

Com o provedor ligado mas fora do ar (sem crédito, 429), o comportamento é o
mesmo, com `GUIDELINE_EMBEDDING_UNAVAILABLE` ou `RETRIEVAL_EMBEDDING_UNAVAILABLE`
no log e no Sentry. Para ligar de novo: `EMBEDDING_PROVIDER=openai` (ou outro
provedor) e `up -d copiloto-api`; os trechos gravados sem vetor precisam de
backfill de embedding para entrar na busca por significado.
