# Copiloto Clínico

Copiloto de IA para o médico de plantão: lê o caso, pergunta o que muda a
conduta e devolve um plano com fontes, que o médico revisa e confirma.

Existe porque o plantonista decide rápido, muitas vezes sozinho e com pouca
informação. Ele precisa de apoio que mostre de onde vem cada recomendação, diga
quando não tem certeza e deixe registro do que foi decidido.

## Estado atual

Beta em produção em `https://copiloto.servidortozato.cloud`. O deploy é
manual, na VPS, conforme o [runbook](docs/runbook.md). Funcionalidade nova
entra desligada, atrás de flag, e é ligada uma a uma.

O backlog fica no ClickUp, com acesso interno. Cada história tem um código
`CC-xxx`, citado no PR que a entrega.

## Princípios

- **Segurança do paciente.** O médico decide. O Copiloto sugere, cita a fonte e
  diz quando não tem certeza. Fonte não revisada por médico só embasa conduta
  preliminar (ADR-012). Mudança clínica entra atrás de flag com padrão seguro e
  passa pelo gabarito clínico antes de ser ligada. Dose, escore e conduta
  precisam da revisão de um médico.
- **LGPD.** O paciente aparece só como um `patientRef` opaco (ADR-004). O texto
  do caso é mascarado antes de ser gravado ou de ir a um modelo, e pode ficar
  cifrado em repouso (ADR-021). Nenhum dado de paciente vai para log, URL,
  analytics ou Sentry. Política completa em
  [docs/compliance/LGPD.md](docs/compliance/LGPD.md).
- **Auditoria.** Cada ação clínica e de conta entra numa trilha append-only,
  encadeada por hash e verificada todo dia (ADR-002, ADR-015). O documento
  confirmado leva um selo de integridade (ADR-018).

## Arquitetura

São duas aplicações no mesmo repositório. A API (NestJS 11 + Fastify +
Prisma 6) grava no Postgres 16 com pgvector, usa o Redis para a fila BullMQ e o
cache da busca e chama os modelos por um gateway de IA, que escolhe o provedor
(Anthropic ou Groq) por etapa da análise. O web (Next.js 16, App Router) fala
com a API em `/v1` e importa só tipos dos contratos Zod de
`src/shared/contracts`, pelo alias `@contracts`. Em produção, API, web, banco e
Redis rodam em containers atrás do Traefik; o worker da fila e os crons rodam
no processo da API. Detalhes em [docs/architecture.md](docs/architecture.md).

```
 Médico (navegador)
        │ HTTPS
        ▼
 ┌───────────────┐  /v1   ┌───────────────────────────────┐
 │ Web           │ ─────► │ API — NestJS 11 + Fastify     │
 │ Next.js 16    │        │ módulos, fila BullMQ, crons,  │
 └───────────────┘        │ gateway de IA                 │
                          └───┬─────────────┬─────────┬───┘
                              │             │         │ texto já mascarado
                              ▼             ▼         ▼
                      ┌──────────────┐ ┌─────────┐ ┌──────────────────┐
                      │ Postgres 16  │ │ Redis 7 │ │ Anthropic, Groq  │
                      │ + pgvector   │ │ fila e  │ │ modelo por etapa │
                      │ trilha       │ │ cache   │ └──────────────────┘
                      └──────────────┘ └─────────┘
```

## Estrutura de pastas

```
src/          API NestJS
  modules/    um módulo por domínio: copilot, ai-gateway, audit, documents, lgpd…
  shared/     contratos Zod (@contracts), cifra, guards, interceptors
  workers/    crons: cadeia de auditoria, retenção de áudio, alertas de IA
  config/     Prisma, leitura de flags, cifra do texto clínico
prisma/       schema, migrations datadas e seeds
web/          aplicação Next.js 16
tests/        e2e da API (Prisma mockado), integração (Postgres real), fixtures sintéticas
e2e/          Playwright por perfil: médico, compliance e admin
evals/        gabarito clínico, de-identificação, leitura do caso e transcrição
scripts/      ingestão de diretrizes, base oficial, seeds, cartões, demo
docker/       compose local, de produção e da demo; Dockerfiles
docs/         arquitetura, runbook, ADRs, compliance, avaliações e planos
```

## Como rodar localmente

Pré-requisitos: Node.js 22, pnpm 10 (`corepack enable`) e Docker com Compose.

**1. Dependências.** A API e o web têm cada um o seu lockfile.

```bash
pnpm install
(cd web && pnpm install)
```

**2. Variáveis de ambiente.**

```bash
cp .env.example .env
```

Banco e Redis já batem com o compose local. Sem chave de IA, use
`AI_PROVIDER=test` (respostas determinísticas, sem custo) e
`EMBEDDING_PROVIDER=none`. Chave real nunca vai para o Git.

**3. Postgres, Redis e MinIO.**

```bash
docker compose -f docker/docker-compose.yml up -d
```

O script de `docker/postgres/init` cria a role da aplicação, com menor
privilégio.

**4. Migrations e cliente Prisma.** A migration roda com a role dona do banco
(`MIGRATION_DATABASE_URL`); a API usa a role da aplicação (`DATABASE_URL`).

```bash
set -a; . ./.env; set +a
DATABASE_URL="$MIGRATION_DATABASE_URL" pnpm prisma migrate deploy
pnpm prisma generate
```

**5. Dados de exemplo (opcional).**

```bash
pnpm seed:e2e         # um usuário por perfil; credenciais em scripts/seed-e2e-users.ts
pnpm seed:protocols   # protocolos piloto; exige um curador, que o seed:e2e cria
pnpm seed:guidelines  # trechos de diretriz aprovados, sem embedding
```

**6. API e web**, em dois terminais.

```bash
pnpm start:dev                    # API em http://localhost:3000/v1
cd web && pnpm dev --port 3001    # web em http://localhost:3001
```

O `CORS_ORIGIN` do `.env.example` já aceita a porta 3001.

## Comandos principais

Na raiz:

| Comando                     | O que faz                                                                              |
| --------------------------- | -------------------------------------------------------------------------------------- |
| `pnpm test`                 | Testes unitários da API e dos evals (Vitest)                                           |
| `pnpm test:cov`             | Unitários com cobertura; o CI exige o mínimo de `vitest.config.ts`                     |
| `pnpm test:e2e`             | E2E da API com Prisma mockado, sem banco                                               |
| `pnpm test:integration`     | Integração contra Postgres real com migrations (runbook, "Rodar testes de integração") |
| `pnpm e2e:ui`               | Playwright por perfil; exige o build da API e do web (`playwright.config.ts`)          |
| `pnpm lint`                 | ESLint de `src/` e `evals/`, sem aviso                                                 |
| `pnpm typecheck`            | `tsc --noEmit` da API                                                                  |
| `pnpm exec prisma validate` | Valida o schema do Prisma                                                              |
| `pnpm eval:clinical`        | Gabarito clínico ([docs/evals/gabarito-clinico.md](docs/evals/gabarito-clinico.md))    |

Em `web/`:

| Comando                           | O que faz                 |
| --------------------------------- | ------------------------- |
| `pnpm test`                       | Testes do web (Vitest)    |
| `pnpm lint`                       | ESLint do web             |
| `pnpm exec tsc --noEmit`          | Typecheck do web          |
| `node scripts/check-contrast.mjs` | Contraste AA da paleta    |
| `pnpm build`                      | Build de produção do Next |

`pnpm eval:clinical --variant test --judge none` roda sem custo. Com modelo
real, a avaliação custa e usa a mesma cota de IA da produção: combine antes de
rodar.

## Documentação

- [docs/README.md](docs/README.md): índice de toda a documentação.
- [docs/architecture.md](docs/architecture.md): módulos, fluxos, flags e dados.
- [docs/runbook.md](docs/runbook.md): deploy, migrations, flags e logs.
- [docs/decisions/README.md](docs/decisions/README.md): ADRs e status.
- [CONTRIBUTING.md](CONTRIBUTING.md): fluxo de branch, PR, migration, flag e
  dado clínico.
- [SECURITY.md](SECURITY.md): como reportar uma vulnerabilidade.
- [CHANGELOG.md](CHANGELOG.md): o que mudou.

## Licença

Software proprietário. Todos os direitos reservados. Ver [LICENSE](LICENSE).
