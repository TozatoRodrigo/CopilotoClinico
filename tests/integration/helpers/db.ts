/**
 * Helper para testes de integração que requerem banco de dados real.
 *
 * Testes de integração são executados apenas quando DATABASE_URL está configurada
 * e apontando para um banco de teste acessível. Em CI, um serviço PostgreSQL é
 * provisionado automaticamente (ver .github/workflows/ci.yml, job integration).
 */
import { PrismaClient } from '@prisma/client';

let prismaInstance: PrismaClient | null = null;

export function getTestPrisma(): PrismaClient {
  if (!prismaInstance) {
    prismaInstance = new PrismaClient({
      datasources: {
        db: {
          url: process.env.DATABASE_URL ?? 'postgresql://test:test@localhost:5432/test?schema=public',
        },
      },
      log: [],
    });
  }
  return prismaInstance;
}

export async function connectTestDb(): Promise<PrismaClient> {
  const prisma = getTestPrisma();
  await prisma.$connect();
  return prisma;
}

export async function disconnectTestDb(): Promise<void> {
  if (prismaInstance) {
    await prismaInstance.$disconnect();
    prismaInstance = null;
  }
}

/**
 * Limpa a tabela audit_log entre testes.
 * Usa $executeRawUnsafe com TRUNCATE pois o trigger só bloqueia UPDATE/DELETE — não DDL.
 * Em produção, TRUNCATE é revogado da role da app (ver migration AUD-001).
 */
export async function clearAuditLog(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRawUnsafe('TRUNCATE TABLE audit_log RESTART IDENTITY CASCADE');
}
