import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { PrismaService } from '../../../config/prisma.service';
import {
  CITATION_ORIGINS,
  type CaseConversationResponse,
  type Citation,
  type ConversationTurn,
} from '../../../shared/contracts/clinical';
import { extractRetrievalCoverage } from '../interaction-trace';
import {
  OrchestratorService,
  type OrchestratorResult,
  type StreamEvent,
} from '../orchestrator/orchestrator.service';
import { IntakeService, toIntakeView } from './intake.service';

/** Mesmo default de orchestrator.service.ts (DEFAULT_MAX_TURNS). */
const DEFAULT_MAX_TURNS = 5;

const answeredQuestionsSchema = z.array(
  z.object({
    questionId: z.string(),
    question: z.string(),
    answer: z.string(),
    turnIndex: z.number(),
  }),
);

/**
 * `ai_interactions.citations` guarda as recomendações com a fonte resolvida
 * (`recommendations`) e, desde a ADR-014, a lista de citações como a análise
 * a devolveu (`sources`, com figura e tabela da evidência). Interações
 * anteriores só têm `recommendations`: a lista é refeita delas, uma por
 * trecho citado.
 */
const storedCitationsSchema = z.object({
  sources: z
    .array(
      z.object({
        chunkId: z.string(),
        source: z.string(),
        sourceVersion: z.string(),
        text: z.string(),
        institutionId: z.string().nullable().optional(),
        origin: z.enum(CITATION_ORIGINS).optional(),
        evidenceFigure: z
          .object({ url: z.string(), caption: z.string().optional() })
          .nullable()
          .optional(),
        evidenceTable: z
          .object({
            caption: z.string().optional(),
            columns: z.array(z.string()),
            rows: z.array(z.array(z.string())),
          })
          .nullable()
          .optional(),
      }),
    )
    .optional(),
  recommendations: z.array(
    z.object({
      chunkId: z.string().nullable().optional(),
      source: z.string().optional(),
      sourceVersion: z.string().optional(),
      sourceText: z.string().optional(),
      origin: z.enum(CITATION_ORIGINS).optional(),
    }),
  ),
});

function citationsOf(stored: Prisma.JsonValue | null): Citation[] {
  const parsed = storedCitationsSchema.safeParse(stored);
  if (!parsed.success) return [];
  if (parsed.data.sources) return parsed.data.sources;
  const byChunk = new Map<string, Citation>();
  for (const recommendation of parsed.data.recommendations) {
    const chunkId = recommendation.chunkId;
    if (!chunkId || byChunk.has(chunkId)) continue;
    byChunk.set(chunkId, {
      chunkId,
      source: recommendation.source ?? '',
      sourceVersion: recommendation.sourceVersion ?? '',
      text: recommendation.sourceText ?? '',
      ...(recommendation.origin ? { origin: recommendation.origin } : {}),
    });
  }
  return [...byChunk.values()];
}

const TURN_SELECT = {
  id: true,
  inputRedacted: true,
  rawOutput: true,
  citations: true,
  uncertainty: true,
  uncertaintyReason: true,
  createdAt: true,
  turnIndex: true,
  parentInteractionId: true,
  answeredQuestions: true,
  params: true,
} satisfies Prisma.AiInteractionSelect;

type TurnRow = Prisma.AiInteractionGetPayload<{ select: typeof TURN_SELECT }>;

/** Falha de validação também é gravada (trilha CFM), mas não é plano para mostrar. */
function isValidPlan(row: TurnRow): boolean {
  const output = row.rawOutput;
  return !(
    output &&
    typeof output === 'object' &&
    !Array.isArray(output) &&
    'validationErrors' in output
  );
}

/** Respostas à rodada anterior que geraram esta; as de antes do 1º plano ficam na conversa. */
function answersThatProduced(row: TurnRow): ConversationTurn['answeredQuestions'] {
  if (row.turnIndex === 0) return [];
  const parsed = answeredQuestionsSchema.safeParse(row.answeredQuestions);
  if (!parsed.success) return [];
  return parsed.data
    .filter((answer) => answer.turnIndex === row.turnIndex - 1)
    .map(({ questionId, question, answer }) => ({ questionId, question, answer }));
}

function toTurn(row: TurnRow): ConversationTurn {
  return {
    interactionId: row.id,
    caseText: row.inputRedacted ?? null,
    // Gravado pelo orquestrador no formato da saída enriquecida — o mesmo que
    // GET /copilot/latest devolve.
    output: row.rawOutput as unknown as ConversationTurn['output'],
    citations: citationsOf(row.citations),
    uncertainty: row.uncertainty,
    uncertaintyReason: row.uncertaintyReason,
    createdAt: row.createdAt.toISOString(),
    turnIndex: row.turnIndex,
    retrievalCoverage: extractRetrievalCoverage(row.params),
    answeredQuestions: answersThatProduced(row),
  };
}

/**
 * As rodadas de uma conversa, da primeira à mais recente: sobe pelos pais a
 * partir do plano válido mais recente que descende de `rootId`.
 */
function threadFrom(rows: TurnRow[], rootId: string | null, maxTurns: number): TurnRow[] {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const rootOf = (row: TurnRow): string => {
    let current = row;
    for (let hops = 0; current.parentInteractionId && hops < maxTurns; hops++) {
      const parent = byId.get(current.parentInteractionId);
      if (!parent) break;
      current = parent;
    }
    return current.id;
  };

  const plans = rows.filter(isValidPlan);
  const latest = [...plans].reverse().find((row) => rootId === null || rootOf(row) === rootId);
  if (!latest) return [];

  const thread: TurnRow[] = [latest];
  let current = latest;
  while (current.parentInteractionId && thread.length < maxTurns) {
    const parent = byId.get(current.parentInteractionId);
    if (!parent) break;
    thread.unshift(parent);
    current = parent;
  }
  return thread;
}

/**
 * ADR-014 — a conversa do caso: as perguntas antes do plano (IntakeService)
 * e as rodadas do plano (OrchestratorService), numa linha só.
 */
@Injectable()
export class ConversationService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(IntakeService) private readonly intake: IntakeService,
    @Inject(OrchestratorService) private readonly orchestrator: OrchestratorService,
    @Inject(ConfigService) private readonly config: ConfigService,
  ) {}

  async analyze(
    physicianId: string,
    encounterId: string,
    intakeId: string,
  ): Promise<OrchestratorResult> {
    const { input, attempt } = await this.intake.beginAnalysis(physicianId, encounterId, intakeId);
    try {
      const result = await this.orchestrator.analyzeScreened(physicianId, encounterId, input);
      await this.intake.completeAnalysis(intakeId, result.interactionId);
      return result;
    } catch (error) {
      await this.intake.abandonAnalysis(intakeId, attempt);
      throw error;
    }
  }

  async *stream(
    physicianId: string,
    encounterId: string,
    intakeId: string,
  ): AsyncGenerator<StreamEvent> {
    const { input, attempt } = await this.intake.beginAnalysis(physicianId, encounterId, intakeId);
    let planSaved = false;
    try {
      for await (const event of this.orchestrator.analyzeScreenedStream(
        physicianId,
        encounterId,
        input,
      )) {
        if (event.type === 'done') {
          await this.intake.completeAnalysis(intakeId, event.result.interactionId);
          planSaved = true;
        }
        yield event;
      }
    } finally {
      if (!planSaved) await this.intake.abandonAnalysis(intakeId, attempt);
    }
  }

  async get(physicianId: string, encounterId: string): Promise<CaseConversationResponse> {
    const encounter = await this.prisma.encounter.findFirst({
      where: { id: encounterId, physicianId },
      select: { id: true },
    });
    if (!encounter) throw new NotFoundException('Encounter not found');

    const maxTurns = this.config.get<number>('COPILOT_MAX_TURNS', DEFAULT_MAX_TURNS);
    const [intake, rows] = await Promise.all([
      this.intake.latest(encounterId),
      this.prisma.aiInteraction.findMany({
        where: { encounterId },
        orderBy: { createdAt: 'asc' },
        select: TURN_SELECT,
      }),
    ]);

    // Com conversa, só as rodadas que nasceram dela; sem conversa (caso de
    // antes do Copiloto guiado), a linha de rodadas mais recente.
    const rootId = intake ? intake.analysisInteractionId : null;
    const turns = intake && !rootId ? [] : threadFrom(rows, rootId, maxTurns);

    return {
      intake: intake ? toIntakeView(intake) : null,
      turns: turns.map(toTurn),
      maxTurns,
    };
  }
}
