/**
 * CC-335/CC-336 — Registra na trilha de auditoria um passo do desligamento
 * do ANY feito fora do Copiloto (Supabase, Netlify, arquivo de envio).
 *
 * Uso:
 *   pnpm any:decommission-log --etapa <etapa> --admin <e-mail de um ADMIN> \
 *     --nota "<o que foi feito>" [--contagens "auth.users=0,public.pageviews=0"]
 *
 * Etapas: arquivo_envio_apagado, redirecionamento_publicado,
 * dados_supabase_apagados (exige --contagens, tudo 0), projeto_netlify_desligado.
 * Checklist e SQL de verificação: docs/any/migracao-e-desligamento.md.
 */
import { parseArgs } from 'util';
import { PrismaClient } from '@prisma/client';
import type { PrismaService } from '../src/config/prisma.service';
import { AuditService } from '../src/modules/audit/audit.service';
import {
  AnyDecommissionRefusedError,
  parseCounts,
  recordAnyDecommissionStep,
  type AnyDecommissionInput,
} from '../src/modules/any-migration/any-decommission-log';

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      etapa: { type: 'string' },
      admin: { type: 'string' },
      nota: { type: 'string' },
      contagens: { type: 'string' },
    },
  });

  let counts: Record<string, number> | undefined;
  if (values.contagens !== undefined) {
    const parsed = parseCounts(values.contagens);
    if (!parsed) throw new AnyDecommissionRefusedError('--contagens no formato tabela=0,tabela=0');
    counts = parsed;
  }

  const prisma = new PrismaClient();
  try {
    const { auditId } = await recordAnyDecommissionStep(
      { prisma, audit: new AuditService(prisma as unknown as PrismaService) },
      {
        step: (values.etapa ?? '') as AnyDecommissionInput['step'],
        adminEmail: values.admin ?? '',
        note: values.nota ?? '',
        counts,
      },
    );
    console.log(`Registrado na trilha: audit_log ${auditId}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof AnyDecommissionRefusedError ? err.message : err);
  process.exit(1);
});
