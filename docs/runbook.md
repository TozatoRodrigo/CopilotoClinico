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
> Diagnóstico completo em `docs/planos/plano-base-contexto.md`.

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
- Os três contadores **reservam a tentativa antes** de conferir o segredo,
  num `UPDATE` condicional: tentativas em paralelo não passam de 5. O login
  passou a fazer isso no CC-026; antes lia o contador e gravava depois, e 50
  logins simultâneos conferiam 50 senhas.
- **Código de backup do MFA** (CC-026): gasto num `UPDATE … WHERE used_at IS
  NULL`. Dois pedidos simultâneos com o mesmo código: só um entra.

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
- **O IP gravado na trilha de auditoria** (`audit_log.ip`, CC-026) sai da
  mesma regra. Antes do CC-026 os registros com IP (cadastro, login,
  login com Google/Microsoft, refresh, logout, MFA, pedido de verificação de
  CRM, lista de espera e aceite dos termos do beta) gravavam o IP do
  Traefik; os antigos continuam assim. O log de acesso HTTP (`HttpAccess`)
  não grava IP.

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
| `AUTH_ACCOUNT_LOCKED scope=login\|mfa\|password_change subject=<hash> durationMs=…` | Começo de um bloqueio por conta |

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
  (`scripts/demo.sh`) usa o `docker/demo.Dockerfile`, que até 16/10/2026
  ficava na raiz como `Dockerfile`.
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

### Mentoria em modo concierge (CC-707)

"Discutir com um médico da equipe": o médico pede no próprio caso, aceita o
termo (CC-708) e o caso vai **mascarado** (máscara de PII do projeto +
patientRef), com o plano da IA, para os médicos marcados como mentores. A
resposta aparece no caso e o médico vê um aviso no Plantão. Assíncrona, não
serve para urgência. Atrás de `COPILOT_MENTORING` (padrão `off`: nada aparece e
as rotas respondem 404). Exige a migration
`20261014120000_cc_707_mentoring_requests`.

**Termo provisório.** O texto em `src/modules/mentoring/mentoring-terms.ts` foi
escrito para o piloto e aparece marcado como provisório até o parecer jurídico
(CC-708). Ao receber o texto final: troque os parágrafos, crie uma **versão
nova** (cada pedido grava a versão aceita, pelo médico e pelo mentor) e mude
`provisional` para `false`. O servidor recusa aceite de versão diferente da
vigente.

**Marcar os mentores** (como `is_curator`, sem tela):

```bash
docker compose -f docker-compose.prod.yml exec copiloto-db \
  psql -U "$POSTGRES_OWNER_USER" -d copiloto_clinico -c \
  "UPDATE physicians SET is_mentor = true WHERE email IN ('mentor@exemplo.com');"
```

O mentor vê "Mentoria" no menu do Plantão. Ele só enxerga pedidos de casos sem
instituição ou de uma instituição a que está vinculado (ADR-009): para atender
um hospital cliente, vincule o mentor à instituição (seção "Multi-tenancy
institucional"). Pedido já respondido só fica visível para quem pediu e para o
mentor que respondeu. Pedido sem mentor elegível fica no painel e gera
`MENTORING_NO_ELIGIBLE_MENTOR` (WARN) no log.

**Aviso por e-mail ainda não existe.** O projeto não tem provedor de e-mail;
o aviso é uma linha `MENTORING_NOTIFY event=new_request|answer` no log, só com
ids e contagem. No concierge, a equipe acompanha a fila em `/mentoria` e o
painel em `/admin/mentoria`. Para ligar e-mail, implemente `MentoringNotifier`
(`src/modules/mentoring/mentoring.notifier.ts`) e troque o provider no módulo;
o aviso leva só o link, nunca o texto do caso. Falha do aviso vira
`MENTORING_NOTIFY_FAILED` (WARN + Sentry) e não desfaz o pedido.

**Trilha de auditoria.** Cada transição grava uma entrada na entidade
`MentoringRequest`: `MENTORING_REQUESTED`, `MENTORING_CLAIMED`,
`MENTORING_RELEASED`, `MENTORING_ANSWERED`, `MENTORING_CANCELLED` e
`MENTORING_RATED`, com status de/para, versões do termo, nota e hashes do caso,
da dúvida e da resposta. Nenhum texto clínico.

```sql
-- Pedidos por médico ativo e tempo de resposta (métrica de sucesso da CC-707)
SELECT count(*) AS pedidos,
       count(DISTINCT requester_id) AS medicos_que_pediram,
       percentile_cont(0.5) WITHIN GROUP (ORDER BY answered_at - created_at) AS mediana_resposta,
       round(avg(satisfaction), 1) AS satisfacao_media
FROM mentoring_requests WHERE created_at > now() - interval '30 days';
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

### Beta por convite (CC-702)

**Abrir e fechar o beta.** `BETA_INVITE_REQUIRED=on` no `.env.production` e
`docker compose ... up -d copiloto-api` (a flag é lida a cada cadastro). Com
ela ligada, quem chega a `/register` sem código vê a lista de espera; com
`off`, o cadastro fica aberto e um código digitado ainda é conferido (a conta
entra no lote do convite e passa pelo onboarding do beta).

**Convites.** Console → Beta → Convites: lote/origem ("rede Ripardo", "base
ANY"), quantidade (até 50), usos por código (1 = uso único) e validade (até
180 dias). O sistema **não envia e-mail** (CC-015 pendente): copie o link
(`/register?convite=XXXX-XXXX`) e mande pelo seu canal. Revogar é definitivo e
não tira quem já entrou. O código é aleatório, sem dado pessoal; o banco
recusa uso além do limite (`CHECK uses_count <= max_uses`).

**Lista de espera.** Console → Beta → Lista de espera. "Aprovar" gera um
convite de uso único (lote padrão "lista de espera", 14 dias) para copiar e
mandar. "Apagar" atende o pedido da pessoa (LGPD): a entrada some e a trilha
guarda só `BETA_WAITLIST_DELETED` com o id. A eliminação de conta
(`POST /lgpd/erasure`) também apaga a entrada com o mesmo e-mail, e a
exportação a inclui.

**Onboarding.** Quem entra por convite passa por `/onboarding/beta`: termo do
beta (versão em `src/shared/contracts/beta.ts`, `BETA_TERMS`; **texto
provisório**, parecer jurídico pendente), perfil do plantão e o caso de
exemplo do copiloto guiado. Trocar o texto do termo exige trocar `version`:
quem aceitou a anterior volta ao onboarding para aceitar a nova.

**Ativação** (meta ≥ 70% com 1ª análise em 24 h): Console → Beta → Ativação, ou
`GET /v1/admin/beta/activation?days=30` (Admin ou Compliance) para o painel da
CC-705. `activated24h` conta qualquer análise (inclusive o caso de exemplo);
`activatedRealCase24h` só casos reais.

No log: `BETA_INVITE_REFUSED reason=missing|not_found|revoked|expired|exhausted`
(com `stage=claim` quando outro cadastro levou o último uso),
`BETA_INVITE_REDEEMED inviteId=...`, `BETA_INVITES_CREATED`, `BETA_WAITLIST_JOINED`,
`BETA_TERMS_ACCEPTED version=...`. Nenhuma linha leva e-mail ou código.

```sql
-- Usos por lote
SELECT batch_label, count(*) AS codigos, sum(uses_count) AS usos
FROM beta_invites GROUP BY batch_label ORDER BY usos DESC;
```

### Painel semanal do beta e reunião de sexta (CC-705, CC-706)

Console → Beta → **Semana** (a aba abre por padrão; Admin e Compliance), ou
`GET /v1/admin/beta/weekly?week=AAAA-MM-DD` (qualquer dia vale pela semana que
o contém; sem `week`, a semana corrente; semana futura dá 400). A semana vai de
segunda 00:00 a domingo 23:59 **no horário de Brasília** (fuso
`America/Sao_Paulo`, não -03:00 fixo). Na semana em andamento, os números vão
até agora e a semana anterior é cortada no mesmo dia e hora: sexta 13h contra
sexta 13h, não meia semana contra uma inteira.

| Número | Definição | Fonte |
|---|---|---|
| Médicos ativos | Papel `PHYSICIAN` com análise concluída ou pergunta do Copiloto respondida em caso real | `ai_interactions` (sem as falhas de validação), `case_intakes.answers[].answeredAt` e `ai_interactions.answered_questions` |
| Análises por médico | Análises concluídas de caso real ÷ médicos ativos (média, mediana e faixas) | `ai_interactions` |
| Feedback negativo / 100 análises | "Cenário errado", "faltou cobertura" e "conduta incorreta" de médicos em caso real | `copilot_feedback` |
| Custo e latência por análise | Requisição com etapa `decision`; latência = soma das chamadas; p50/p95 entre análises | `ai_calls` (serviço da CC-004) |
| Lacunas | "Não encontrei o que precisava", por síndrome de PS (top 5) | `knowledge_gaps` (CC-703) |
| Ativação em 24 h | Coorte cadastrada na semana, por lote (mesma regra da CC-702) | `physicians`, `beta_invites` |

Caso de exemplo do onboarding e contas de admin ficam fora de uso e feedback
(o caso de exemplo aparece à parte). Custo e latência incluem tudo o que passou
pela decisão, como o painel de `ai_calls`. Médico só aparece agregado: a API
não devolve id, nome nem ranking, e nada do caso (nota e consultas da lacuna
ficam no banco).

**O que o painel ainda não tem ("sem dado").** Cada um tem a constante de
extensão em `src/modules/beta/beta-weekly.service.ts`; a tela e a ata já
mostram o número quando o serviço passar a devolvê-lo:

- **% de análises com cartão aplicado**: a análise não registra cartão
  aplicado até a CC-408 (cartões na decisão, sobre `knowledge_cards` da
  CC-402). Ao entregar, gravar na análise quais cartões foram aplicados e
  contar aqui.
- **Uso de ferramentas**: a área Ferramentas (CC-304) não existe. Os eventos
  `ferramenta_aberta` e `calculo_feito` da CC-704 vão para o Umami, não para
  o banco; para entrar no painel (e na definição de médico ativo), o uso
  precisa ser gravado no servidor ou lido da API do Umami.
- **Pedidos de mentoria**: entram com a CC-707.

Também ficam só no Umami: cartão aberto, pergunta rápida e a duração da
montagem do plano. Para esses, abrir o Umami.

**Ritual de sexta 13h (CC-706).** 15 min de números (esta aba), 30 min de
decisões, 15 min de próximos passos. "Copiar resumo para a ata" copia o
markdown da semana com as três seções (decisões e próximos passos em branco
para preencher na reunião); colar na ata do **Meeting Tracker** do ClickUp.
O mesmo texto vem em `markdown` na resposta da API.

No log: `BETA_WEEKLY_REPORT week=... inProgress=... activePhysicians=...
analyses=... durationMs=...` (só contagens).

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

### Termos de uso e política de privacidade (CC-905)

Termos de Uso e Política de Privacidade versionados, com aceite por médico.
O texto vive no código (`src/modules/legal/legal-document-catalog.ts`); uma
versão vale quando um ADMIN a publica em **Console → Termos**
(`/admin/termos`). A vigente de cada tipo é a publicada por último.

Com `LEGAL_TERMS_V2=on`, quem não aceitou a vigente dos dois documentos vê a
tela de aceite (`/aceite-termos`) ao entrar e a API responde **428**
`TERMS_ACCEPTANCE_REQUIRED` em toda rota autenticada, exceto `/legal/*`,
`/admin/legal/*`, `POST /auth/logout` e `/lgpd/*` (exportação, eliminação e
consentimentos). Desligada (padrão), nada muda, e publicar só deixa a versão
pronta. Sem versão publicada, nada é exigido mesmo com a flag ligada.

**Ligar (primeira vez):**

1. Migration `20261015180000_cc_905_legal_documents` aplicada.
2. Console → Termos: publicar os Termos de Uso e a Política de Privacidade.
3. `LEGAL_TERMS_V2=on` no `docker/.env.production` e reiniciar só a API.
4. Acompanhar o % de aceite no console.

**Versão nova (ex.: texto final do advogado, CC-006):** acrescentar ao
catálogo uma versão nova com `provisional: false` (nunca editar uma versão já
publicada: o publish recusa texto diferente com a mesma versão e o teste de
hash do catálogo falha), fazer o deploy e publicar pelo console. Todas as
contas voltam à tela de aceite no próximo acesso, vendo o resumo do que
mudou. Outras instâncias da API passam a exigir a versão nova em até 30 s.

**No log:** `LEGAL_DOCUMENT_PUBLISHED` (tipo, versão, hash, quem publicou),
`LEGAL_DOCUMENTS_ACCEPTED` (médico e versões) e `LEGAL_TERMS_REQUIRED`
(médico e handler bloqueado, sem URL). `LEGAL_AUDIT_FAILED` (ERROR) indica
que o aceite ou a publicação foi gravado, mas a entrada da trilha falhou. Na
trilha: `LEGAL_DOCUMENT_PUBLISHED` e `LEGAL_DOCUMENT_ACCEPTED`, entidade
`LegalDocument`.

```sql
-- Aceites por versão (a eliminação LGPD apaga os aceites da conta)
SELECT d.type, d.version, d.provisional, d.published_at, count(a.id) AS accepted
FROM legal_documents d
LEFT JOIN legal_acceptances a ON a.document_id = d.id
GROUP BY d.id ORDER BY d.type, d.published_at DESC;
```

**Rollback:** `LEGAL_TERMS_V2=off` libera todo mundo na hora, sem redeploy.
Versão publicada não se apaga (a API não tem `DELETE` em `legal_documents`):
para corrigir um texto, publique uma versão nova.

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

A mesma flag autoriza escrever protocolo (CC-020): criar
(`POST /v1/protocols`), publicar (`POST /v1/protocols/:id/publish`) e criar
versão nova (`POST /v1/protocols/:id/revise`) são de curador ou ADMIN; os
demais médicos recebem `403` e só leem e rodam. Vale na hora, sem novo login
(a flag é lida do banco a cada pedido). Recusas aparecem no log como
`PROTOCOL_WRITE_DENIED action=<create|publish|revise>`. Protocolo institucional
exige, além do papel, vínculo ativo com a instituição (ADR-009, adendo CC-020).

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
| `GET /v1/admin/knowledge-cards?displayStatus=&syndrome=&institutionId=` | Fila, com contagem por status de tela |
| `GET /v1/admin/knowledge-cards/:id` | Cartão e todas as versões, com fontes, autor (IA: modelo, hash do prompt, origem) e revisão |
| `POST /v1/admin/knowledge-cards/:id/versions` | "Corrigir": versão nova do médico (`{ basedOnVersion, content }`); mesma checagem de citação, 422 com os problemas |
| `POST /v1/admin/knowledge-cards/:id/submit` | Rascunho → em revisão |
| `POST /v1/admin/knowledge-cards/:id/approve` | **Exige CRM verificado (403 sem ele).** Grava revisor, data, validade (`validityMonths`, padrão 12), comentário e `reviewDurationMs`; a versão vira a publicada |
| `POST /v1/admin/knowledge-cards/:id/reject` | "Descartar" com `reason`: arquiva; numa correção de cartão publicado, só a correção cai |
| `POST /v1/admin/knowledge-cards/:id/archive` | Tira de uso (final) |
| `GET /v1/admin/knowledge-cards/drafts` | Registro dos pedidos de rascunho, com as rejeições |

Corrigir um cartão publicado não o tira do ar: a versão assinada segue
valendo até a nova ser aprovada. Publicado com a validade vencida aparece como
`needs_review` ("revisar"). Cada transição grava `CARD_DRAFTED`,
`CARD_VERSION_CREATED`, `CARD_SUBMITTED`, `CARD_APPROVED`, `CARD_REJECTED` ou
`CARD_ARCHIVED` na trilha, com versão e `contentSha256` — comentário e motivo
só como hash. No banco, um trigger impede mudar o conteúdo de uma versão ou
regravar a decisão do revisor, e a role da API não apaga cartão nem versão.

**Anti-circularidade (CC-412)** — nenhum caso do gabarito pode ter a mesma
origem de rascunho de um cartão (mesmo `draftId` ou mesmo
`sourceContentSha256`). O runner do gabarito confere antes de medir; à mão:

```bash
pnpm cards:check-circularity   # só leitura; código 1 se houver caso circular
```

**Revisão no celular (CC-404)** — os médicos revisores usam `/revisao` no web:
um cartão por vez, com o texto integral das fontes e o trecho citado marcado,
e três decisões (Aprovar com validade, Corrigir, Descartar com motivo). A tela
cronometra cada cartão (só o tempo com a tela visível) e manda
`reviewDurationMs` junto com a decisão.

O acesso **não** é o do console: o revisor costuma ter papel `PHYSICIAN`, e a
fila exige a flag `is_card_reviewer` **e** CRM verificado. A flag não dá
acesso a `admin/knowledge-cards` (rascunho por IA, arquivar, lista completa).

```sql
-- Conceder (o médico sai e entra de novo para ver "Revisão de cartões" no menu)
UPDATE physicians SET is_card_reviewer = true WHERE email = 'revisor@exemplo.com';
-- Conferir quem pode revisar (sem CRM verificado a fila responde 403)
SELECT email, role, crm_verified, is_card_reviewer FROM physicians WHERE is_card_reviewer;
```

| Endpoint (papel de revisor) | O que faz |
|---|---|
| `GET /v1/review/knowledge-cards/next?skip=<id>,<id>` | Próximo cartão `in_review` (o que espera há mais tempo), só globais e das instituições com que o revisor tem vínculo ativo (CC-019), com o texto das fontes e os trechos citados; `skip` = pulados na sessão |
| `POST /v1/review/knowledge-cards/:id/versions` | Corrigir (mesma checagem de citação; 422 com os problemas por campo) |
| `POST /v1/review/knowledge-cards/:id/approve` | Aprovar; `reviewDurationMs` obrigatório |
| `POST /v1/review/knowledge-cards/:id/reject` | Descartar com `reason`; `reviewDurationMs` obrigatório |

Cartão fora do escopo do revisor responde 404; cartão que outro revisor já
decidiu, 409 (a tela avisa e passa ao próximo). No log, cada decisão sai como
`KNOWLEDGE_CARD_REVIEW decision=approved|rejected|corrected card=<id>
version=<n> durationMs=<ms>`, sem texto do cartão.

**Revisão cruzada (CC-411)** — 10% das aprovações são lidas de novo por um
segundo médico (nem quem aprovou, nem quem escreveu a versão; o banco recusa
por CHECK). O sorteio é pelo SHA-256 de `cc-411:<id da versão aprovada>`
(4 primeiros bytes, módulo 100; entra quem fica abaixo de 10) e acontece na
transação da aprovação, que já cria a linha `pending` em
`knowledge_card_cross_reviews` (log `KNOWLEDGE_CARD_CROSS_REVIEW_SAMPLED`,
`crossReviewSampled` no `CARD_APPROVED`). Na fila do celular a revisão
cruzada vem antes dos cartões em revisão: é cartão no ar.

- **Concordar** mantém o cartão no ar (`CARD_CROSS_REVIEW_AGREED`).
- **Divergir é corrigir**: motivo obrigatório e a correção (mesma checagem de
  citação). A correção vira versão nova, o cartão **sai do ar**
  (`published_version_id` nulo, status `in_review`) e volta para a fila com o
  contexto da divergência, até outro médico aprovar ou descartar
  (`CARD_CROSS_REVIEW_DIVERGED`, motivo só como hash).
- Revisão cruzada de versão que saiu do ar antes (outra aprovação,
  arquivamento) fica `pending` e não aparece mais na fila; o painel a conta
  como "saíram do ar antes da revisão".

| Endpoint (papel de revisor) | O que faz |
|---|---|
| `POST /v1/review/knowledge-cards/cross-reviews/:id/agree` | `{ reviewDurationMs, comment? }` |
| `POST /v1/review/knowledge-cards/cross-reviews/:id/diverge` | `{ reason, reviewDurationMs, basedOnVersion, content }`; 422 com os problemas da correção |
| `GET /v1/review/knowledge-cards/cross-reviews/summary` | Painel (`/revisao/concordancia` no web): concordância, divergência contra a meta de 5%, pendentes, tempo mediano de revisão e as divergências recentes |

```sql
-- Conferir o sorteio de uma aprovação (mesmo balde do código)
SELECT id, ('x' || lpad(left(encode(sha256(convert_to('cc-411:' || id::text, 'UTF8')), 'hex'), 8), 16, '0'))::bit(64)::bigint % 100 AS bucket
FROM knowledge_card_versions WHERE review_decision = 'approved';
-- Taxa de divergência (métrica do CC-411: abaixo de 5%)
SELECT status, count(*) FROM knowledge_card_cross_reviews GROUP BY 1;
```

```sql
-- Tempo de revisão por decisão (meta do CC-404: até 6 minutos por cartão)
SELECT review_decision, count(*) AS decisoes,
       round(percentile_cont(0.5) WITHIN GROUP (ORDER BY review_duration_ms) / 1000) AS mediana_s,
       round(percentile_cont(0.9) WITHIN GROUP (ORDER BY review_duration_ms) / 1000) AS p90_s
FROM knowledge_card_versions WHERE review_duration_ms IS NOT NULL GROUP BY 1;
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
   texto do caso), na instituição do atendimento se o médico tem vínculo
   ativo com ela (CC-019; senão, só nos globais) — **é uma chamada de
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

### De-identificação com o modelo local (CC-203, ADR-020)

`DEID_MODE=model` soma à regex o serviço `copiloto-deid` (OpenMed PII 44M em
ONNX, CPU): nome solto, parente e endereço saem do caso, das respostas, do
anexo, da transcrição e da consulta de diretrizes antes da IA e do banco. O
padrão é `regex`. Serviço fora do ar ou lento: o texto segue só com a regex e a
API loga `DEID_FALLBACK stage=<etapa> reason=<timeout|unavailable|bad_status|bad_response>`
(nunca o texto). A análise não falha por causa dele.

**1. Construir a imagem fora da VPS.** O estágio que exporta o modelo passa de
3 GB de RAM: na VPS compartilhada isso derruba os outros apps. Na máquina de
desenvolvimento (Docker com ≥ 4 GB e ~3 GB de disco livres):

```bash
TAG=$(date +%Y%m%d)
docker buildx build --platform linux/amd64 -f docker/Dockerfile.deid \
  -t copiloto-deid:$TAG --load .
docker save copiloto-deid:$TAG | gzip | ssh rodrigo@76.13.173.181 'gunzip | docker load'
docker builder prune -f
```

O build confere o sha256 dos pesos baixados do Hugging Face (revisão fixa em
`services/deid/export_onnx.py`) e para se o ONNX não concordar com o modelo
original. Para medir em casa sem a imagem: `docker compose --profile deid up -d deid`
(`docker/docker-compose.yml`, porta 8099).

**2. Subir na VPS (ainda sem ligar).**

```bash
cd ~/apps/copiloto-clinico/docker
TAG=<a mesma do passo 1>
docker tag copiloto-deid:$TAG copiloto-deid:latest
docker compose --env-file .env.production -f docker-compose.prod.yml --profile deid up -d copiloto-deid
docker logs copiloto-deid 2>&1 | grep DEID_READY     # revisão do modelo e tempo de carga
```

O serviço só existe na rede `copiloto-net` (sem Traefik, sem porta no host),
com `mem_limit: 400m` e `cpus: 2`. `--profile deid` é obrigatório: o `up -d`
de sempre não o toca, nem o reconstrói.

**3. Medir na VPS antes de ligar** (critério 3 da CC-203: p95 ≤ 300 ms e
memória ≤ 400 MB). O corpus é sintético (`pnpm eval:deid` gera
`evals/deid/out/corpus.jsonl` na máquina de desenvolvimento):

```bash
scp evals/deid/out/corpus.jsonl rodrigo@76.13.173.181:/tmp/deid-corpus.jsonl
# na VPS
docker cp /tmp/deid-corpus.jsonl copiloto-deid:/tmp/corpus.jsonl
docker exec copiloto-deid python bench.py --url http://127.0.0.1:8000 --corpus /tmp/corpus.jsonl --count 100
docker exec copiloto-deid python bench.py --url http://127.0.0.1:8000 --corpus /tmp/corpus.jsonl --count 100 --join 6
docker stats --no-stream copiloto-deid
```

A segunda linha junta 6 relatos (~1.000 caracteres, um caso de plantão). Na
máquina de desenvolvimento deu p95 de 25 ms e 180 ms com 2 CPUs, ~340 MB.
Qualidade, com o mesmo modelo da VPS (a quantização muda com a CPU):

```bash
IP=$(ssh rodrigo@76.13.173.181 "docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' copiloto-deid")
ssh -N -L 8099:$IP:8000 rodrigo@76.13.173.181 &
pnpm eval:deid --deid-url http://127.0.0.1:8099
```

Meta: nomes ≥ 95% e termos clínicos 100% (ADR-020 tem a medição de referência).

**4. Ligar e acompanhar.**

```bash
# docker/.env.production
DEID_MODE=model
DEID_TIMEOUT_MS=1000      # a cada 2.000 caracteres; anexo de 20 mil espera até 10 s

docker compose --env-file .env.production -f docker-compose.prod.yml up -d copiloto-api
docker logs --since 1h copiloto-api 2>&1 | grep -cE "DEID stage="      # textos com o modelo
docker logs --since 1h copiloto-api 2>&1 | grep -E "DEID_FALLBACK"     # quedas para a regex
docker logs --since 1h copiloto-deid 2>&1 | grep -E "DEID_BUSY"        # fila cheia
```

`DEID stage=case ... latencyMs=… entities=… masked=…` diz quanto o modelo
marcou e quanto sobrou depois dos epônimos protegidos. `DEID_FALLBACK
reason=timeout` frequente: subir `DEID_TIMEOUT_MS` ou `DEID_THREADS` (serviço,
padrão 2). `reason=unavailable`: o container caiu (`docker ps`, `docker inspect
copiloto-deid --format '{{.State.OOMKilled}}'`).

**Rollback:** `DEID_MODE=regex` e `up -d copiloto-api` (a regex é a de
sempre). Para liberar a memória: `docker compose --env-file .env.production -f
docker-compose.prod.yml --profile deid stop copiloto-deid`.

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

## E-mail transacional (CC-015)

O `MailService` (`src/modules/mail`) envia e-mail por SMTP, então serve
qualquer provedor (SES, Resend, Postmark, Brevo). Sem `SMTP_HOST` nada sai:
cada envio vira uma linha `MAIL_LOGGED` (INFO) e o fluxo segue como antes.
Falha do provedor vira `MAIL_SEND_FAILED` (WARN, e aviso no Sentry) e também
não para o fluxo que pediu o envio.

Todo e-mail sai de um template de `mail-templates.ts`. Nenhum leva texto
clínico nem identificador de paciente: no máximo um link para a tela, que
exige login. Templates de hoje: o teste de envio e os dois avisos da mentoria
(pedido novo, resposta), prontos para a CC-707 ligar (ver "Usos previstos").

### Variáveis

| Variável | Padrão | Uso |
|---|---|---|
| `SMTP_HOST` | vazio | Vazio = nenhum e-mail sai (só log) |
| `SMTP_PORT` | `587` | `587` = STARTTLS; `465` = TLS desde a conexão |
| `SMTP_SECURE` | conforme a porta | Vazio: `465` liga e as outras não. `true`/`false` força |
| `SMTP_USER` / `SMTP_PASSWORD` | vazios | Os dois ou nenhum. Com credencial, o envio exige TLS: a senha nunca trafega aberta |
| `SMTP_FROM` | — | Obrigatório com SMTP: `Copiloto Clínico <nao-responda@dominio>` |
| `WEB_PUBLIC_URL` | `https://copiloto.servidortozato.cloud` no compose | Base dos links dos e-mails. Obrigatório com SMTP |

Com `SMTP_HOST` preenchido e alguma outra variável errada, o boot registra
`MAIL_SMTP_CONFIG_INVALID invalid=<nomes das variáveis>` (WARN, sem os
valores) e nada sai até corrigir. Os prazos são curtos e fixos no código: 5 s
para conectar e para a saudação, 10 s de silêncio no socket e 10 s para o
envio inteiro.

### Configurar o provedor

| Provedor | `SMTP_HOST` | `SMTP_PORT` | `SMTP_USER` | `SMTP_PASSWORD` |
|---|---|---|---|---|
| Amazon SES (São Paulo) | `email-smtp.sa-east-1.amazonaws.com` | `587` | usuário SMTP gerado no console do SES (não é a access key do IAM) | senha SMTP gerada junto |
| Resend | `smtp.resend.com` | `587` | `resend` | a API key (`re_...`) |
| Postmark | `smtp.postmarkapp.com` | `587` | o Server API Token | o mesmo token |
| Brevo | `smtp-relay.brevo.com` | `587` | o login SMTP da página "SMTP & API" | a chave SMTP (não a API key) |

- **SES começa em sandbox**: só entrega para endereços verificados. Peça a
  saída do sandbox no console antes do primeiro uso real.
- O provedor recebe o endereço do médico, que é dado pessoal (nunca dado de
  paciente). Antes de ligar, confirme o DPA do provedor e registre-o como
  operador em `docs/compliance/LGPD.md`.

```bash
# docker/.env.production — aspas no remetente (tem espaço e <>); aspas
# simples na senha se ela tiver "$" (o compose interpolaria)
SMTP_HOST=smtp.resend.com
SMTP_PORT=587
SMTP_USER=resend
SMTP_PASSWORD='re_xxxxxxxx'
SMTP_FROM="Copiloto Clínico <nao-responda@seu-dominio.com.br>"

docker compose --env-file .env.production -f docker-compose.prod.yml up -d copiloto-api
docker logs copiloto-api 2>&1 | grep MAIL_TRANSPORT
# Esperado: MAIL_TRANSPORT channel=smtp host=smtp.resend.com port=587 secure=false auth=on
```

### Domínio remetente: SPF, DKIM e DMARC

Sem os três, o e-mail cai no spam ou é recusado (Gmail e Outlook exigem
autenticação de quem envia volume). O domínio de `SMTP_FROM` precisa estar
verificado no provedor; o painel dele mostra os registros exatos ao verificar
o domínio, e são esses que valem. A forma geral:

| Registro | Nome | Valor (exemplo) |
|---|---|---|
| SPF (TXT) | o domínio, ou o subdomínio de retorno que o provedor indicar | `v=spf1 include:<o do provedor> ~all` |
| DKIM (TXT ou CNAME) | `<seletor>._domainkey.<domínio>` | a chave ou o CNAME que o provedor gerar |
| DMARC (TXT) | `_dmarc.<domínio>` | `v=DMARC1; p=none; rua=mailto:dmarc@<domínio>` |

- **Um SPF só por nome.** Se o domínio já tem SPF (ex.: o do e-mail
  corporativo), acrescente o `include:` do provedor ao registro existente;
  dois registros `v=spf1` invalidam os dois.
- **DMARC em etapas**: comece com `p=none` e leia os relatórios do `rua` por
  duas semanas; sem falha de alinhamento, suba para `p=quarantine` e depois
  `p=reject`.
- Conferir: mande o e-mail de teste (abaixo) para uma conta Gmail e abra
  "Mostrar original". SPF, DKIM e DMARC devem aparecer como `PASS`.

### Enviar o e-mail de teste

`POST /v1/admin/mail/test`, só para `ADMIN`, até 3 por minuto. O e-mail vai
para o endereço da conta do próprio admin (o endpoint não aceita destino:
não pode virar relay). O jeito mais simples é o console do navegador, logado
como admin em `https://copiloto.servidortozato.cloud`:

```js
await (await fetch('/v1/admin/mail/test', { method: 'POST', credentials: 'include' })).json()
```

Ou com o token de acesso:

```bash
curl -X POST https://copiloto.servidortozato.cloud/v1/admin/mail/test \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

A resposta é sempre 200; o corpo diz o resultado:

| Resposta | Significado e ação |
|---|---|
| `{"status":"sent","messageId":...}` | O provedor aceitou. Procure o `messageId` no painel dele se não chegar |
| `{"status":"logged","channel":"log"}` | Sem SMTP (ou config inválida): veja `MAIL_TRANSPORT`/`MAIL_SMTP_CONFIG_INVALID` no boot |
| `reason: "EAUTH"` (`responseCode` 535) | Usuário ou senha SMTP errados. No SES e na Brevo, a credencial SMTP é diferente da chave de API |
| `reason: "ETLS"` | Há credencial e o servidor não ofereceu STARTTLS. Confira a porta, ou use `465` com `SMTP_SECURE=true` |
| `reason: "ETIMEDOUT"`, `"ECONNECTION"`, `"EDNS"` | Host ou porta errados, ou a VPS bloqueia a porta de saída. Teste `587` e `465`; a `25` costuma ser bloqueada |
| `reason: "EENVELOPE"` (`responseCode` 550/554) | Remetente não verificado no provedor, ou SES em sandbox com destinatário não verificado |
| `reason: "invalid_recipient"` | O e-mail da conta do admin não é um endereço válido |

### No log

| Linha | Nível | Significado |
|---|---|---|
| `MAIL_TRANSPORT channel=smtp host=... port=... secure=... auth=on\|off` | INFO, no boot | SMTP ativo |
| `MAIL_TRANSPORT channel=log reason=smtp_not_configured` | INFO, no boot | Sem `SMTP_HOST`: nada sai |
| `MAIL_SMTP_CONFIG_INVALID invalid=SMTP_FROM,...` | WARN, no boot | `SMTP_HOST` preenchido e as variáveis listadas erradas: nada sai |
| `MAIL_SENT template=... to=r***@s***.com.br durationMs=... messageId=...` | INFO | O provedor aceitou |
| `MAIL_LOGGED template=... to=...` | INFO | Sem SMTP: nada saiu, o fluxo seguiu |
| `MAIL_SEND_FAILED template=... reason=... responseCode=...` | WARN, e aviso no Sentry | O provedor recusou, estourou o prazo, ou destinatário/template inválido. O fluxo seguiu |

Nenhuma linha leva assunto, corpo ou endereço completo: o destinatário sai
mascarado e o erro do provedor só pelo código (a mensagem dele costuma repetir
o endereço). Todas levam `requestId` quando o envio acontece numa requisição.

### Para quem desenvolve

```ts
// O módulo que envia importa MailModule e injeta MailService.
const result = await this.mail.send({
  to: physician.email,
  template: { name: 'mentoring_answer', params: { path: `/encounters/${id}` } },
});
```

- `send` nunca rejeita. Numa requisição do médico, chame sem `await`
  (`void this.mail.send(...)`) para não somar até 10 s de um provedor lento;
  num cron, `await` serve.
- Um destinatário por envio: aviso para vários vira vários `send`, e ninguém
  vê o endereço do outro.
- Template novo: um membro na união `MailTemplate`, um `case` em
  `renderBlocks` e um teste. Parâmetro só do que pode sair por e-mail (link
  validado, código de convite, números); nada do texto do caso.
- Sem fila: o envio é direto, com prazo curto. Uma fila poria endereço e corpo
  no Redis em troca de retry, o que ainda não compensa com poucos e-mails por
  dia; se o volume crescer, ela entra atrás do mesmo `MailService`.
- Testar localmente com o Mailpit, sem credencial:
  `docker run --rm -p 1025:1025 -p 8025:8025 axllent/mailpit` e, no `.env`,
  `SMTP_HOST=localhost`, `SMTP_PORT=1025`, `SMTP_FROM=dev@copiloto.local`,
  `WEB_PUBLIC_URL=http://localhost:3001`. Os e-mails aparecem em
  `http://localhost:8025`.

### Usos previstos

**Mentoria (CC-707, PR #186).** O `MentoringNotifier` do #186 recebe só ids,
destinatários e o `path`. O adaptador fica em
`src/modules/mentoring/mail-mentoring.notifier.ts`:

```ts
@Injectable()
export class MailMentoringNotifier implements MentoringNotifier {
  private readonly logger = new Logger('MentoringNotifier');

  constructor(@Inject(MailService) private readonly mail: MailService) {}

  async notifyNewRequest(notice: NewMentoringRequestNotice): Promise<void> {
    this.logger.log(
      `MENTORING_NOTIFY event=new_request requestId=${notice.requestId} ` +
        `recipients=${notice.recipients.length} channel=${this.mail.channel}`,
    );
    // Sem await: o pedido do médico não espera o SMTP. Um e-mail por mentor.
    for (const recipient of notice.recipients) {
      void this.mail.send({
        to: recipient.email,
        template: { name: 'mentoring_new_request', params: { path: notice.path } },
      });
    }
  }

  async notifyAnswer(notice: MentoringAnswerNotice): Promise<void> {
    this.logger.log(
      `MENTORING_NOTIFY event=answer requestId=${notice.requestId} ` +
        `encounterId=${notice.encounterId} channel=${this.mail.channel}`,
    );
    void this.mail.send({
      to: notice.recipient.email,
      template: { name: 'mentoring_answer', params: { path: notice.path } },
    });
  }
}
```

No `mentoring.module.ts`: `imports: [MailModule]` e
`{ provide: MENTORING_NOTIFIER, useClass: MailMentoringNotifier }` no lugar do
`LogMentoringNotifier`. Sem SMTP, o comportamento é o de hoje mais uma linha
`MAIL_LOGGED` por destinatário.

**Convite do beta (CC-702).** Template `beta_invite` com `{ inviteCode }`
(validado por formato, como o `path`) e link fixo para o cadastro; o código
vai no corpo, não na URL. Convites em lote são o caso que pode pedir a fila.

**Alertas de custo e latência (CC-005, PR #176).** Hoje saem como log ERROR e
Sentry. Para também mandar e-mail: um template `ai_cost_alert` só com números
(dia, custo, teto, chamadas, ou p95 e limite), enviado aos `ADMIN` ativos no
`notify` do `AiCallAlertsCronService`, que já garante uma vez por dia ou por
hora. Em cron, `await this.mail.send(...)`.

---

### Revise seu plantão (CC-801)

Depois do plantão, o médico responde até 3 perguntas geradas das análises dos
seus casos dos últimos 7 dias, marca "sei", "tenho dúvida" ou "chutei" e vê a
explicação com a fonte que a análise citou. Desligado por padrão
(`COPILOT_SHIFT_REVIEW=false`).

- **Onde**: entrada "Revise seu plantão" no Plantão e tela `/revise-seu-plantao`
  no web (`/revisao` é da revisão de cartões, CC-404); API em
  `/v1/shift-review/*`.

- **Material**: só as análises do próprio médico (última análise válida de
  cada caso não cancelado, até 6 casos), com entendimento, sinais de alarme,
  condutas e os trechos das fontes citadas. O texto do caso não vai. Tudo
  passa pela máscara de PII e pela redação do `patientRef`. Conhecimento geral
  do modelo e anexo do médico não viram fonte de pergunta.
- **Fonte**: o modelo só aponta a chave de uma fonte listada (`F1`, `F2`…); o
  servidor copia a fonte da análise. Chave fora da lista, alternativa
  inválida ou qualquer dado do paciente (o que a máscara pega, o `patientRef`,
  marcas `[REDACTED_…]`) derruba a pergunta; falta de pergunta pede um retry.
- **Cache**: uma revisão por médico por semana (segunda-feira, horário de
  Brasília). Falha de geração pode ser tentada de novo ao abrir, até 3 vezes
  na semana; sem material (`no_material`), só quando chega análise nova.
  Geração parada há mais de 5 min (deploy no meio) volta a poder ser gerada.
- **Job**: segunda às 10:00 (Brasília), gera a revisão de quem teve análise nos
  7 dias anteriores e ainda não tem a da semana (até 500 médicos por rodada).
- **Custo**: uma chamada por revisão (duas com o retry), etapa
  `review_questions` em `ai_calls`. Custo e modelo também em `shift_reviews`.

```sql
-- Métrica da CC-801: % de médicos ativos que revisaram ao menos 1 vez por semana
WITH ativos AS (
  SELECT date_trunc('week', i.created_at AT TIME ZONE 'America/Sao_Paulo') AS semana,
         e.physician_id
  FROM ai_interactions i JOIN encounters e ON e.id = i.encounter_id
  GROUP BY 1, 2
), revisaram AS (
  SELECT date_trunc('week', answered_at AT TIME ZONE 'America/Sao_Paulo') AS semana,
         physician_id
  FROM shift_review_questions WHERE answered_at IS NOT NULL
  GROUP BY 1, 2
)
SELECT a.semana, count(*) AS ativos, count(r.physician_id) AS revisaram,
       round(100.0 * count(r.physician_id) / count(*), 1) AS pct
FROM ativos a LEFT JOIN revisaram r USING (semana, physician_id)
GROUP BY 1 ORDER BY 1 DESC;

-- Saúde da geração na semana: prontas, falhas por motivo, custo
SELECT status, failure_reason, count(*), round(sum(cost)::numeric, 4) AS usd
FROM shift_reviews WHERE period_start >= date_trunc('week', now())::date
GROUP BY 1, 2 ORDER BY 3 DESC;

-- Acerto × certeza (semente do mapa de calibração da CC-802)
SELECT confidence, count(*) AS respostas, count(*) FILTER (WHERE correct) AS acertos
FROM shift_review_questions WHERE answered_at IS NOT NULL
GROUP BY 1;
```

#### Seu mapa (CC-802)

Aba "Seu mapa" (`/revise-seu-plantao/seu-mapa`, API `GET /v1/shift-review/map`),
atrás da mesma `COPILOT_SHIFT_REVIEW`. Mostra, por tema, acerto × o quanto o
médico sabia (método de avaliação por grau de certeza do Dr. Luiz) e sugere o
que estudar onde ele errou marcando "Sei". Só lê o que a CC-801 já grava: sem
migration, sem chamada de IA.

- **Quadrantes**: "Sei" e acertou = sabe e sabe que sabe; "Tenho dúvida" ou
  "Chutei" e acertou = acerta chutando; "Sei" e errou = erra achando que sabe
  (o perigoso, em vermelho, primeiro na lista); dúvida ou chute e errou = erra
  e sabe que não sabe. Calibração = % de respostas na diagonal (sabia e
  acertou, não sabia e errou).
- **Tema**: a síndrome de PS da análise (lista fechada); sem síndrome, ou com
  "outro", o tema escrito na pergunta, normalizado (acento, caixa, pontuação).
- **Mínimos** (`shift-review.settings.ts`): o mapa sai com 20 respostas
  (`CALIBRATION_MAP_MIN_ANSWERS`, critério da história); antes disso a tela
  mostra quanto falta. Tema com menos de 3 respostas
  (`CALIBRATION_THEME_MIN_ANSWERS`) aparece só como "poucos dados", sem
  quadrantes. Lê as 200 respostas mais recentes (`CALIBRATION_MAP_MAX_ANSWERS`).
- **Isolamento**: só as respostas do médico do token; não há agregado entre
  médicos nem rota que receba outro médico.
- **O que estudar**: `StudySuggestionSource` (study-suggestions.ts). Hoje
  `CitedSourceSuggestions` devolve as fontes que as próprias perguntas do tema
  citaram (as das respostas erradas com "Sei" primeiro, até 3, sem repetir
  documento). Quando os cartões revisados (CC-402, PR #179) entrarem, um
  provedor que busca os cartões publicados da síndrome/tema substitui o
  padrão em `shift-review.module.ts` (`SHIFT_REVIEW_STUDY_SUGGESTIONS`),
  devolvendo `knowledge_card`; contrato e tela já aceitam.
- **Log**: `SHIFT_REVIEW_MAP answered=… calibrated=… themes=… mapped=… toStudy=…`
  (só contagens). Falha do provedor de sugestões não derruba o mapa:
  `SHIFT_REVIEW_MAP_SUGGESTIONS_ERROR error=<classe>` no log e no Sentry, e os
  temas saem sem sugestão.

```sql
-- Métrica da CC-802 (uso recorrente): médicos com 20+ respostas, que já têm mapa
SELECT count(*) AS medicos_com_mapa
FROM (
  SELECT physician_id FROM shift_review_questions
  WHERE answered_at IS NOT NULL GROUP BY 1 HAVING count(*) >= 20
) m;
```

---

## Login com Google e Microsoft (CC-334)

Para quem vem do ANY App (que usava OAuth do Supabase com Google e
Microsoft). OAuth 2.0 + OpenID Connect com PKCE, `state` e `nonce`, inteiro no
backend: o segredo do cliente e o `code_verifier` nunca vão ao navegador.

**Liga sozinho quando configurado.** Cada provedor aparece na tela de login e
de cadastro só com `OAUTH_<PROVEDOR>_CLIENT_ID`, `OAUTH_<PROVEDOR>_CLIENT_SECRET`
e `APP_PUBLIC_URL` preenchidos (lidos a cada requisição). Sem eles, a tela e a
API ficam como antes. Exige a migration `20261014150000_cc334_external_identities`.

| Variável | Valor em produção |
|---|---|
| `APP_PUBLIC_URL` | `https://copiloto.servidortozato.cloud`, já o padrão do `docker-compose.prod.yml` (o web; o callback vira `${APP_PUBLIC_URL}/${API_PREFIX}/auth/oauth/<provedor>/callback`) |
| `OAUTH_REDIRECT_BASE_URL` | vazio. Só quando a API não está em `${APP_PUBLIC_URL}/${API_PREFIX}` (dev: `http://localhost:3000/v1` com o web em `http://localhost:3001`) |
| `OAUTH_GOOGLE_CLIENT_ID` / `OAUTH_GOOGLE_CLIENT_SECRET` | cliente OAuth do Google Cloud (abaixo) |
| `OAUTH_MICROSOFT_CLIENT_ID` / `OAUTH_MICROSOFT_CLIENT_SECRET` | registro de aplicativo no Entra ID (abaixo) |

URLs de callback a cadastrar nos provedores:

- `https://copiloto.servidortozato.cloud/v1/auth/oauth/google/callback`
- `https://copiloto.servidortozato.cloud/v1/auth/oauth/microsoft/callback`

### Criar o cliente no Google Cloud

1. [console.cloud.google.com](https://console.cloud.google.com) → projeto do
   Copiloto (ou crie um).
2. **Google Auth Platform → Branding** (antiga "Tela de consentimento OAuth"):
   público **Externo**; nome "Copiloto Clínico"; e-mail de suporte; domínio
   autorizado `servidortozato.cloud`; política de privacidade
   `https://copiloto.servidortozato.cloud/privacidade`.
3. **Data access / Escopos:** só `openid`, `.../auth/userinfo.email` e
   `.../auth/userinfo.profile`. São escopos não sensíveis: não pedem a
   verificação do Google.
4. **Audience / Público:** publique o app (**Em produção**). Em "Teste", só os
   usuários de teste listados conseguem entrar.
5. **Clients → Criar cliente → Aplicativo da Web.** Origens JavaScript: nenhuma.
   URI de redirecionamento autorizado: o callback do Google acima. Para dev,
   crie um cliente separado com `http://localhost:3000/v1/auth/oauth/google/callback`.
6. Copie o ID e o segredo para `OAUTH_GOOGLE_CLIENT_ID` e
   `OAUTH_GOOGLE_CLIENT_SECRET` em `docker/.env.production`.

### Criar o aplicativo no Microsoft Entra ID

1. [entra.microsoft.com](https://entra.microsoft.com) → **Aplicativos →
   Registros de aplicativo → Novo registro**.
2. Nome "Copiloto Clínico". **Tipos de conta:** "Contas em qualquer diretório
   organizacional e contas pessoais da Microsoft" — é o que o endpoint `common`
   atende (hospital e outlook.com/hotmail.com).
3. **URI de redirecionamento:** plataforma **Web**, o callback da Microsoft
   acima (dev: `http://localhost:3000/v1/auth/oauth/microsoft/callback`).
4. **Certificados e segredos → Novo segredo do cliente.** Copie o **Valor** (não
   o "ID do segredo") para `OAUTH_MICROSOFT_CLIENT_SECRET`, e o "ID do aplicativo
   (cliente)" da visão geral para `OAUTH_MICROSOFT_CLIENT_ID`. **Anote a data de
   expiração** (no máximo 24 meses): vencido, o login Microsoft para com
   `OAUTH_CALLBACK_FAILED provider=microsoft reason=provider_error detail=token_http_401`.
5. **Configuração de token → Adicionar declaração opcional → ID:** marque
   `email` e `xms_edov`. Sem `xms_edov`, conta corporativa nova cai em
   `email_unverified` (só conta pessoal e quem já está vinculado entram).
6. **Permissões de API:** Microsoft Graph, delegadas `openid`, `email` e
   `profile` (o `User.Read` padrão pode ficar). Não pedem consentimento de
   administrador.
7. Tenant de hospital que bloqueia consentimento de usuário a apps de terceiros
   mostra "Precisa da aprovação do administrador": o TI do hospital consente uma
   vez pelo link que a própria tela oferece. A **verificação do editor**
   (Partner Center) remove esse bloqueio na maioria dos tenants.

### Deploy

1. Migration `20261014150000_cc334_external_identities` antes da API, como em
   "Aplicar migrations em produção". Ela cria `external_identities` (com GRANT
   para `copiloto_app`) e deixa `physicians.password_hash` aceitar NULL — só
   relaxa a restrição, nenhuma linha muda.
2. API e web novos. As variáveis entram em `docker/.env.production`; o
   `docker-compose.prod.yml` já as repassa.
3. Conferir: `curl -s https://copiloto.servidortozato.cloud/v1/auth/oauth/providers`
   lista os provedores configurados, e os botões aparecem em `/login`.

### Como funciona

- **Conta externa já vinculada** (chave: provedor + `sub` do id_token, não o
  e-mail): entra direto. Com MFA ligado, pede o código como no login por senha.
- **E-mail confirmado pelo provedor, sem cadastro:** a página `/login/oauth`
  pede CRM (obrigatório) e o aceite da Política de Privacidade; só então a conta
  é criada, sem senha, e segue para o onboarding. Não existe conta sem CRM.
- **E-mail de um cadastro existente:** nunca vincula sozinho. O médico digita a
  senha da conta uma vez (mesmo bloqueio por tentativas do login); com MFA
  ligado, o vínculo só é gravado depois do código.
- **E-mail não confirmado pelo provedor:** recusa (`email_unverified`). No
  Google vale `email_verified`; na Microsoft, conta pessoal ou `xms_edov`
  (o administrador de um tenant consegue pôr qualquer e-mail num usuário).
- id_token conferido: assinatura RS256 pela chave do JWKS do provedor (cache de
  1 h; `kid` desconhecido rebusca no máximo a cada 30 s), `aud` = nosso client
  id, `exp`, `nonce` do fluxo e `iss` (Microsoft: o do tenant do próprio token).
- Cookies do fluxo (`oauth_flow`, `oauth_pending`): httpOnly, `SameSite=Lax`,
  caminho `/v1/auth/oauth`, 10 e 15 min. Assinados com segredos derivados do
  `JWT_ACCESS_SECRET`, não valem como sessão.

### Logs e trilha

- `OAUTH_CALLBACK_FAILED provider=<p> reason=<motivo> detail=<causa>` (WARN):
  `state_mismatch` (cookie do fluxo ausente/expirado ou outra aba),
  `invalid_token` (`detail` = `audience`, `expired`, `issuer`, `nonce`, `signature`…),
  `provider_error` (`token_http_<status>`, `jwks_unavailable`),
  `email_unverified`. Nunca e-mail, `sub` ou token.
- `OAUTH_JWKS_FETCH_FAILED uri=...` (WARN): o JWKS do provedor não respondeu.
- Trilha: `AUTH_LOGIN`, `AUTH_LOGIN_MFA_REQUIRED` e `AUTH_LOGIN_FAILED` com
  `{ method: 'oauth', provider }` (falha também com `reason`); `AUTH_REGISTER`
  com `{ crmUf, method, provider }`; `AUTH_OAUTH_LINKED { provider }` e
  `AUTH_OAUTH_LINK_FAILED { provider, reason }`. Sem e-mail nem `sub`.

### Suporte e rollback

```sql
-- Contas externas de um médico
SELECT provider, email_at_link, created_at, last_login_at
FROM external_identities WHERE physician_id = '<id>';

-- Desvincular (o médico volta a ver a tela de vínculo no próximo login)
DELETE FROM external_identities WHERE physician_id = '<id>' AND provider = 'google';
```

- **Desligar:** apague as variáveis do provedor e suba a API de novo (`up -d
  --no-deps copiloto-api`). ⚠️ Quem criou a conta pelo login social não tem
  senha e fica sem entrar até o provedor voltar — não há tela para criar senha
  depois. Antes de desligar, contar: `SELECT count(*) FROM physicians WHERE
  password_hash IS NULL;`
- A eliminação LGPD apaga `external_identities` do médico; a portabilidade
  (`GET /lgpd/data`) inclui as contas vinculadas.

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
| `20261014120000_cc_402_knowledge_cards` | Cartões revisados (ADR-019): `knowledge_card_drafts`, `knowledge_cards`, `knowledge_card_versions`, trigger que congela o conteúdo assinado e GRANT sem DELETE; só cria tabelas |
| `20261014120000_cc_707_mentoring_requests` | Tabela `mentoring_requests` (pedidos de mentoria, um em aberto por caso) e `physicians.is_mentor` — CC-707 |
| `20261014150000_cc334_external_identities` | Tabela `external_identities` (login com Google/Microsoft) e `physicians.password_hash` opcional — CC-334; só cria tabela e relaxa NOT NULL |
| `20261014180000_ai_calls_fallback_from` | `ai_calls.fallback_from` (perfil que caiu, na chamada feita no modelo de reserva) — CC-107; só adiciona coluna nula |
| `20261014180000_cc_703_knowledge_gaps` | Tabela `knowledge_gaps` (registro de lacunas, CC-703); só cria tabela e tipo, sem tocar nas existentes |
| `20261014200100_audio_capture_retention` | `audio_captures.encrypted_content` anulável + CHECK `deleted` ⇔ sem áudio (retenção de 30 dias). Só metadado de coluna e CHECK: a versão anterior da API roda sobre o schema novo |
| `20261015120000_cc_404_card_reviewer` | `physicians.is_card_reviewer` (padrão `false`): acesso só à fila de revisão de cartões (CC-404); só adiciona coluna |
| `20261015120000_cc_406_knowledge_card_index` | Índice semântico dos cartões (CC-406): `knowledge_card_index`, derivado (CASCADE a partir do cartão, GRANT com DELETE), `embedding vector` sem dimensão fixa; só cria tabela — depois do deploy, `pnpm cards:reindex` |
| `20261015120100_cc_411_card_cross_reviews` | Revisão cruzada (CC-411): `knowledge_card_cross_reviews`, CHECK de segundo médico, trigger que congela sorteio e decisão, GRANT sem DELETE; só cria tabela |
| `20261015130000_cc_801_shift_reviews` | Tabelas `shift_reviews` e `shift_review_questions` (CC-801, "Revise seu plantão"); só cria tabelas e enums, com GRANT de DML para `copiloto_app` |
| `20261015180000_cc207_chief_complaint_text` | `encounters.chief_complaint` de `VARCHAR(140)` para `TEXT`, para caber o valor cifrado — CC-207/ADR-021; sem reescrever a tabela |
| `20261016120000_cc_012_lgpd_erasure_privileges` | CC-012: `copiloto_app` ganha `UPDATE` só em `ai_calls.physician_id`/`encounter_id`/`request_id` e `DELETE` explícito em `mfa_backup_codes`, `crm_verification_requests`, `physician_institutions` e `login_security_states`. Só GRANT; sem ela, `POST /lgpd/erasure` falha com `permission denied for table ai_calls` e nada é apagado |

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
| `TRUSTED_PROXY_HOPS` | Proxies confiáveis à frente da API (padrão 1 = Traefik). Define o IP do limite de tentativas e o gravado na trilha de auditoria. Alto demais (2 sem Cloudflare) deixa o cliente escolher esse IP; baixo demais (1 com Cloudflare) junta médicos no mesmo limite e grava o IP da Cloudflare. Ver "Limite de tentativas" |
| `INTERNAL_SERVICE_TOKEN` | Endpoint `/audit/verify-chain` inacessível |
| `BETA_INVITE_REQUIRED` | `on` fecha o cadastro para quem não tem convite do beta (CC-702): sem código válido, `403 BETA_INVITE_REQUIRED` e o web abre a lista de espera. `off` (padrão) = cadastro aberto, como antes. Ausente ou irreconhecível = `off`. Ver "Beta por convite (CC-702)". Exige a migration `20261015120000_cc702_beta_convites` |
| `AI_API_KEY` | Análise clínica indisponível |
| `DATABASE_URL` | Sistema completamente indisponível ou rodando com privilégios excessivos |
| `MIGRATION_DATABASE_URL` | Migrations indisponíveis ou executadas com usuário incorreto |
| `FIELD_ENCRYPTION_KEY` | API não sobe (segredo do MFA). Trocada sem `FIELD_ENCRYPTION_KEY_PREVIOUS`: MFA, áudio e texto clínico cifrado deixam de abrir (`SealedValueError`). Perdida: o texto clínico cifrado não volta |
| `CLINICAL_TEXT_ENCRYPTION` | `on` grava o texto clínico cifrado (CC-207/ADR-021); `off` (padrão) grava em claro. A leitura abre os dois sempre: desligar é o rollback. Ausente ou irreconhecível = `off`. Ver "Texto clínico cifrado em repouso" |
| `FIELD_ENCRYPTION_KEY_PREVIOUS` | Só durante uma rotação: a chave anterior, para decifrar. Vazia = sem rotação |
| `OFFICIAL_GUIDELINES_ENABLED` | `false` tira PCDT/DDT/DB/PU do retrieval (válvula de escape da ADR-010); ausente = ligada. Os limiares `OFFICIAL_*` estão em `.env.example` |
| `KNOWLEDGE_CARDS_DRAFT_ENABLED` | `true` liga o rascunho de cartões por IA (CC-403: `pnpm cards:draft` e `POST /v1/admin/knowledge-cards/drafts`). Ausente ou irreconhecível = desligado (503). Modelo em `AI_CARD_DRAFT_MODEL` (vazio = `AI_MODEL`; aceita `perfil:modelo`). Não muda a análise do Copiloto |
| `COPILOT_REVIEWED_CARDS` | CC-408: `on` põe os cartões revisados publicados na decisão em etapas (v2/v3/v4), com "Revisado por" e a dose estruturada do cartão liberada. Ausente ou irreconhecível = desligada: nenhuma busca de cartão, prompt e saída iguais. Ligada, uma chamada de embedding a mais por análise; sem embedding, segue sem cartões. Limiares em `REVIEWED_CARDS_MIN_SIMILARITY` (padrão 0,5) e `REVIEWED_CARDS_MAX` (padrão 3). Ver "Cartões na decisão" |
| `UNREVIEWED_SOURCES_PRELIMINARY` | `false` desliga a contenção da ADR-012: PCDT e chunk curado sem assinatura voltam a embasar conduta definitiva. Ausente ou irreconhecível = ligada |
| `COPILOT_REASONING` | `stages` liga o raciocínio em etapas da ADR-013 (entendimento do caso antes da busca, busca dirigida, card "O que eu entendi"); `legacy` (padrão) volta ao pipeline de sempre. Ausente ou irreconhecível = `legacy`. Etapa 1 com `AI_UNDERSTANDING_MODEL` (vazio = `AI_MODEL`) e `AI_UNDERSTANDING_EFFORT` (padrão `low`). Falha da Etapa 1 aparece como `UNDERSTANDING_FAILED`/`UNDERSTANDING_FALLBACK` no log e a análise segue pela busca de sempre |
| `COPILOT_DECISION_PROMPT` | `v2` liga a decisão em duas camadas da ADR-013 ("Fazer agora" × "Depende de…", perguntas que separam hipóteses, conhecimento geral do modelo rotulado e sem dose); `v1` (padrão) é o prompt de sempre. Exige `COPILOT_REASONING=stages`: sem ele fica `v1` e o log mostra `DECISION_PIPELINE_DOWNGRADE`. Regra da v2 que sobra depois do retry vira `OUTPUT_VALIDATION_WARNING`, nunca bloqueio |
| `COPILOT_WHY_LINE` | CC-601: `on` pede, em cada conduta "Fazer agora", uma linha de "por quê" de até 120 caracteres em linguagem simples, que o médico abre ao tocar em "Por quê"; sem ela (flag desligada, conduta "depende" ou linha descartada), a tela mostra o `rationale` de sempre. `off` (padrão) deixa o prompt e a saída da decisão byte a byte como antes. Ausente ou irreconhecível = `off`. Exige `COPILOT_DECISION_PROMPT=v3` ou `v4`: com outro prompt fica desligada e o log mostra `DECISION_PIPELINE_DOWNGRADE`. Nunca pede retry sozinha: linha acima do teto sai da resposta e aparece como `OUTPUT_VALIDATION_WARNING: WHY LINE TOO LONG`, conduta "agora" sem linha como `WHY LINE MISSING` (só índices, sem texto clínico). A interação grava `params.whyLine: true`. Liberar só depois do gabarito com e sem a linha (variantes `claude-opus-5-5-v3-modelo` e `claude-opus-5-5-v3-por-que`): sem aumento de erro crítico nem de latência acima de 10% |
| `COPILOT_INTAKE` | `on` liga o Copiloto guiado da ADR-014: antes do plano, a leitura do caso decide se pergunta (no máximo 3 perguntas, uma por vez). `off` (padrão) vai direto ao plano. Ausente ou irreconhecível = `off`. Modelo da leitura em `AI_INTAKE_MODEL` (vazio = o da Etapa 1). No log: `INTAKE_READING` (tempo e perguntas), `INTAKE_STARTED` (caminho: `ask`, `unstable`, `complete`, `reading_failed`, `disabled`), `INTAKE_CLOSED` (motivo) e `INTAKE_READING_TIMEOUT` (leitura passou de 20 s e o caso seguiu direto ao plano). Exige a migration `20261012120000_adr_014_case_intakes` |
| `AI_FALLBACK_MODEL` | CC-107: modelo de reserva quando o provedor de uma etapa fica fora do ar (prazo, rede, 5xx, 429, limite de uso); uma nova tentativa nele. Vazio = sem reserva. Por etapa: `AI_<ETAPA>_FALLBACK_MODEL` (`none` desliga). Ver "Reserva de provedor (CC-107)". No log: `AI_FALLBACK`, `AI_FALLBACK_SKIPPED`, `AI_FALLBACK_FAILED` |
| `WHISPER_MODEL` | CC-205: modelo da transcrição do ditado, `whisper-large-v3` (padrão) ou `whisper-large-v3-turbo`. Ausente ou irreconhecível = `whisper-large-v3`. Ver "Modelo da transcrição" e docs/evals/transcricao.md |
| `DEID_CONTEXT_RULES` | CC-201/CC-202/CC-206: `on` (padrão) faz a máscara de PII tirar também o número de prontuário pelo rótulo ("prontuário", "RH", "registro", "matrícula", "BE", "nº de atendimento" → `[REDACTED_RECORD]`) e o nome depois de tratamento ou apelido ("Seu Zé", "Dona Cida", "Sr. João", "Tião" → `[NOME]`), sem tocar a lista de epônimos protegidos (`src/modules/copilot/guardrails/protected-clinical-terms.list.ts`, revisão médica pendente). `off` volta à regex anterior, sem redeploy, se aparecer máscara indevida em texto clínico. Ausente ou irreconhecível = `on`. Vale para o caso, as respostas do afunilamento, áudio, anexos, busca de diretrizes e notas livres. No log (debug): `PII detection ... {"record":1,"name":2}`, só a contagem por tipo |
| `DEID_MODE` / `DEID_TIMEOUT_MS` / `DEID_SERVICE_URL` | CC-203 / ADR-020: `model` soma à regex o modelo local (`copiloto-deid`, sobe com `--profile deid`) para nome solto, parente e endereço no caso, respostas, anexo, transcrição e consulta de diretrizes; `regex` (padrão) é só a regex. Ausente ou irreconhecível = `regex`. Serviço fora do ar ou mais lento que `DEID_TIMEOUT_MS` (padrão 1000, a cada 2.000 caracteres): segue só com a regex e loga `DEID_FALLBACK`. Ver "De-identificação com o modelo local" |
| `COPILOT_MENTORING` | `on` liga "Discutir com um médico da equipe" (CC-707): o caso vai mascarado, com o plano da IA, para os médicos com `is_mentor`; a resposta aparece no caso. `off` (padrão): nada aparece e as rotas da mentoria respondem 404. Ausente ou irreconhecível = `off`. Termo provisório até o parecer (CC-708). No log: `MENTORING_REQUESTED`, `MENTORING_NOTIFY`, `MENTORING_NO_ELIGIBLE_MENTOR`, `MENTORING_NOTIFY_FAILED` e uma linha por transição. Ver "Mentoria em modo concierge (CC-707)" |
| `AI_DECISION_MODEL` / `AI_DECISION_CRITICAL_MODEL` | ADR-016: modelo da decisão no caso comum e no caso grave (instável ou tempo-crítico pela Etapa 1, ou sem entendimento). Vazios = `AI_MODEL` nas duas rotas. Crítico vazio = o comum nas duas. Aceitam `perfil:modelo`. No log: `DECISION_MODEL route=critical\|standard model=...`; a interação grava `params.decisionRoute` |
| `SMTP_HOST` e demais `SMTP_*`, `WEB_PUBLIC_URL` | Vazio: nenhum e-mail sai, cada envio vira `MAIL_LOGGED` no log e o fluxo segue. Preenchido com alguma variável errada: `MAIL_SMTP_CONFIG_INVALID` no boot e também nada sai. Ver "E-mail transacional (CC-015)" |
| `COPILOT_SHIFT_REVIEW` | CC-801: `true` liga "Revise seu plantão" (perguntas sobre os próprios casos com grau de certeza). `false` (padrão) esconde a entrada e a API responde `disabled`; o job semanal não roda. Ausente ou irreconhecível = `false`. Modelo em `AI_SHIFT_REVIEW_MODEL` (vazio = `AI_MODEL`, aceita `perfil:modelo`) e esforço em `AI_SHIFT_REVIEW_EFFORT` (padrão `low`). No log: `SHIFT_REVIEW_READY`, `SHIFT_REVIEW_FAILED reason=...`, `SHIFT_REVIEW_ANSWERED`, `SHIFT_REVIEW_WEEKLY`, `REVIEW_QUESTIONS_RETRY`. Exige a migration `20261015130000_cc_801_shift_reviews`. Ver "Revise seu plantão (CC-801)". CC-802: a mesma flag liga a aba "Seu mapa" (mapa de calibração por tema, `GET /v1/shift-review/map`; desligada responde `disabled`); no log `SHIFT_REVIEW_MAP` e `SHIFT_REVIEW_MAP_SUGGESTIONS_ERROR`. Ver "Seu mapa (CC-802)" |
| `COPILOT_KNOWLEDGE_SOURCE` | `internal_kb` (padrão) é a busca de sempre (embedding na OpenAI); `model_only` não busca nada; `web` pesquisa em fontes oficiais (`AI_RESEARCH_MODEL`, padrão `claude-sonnet-5-5`; `AI_RESEARCH_EFFORT`, padrão `low`; `WEB_RESEARCH_MAX_SEARCHES`, padrão 5; `WEB_RESEARCH_ALLOWED_DOMAINS`, vazio = 32 fontes padrão). `model_only` e `web` nunca chamam o provedor de embedding. `web` exige `stages` e `COPILOT_DECISION_PROMPT=v2` (sem eles vira `model_only`, com `DECISION_PIPELINE_DOWNGRADE` no log) e Anthropic como `AI_PROVIDER`; pesquisa que falha aparece como `WEB_RESEARCH_FALLBACK` e a análise segue só com o conhecimento do modelo |
| `AI_DAILY_COST_ALERT_USD` / `AI_P95_ALERT_MS` | CC-005: teto do custo do dia (UTC, em USD) e meta do p95 da decisão na última hora (ms). Vazios ou inválidos = alerta desligado (inválido avisa `AI_CALL_ALERT_THRESHOLD_INVALID` no log). Ver "Alertas de custo e latência da IA" |
| `COPILOT_SITE_CONTEXT` | CC-602/CC-603: `on` leva à decisão o local de plantão declarado no caso (porte, o que o serviço tem e **não** tem, especialistas, tempo até a referência) e a regra de transferência (destino, prioridade e conduta até a transferência; nada que exija recurso ausente no próprio serviço). Vale nos prompts v1 e v2/v3/v4. `off` (padrão), ou caso sem local declarado, mantém o prompt byte a byte igual. Ausente ou irreconhecível = `off`. No log: `SITE_CONTEXT facilityType=… missing=hasCT,hasICU specialists=n referenceMinutes=…` (sem texto do caso); a interação grava `params.siteContext: true`. Os locais do médico (Configurações → Locais de plantão) exigem a migration `20261014120000_cc_602_practice_sites`; o caso guarda uma cópia do local em `encounters.context.site` |
| `LEGAL_TERMS_V2` | CC-905: `on` exige o aceite da versão vigente dos Termos de Uso e da Política de Privacidade (tela de aceite no web, 428 `TERMS_ACCEPTANCE_REQUIRED` na API, exceto aceite, logout e LGPD). `off` (padrão) não muda nada. Ausente ou irreconhecível = `off`. Sem versão publicada no console, nada é exigido. Ver "Termos de uso e política de privacidade (CC-905)" |
| `OAUTH_GOOGLE_CLIENT_ID` / `OAUTH_GOOGLE_CLIENT_SECRET`, `OAUTH_MICROSOFT_CLIENT_ID` / `OAUTH_MICROSOFT_CLIENT_SECRET`, `APP_PUBLIC_URL` | CC-334: com os dois de um provedor e `APP_PUBLIC_URL`, o botão "Entrar com <provedor>" aparece; sem eles nada muda. Apagar depois de em uso deixa sem acesso quem criou a conta pelo login social (não tem senha) — ver "Login com Google e Microsoft". Segredo da Microsoft vence (máx. 24 meses) |

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
`verify_attach`, `guideline_classification`, `review_questions`, `card_draft`), perfil, provedor, modelo pedido
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
A eliminação LGPD (CC-012) mantém as linhas no custo agregado, mas zera
`physician_id`, `encounter_id` e `request_id`: depois dela o `x-request-id`
daquele médico não acha mais nada.

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
| `DEID_FALLBACK` (WARN, frequente) | Com `DEID_MODE=model`, o serviço `copiloto-deid` caiu, está lento ou respondeu fora do contrato; o texto seguiu só com a regex (nome solto passa) | Ver `reason=` e a seção "De-identificação com o modelo local"; se persistir, `DEID_MODE=regex` |

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
