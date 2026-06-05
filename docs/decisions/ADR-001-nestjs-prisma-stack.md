# ADR-001: Stack Backend — NestJS + Prisma + PostgreSQL

**Status:** Aceito  
**Data:** 2026-06-05

## Decisão

Backend em NestJS 11 (Fastify adapter) + Prisma 6 + PostgreSQL 16 com extensão pgvector.

## Justificativa

- **NestJS**: DI nativa essencial para injetar AuditService em qualquer módulo sem acoplamento (padrão @Global). Decorators tornam a adição de guards e pipes simples e auditável. TypeScript first-class.
- **Fastify**: ~30% mais rápido que Express. Importante para endpoints de análise clínica onde latência é perceptível ao médico.
- **Prisma**: type-safe elimina uma classe de erros em runtime. Migrations versionadas no repositório — crítico para auditoria regulatória. Schema como fonte única de verdade.
- **PostgreSQL + pgvector**: busca vetorial semântica de diretrizes no mesmo banco relacional elimina a necessidade de um vector store separado (Pinecone, Weaviate, etc.) no R0. Triggers DDL-nível necessários para AUD-001 (append-only) só existem em PostgreSQL com maturidade adequada.
