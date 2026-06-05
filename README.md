# Copiloto Clínico

Copiloto de IA para médicos em ambiente hospitalar — geração assistida de documentos clínicos (SOAP, SBAR, prescrições) com trilha de auditoria inviolável, em conformidade com CFM e LGPD.

> **R0 — Pré-demo / Honestidade:** todas as 10 histórias do épico R0 foram implementadas e mergeadas. Ver [Sprint R0](https://app.clickup.com/90132565680/v/l/901327466671).

---

## Stack

| Camada | Tecnologia |
|---|---|
| **Backend** | NestJS 11 + Fastify + Prisma 6 + PostgreSQL 16 (pgvector) |
| **Frontend** | Next.js 16 (App Router) + Tailwind CSS + shadcn/ui |
| **IA** | Anthropic Claude / OpenAI (configurável via `AI_PROVIDER`) |
| **Busca vetorial** | pgvector (embeddings de diretrizes médicas) |
| **Cache / Filas** | Redis 7 |
| **Infra dev** | Docker Compose |
| **Testes** | Vitest (unit + e2e + integration) |

---

## Setup Local (< 15 min)

### Pré-requisitos
- Node.js 22+
- pnpm 10+
- Docker + Docker Compose

### 1. Clonar e instalar dependências

```bash
git clone https://github.com/TozatoRodrigo/CopilotoClinico.git
cd CopilotoClinico
pnpm install
```

### 2. Configurar variáveis de ambiente

```bash
cp .env.example .env
```

Editar `.env` com suas chaves:

| Variável | Obrigatória | Descrição |
|---|---|---|
| `DATABASE_URL` | ✅ | PostgreSQL (já preenchida para docker-compose local) |
| `JWT_ACCESS_SECRET` | ✅ | Mínimo 32 caracteres |
| `JWT_REFRESH_SECRET` | ✅ | Mínimo 32 caracteres |
| `AI_API_KEY` | ✅ | Chave do provider de IA (Anthropic ou OpenAI) |
| `AI_PROVIDER` | ✅ | `anthropic` ou `openai` |
| `AI_MODEL` | ✅ | Ex: `claude-sonnet-4-20250514` |
| `AI_EMBEDDING_MODEL` | ✅ | Ex: `text-embedding-3-small` |
| `INTERNAL_SERVICE_TOKEN` | ✅ | Token para endpoints internos (`openssl rand -hex 32`) |
| `REDIS_URL` | ✅ | Redis (já preenchida para docker-compose local) |

### 3. Subir infraestrutura

```bash
docker compose -f docker/docker-compose.yml up -d
```

Aguarda PostgreSQL e Redis ficarem healthy (~ 10 segundos).

### 4. Aplicar migrations e gerar Prisma client

```bash
pnpm prisma migrate deploy
pnpm prisma generate
```

### 5. Iniciar o backend

```bash
pnpm start:dev
# API disponível em http://localhost:3000/v1
```

### 6. Iniciar o frontend

```bash
cd web
pnpm dev
# App disponível em http://localhost:3001
```

---

## Testes

```bash
# Unit tests (sem banco)
pnpm test

# E2E tests (sem banco — mocks de Prisma)
pnpm test:e2e

# Integration tests (requer PostgreSQL com migrations)
DATABASE_URL=postgresql://test:test@localhost:5432/test pnpm test:integration
```

### CI

O GitHub Actions executa dois jobs em sequência:
1. **Quality Gates** — lint, typecheck, unit, e2e (sem banco)
2. **Integration Tests** — PostgreSQL 16 como serviço (via `needs: quality`)

---

## Estrutura do Projeto

```
CopilotoClinico/
├── src/                        # Backend NestJS
│   ├── modules/
│   │   ├── ai-gateway/         # Abstração de providers de IA (Anthropic / OpenAI)
│   │   ├── audit/              # Trilha de auditoria append-only + verificação de cadeia
│   │   ├── auth/               # Autenticação JWT + registro de médicos
│   │   ├── copilot/            # Orquestrador clínico (PII filter → retrieval → LLM → validate)
│   │   ├── documents/          # Geração, edição e confirmação de documentos SOAP/SBAR
│   │   ├── encounters/         # Atendimentos médicos
│   │   ├── guidelines/         # Ingestão e busca vetorial de diretrizes médicas
│   │   ├── health/             # Health check endpoint
│   │   └── lgpd/               # Exportação e apagamento de dados (LGPD Art. 18)
│   ├── shared/                 # Guards, pipes, decorators, tipos compartilhados
│   └── workers/                # Cron jobs (ex: verificação diária da cadeia de hash)
├── prisma/
│   ├── schema.prisma           # Schema do banco de dados
│   └── migrations/             # Migrations versionadas
├── tests/
│   ├── e2e/                    # Testes end-to-end (app completo, Prisma mockado)
│   ├── integration/            # Testes de integração com banco real
│   └── helpers/                # Helpers compartilhados
├── web/                        # Frontend Next.js 16
│   └── src/app/
│       ├── (app)/              # Rotas autenticadas (dashboard, encounters, documents, audit)
│       └── (auth)/             # Rotas públicas (login, registro)
├── docs/
│   ├── architecture.md         # Diagrama C4 e decisões de design
│   ├── compliance/             # DPA, política LGPD
│   ├── decisions/              # ADRs (Architecture Decision Records)
│   └── runbook.md              # Operação e manutenção
└── docker/                     # Docker Compose e Dockerfiles
```

---

## Principais Endpoints

```
POST /v1/auth/register          # Registro de médico
POST /v1/auth/login             # Login (retorna JWT + refresh token)
GET  /v1/auth/me                # Perfil do médico autenticado (inclui crmVerified)
POST /v1/auth/refresh           # Refresh do access token

GET  /v1/encounters             # Listar atendimentos
POST /v1/encounters             # Criar atendimento
POST /v1/encounters/:id/copilot/analyze   # Analisar caso com IA

POST /v1/encounters/:id/documents         # Gerar documento (SOAP, SBAR, etc.)
POST /v1/encounters/:id/documents/:docId/confirm   # Confirmar documento (gate médico-legal)

GET  /v1/audit                  # Trilha de auditoria
POST /v1/audit/verify-chain     # Verificar integridade da cadeia [interno]

GET  /v1/lgpd/data              # Exportar dados (LGPD Art. 18)
DELETE /v1/lgpd/erasure         # Solicitar apagamento
```

---

## Decisões de Arquitetura

Ver `docs/decisions/` para os ADRs formais:

| ADR | Decisão |
|---|---|
| [ADR-003](docs/decisions/ADR-003-mfa-deferred.md) | MFA diferido para R1 — campos removidos do schema |
| [ADR-004](docs/decisions/ADR-004-patient-ref-pseudonymization.md) | patientRef como identificador opaco (LGPD) |

Ver `docs/architecture.md` para diagrama C4 e mapa de módulos.

---

## Conformidade

| Requisito | Status |
|---|---|
| CFM — Trilha de auditoria inviolável | ✅ AUD-001 (trigger append-only) + AUD-003 (verificação cadeia) |
| CFM — Confirmação humana auditável | ✅ CLIN-003 (gate com contentHash canônico) |
| LGPD — Pseudonimização de pacientes | ✅ LGPD-001 (patientRef opaco) |
| LGPD — Redação antes do provider de IA | ✅ LGPD-005 (2 camadas: PII + patientRef) |
| LGPD — Direitos do titular | ✅ `/lgpd/data` + `/lgpd/erasure` |
| DPA com provider de IA | ⚠️ Ação manual necessária — ver `docs/compliance/DPA_PROVIDER.md` |

---

## Notas de Segurança

- **audit_log**: imutável no banco via trigger PostgreSQL — `UPDATE`/`DELETE` são bloqueados
- **audit_log**: verificação diária de integridade da cadeia de hash (cron 02:00 UTC)
- **MFA**: removido do R0 (campos dead code → honest state) — planejado para R1 com TOTP + recovery codes
- **CRM**: verificação contra API do CFM planejada para R1 — dashboard mostra status honesto

---

## Licença

UNLICENSED — Propriedade da Strivium. Todos os direitos reservados.
