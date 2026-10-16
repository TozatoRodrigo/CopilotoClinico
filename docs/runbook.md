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

### Limite de tentativas: login, MFA e troca de senha (CC-025)

Duas camadas, independentes:

- **Por IP** (`@nestjs/throttler`, em memória na API): `/auth/login` e
  `/auth/register` 5 por minuto, `/auth/mfa/verify` 5 a cada 5 minutos, o resto
  `THROTTLER_LIMIT` (600/min em produção). O IP é o N-ésimo a partir da
  direita do `X-Forwarded-For`, com N = `TRUSTED_PROXY_HOPS` (padrão 1). Antes
  do CC-025 era o primeiro da lista, que o cliente forja.
- **Por conta** (`login_security_states`, no Postgres): 5 tentativas sem
  acerto em 15 min bloqueiam por 15 min (`AUTH_LOCKOUT_*`). Contadores
  separados: login (por e-mail), código do MFA (login com MFA, desativar o
  MFA, gerar novos códigos de backup) e senha atual na troca de senha. Login
  bloqueado responde 401, igual a senha errada; MFA e troca de senha
  respondem 429 "Muitas tentativas".

#### `TRUSTED_PROXY_HOPS` e o Traefik

Cada proxy acrescenta à direita do XFF o IP de quem se conectou a ele; o que
está à esquerda veio do cliente. O valor certo é o número de proxies entre a
internet e a API:

| Caminho | `TRUSTED_PROXY_HOPS` |
|---|---|
| cliente → Traefik → API (produção hoje) | `1` (padrão) |
| cliente → Cloudflare com proxy ligado (nuvem laranja) → Traefik → API | `2` |
| cliente → API, sem proxy | `0` |

- **Com 1**, a configuração do Traefik não muda o resultado: a API usa o IP
  que o próprio Traefik acrescentou, mesmo que ele repasse o XFF do cliente.
- **Com 2**, o Traefik precisa aceitar o XFF **só** da Cloudflare:
  `entryPoints.websecure.forwardedHeaders.trustedIPs` com as faixas de
  <https://www.cloudflare.com/ips/> e **sem** `forwardedHeaders.insecure`.
  Assim, quem chega direto ao Traefik (pulando a Cloudflare) tem o XFF
  descartado e a API usa o IP que o Traefik viu. Com `insecure` ou
  `trustedIPs` amplo (ex.: `0.0.0.0/0`), quem pula a Cloudflare escolhe o
  próprio rastreador.
- **Ligar a Cloudflare e trocar para 2 no mesmo deploy.** Com 1 atrás da
  Cloudflare, o rastreador vira o IP da borda dela, e médicos diferentes
  dividem os mesmos 5 logins por minuto.
- Valor inválido na env: a API usa 1 e loga `TRUSTED_PROXY_HOPS inválido`
  na subida.

Conferir na VPS (a configuração estática do Traefik não está neste repo):

```bash
# Flags de linha de comando do Traefik
docker inspect <container-do-traefik> --format '{{range .Args}}{{println .}}{{end}}' \
  | grep -i -E 'entrypoints|forwardedheaders'
# Ou o arquivo estático montado (traefik.yml/traefik.toml)
docker inspect <container-do-traefik> --format '{{range .Mounts}}{{println .Source}}{{end}}'
grep -n -i -A4 'forwardedHeaders' <arquivo-estático>
# Cloudflare na frente? Endereços dela (104.16.0.0/13, 172.64.0.0/13…) = proxy ligado
dig +short copiloto.servidortozato.cloud
```

Teste depois do deploy, de fora da VPS (seu IP fica 1 min sem login):

```bash
for i in 1 2 3 4 5 6 7; do
  curl -s -o /dev/null -w '%{http_code}\n' -X POST https://copiloto.servidortozato.cloud/v1/auth/login \
    -H 'content-type: application/json' -H "x-forwarded-for: 198.51.100.$i" \
    -d '{"email":"teste-limite@example.com","password":"senha-errada"}'
done
# Esperado: 401 cinco vezes e depois 429. Sete 401 = o XFF forjado ainda troca o rastreador.
```

#### Logs

| Log (WARN) | Significado |
|---|---|
| `AUTH_RATE_LIMITED reason=ip route=AuthController.<rota> limit=… ttlMs=… blockedForS=…` | Um IP passou do limite numa rota de `/auth`. Uma linha por bloqueio, não por requisição recusada; sem o IP |
| `RATE_LIMITED reason=ip route=…` | O mesmo fora de `/auth` |
| `AUTH_RATE_LIMITED reason=account scope=login\|mfa\|password_change subject=<hash>` | Tentativa recusada porque a conta está bloqueada |
| `AUTH_ACCOUNT_LOCKED scope=mfa\|password_change subject=<hash> durationMs=…` | Começo de um bloqueio por conta |

`subject` são os 12 primeiros hex do sha256 do id do médico (`unknown` no
login de e-mail sem cadastro). Bloqueios seguidos de `scope=mfa` para o mesmo
`subject` querem dizer que alguém tem a senha desse médico: avisar o médico
para trocá-la. Para achar o médico e, depois de confirmar com ele, desbloquear:

```bash
docker exec -i copiloto-db psql -v ON_ERROR_STOP=1 -U "$POSTGRES_OWNER_USER" -d copiloto_clinico <<'SQL'
SELECT id FROM physicians
WHERE left(encode(sha256(convert_to(id::text, 'UTF8')), 'hex'), 12) = '<subject>';

-- Zera login, MFA e troca de senha desse médico
UPDATE login_security_states
SET failed_count = 0, locked_until = NULL, last_failed_at = NULL
WHERE physician_id = '<id>';
SQL
```

### Conferir a retenção de áudio (LGPD)

O cron `AudioRetentionCronService` roda de hora em hora (minuto 15, UTC) e
elimina o áudio das capturas com `retain_until` vencido. Regras e motivo da
lápide: "Capturas de áudio" em `docs/compliance/LGPD.md`.

```sql
-- Deve retornar 0. A folga de 1h cobre o intervalo entre execuções.
SELECT count(*) FROM audio_captures
WHERE status <> 'deleted' AND retain_until < now() - interval '1 hour';
```

Cada eliminação deixa uma entrada `AUDIO_RETENTION_PURGE` na trilha
(`entity = 'AudioCapture'`, `entity_id` = id da captura).

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

- A imagem `copiloto-api` sai de `docker/Dockerfile.api` (o `dockerfile` do
  serviço em `docker-compose.prod.yml`), e a do web, de `docker/Dockerfile.web`.
  O antigo `docker/api.Dockerfile` foi removido na CC-014: nenhum compose,
  script, workflow ou documento o usava, e ele divergia da imagem de produção
  (pnpm sem versão fixa, sem `pnpm-workspace.yaml` e sem `tini`). A demo
  (`scripts/demo.sh`) usa o `Dockerfile` da raiz.
- A imagem de runtime não tem `pnpm` (`sh: pnpm: not found`): use
  `npx --no-install prisma`, que usa o CLI já instalado em `node_modules` e
  nunca baixa nada. Corrigido em 24/09/2026, no deploy da ADR-010.
- Desde a CC-024, o `node_modules` da imagem de runtime tem só as dependências
  de produção e o CLI do Prisma, que fica para este passo. `tsx`, `nest`,
  `vitest` e afins existem só no estágio `builder`: rode scripts de `scripts/`
  por ele, como na ingestão. Se um build quebrar em `prisma generate` no
  estágio `prod-deps`, o lock deixou de trazer o CLI como dependência opcional
  do `@prisma/client` (comentário em `docker/Dockerfile.api`).
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

### Texto clínico cifrado em repouso (CC-207, ADR-021)

O texto clínico (caso, saída da IA, conversa, anexos, transcrições,
documentos, notas — inventário completo na ADR-021) é cifrado pela extensão
do Prisma com `FIELD_ENCRYPTION_KEY` quando `CLINICAL_TEXT_ENCRYPTION=on`. A
leitura abre texto em claro e cifrado sempre, com a flag ligada ou não.

#### Deploy (primeira vez)

Na VPS, em `~/apps/copiloto-clinico/docker`, com `set -a; . ./.env.production; set +a`:

1. **Cópia da chave.** Confirme que `FIELD_ENCRYPTION_KEY` de
   `.env.production` está guardada também fora do servidor. Sem ela, o texto
   cifrado não volta.
2. **Backup** (como no Passo 0.2 do release), e confira que não está vazio:

   ```bash
   docker compose -f docker-compose.prod.yml exec copiloto-db \
     pg_dump -U "$POSTGRES_OWNER_USER" copiloto_clinico > backup-pre-cc207-$(date +%F-%H%M).sql
   ```

3. **Código e migration com a flag desligada** (padrão `off`): ver
   "Aplicar migrations em produção". A migration
   `20261015180000_cc207_chief_complaint_text` só troca
   `encounters.chief_complaint` de `VARCHAR(140)` para `TEXT` (sem reescrever
   a tabela). Nada muda para o médico.
4. **Ligar a gravação cifrada:** `CLINICAL_TEXT_ENCRYPTION=on` em
   `.env.production`, depois
   `docker compose --env-file .env.production -f docker-compose.prod.yml up -d --no-deps copiloto-api`.
   Confira que o container recebeu: `docker compose -f docker-compose.prod.yml exec copiloto-api printenv CLINICAL_TEXT_ENCRYPTION` → `on`.
   Faça uma análise de teste e confira que abre normalmente.
5. **Cifrar o que já existe.** A imagem de runtime não tem `scripts/`: use o
   estágio `builder`, como na ingestão, e a role da aplicação.

   ```bash
   docker build -f Dockerfile.api --target builder -t copiloto-cc207:tmp ..
   APPDB="postgresql://${POSTGRES_APP_USER}:${POSTGRES_APP_PASSWORD}@copiloto-db:5432/copiloto_clinico?schema=public"
   cc207() {
     docker run --rm --network docker_copiloto-net \
       -e DATABASE_URL="$APPDB" -e FIELD_ENCRYPTION_KEY="$FIELD_ENCRYPTION_KEY" \
       -e FIELD_ENCRYPTION_KEY_PREVIOUS="${FIELD_ENCRYPTION_KEY_PREVIOUS:-}" \
       --entrypoint sh copiloto-cc207:tmp -c "npx tsx scripts/encrypt-clinical-text.ts $*"
   }
   cc207 --dry-run            # contagem por coluna, nada gravado
   cc207 --batch 500          # cifra; pode interromper e rodar de novo
   cc207 --verify             # tem que terminar com "OK: nenhum texto clínico em claro."
   ```

   A `Chave atual` impressa pelo script tem que ser a mesma nas três
   chamadas. `concorrentes > 0` é normal com médicos usando o sistema: rode
   de novo até zerar. `falhas > 0` (chave desconhecida ou valor que não abre)
   para tudo — ver a tabela de erros abaixo.
6. **Conferir no banco** (amostra; não deve aparecer texto legível):

   ```bash
   docker compose -f docker-compose.prod.yml exec copiloto-db psql -U "$POSTGRES_OWNER_USER" -d copiloto_clinico -c \
     "SELECT left(input_redacted, 20), left(raw_output::text, 22) FROM ai_interactions ORDER BY created_at DESC LIMIT 3;"
   ```

   Esperado: `enc:v1:<id>:…` e `"enc:v1:<id>:…`.
7. **Backups antigos** (antes do passo 5) continuam com o texto em claro:
   aplique a política de retenção a eles.

#### Rollback

- **Comportamento:** `CLINICAL_TEXT_ENCRYPTION=off` e `up -d --no-deps
  copiloto-api`. Volta a gravar em claro; o que já foi cifrado continua
  abrindo (leitura dupla). Não precisa decifrar nada.
- **Código:** a versão anterior ao CC-207 não lê `enc:v1:`. Para voltar a
  imagem da API para antes do CC-207: flag `off`, depois `cc207 --decrypt
  --dry-run` e `cc207 --decrypt` (grava em claro o que estava cifrado, com o
  mesmo compare-and-set), e só então a imagem antiga. A migration pode ficar
  (`TEXT` serve à versão antiga).

#### Rotação da chave

1. `FIELD_ENCRYPTION_KEY` = nova (`openssl rand -hex 32`),
   `FIELD_ENCRYPTION_KEY_PREVIOUS` = antiga; `up -d --no-deps copiloto-api`.
2. `cc207 --batch 500` (o relatório mostra `rotacionados`), depois
   `cc207 --verify` com `chaveAnterior` = 0 em todas as colunas.
3. **Não remova a chave anterior ainda:** o segredo do MFA e o áudio (formato
   legado) também abrem com ela, mas o script não os refaz. Sem ela, o login
   de quem tem MFA quebra.

#### Erros

| Erro (log/Sentry) | Causa | Ação |
|---|---|---|
| `SealedValueError: <Modelo>.<campo>: Sealed value uses unknown key <id>` | Valor cifrado com uma chave que não está no ambiente (chave trocada sem `FIELD_ENCRYPTION_KEY_PREVIOUS`). | Recolocar a chave certa (ou a anterior em `FIELD_ENCRYPTION_KEY_PREVIOUS`) e reiniciar a API. |
| `SealedValueError: … does not open with key <id>` / `Malformed sealed value` | Valor cifrado alterado ou truncado no banco. | Tratar como incidente de integridade: `cc207 --verify` lista os ids (`undecryptableIds`). |
| `FieldKeyError: FIELD_ENCRYPTION_KEY is required` (na leitura: `SealedValueError: <Modelo>.<campo>: FIELD_ENCRYPTION_KEY is required`) | Flag ligada, ou valor cifrado lido, sem a chave no ambiente. | Conferir o repasse no `docker-compose.prod.yml`. |
| `ClinicalTextQueryError: <Modelo>.<campo> é texto clínico cifrado: …` | Código novo filtrando/ordenando pelo conteúdo de um campo cifrado. | Bug: o filtro não funcionaria sobre texto cifrado. Corrigir o código (filtrar por outro campo ou no código depois de ler). |

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
O modelo da leitura do caso do Copiloto guiado (`AI_INTAKE_MODEL`) se escolhe
pela latência e pelos erros de dado de cada candidato (`pnpm eval:intake`, ver
[docs/evals/leitura-do-caso.md](evals/leitura-do-caso.md)).

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

### Feedback que vira caso do gabarito e "não encontrei" (CC-703)

Na triagem (`/admin/feedback`), "Virou caso do gabarito" marca o reporte e já
baixa o rascunho do caso, `campo-<8 primeiros do id>.json`; "Baixar rascunho do
caso" baixa de novo a qualquer momento. O servidor monta o rascunho
(`GET /v1/admin/copilot-feedback/:id/eval-case-draft`, papel
COMPLIANCE/ADMIN e curador): formato v2 do gabarito, texto que o modelo leu
naquela rodada (caso e respostas) passado de novo pela máscara, expectativas
vazias, `provenance.origin = feedback:<id>` e o que é do curador marcado
`A PREENCHER`. Cada download fica na trilha como
`COPILOT_FEEDBACK_EVAL_CASE_EXPORTED` (só o id do rascunho) e no log como
`EVAL_CASE_DRAFT_EXPORTED`.

A API não escreve no repositório. O curador salva o arquivo em
`evals/clinical/cases/`, preenche o que está marcado (ver
`docs/evals/gabarito-clinico.md`, "Caso novo") e abre o PR. O teste do
gabarito recusa arquivo com `A PREENCHER` ou com a tag `a-preencher`.

O botão "Não encontrei o que precisava", sob a análise, grava uma lacuna em
`knowledge_gaps` (não entra na fila de triagem): a síndrome de PS e as consultas
da busca dirigida que o entendimento registrou, e a frase opcional do médico
(até 280 caracteres, mascarada). Nunca o texto do caso. Uma por análise: tocar
de novo atualiza a nota. No log: `KNOWLEDGE_GAP_RECORDED`. É a entrada da
fila de cartões (CC-409) e do painel do beta (CC-705).

```sql
-- Lacunas da semana por síndrome, com as consultas mais repetidas
SELECT coalesce(g.syndrome, '(sem entendimento)') AS syndrome, count(DISTINCT g.id) AS gaps,
       (array_agg(DISTINCT q.query))[1:5] AS sample_queries
FROM knowledge_gaps g LEFT JOIN LATERAL unnest(g.search_queries) AS q(query) ON true
WHERE g.created_at > now() - interval '7 days'
GROUP BY 1 ORDER BY gaps DESC;

-- O que os médicos disseram que faltou
SELECT created_at, syndrome, note FROM knowledge_gaps
WHERE note IS NOT NULL ORDER BY created_at DESC LIMIT 50;
```

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

#### Reserva de provedor (CC-107)

Com a Groq (ou qualquer perfil) numa etapa, uma queda do host virava erro
para o médico. Com `AI_FALLBACK_MODEL`, quando a chamada de uma etapa falha
por **indisponibilidade** — prazo estourado, falha de rede, 5xx (inclusive o
529 da Anthropic), 429 depois das novas tentativas do provedor ou limite de
uso da conta (o 400 "workspace API usage limits" da Anthropic, o 402 e o
`insufficient_quota` dos hosts compatíveis com a OpenAI) — o gateway repete a
chamada **uma vez** no modelo de reserva, com as mesmas mensagens, esforço e
schema.

```bash
# docker/.env.production — Groq na leitura e no entendimento, Sonnet de reserva
AI_FALLBACK_MODEL=claude-sonnet-5-5
# Opcional, por etapa (vence a geral); "none" desliga a reserva na etapa
AI_DECISION_FALLBACK_MODEL=claude-opus-5-5
```

| Variável | Etapa (`ai_calls.stage`) |
|---|---|
| `AI_FALLBACK_MODEL` | todas sem variável própria |
| `AI_INTAKE_FALLBACK_MODEL` | `intake_reading` |
| `AI_UNDERSTANDING_FALLBACK_MODEL` | `understanding` |
| `AI_DECISION_FALLBACK_MODEL` | `decision` (as duas rotas da ADR-016) |
| `AI_VERIFY_ATTACH_FALLBACK_MODEL` | `verify_attach` |
| `AI_GUIDELINE_CLASSIFICATION_FALLBACK_MODEL` | `guideline_classification` |

Aceitam `perfil:modelo`, como os modelos das etapas; vazio = sem reserva,
como antes. A reserva **não** entra:

- em erro do pedido: 400 de parâmetro ou schema, 401/403 de chave, 404 de
  modelo, recusa (`AiRefusalError`), truncamento (`AiTruncatedError`) ou saída
  que não passa na validação — outro provedor não resolveria, e repetir só
  dobraria custo e espera;
- quando a reserva está no mesmo perfil que caiu (`AI_FALLBACK_SKIPPED`): o
  mesmo host responderia de novo. Um segundo perfil da mesma empresa com
  outra chave (outro workspace) conta como outro perfil;
- no stream da decisão depois do primeiro trecho (`AI_FALLBACK_SKIPPED ...: o
  stream já tinha começado`): trocar de modelo no meio misturaria duas
  respostas. Antes do primeiro trecho, o stream continua na reserva;
- na pesquisa web, que só existe na Anthropic (falha nela já segue sem pesquisa).

Se a reserva também falha, a etapa recebe o erro **original** (o do provedor
que caiu), com `AI_FALLBACK_FAILED` no log. Exceção: recusa ou truncamento da
reserva seguem como estão, porque quem chama contabiliza o custo deles e já
sabe tratá-los.

⚠️ **Latência.** A reserva só entra depois das novas tentativas do provedor.
Com os padrões (`AI_REQUEST_TIMEOUT_MS=180000`, `AI_REQUEST_MAX_RETRIES=2`),
um host que trava em vez de recusar segura a etapa por até ~9 min antes da
reserva. Com a reserva ligada, vale encurtar os dois (ex.: `60000` e `1`):
valem para todos os perfis compatíveis com a OpenAI. 429 e 5xx rápidos
caem para a reserva em segundos.

No rastro, as duas chamadas ficam em `ai_calls` com o mesmo `request_id`: a
que falhou (`outcome=error`, `error_type` com classe e status ou motivo, ex.:
`AiProviderError:503`, `AiProviderError:timeout`) e a da reserva, com
`fallback_from` = perfil que caiu (exige a migration
`20261014180000_ai_calls_fallback_from`). Rollback: esvaziar
`AI_FALLBACK_MODEL` (e as variáveis por etapa) e recriar o container, sem rebuild.

| Log | Significado | Ação |
|---|---|---|
| `AI_FALLBACK stage=... from=... fromModel=... to=... toModel=... reason=... error=... requestId=...` (WARN) | A etapa foi para a reserva; `reason` = `timeout`, `network`, `rate_limit`, `server_error` ou `usage_limit` | Esporádico: esperado. Contínuo: ver o status do host (status.groq.com, status.anthropic.com) ou o limite da conta |
| `AI_FALLBACK_SKIPPED ...: reserva no mesmo perfil que caiu` / `o stream já tinha começado` (WARN) | Indisponibilidade sem reserva possível | Mesmo perfil: apontar a reserva da etapa para outro perfil |
| `AI_FALLBACK_FAILED stage=... original=... error=...` (ERROR) | A reserva também falhou; a etapa recebeu o erro original | Os dois provedores fora: ver status dos dois e o limite de uso |

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

#### Modelo da transcrição (`WHISPER_MODEL`)

O ditado vai para a Groq (`WHISPER_BASE_URL`) com o modelo de `WHISPER_MODEL`,
lido a cada transcrição: `whisper-large-v3` (padrão, US$ 0,111/h) ou
`whisper-large-v3-turbo` (US$ 0,04/h). Valor fora da lista cai no padrão. A
troca só depois de medir com `pnpm eval:transcription`
([docs/evals/transcricao.md](./evals/transcricao.md)) e registrar a decisão lá.

```bash
# docker/.env.production
WHISPER_MODEL=whisper-large-v3-turbo

docker compose --env-file .env.production -f docker-compose.prod.yml up -d copiloto-api
```

Rollback: apagar a linha (ou `whisper-large-v3`) e subir a API de novo. A
auditoria `AUDIO_TRANSCRIBE` grava o modelo de cada transcrição em
`payload.model`, e o log de debug `AUDIO_TRANSCRIBE ... model=...` também.
Falha do provedor aparece como `Whisper API error <status> model=...`; 429
contínuo é limite do plano na Groq.

### Consentimento de IA (CC-010)

Quem revoga "Processamento por IA" em Configurações → Privacidade recebe 403
com `code: "AI_CONSENT_REVOKED"` na leitura do caso, análise (POST, streaming
e fila), reanálise e ditado, antes de qualquer chamada ao gateway ou ao
Whisper (`AiConsentGuard`). Análise que já estava na fila falha sem retry. A
consulta de diretrizes segue só por palavra-chave. O histórico e os documentos
continuam abertos. No log: `AI_CONSENT_REVOKED physicianId=...` (WARN).

Vale o registro mais recente de `consents` para o escopo; sem nenhum, o
processamento por IA está ativo (padrão desde o cadastro). Não há flag: para
liberar, o próprio médico concede de novo na mesma tela.

```sql
-- Antes do deploy: quem ficará bloqueado (última linha de ai_processing revogada)
SELECT DISTINCT ON (physician_id) physician_id, granted_at, revoked_at
FROM consents WHERE scope = 'ai_processing'
ORDER BY physician_id, granted_at DESC;
-- bloqueados = linhas com revoked_at preenchido
```

### Fila de análise assíncrona (CC-011)

`POST .../copilot/analyze/async` e o áudio gravado (`POST
/encounters/:id/audio`) gravam o caso já redigido numa conversa sem leitura
(`case_intakes`, `path = disabled`) e enfileiram só ids: `{ physicianId,
encounterId, intakeId }`. O worker analisa pela conversa, como o plano sem
streaming da tela. O resultado no Redis também são só ids (`intakeId`,
`interactionId`); o plano sai por `GET .../copilot/conversation` ou
`.../latest`. Retenção da fila: concluído 24 h, falho 7 dias.

Deploy: job enfileirado antes da versão nova ainda leva o caso sem redação. O
worker tira o texto do Redis antes de tudo (`INFERENCE_LEGACY_JOB jobId=...`,
WARN), abre a conversa e segue como um job novo; se a conversa for recusada
(injeção, caso encerrado), o job falha sem o texto. Esse caminho pode sair
depois de 7 dias da versão no ar. Recusa 4xx (consentimento, posse, injeção,
plano já feito) falha sem retry.

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

**5. Desativar uma instituição (nunca apagar)**

Desde a CC-021 o banco recusa apagar instituição que tenha protocolo, trecho
de diretriz ou atendimento (`ON DELETE RESTRICT`, erro `violates foreign key
constraint`). Antes, o `institution_id` desses registros virava `NULL`, e o
material interno passava a aparecer para todos os médicos. Para tirar uma
instituição de uso, desative-a. Não há rota para isso (`POST /v1/institutions`
só cria); na VPS, como owner:

```bash
docker exec -i copiloto-db psql -v ON_ERROR_STOP=1 -U "$POSTGRES_OWNER_USER" -d copiloto_clinico \
  -c "UPDATE institutions SET status = 'inactive', updated_at = now() WHERE id = '<uuid>';"
```

O conteúdo continua institucional, nunca global. Com a CC-019 (filtro por
vínculo ativo), vínculo com instituição `inactive` não conta e os médicos dela
deixam de ver esse conteúdo; antes dela, a aplicação não lê `status`.

Só se apaga instituição sem nada apontando para ela (ex.: criada por engano).
O vínculo com médicos sai junto (`CASCADE`). Para ver o que ainda a prende:

```sql
SELECT 'protocols' AS tabela, count(*) FROM protocols WHERE institution_id = '<uuid>'
UNION ALL SELECT 'guideline_chunks', count(*) FROM guideline_chunks WHERE institution_id = '<uuid>'
UNION ALL SELECT 'encounters', count(*) FROM encounters WHERE institution_id = '<uuid>';
```

Não zere `institution_id` para destravar o `DELETE`: em protocolo e diretriz,
`NULL` publica o conteúdo para todos (ADR-009, adendo CC-021).

A migration `20261015190000_cc_021_institution_delete_restrict` só troca a
regra das três FKs: não depende de código novo e entra pelo passo 2 de
"Aplicar migrations em produção", sem janela.

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
| `20261014180000_ai_calls_fallback_from` | `ai_calls.fallback_from` (perfil que caiu, na chamada feita no modelo de reserva) — CC-107; só adiciona coluna nula |
| `20261014180000_cc_703_knowledge_gaps` | Tabela `knowledge_gaps` (registro de lacunas, CC-703); só cria tabela e tipo, sem tocar nas existentes |
| `20261014200100_audio_capture_retention` | `audio_captures.encrypted_content` anulável + CHECK `deleted` ⇔ sem áudio (retenção de 30 dias). Só metadado de coluna e CHECK: a versão anterior da API roda sobre o schema novo |
| `20261015180000_cc207_chief_complaint_text` | `encounters.chief_complaint` de `VARCHAR(140)` para `TEXT`, para caber o valor cifrado — CC-207/ADR-021; sem reescrever a tabela |

### Rollback de Migration

Prisma não suporta rollback automático. Para reverter:
1. Criar nova migration com o `ALTER TABLE` inverso
2. Aplicar normalmente via `prisma migrate deploy`
3. Nunca deletar migrations já aplicadas em produção

---

## Containers de produção (CC-013)

`docker/docker-compose.prod.yml` sobe `copiloto-db`, `copiloto-redis`,
`copiloto-api` (`docker/Dockerfile.api`) e `copiloto-web`
(`docker/Dockerfile.web`). Não há container de worker:

- **Worker da fila e crons rodam dentro da API.** `InferenceWorkerService`
  (BullMQ, fila `inference`) sobe no `onModuleInit` do `QueueModule`, e os
  crons de `src/workers/` (cadeia de auditoria, saúde do banco, abandono do
  funil) vêm do `ScheduleModule`, no mesmo processo. Concorrência e ritmo:
  `INFERENCE_QUEUE_CONCURRENCY` e `INFERENCE_QUEUE_RATE_PER_SEC`.
- **`docker/worker.Dockerfile` foi removido.** Ele rodava `dist/workers/main.js`,
  que nunca existiu, e copiava de uma imagem `copiloto-api:latest` que nenhum
  compose gera. Separar o worker exige um entrypoint próprio que suba só a
  fila, sem HTTP e sem os crons (senão os crons rodam duas vezes); só vale a
  pena se a análise pela fila competir com a API por CPU.

**Object storage (MinIO/S3): desligado em produção, de propósito.** O
compose não repassa `MINIO_*`, então `StorageService.isAvailable()` é falso:
o PDF do documento confirmado é montado na hora do download
(`DocumentsService`, "PDF sob demanda") e nada fica gravado fora do banco.
Ligar exige subir um MinIO (ou usar S3) com backup e retenção próprios e
resolver o PDF que fica órfão na eliminação da conta (em PR aberto, #142).
Até lá, nenhum ganho justifica guardar mais uma cópia do documento clínico.

**Sentry:** o `SENTRY_DSN` no compose e o evento sem corpo nem cabeçalhos de
credencial vêm do PR #168 (seção "Sentry" em Monitoramento).

---

## Variáveis de Ambiente Críticas

| Variável | Risco se ausente/errada |
|---|---|
| `JWT_ACCESS_SECRET` | Todos os tokens são inválidos ou forjáveis |
| `JWT_REFRESH_SECRET` | Refresh tokens inválidos |
| `TRUSTED_PROXY_HOPS` | Proxies confiáveis à frente da API (padrão 1 = Traefik). Alto demais (2 sem Cloudflare) deixa o cliente escolher o IP do limite de tentativas; baixo demais (1 com Cloudflare) junta médicos no mesmo limite. Ver "Limite de tentativas" |
| `INTERNAL_SERVICE_TOKEN` | Endpoint `/audit/verify-chain` inacessível |
| `AI_API_KEY` | Análise clínica indisponível |
| `DATABASE_URL` | Sistema completamente indisponível ou rodando com privilégios excessivos |
| `MIGRATION_DATABASE_URL` | Migrations indisponíveis ou executadas com usuário incorreto |
| `FIELD_ENCRYPTION_KEY` | API não sobe (segredo do MFA). Trocada sem `FIELD_ENCRYPTION_KEY_PREVIOUS`: MFA, áudio e texto clínico cifrado deixam de abrir (`SealedValueError`). Perdida: o texto clínico cifrado não volta |
| `CLINICAL_TEXT_ENCRYPTION` | `on` grava o texto clínico cifrado (CC-207/ADR-021); `off` (padrão) grava em claro. A leitura abre os dois sempre: desligar é o rollback. Ausente ou irreconhecível = `off`. Ver "Texto clínico cifrado em repouso" |
| `FIELD_ENCRYPTION_KEY_PREVIOUS` | Só durante uma rotação: a chave anterior, para decifrar. Vazia = sem rotação |
| `OFFICIAL_GUIDELINES_ENABLED` | `false` tira PCDT/DDT/DB/PU do retrieval (válvula de escape da ADR-010); ausente = ligada. Os limiares `OFFICIAL_*` estão em `.env.example` |
| `UNREVIEWED_SOURCES_PRELIMINARY` | `false` desliga a contenção da ADR-012: PCDT e chunk curado sem assinatura voltam a embasar conduta definitiva. Ausente ou irreconhecível = ligada |
| `COPILOT_REASONING` | `stages` liga o raciocínio em etapas da ADR-013 (entendimento do caso antes da busca, busca dirigida, card "O que eu entendi"); `legacy` (padrão) volta ao pipeline de sempre. Ausente ou irreconhecível = `legacy`. Etapa 1 com `AI_UNDERSTANDING_MODEL` (vazio = `AI_MODEL`) e `AI_UNDERSTANDING_EFFORT` (padrão `low`). Falha da Etapa 1 aparece como `UNDERSTANDING_FAILED`/`UNDERSTANDING_FALLBACK` no log e a análise segue pela busca de sempre |
| `COPILOT_DECISION_PROMPT` | `v2` liga a decisão em duas camadas da ADR-013 ("Fazer agora" × "Depende de…", perguntas que separam hipóteses, conhecimento geral do modelo rotulado e sem dose); `v1` (padrão) é o prompt de sempre. Exige `COPILOT_REASONING=stages`: sem ele fica `v1` e o log mostra `DECISION_PIPELINE_DOWNGRADE`. Regra da v2 que sobra depois do retry vira `OUTPUT_VALIDATION_WARNING`, nunca bloqueio |
| `COPILOT_WHY_LINE` | CC-601: `on` pede, em cada conduta "Fazer agora", uma linha de "por quê" de até 120 caracteres em linguagem simples, que o médico abre ao tocar em "Por quê"; sem ela (flag desligada, conduta "depende" ou linha descartada), a tela mostra o `rationale` de sempre. `off` (padrão) deixa o prompt e a saída da decisão byte a byte como antes. Ausente ou irreconhecível = `off`. Exige `COPILOT_DECISION_PROMPT=v3` ou `v4`: com outro prompt fica desligada e o log mostra `DECISION_PIPELINE_DOWNGRADE`. Nunca pede retry sozinha: linha acima do teto sai da resposta e aparece como `OUTPUT_VALIDATION_WARNING: WHY LINE TOO LONG`, conduta "agora" sem linha como `WHY LINE MISSING` (só índices, sem texto clínico). A interação grava `params.whyLine: true`. Liberar só depois do gabarito com e sem a linha (variantes `claude-opus-5-5-v3-modelo` e `claude-opus-5-5-v3-por-que`): sem aumento de erro crítico nem de latência acima de 10% |
| `COPILOT_INTAKE` | `on` liga o Copiloto guiado da ADR-014: antes do plano, a leitura do caso decide se pergunta (no máximo 3 perguntas, uma por vez). `off` (padrão) vai direto ao plano. Ausente ou irreconhecível = `off`. Modelo da leitura em `AI_INTAKE_MODEL` (vazio = o da Etapa 1). No log: `INTAKE_READING` (tempo e perguntas), `INTAKE_STARTED` (caminho: `ask`, `unstable`, `complete`, `reading_failed`, `disabled`), `INTAKE_CLOSED` (motivo) e `INTAKE_READING_TIMEOUT` (leitura passou de 20 s e o caso seguiu direto ao plano). Exige a migration `20261012120000_adr_014_case_intakes` |
| `AI_FALLBACK_MODEL` | CC-107: modelo de reserva quando o provedor de uma etapa fica fora do ar (prazo, rede, 5xx, 429, limite de uso); uma nova tentativa nele. Vazio = sem reserva. Por etapa: `AI_<ETAPA>_FALLBACK_MODEL` (`none` desliga). Ver "Reserva de provedor (CC-107)". No log: `AI_FALLBACK`, `AI_FALLBACK_SKIPPED`, `AI_FALLBACK_FAILED` |
| `WHISPER_MODEL` | CC-205: modelo da transcrição do ditado, `whisper-large-v3` (padrão) ou `whisper-large-v3-turbo`. Ausente ou irreconhecível = `whisper-large-v3`. Ver "Modelo da transcrição" e docs/evals/transcricao.md |
| `DEID_CONTEXT_RULES` | CC-201/CC-202/CC-206: `on` (padrão) faz a máscara de PII tirar também o número de prontuário pelo rótulo ("prontuário", "RH", "registro", "matrícula", "BE", "nº de atendimento" → `[REDACTED_RECORD]`) e o nome depois de tratamento ou apelido ("Seu Zé", "Dona Cida", "Sr. João", "Tião" → `[NOME]`), sem tocar a lista de epônimos protegidos (`src/modules/copilot/guardrails/protected-clinical-terms.list.ts`, revisão médica pendente). `off` volta à regex anterior, sem redeploy, se aparecer máscara indevida em texto clínico. Ausente ou irreconhecível = `on`. Vale para o caso, as respostas do afunilamento, áudio, anexos, busca de diretrizes e notas livres. No log (debug): `PII detection ... {"record":1,"name":2}`, só a contagem por tipo |
| `AI_DECISION_MODEL` / `AI_DECISION_CRITICAL_MODEL` | ADR-016: modelo da decisão no caso comum e no caso grave (instável ou tempo-crítico pela Etapa 1, ou sem entendimento). Vazios = `AI_MODEL` nas duas rotas. Crítico vazio = o comum nas duas. Aceitam `perfil:modelo`. No log: `DECISION_MODEL route=critical\|standard model=...`; a interação grava `params.decisionRoute` |
| `COPILOT_KNOWLEDGE_SOURCE` | `internal_kb` (padrão) é a busca de sempre (embedding na OpenAI); `model_only` não busca nada; `web` pesquisa em fontes oficiais (`AI_RESEARCH_MODEL`, padrão `claude-sonnet-5-5`; `AI_RESEARCH_EFFORT`, padrão `low`; `WEB_RESEARCH_MAX_SEARCHES`, padrão 5; `WEB_RESEARCH_ALLOWED_DOMAINS`, vazio = 32 fontes padrão). `model_only` e `web` nunca chamam o provedor de embedding. `web` exige `stages` e `COPILOT_DECISION_PROMPT=v2` (sem eles vira `model_only`, com `DECISION_PIPELINE_DOWNGRADE` no log) e Anthropic como `AI_PROVIDER`; pesquisa que falha aparece como `WEB_RESEARCH_FALLBACK` e a análise segue só com o conhecimento do modelo |
| `AI_DAILY_COST_ALERT_USD` / `AI_P95_ALERT_MS` | CC-005: teto do custo do dia (UTC, em USD) e meta do p95 da decisão na última hora (ms). Vazios ou inválidos = alerta desligado (inválido avisa `AI_CALL_ALERT_THRESHOLD_INVALID` no log). Ver "Alertas de custo e latência da IA" |
| `COPILOT_SITE_CONTEXT` | CC-602/CC-603: `on` leva à decisão o local de plantão declarado no caso (porte, o que o serviço tem e **não** tem, especialistas, tempo até a referência) e a regra de transferência (destino, prioridade e conduta até a transferência; nada que exija recurso ausente no próprio serviço). Vale nos prompts v1 e v2/v3/v4. `off` (padrão), ou caso sem local declarado, mantém o prompt byte a byte igual. Ausente ou irreconhecível = `off`. No log: `SITE_CONTEXT facilityType=… missing=hasCT,hasICU specialists=n referenceMinutes=…` (sem texto do caso); a interação grava `params.siteContext: true`. Os locais do médico (Configurações → Locais de plantão) exigem a migration `20261014120000_cc_602_practice_sites`; o caso guarda uma cópia do local em `encounters.context.site` |

---

## Monitoramento

### Sentry

O Sentry só liga com `SENTRY_DSN` no `.env.production` (o compose repassa a
variável). Antes de ligar, confirme região e retenção do projeto no Sentry
(`docs/compliance/DPA_PROVIDER.md`). O evento vai sem corpo, query, cookies e
cabeçalhos de credencial (`scrubSentryEvent`): o corpo da requisição é o caso
clínico. Os logs de acesso com erro registram só os nomes dos campos do corpo
(`bodyFields=`).

### Rastro das chamadas de IA (`ai_calls`)

Cada chamada ao modelo grava uma linha em `ai_calls` e uma linha `AI_CALL` no
log: etapa (`intake_reading`, `understanding`, `decision`, `research`,
`verify_attach`, `guideline_classification`), perfil, provedor, modelo pedido
e servido, esforço, hash do system prompt (a versão do prompt), tokens, custo,
latência e desfecho (`ok`, `refusal`, `truncated`, `error`, `aborted`), e
`fallback_from` (o perfil que caiu) quando a chamada foi no modelo de reserva
(CC-107). Nenhum texto do caso, do prompt ou da resposta. A resposta HTTP devolve
`x-request-id`; o mesmo id está em `ai_calls.request_id` e em
`ai_interactions.request_id`. Falha ao gravar vira `AI_CALL_LOG_FAILED` (WARN)
e nunca para a análise. Quando o provedor recusa por cota esgotada (limite de
uso do workspace da Anthropic, falta de crédito, `insufficient_quota` da
OpenAI), `error_type` termina em `:usage_limit` (ex.:
`BadRequestError:400:usage_limit`); a mensagem do provedor não é gravada.

**Painel (CC-004).** `/admin/analytics`, aba "Etapas e modelos" (ADMIN e
COMPLIANCE; o médico comum recebe 403 da API). Em 24 h, 7 ou 30 dias: por
etapa e modelo pedido, chamadas, custo total e médio, p50 e p95 de latência
(`percentile_cont`, como abaixo) e falhas por desfecho; custo por análise
completa (requisição com chamada `decision`, somando todas as chamadas dela);
as 10 requisições mais caras; e a busca pelo `x-request-id`, que lista as
chamadas da requisição. A API é `GET /v1/analytics/ai-calls?period=24h|7d|30d`
e `GET /v1/analytics/ai-calls/requests/<x-request-id>`. Só metadados: nenhum
texto do caso e nenhum id de médico, paciente ou atendimento.

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

-- CC-107: quantas etapas a reserva salvou, por etapa e perfil que caiu
SELECT stage, fallback_from, count(*) AS fallbacks,
       count(*) FILTER (WHERE outcome = 'ok') AS saved
FROM ai_calls WHERE fallback_from IS NOT NULL AND created_at > now() - interval '7 days'
GROUP BY 1, 2 ORDER BY fallbacks DESC;
```

### Alertas de custo e latência da IA (CC-005)

O cron `ai-call-alerts` roda a cada 5 min na API e lê `ai_calls`. Cada alerta
sai como linha ERROR no log e, com `SENTRY_DSN` no container, como mensagem no
Sentry (tag `component=ai-gateway`). Só números, etapa e provedor: nada do
caso nem a mensagem do provedor. O "já avisei" fica no Redis
(`ai-call-alert:*`), então um restart não repete o alerta.

| Alerta | Liga com | Dispara quando | Repete |
|---|---|---|---|
| `AI_DAILY_COST_ALERT` (Sentry `warning`) | `AI_DAILY_COST_ALERT_USD` | Custo estimado somado desde 00:00 UTC (21:00 de Brasília) passa do teto | 1× por dia UTC |
| `AI_DECISION_P95_ALERT` (Sentry `warning`) | `AI_P95_ALERT_MS` | p95 da etapa `decision` na última hora passa da meta, com ao menos 3 decisões na hora | No máximo 1× por hora |
| `AI_PROVIDER_USAGE_LIMIT` (Sentry `error`) | Sempre ligado | Alguma chamada nos últimos 10 min voltou com `:usage_limit` | 1× por hora e provedor, enquanto durar |

Para ligar, defina as variáveis em `docker/.env.production` (o compose já as
repassa) e recrie a API:

```bash
# docker/.env.production
AI_DAILY_COST_ALERT_USD=20
AI_P95_ALERT_MS=60000
```

O custo é estimativa pelos tokens e pela tabela de preços do código; concilie
com a fatura do provedor. O limite que derruba a produção é o do workspace na
Anthropic: o alerta de custo avisa antes, o de cota avisa quando já bateu.
Sem `SENTRY_DSN` (CC-003), os alertas ficam só no log.

### Eventos de produto no Umami (CC-704)

O web manda eventos ao Umami autoalojado (sem cookie) pelo módulo único
`web/src/lib/analytics.ts`. A lista é fechada e nenhuma propriedade aceita
texto livre: só valor de lista, número inteiro, sim/não ou id de ferramenta
(kebab-case curto, nunca UUID). Evento fora da lista não sai. Sem o script do
Umami (local, CI, e2e) nada é enviado.

| Evento | Propriedades | Quando |
|---|---|---|
| `analise_iniciada` | `rodada`: `inicial` \| `reanalise` | Caso enviado; reanálise pedida depois do plano |
| `analise_concluida` | `rodada`, `duracao_s` (montagem do plano) | Plano entregue nesta tela |
| `pergunta_respondida` | `fase`: `antes_do_plano` \| `depois_do_plano`; `canal` (antes do plano): `tap` \| `text` \| `voice` | Cada resposta a uma pergunta do Copiloto (a correção do entendimento não conta) |
| `feedback_enviado` | `tipo`: `wrong_scenario` \| `missing_coverage` \| `wrong_recommendation` \| `helpful` | Reporte sob a análise |
| `nao_encontrei` | `com_nota`: sim/não | "Não encontrei o que precisava" (CC-703) |
| `ferramenta_aberta` | `ferramenta` (id), `origem`: `hub` \| `busca` \| `plano` \| `link` | Pronto para a área Ferramentas |
| `calculo_feito` | `ferramenta` (id) | Pronto para as calculadoras |
| `cartao_aberto` | `cartao` (id), `origem`: `plano` \| `pergunta_rapida` \| `busca` | Pronto para os cartões; o id precisa ser um slug, o UUID do cartão é recusado |
| `pergunta_rapida` | `fonte`: `cartao` \| `modelo`, `duracao_s` | Pronto para a pergunta rápida |

A URL que o Umami anexa ao evento vai como rota, sem id e sem query
(`/encounters/:id/conversation`). O pageview automático do script continua com
a URL completa da página. Evento novo: acrescente em `PRODUCT_EVENTS` (o teste
`web/src/lib/__tests__/analytics.test.ts` confere que nenhuma propriedade
aceita texto livre) e nesta tabela.

### Logs de nível ERROR que exigem atenção imediata

| Log | Causa | Ação |
|---|---|---|
| `AUDIT CHAIN INTEGRITY FAILURE` (também alerta no Sentry) | Cadeia rompida: conteúdo, elo ou versão de hash que não confere (ADR-015). "Legado não verificável" **não** dispara isto. | Ler a mensagem na tabela "Mensagens de falha" (em "Verificar integridade da trilha de auditoria"). Se for adulteração: isolar o sistema, investigar os registros suspeitos e acionar o DPO |
| `Audit chain verification failed with exception` | Erro ao verificar cadeia | Verificar conectividade com banco |
| `AUDIO RETENTION PURGE INCOMPLETE` | Captura com `retain_until` vencido ainda guarda áudio | O log anterior (`Audio retention purge failed for capture <id>`) traz a causa; o job retenta na hora seguinte. Se persistir, acionar DPO: o prazo de 30 dias da LGPD.md está sendo descumprido |
| `Audio retention purge failed with exception` | Erro ao listar capturas vencidas | Verificar conectividade com banco |
| `Output validation failed` | IA retornou resposta inválida | Verificar provider, possível mudança de modelo |
| `Anthropic API error: status=...` | Falha na API da Anthropic | 4xx: ver "Trocar o provider ou o modelo de IA"; 429/5xx: o SDK já retentou 2x, checar status.anthropic.com |
| `AI_FALLBACK_FAILED` | Provedor da etapa e modelo de reserva fora ao mesmo tempo (CC-107) | Ver "Reserva de provedor (CC-107)" |
| `Injection detected` | Possível tentativa de prompt injection | Revisar logs de acesso, bloquear IP se necessário |
| `SealedValueError` / `ClinicalTextQueryError` | Texto clínico cifrado que não abre (chave) ou consulta pelo conteúdo de um campo cifrado (bug) — CC-207 | Tabela "Erros" em "Texto clínico cifrado em repouso" |
| `AI_PROVIDER_USAGE_LIMIT provider=...` (também no Sentry) | O provedor recusa chamadas por cota esgotada: as análises falham | Conferir o limite e o saldo no console do provedor (na Anthropic, o limite do workspace) e subir o limite, ou trocar de provedor ("Trocar o provider ou o modelo de IA"). Parar avaliações que usem a mesma chave |
| `AI_DAILY_COST_ALERT day=...` (também no Sentry) | Custo estimado do dia passou de `AI_DAILY_COST_ALERT_USD` | Abrir `/admin/analytics` → "Etapas e modelos" (24 h) e ver a etapa, o modelo e as requisições mais caras. Avaliação rodando com a chave de produção é o suspeito de sempre |
| `AI_DECISION_P95_ALERT p95Ms=...` (também no Sentry) | A decisão está mais lenta que `AI_P95_ALERT_MS` na última hora | Ver p95 por modelo no painel (24 h) e o status do provedor; se persistir, trocar `AI_DECISION_MODEL` ou baixar o esforço |
| `AI_CALL_ALERT_CHECK_FAILED check=...` | A verificação dos alertas falhou (banco fora, por exemplo) | Verificar conectividade com o banco; os outros alertas seguem |

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
