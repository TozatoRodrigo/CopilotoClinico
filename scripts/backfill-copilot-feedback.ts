/**
 * F0-D — Importa para a fila de triagem (`copilot_feedback`) os reportes de
 * feedback que o F7 gravou só na trilha de auditoria (COPILOT_FEEDBACK).
 *
 * Idempotente (cada linha guarda o audit_log_id de origem, único) — pode
 * rodar de novo sem duplicar. Sem `--apply` só conta o que seria importado.
 *
 * Uso:
 *   pnpm backfill:copilot-feedback            # dry-run: relatório, nada gravado
 *   pnpm backfill:copilot-feedback --apply    # grava
 *
 * Precisa de SELECT em audit_log/ai_interactions/encounters e INSERT em
 * copilot_feedback (a role de runtime `copiloto_app` tem os dois). Confira o
 * host impresso antes de usar `--apply`.
 */
import { parseArgs } from 'util';
import { PrismaClient } from '@prisma/client';
import { backfillCopilotFeedback } from '../src/modules/copilot/feedback/copilot-feedback-backfill';

function databaseHost(): string {
  try {
    const url = new URL(process.env.DATABASE_URL ?? '');
    return `${url.hostname}:${url.port || '5432'}${url.pathname}`;
  } catch {
    return '(DATABASE_URL inválida ou ausente)';
  }
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      apply: { type: 'boolean', default: false },
      'batch-size': { type: 'string' },
    },
  });
  const apply = values.apply ?? false;
  const batchSize = values['batch-size'] ? Number(values['batch-size']) : undefined;

  console.log(`Banco: ${databaseHost()} — ${apply ? 'GRAVANDO' : 'dry-run (use --apply para gravar)'}`);

  const prisma = new PrismaClient();
  try {
    const report = await backfillCopilotFeedback(prisma, { apply, batchSize });
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
