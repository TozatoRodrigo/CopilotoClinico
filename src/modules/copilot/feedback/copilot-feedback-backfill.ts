import { z } from 'zod';
import type { Prisma, PrismaClient } from '@prisma/client';
import { maskFreeText } from '../guardrails/pii-filter';
import { feedbackKindValues } from '../schemas/copilot.schemas';

/**
 * F0-D — importa para a fila de triagem os reportes que o F7 gravou só na
 * trilha de auditoria (`audit_log`, ação COPILOT_FEEDBACK), antes de existir
 * `copilot_feedback`.
 *
 * Idempotente: cada linha guarda o `audit_log_id` de origem (único), entradas
 * já importadas são puladas e o `createMany` usa `skipDuplicates` — rodar de
 * novo, ou junto com a API gravando reportes novos, não duplica nada.
 *
 * Entradas cuja análise não existe mais (encontro apagado por pedido LGPD) ou
 * cujo payload não bate com a análise ficam de fora e entram no relatório.
 */

const FEEDBACK_AUDIT_ACTION = 'COPILOT_FEEDBACK';
const DEFAULT_BATCH_SIZE = 500;

const uuidSchema = z.string().uuid();

const feedbackAuditPayloadSchema = z.object({
  encounterId: uuidSchema,
  kind: z.enum(feedbackKindValues),
  comment: z.string().nullish(),
});

export interface CopilotFeedbackBackfillReport {
  /** `false` = só contou o que seria importado. */
  applied: boolean;
  scanned: number;
  alreadyImported: number;
  imported: number;
  skippedInvalidPayload: number;
  skippedMissingAnalysis: number;
}

export interface CopilotFeedbackBackfillOptions {
  apply: boolean;
  batchSize?: number;
}

type BackfillPrisma = Pick<PrismaClient, 'auditLog' | 'aiInteraction' | 'copilotFeedback'>;

type FeedbackAuditEntry = {
  id: string;
  actorId: string;
  entityId: string;
  payload: Prisma.JsonValue;
  createdAt: Date;
};

export async function backfillCopilotFeedback(
  prisma: BackfillPrisma,
  options: CopilotFeedbackBackfillOptions,
): Promise<CopilotFeedbackBackfillReport> {
  const batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;
  const report: CopilotFeedbackBackfillReport = {
    applied: options.apply,
    scanned: 0,
    alreadyImported: 0,
    imported: 0,
    skippedInvalidPayload: 0,
    skippedMissingAnalysis: 0,
  };

  let cursor: string | undefined;
  while (true) {
    // createdAt é estritamente crescente na trilha (AuditService.log garante
    // +1 ms em empate), então a ordem do cursor é estável.
    const entries: FeedbackAuditEntry[] = await prisma.auditLog.findMany({
      where: { action: FEEDBACK_AUDIT_ACTION },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: batchSize,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: { id: true, actorId: true, entityId: true, payload: true, createdAt: true },
    });
    if (entries.length === 0) break;
    cursor = entries[entries.length - 1]!.id;
    report.scanned += entries.length;

    const rows = await feedbackRowsFor(prisma, entries, report);
    if (rows.length > 0) {
      report.imported += options.apply
        ? (await prisma.copilotFeedback.createMany({ data: rows, skipDuplicates: true })).count
        : rows.length;
    }

    if (entries.length < batchSize) break;
  }

  return report;
}

async function feedbackRowsFor(
  prisma: BackfillPrisma,
  entries: FeedbackAuditEntry[],
  report: CopilotFeedbackBackfillReport,
): Promise<Prisma.CopilotFeedbackCreateManyInput[]> {
  const imported = await prisma.copilotFeedback.findMany({
    where: { auditLogId: { in: entries.map((entry) => entry.id) } },
    select: { auditLogId: true },
  });
  const importedAuditIds = new Set(imported.map((row) => row.auditLogId));

  const candidates = entries.flatMap((entry) => {
    if (importedAuditIds.has(entry.id)) {
      report.alreadyImported += 1;
      return [];
    }
    const payload = feedbackAuditPayloadSchema.safeParse(entry.payload);
    const idsAreValid =
      uuidSchema.safeParse(entry.entityId).success && uuidSchema.safeParse(entry.actorId).success;
    if (!payload.success || !idsAreValid) {
      report.skippedInvalidPayload += 1;
      return [];
    }
    return [{ entry, payload: payload.data }];
  });
  if (candidates.length === 0) return [];

  const interactions = await prisma.aiInteraction.findMany({
    where: { id: { in: candidates.map(({ entry }) => entry.entityId) } },
    select: { id: true, encounterId: true, encounter: { select: { physicianId: true } } },
  });
  const interactionsById = new Map(
    interactions.map((interaction) => [interaction.id, interaction]),
  );

  return candidates.flatMap(({ entry, payload }) => {
    const interaction = interactionsById.get(entry.entityId);
    const matchesAnalysis =
      interaction?.encounterId === payload.encounterId &&
      interaction.encounter.physicianId === entry.actorId;
    if (!interaction || !matchesAnalysis) {
      report.skippedMissingAnalysis += 1;
      return [];
    }
    return [
      {
        auditLogId: entry.id,
        interactionId: interaction.id,
        encounterId: interaction.encounterId,
        physicianId: entry.actorId,
        kind: payload.kind,
        // Entradas antigas gravaram o comentário sem máscara na trilha; a
        // fila nasce mascarada.
        comment: maskFreeText(payload.comment),
        createdAt: entry.createdAt,
      },
    ];
  });
}
