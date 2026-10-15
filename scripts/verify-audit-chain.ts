/**
 * ADR-015 — Verifica a cadeia de hash do audit_log fora da API, só leitura.
 *
 * Mesma verificação do cron diário e de POST /v1/audit/verify-chain. Serve
 * para conferir um backup restaurado antes do deploy (aplique as migrations
 * no banco restaurado antes: o verificador lê `hash_version`) e para quem
 * audita a trilha sem acesso à API.
 *
 * Uso:
 *   DATABASE_URL=postgresql://... pnpm verify:audit-chain
 *
 * Sai com código 0 se a cadeia está íntegra e 2 se está rompida. "Legado não
 * verificável" não muda o código de saída — ver docs/runbook.md.
 */
import { PrismaClient } from '@prisma/client';
import { AuditService } from '../src/modules/audit/audit.service';
import type { PrismaService } from '../src/config/prisma.service';

function databaseHost(): string {
  try {
    const url = new URL(process.env.DATABASE_URL ?? '');
    return `${url.hostname}:${url.port || '5432'}${url.pathname}`;
  } catch {
    return '(DATABASE_URL inválida ou ausente)';
  }
}

async function main(): Promise<void> {
  console.log(`Banco: ${databaseHost()} — só leitura`);

  const prisma = new PrismaClient();
  try {
    const result = await new AuditService(prisma as PrismaService).verifyChain();
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = result.valid ? 0 : 2;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
