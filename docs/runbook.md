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

```bash
docker compose -f docker-compose.prod.yml exec copiloto-api \
  sh -c 'DATABASE_URL="$MIGRATION_DATABASE_URL" pnpm prisma migrate deploy'
```

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

```bash
docker compose -f docker-compose.prod.yml exec copiloto-api \
  pnpm ingest:guidelines docs/guidelines/drafts/kb-005-arboviroses-dengue
```

```bash
docker compose -f docker-compose.prod.yml exec copiloto-api \
  pnpm ingest:guidelines docs/guidelines/drafts/kb-006-cefaleias-primarias
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

Resposta esperada (cadeia íntegra):
```json
{ "valid": true, "count": 1234 }
```

Resposta em caso de corrupção:
```json
{ "valid": false, "count": 45, "brokenAt": "<uuid>", "message": "afterHash mismatch at record ..." }
```

O cron `AuditChainCronService` executa isso automaticamente às 02:00 UTC e loga `ERROR` em caso de falha.

### Aplicar migrations em produção

```bash
DATABASE_URL="$MIGRATION_DATABASE_URL" pnpm prisma migrate deploy
```

`MIGRATION_DATABASE_URL` deve apontar para a role owner/admin do banco. A API
deve continuar usando `DATABASE_URL` com o usuário LOGIN membro de
`copiloto_app`, sem privilégios de DDL e sem `DELETE`/`TRUNCATE` em `audit_log`.

⚠️ **ATENÇÃO — audit_log:** Qualquer migration que altere a tabela `audit_log` (ex: adicionar coluna) precisa de revisão manual. O trigger `audit_log_no_update_delete` bloqueia `UPDATE`/`DELETE` mas **não bloqueia DDL**. Verificar que a migration não remove dados existentes.

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

---

## Monitoramento

### Logs de nível ERROR que exigem atenção imediata

| Log | Causa | Ação |
|---|---|---|
| `AUDIT CHAIN INTEGRITY FAILURE` | Hash corrompido detectado | Isolar sistema, investigar registros suspeitos, acionar DPO |
| `Audit chain verification failed with exception` | Erro ao verificar cadeia | Verificar conectividade com banco |
| `Output validation failed` | IA retornou resposta inválida | Verificar provider, possível mudança de modelo |
| `Injection detected` | Possível tentativa de prompt injection | Revisar logs de acesso, bloquear IP se necessário |

---

## Conformidade CFM — Checklist de Auditoria

Para uma auditoria regulatória do CFM, verificar:

- [ ] `audit_log` tem registros para todos os atendimentos (`ENCOUNTER_CREATED`)
- [ ] Todos os documentos confirmados têm `DOCUMENT_CONFIRMED` com `afterHash`
- [ ] Cadeia de hash está íntegra (`POST /audit/verify-chain`)
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
