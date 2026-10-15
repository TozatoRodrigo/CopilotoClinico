import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { createHash } from 'crypto';
import { z } from 'zod';
import type { CopilotFeedbackKind, CopilotFeedbackStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../../config/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { maskFreeText } from '../guardrails/pii-filter';
import { extractCitedChunkIds, extractRetrievalCoverage } from '../interaction-trace';
import type {
  CopilotFeedbackOutputSummary,
  CopilotFeedbackTriageItem,
  CopilotFeedbackTriagePage,
  EvalCaseDraft,
} from '../../../shared/contracts/clinical';
import type {
  CopilotFeedbackInput,
  ListCopilotFeedbackQuery,
  UpdateCopilotFeedbackTriageInput,
} from '../schemas/copilot.schemas';
import { buildEvalCaseDraft } from './eval-case-draft';

const TRIAGE_SELECT = {
  id: true,
  kind: true,
  comment: true,
  status: true,
  triageNote: true,
  triagedBy: true,
  triagedAt: true,
  createdAt: true,
  encounterId: true,
  physicianId: true,
  interaction: {
    select: {
      id: true,
      model: true,
      turnIndex: true,
      inputRedacted: true,
      retrievedChunkIds: true,
      params: true,
      citations: true,
      rawOutput: true,
      createdAt: true,
    },
  },
} as const satisfies Prisma.CopilotFeedbackSelect;

type TriageRow = Prisma.CopilotFeedbackGetPayload<{ select: typeof TRIAGE_SELECT }>;

/** CC-703 — o que o rascunho de caso do gabarito precisa do reporte e da análise. */
const EVAL_CASE_DRAFT_SELECT = {
  id: true,
  kind: true,
  comment: true,
  createdAt: true,
  encounter: { select: { context: true } },
  interaction: {
    select: {
      model: true,
      turnIndex: true,
      inputRedacted: true,
      answeredQuestions: true,
      params: true,
      rawOutput: true,
    },
  },
} as const satisfies Prisma.CopilotFeedbackSelect;

/**
 * Leitura defensiva do `rawOutput` (JSON gravado sem re-validação): cada
 * campo que faltar vira vazio em vez de derrubar a fila inteira.
 */
const outputSummarySchema = z.object({
  differentials: z.array(z.object({ hypothesis: z.string() })).catch([]),
  recommendations: z
    .array(
      z.object({
        action: z.string(),
        preliminary: z.boolean().catch(false),
        citationChunkId: z.string().nullable().catch(null),
      }),
    )
    .catch([]),
  clarifyingQuestions: z
    .array(z.object({ question: z.string(), criticality: z.string().catch('') }))
    .catch([]),
  uncertainty: z.boolean().catch(false),
});

const EMPTY_OUTPUT_SUMMARY: CopilotFeedbackOutputSummary = {
  mainHypothesis: null,
  recommendations: [],
  questions: [],
  uncertainty: false,
};

function summarizeOutput(rawOutput: Prisma.JsonValue): CopilotFeedbackOutputSummary {
  const parsed = outputSummarySchema.safeParse(rawOutput);
  if (!parsed.success) return EMPTY_OUTPUT_SUMMARY;
  const output = parsed.data;
  return {
    mainHypothesis: output.differentials[0]?.hypothesis ?? null,
    recommendations: output.recommendations.map((rec) => ({
      action: rec.action,
      preliminary: rec.preliminary,
      citationChunkId: rec.citationChunkId,
    })),
    questions: output.clarifyingQuestions.map((q) => ({
      question: q.question,
      criticality: q.criticality,
    })),
    uncertainty: output.uncertainty,
  };
}

function toTriageItem(row: TriageRow): CopilotFeedbackTriageItem {
  return {
    id: row.id,
    kind: row.kind,
    comment: row.comment,
    status: row.status,
    triageNote: row.triageNote,
    triagedBy: row.triagedBy,
    triagedAt: row.triagedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    encounterId: row.encounterId,
    physicianId: row.physicianId,
    interaction: {
      id: row.interaction.id,
      model: row.interaction.model,
      turnIndex: row.interaction.turnIndex,
      inputRedacted: row.interaction.inputRedacted,
      retrievalCoverage: extractRetrievalCoverage(row.interaction.params),
      retrievedChunkIds: row.interaction.retrievedChunkIds,
      citedChunkIds: extractCitedChunkIds(row.interaction.citations),
      output: summarizeOutput(row.interaction.rawOutput),
      createdAt: row.interaction.createdAt.toISOString(),
    },
  };
}

function countsByStatus(
  grouped: Array<{ status: CopilotFeedbackStatus; _count: { _all: number } }>,
): CopilotFeedbackTriagePage['countsByStatus'] {
  const countOf = (status: CopilotFeedbackStatus): number =>
    grouped.find((row) => row.status === status)?._count._all ?? 0;
  return {
    new: countOf('new'),
    triaged: countOf('triaged'),
    converted_to_eval_case: countOf('converted_to_eval_case'),
    dismissed: countOf('dismissed'),
  };
}

function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

/**
 * F7 + F0-D — feedback do médico sobre uma análise e a fila de triagem.
 *
 * Origem: o F7 gravava o reporte só na trilha de auditoria. Sem fila nem
 * estado, ninguém triava — erros clínicos conhecidos continuaram chegando por
 * WhatsApp. Agora cada reporte vira também uma linha em `copilot_feedback`,
 * que a curadoria tria no console (novo → triado / virou caso do gabarito /
 * descartado).
 */
@Injectable()
export class CopilotFeedbackService {
  private readonly logger = new Logger(CopilotFeedbackService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly auditService: AuditService,
  ) {}

  /**
   * Registra o reporte em dois lugares, nesta ordem:
   * 1. trilha de auditoria (COPILOT_FEEDBACK) — registro médico-legal do
   *    atendimento, append-only, com o rastro técnico para reproduzir o caso;
   * 2. fila de triagem (`copilot_feedback`), ligada à entrada da trilha.
   * Se (2) falhar depois de (1), a linha é recuperável pelo backfill
   * idempotente (scripts/backfill-copilot-feedback.ts).
   *
   * O comentário é mascarado ANTES de ir para a trilha: ela não é apagada no
   * pedido de eliminação (LGPD), então PII ali ficaria para sempre.
   */
  async submit(
    physicianId: string,
    encounterId: string,
    input: CopilotFeedbackInput,
  ): Promise<{ recorded: true }> {
    const interaction = await this.prisma.aiInteraction.findFirst({
      where: { id: input.interactionId, encounter: { id: encounterId, physicianId } },
      select: {
        id: true,
        model: true,
        turnIndex: true,
        retrievedChunkIds: true,
        params: true,
        citations: true,
      },
    });

    // Mesmo tratamento de encounter inexistente e de encounter de outro
    // médico: não confirmar a existência de um atendimento alheio.
    if (!interaction) throw new NotFoundException('Analysis not found for this encounter');

    const kind: CopilotFeedbackKind = input.kind;
    const comment = maskFreeText(input.comment);

    const auditEntry = await this.auditService.log({
      actorId: physicianId,
      action: 'COPILOT_FEEDBACK',
      entity: 'AiInteraction',
      entityId: interaction.id,
      payload: {
        encounterId,
        kind,
        comment,
        model: interaction.model,
        turnIndex: interaction.turnIndex,
        retrievedChunkIds: interaction.retrievedChunkIds,
        retrievalCoverage: extractRetrievalCoverage(interaction.params),
        citedChunkIds: extractCitedChunkIds(interaction.citations),
      },
    });

    await this.prisma.copilotFeedback.create({
      data: {
        interactionId: interaction.id,
        encounterId,
        physicianId,
        kind,
        comment,
        auditLogId: auditEntry.id,
      },
      select: { id: true },
    });

    return { recorded: true };
  }

  async listForTriage(query: ListCopilotFeedbackQuery): Promise<CopilotFeedbackTriagePage> {
    const where: Prisma.CopilotFeedbackWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.kind ? { kind: query.kind } : {}),
    };

    const [rows, total, grouped] = await Promise.all([
      this.prisma.copilotFeedback.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: query.limit,
        skip: query.offset,
        select: TRIAGE_SELECT,
      }),
      this.prisma.copilotFeedback.count({ where }),
      this.prisma.copilotFeedback.groupBy({ by: ['status'], _count: { _all: true } }),
    ]);

    return { items: rows.map(toTriageItem), total, countsByStatus: countsByStatus(grouped) };
  }

  /**
   * Muda o status do reporte. Voltar para `new` (reabrir) limpa quem triou;
   * qualquer outro status registra o curador e o momento.
   */
  async updateTriage(
    curatorId: string,
    feedbackId: string,
    input: UpdateCopilotFeedbackTriageInput,
  ): Promise<CopilotFeedbackTriageItem> {
    const current = await this.prisma.copilotFeedback.findUnique({
      where: { id: feedbackId },
      select: { id: true, status: true, triageNote: true },
    });
    if (!current) throw new NotFoundException('Feedback not found');

    const status: CopilotFeedbackStatus = input.status;
    const triageNote =
      input.triageNote === undefined ? current.triageNote : maskFreeText(input.triageNote);
    const reopened = status === 'new';

    const updated = await this.prisma.copilotFeedback.update({
      where: { id: feedbackId },
      data: {
        status,
        triageNote,
        triagedBy: reopened ? null : curatorId,
        triagedAt: reopened ? null : new Date(),
      },
      select: TRIAGE_SELECT,
    });

    await this.auditService.log({
      actorId: curatorId,
      action: 'COPILOT_FEEDBACK_TRIAGED',
      entity: 'CopilotFeedback',
      entityId: feedbackId,
      payload: {
        from: current.status,
        to: status,
        triageNoteHash: triageNote ? sha256(triageNote) : null,
      },
    });

    return toTriageItem(updated);
  }

  /**
   * CC-703 — rascunho do caso do gabarito para o curador baixar e levar ao
   * repositório por PR (a API não escreve em evals/). Sai do sistema com o
   * texto do caso (mascarado), então fica na trilha quem exportou e quando.
   */
  async exportEvalCaseDraft(curatorId: string, feedbackId: string): Promise<EvalCaseDraft> {
    const row = await this.prisma.copilotFeedback.findUnique({
      where: { id: feedbackId },
      select: EVAL_CASE_DRAFT_SELECT,
    });
    if (!row) throw new NotFoundException('Feedback not found');

    const draft = buildEvalCaseDraft({
      feedback: { id: row.id, kind: row.kind, comment: row.comment, createdAt: row.createdAt },
      interaction: row.interaction,
      encounterContext: row.encounter.context,
    });

    await this.auditService.log({
      actorId: curatorId,
      action: 'COPILOT_FEEDBACK_EVAL_CASE_EXPORTED',
      entity: 'CopilotFeedback',
      entityId: feedbackId,
      payload: { draftId: draft.id },
    });
    this.logger.log(`EVAL_CASE_DRAFT_EXPORTED feedbackId=${feedbackId} draftId=${draft.id}`);

    return draft;
  }
}
