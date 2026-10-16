import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { CaseIntake, CaseIntakeCloseReason, Prisma } from '@prisma/client';
import { createHash } from 'crypto';
import { PrismaService } from '../../../config/prisma.service';
import { AuditService } from '../../audit/audit.service';
import {
  UNDERSTANDING_CORRECTION_QUESTION_ID,
  type IntakeAnswer,
  type IntakePath,
  type IntakeView,
} from '../../../shared/contracts/clinical';
import { rejectInjection, screenClinicalText } from '../guardrails/clinical-text-screening';
import type { AnalyzeInput } from '../schemas/copilot.schemas';
import { readStoredEncounterContext } from '../../encounters/schemas/encounter-context.schema';
import type { AnsweredQuestion, ScreenedAnalysisInput } from '../orchestrator/orchestrator.service';
import { UnderstandingService } from '../understanding/understanding.service';
import { intakeAnswerText } from './intake-answer-text';
import { isUrgentAnswer } from './intake-urgency';
import { decideIntake, toIntakeQuestion, type IntakeQuestionRecord } from './intake-gate';
import {
  StoredIntakeReadingSchema,
  understandingOf,
  type IntakeReading,
} from './intake-reading.schema';
import { readStoredAnswers, readStoredQuestions, type AnswerIntakeInput } from './intake.schemas';
import {
  INTAKE_ANALYSIS_STALE_MS,
  INTAKE_READING_TIMEOUT_MS,
  readIntakeMode,
} from './intake.settings';

const LOG_LABEL = ' (conversa)';

/** Rótulo da correção do entendimento no bloco "P: … R: …", o mesmo da reanálise. */
const CORRECTION_LABEL = 'Correção do médico ao entendimento';

/**
 * ADR-014 — respostas dadas antes do primeiro plano. O turno 0 é o primeiro
 * plano; o que veio antes dele fica no turno -1.
 */
export const BEFORE_FIRST_PLAN_TURN = -1;

interface ReadingResult {
  path: IntakePath;
  questions: IntakeQuestionRecord[];
  reading: IntakeReading | null;
  model: string | null;
  cost: number;
  latencyMs: number;
}

/** Conversa sem leitura do caso: `COPILOT_INTAKE=off` ou análise pela fila. */
const NO_READING: ReadingResult = {
  path: 'disabled',
  questions: [],
  reading: null,
  model: null,
  cost: 0,
  latencyMs: 0,
};

const READING_TIMED_OUT = Symbol('intake-reading-timed-out');

async function withTimeout<Value>(
  promise: Promise<Value>,
  timeoutMs: number,
): Promise<Value | typeof READING_TIMED_OUT> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<typeof READING_TIMED_OUT>((resolve) => {
    timer = setTimeout(() => resolve(READING_TIMED_OUT), timeoutMs);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

function hashOf(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function readReading(value: Prisma.JsonValue | null): IntakeReading | null {
  if (value === null) return null;
  const parsed = StoredIntakeReadingSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function isAnalysisInProgress(intake: CaseIntake, now: number): boolean {
  if (intake.analysisInteractionId || !intake.analysisStartedAt) return false;
  return now - intake.analysisStartedAt.getTime() < INTAKE_ANALYSIS_STALE_MS;
}

export function toIntakeView(intake: CaseIntake, now = Date.now()): IntakeView {
  const questions = readStoredQuestions(intake.questions);
  const answers = readStoredAnswers(intake.answers);
  const reading = readReading(intake.reading);
  const pending =
    intake.status === 'asking'
      ? questions.find((question) => !answers.some((answer) => answer.questionId === question.id))
      : undefined;

  return {
    intakeId: intake.id,
    path: intake.path,
    status: intake.status,
    closeReason: intake.closeReason,
    caseText: intake.caseTextRedacted,
    summary: reading?.problemRepresentation ?? null,
    instabilityFindings: intake.path === 'unstable' ? (reading?.instability.findings ?? []) : [],
    questions: questions.map(toIntakeQuestion),
    answers,
    pendingQuestionId: pending?.id ?? null,
    analysisInteractionId: intake.analysisInteractionId,
    analysisInProgress: isAnalysisInProgress(intake, now),
    createdAt: intake.createdAt.toISOString(),
  };
}

/**
 * ADR-014 — Copiloto guiado: a conversa antes do primeiro plano.
 *
 * O caso chega, a leitura do caso (UnderstandingService.readForIntake) diz o
 * que falta e o portão (intake-gate.ts) decide se pergunta. Nada aqui
 * bloqueia o plano: leitura que falha ou demora manda o caso direto à
 * análise, e o médico pode pular as perguntas a qualquer momento.
 */
@Injectable()
export class IntakeService {
  private readonly logger = new Logger(IntakeService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(UnderstandingService) private readonly understanding: UnderstandingService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(ConfigService) private readonly config: ConfigService,
  ) {}

  async start(physicianId: string, encounterId: string, input: AnalyzeInput): Promise<IntakeView> {
    const intake = await this.open(physicianId, encounterId, input, (caseText, redFlags) =>
      this.read(caseText, redFlags),
    );
    // Os recursos marcados na captura valem para as reanálises seguintes,
    // que leem o contexto do encontro.
    await this.prisma.encounter.update({
      where: { id: encounterId },
      data: { context: input.context },
      select: { id: true },
    });
    return toIntakeView(intake);
  }

  /**
   * CC-011 — a análise pela fila (`POST .../analyze/async` e o áudio gravado):
   * o caso entra redigido numa conversa, e o job leva só o id dela — nenhum
   * texto clínico no Redis. Ninguém está na tela para responder perguntas:
   * sem leitura do caso, a conversa nasce fechada, como com
   * `COPILOT_INTAKE=off`. O contexto do encontro não muda, como a análise pela
   * fila sempre fez.
   */
  async openForQueue(
    physicianId: string,
    encounterId: string,
    input: AnalyzeInput,
  ): Promise<CaseIntake> {
    return this.open(physicianId, encounterId, input, () => Promise.resolve(NO_READING));
  }

  /** Posse do caso, redação, barreira de injeção, leitura e a conversa gravada. */
  private async open(
    physicianId: string,
    encounterId: string,
    input: AnalyzeInput,
    read: (caseText: string, redFlags: Record<string, boolean>) => Promise<ReadingResult>,
  ): Promise<CaseIntake> {
    const encounter = await this.loadEncounter(physicianId, encounterId);
    const screened = screenClinicalText(input.caseText, encounter.patientRef);
    await rejectInjection(
      { audit: this.audit, logger: this.logger },
      { physicianId, encounterId, logLabel: LOG_LABEL },
      screened.injection,
      {
        piiDetected: screened.piiDetected,
        patientRefRedacted: screened.patientRefRedacted,
        inputLength: input.caseText.length,
      },
    );

    const redFlags = input.redFlags ?? {};
    const reading = await read(screened.redacted, redFlags);
    const asking = reading.path === 'ask';
    const now = new Date();

    const intake = await this.prisma.caseIntake.create({
      data: {
        encounterId,
        physicianId,
        caseTextRedacted: screened.redacted,
        context: input.context,
        redFlags,
        demoCase: input.demoCase ?? null,
        piiDetected: screened.piiDetected,
        path: reading.path,
        status: asking ? 'asking' : 'closed',
        closeReason: asking ? null : 'not_needed',
        closedAt: asking ? null : now,
        reading: reading.reading ?? undefined,
        readingModel: reading.model,
        questions: reading.questions as unknown as Prisma.InputJsonValue,
        answers: [],
        cost: reading.cost,
        latencyMs: reading.latencyMs,
      },
    });

    this.logger.log(
      `INTAKE_STARTED intakeId=${intake.id} path=${reading.path} questions=${reading.questions.length} ` +
        `latencyMs=${reading.latencyMs}`,
    );
    await this.audit.log({
      actorId: physicianId,
      action: 'COPILOT_INTAKE_STARTED',
      entity: 'Encounter',
      entityId: encounterId,
      payload: {
        intakeId: intake.id,
        path: reading.path,
        questionIds: reading.questions.map((question) => question.id),
        readingLatencyMs: reading.latencyMs,
        cost: reading.cost,
      },
    });
    return intake;
  }

  async answer(
    physicianId: string,
    encounterId: string,
    intakeId: string,
    input: AnswerIntakeInput,
  ): Promise<IntakeView> {
    const { intake, patientRef } = await this.loadIntake(physicianId, encounterId, intakeId);
    // Resposta que chega depois de a conversa fechar (toque duplo, rede lenta)
    // não reabre nada: devolve o estado atual.
    if (intake.status !== 'asking') return toIntakeView(intake);

    const questions = readStoredQuestions(intake.questions);
    const answers = readStoredAnswers(intake.answers);
    const isCorrection = input.questionId === UNDERSTANDING_CORRECTION_QUESTION_ID;
    const question = questions.find((candidate) => candidate.id === input.questionId);
    if (!question && !isCorrection) {
      throw new BadRequestException({ message: 'Pergunta não pertence a esta conversa' });
    }
    if (question && answers.some((answer) => answer.questionId === question.id)) {
      return toIntakeView(intake);
    }

    const text = intakeAnswerText(question, input.answer);
    const screened = screenClinicalText(text, patientRef);
    await rejectInjection(
      { audit: this.audit, logger: this.logger },
      { physicianId, encounterId, logLabel: LOG_LABEL },
      screened.injection,
      {
        piiDetected: screened.piiDetected,
        patientRefRedacted: screened.patientRefRedacted,
        inputLength: text.length,
      },
    );

    const answer: IntakeAnswer = {
      questionId: input.questionId,
      question: question?.question ?? CORRECTION_LABEL,
      answer: screened.redacted,
      channel: input.channel,
      answeredAt: new Date().toISOString(),
    };
    const allAnswers = [...answers, answer];
    const closeReason = isUrgentAnswer(question, input.answer, text)
      ? 'urgent_answer'
      : this.closeReasonAfter(questions, allAnswers);

    const { intake: updated, written } = await this.updateIfUnchanged(intake, {
      answers: allAnswers as unknown as Prisma.InputJsonValue,
      piiDetected: intake.piiDetected || screened.piiDetected,
      ...(closeReason ? { status: 'closed', closeReason, closedAt: new Date() } : {}),
    });
    // Outro aparelho gravou antes: esta resposta não entrou, e a trilha não
    // registra o que não aconteceu.
    if (!written) return toIntakeView(updated);

    await this.audit.log({
      actorId: physicianId,
      action: 'COPILOT_INTAKE_ANSWERED',
      entity: 'Encounter',
      entityId: encounterId,
      // Minimização (LGPD): a resposta nunca vai em texto claro, só o hash.
      payload: {
        intakeId,
        questionId: input.questionId,
        channel: input.channel,
        answerHash: hashOf(input.answer),
      },
    });
    if (closeReason) await this.logClosed(physicianId, updated, closeReason, allAnswers.length);
    return toIntakeView(updated);
  }

  async skip(physicianId: string, encounterId: string, intakeId: string): Promise<IntakeView> {
    const { intake } = await this.loadIntake(physicianId, encounterId, intakeId);
    if (intake.status !== 'asking') return toIntakeView(intake);
    const answered = readStoredAnswers(intake.answers).length;
    const { intake: updated, written } = await this.updateIfUnchanged(intake, {
      status: 'closed',
      closeReason: 'skipped',
      closedAt: new Date(),
    });
    if (written) await this.logClosed(physicianId, updated, 'skipped', answered);
    return toIntakeView(updated);
  }

  /**
   * Marca o início do plano e devolve o que a análise precisa, com a marca
   * desta tentativa (`attempt`). Uma conversa gera um plano só: com plano
   * gravado ou outro em andamento, 409 — a tela recarrega a conversa em vez de
   * pedir um plano duplicado.
   */
  async beginAnalysis(
    physicianId: string,
    encounterId: string,
    intakeId: string,
  ): Promise<{ input: ScreenedAnalysisInput; attempt: Date }> {
    let { intake } = await this.loadIntake(physicianId, encounterId, intakeId);
    // Uma resposta gravada noutro aparelho entre a leitura e a trava muda a
    // conversa: relê uma vez para o plano não sair sem ela.
    for (let tries = 0; tries < 2; tries++) {
      if (intake.analysisInteractionId) {
        throw new ConflictException({ message: 'O plano desta conversa já saiu' });
      }
      if (isAnalysisInProgress(intake, Date.now())) {
        throw new ConflictException({ message: 'O plano desta conversa já está sendo montado' });
      }

      const attempt = new Date();
      // Pedir o plano com perguntas abertas é pular as que faltam.
      const skipping = intake.status === 'asking';
      const started = await this.prisma.caseIntake.updateMany({
        where: {
          id: intake.id,
          analysisStartedAt: intake.analysisStartedAt,
          updatedAt: intake.updatedAt,
        },
        data: {
          analysisStartedAt: attempt,
          ...(skipping ? { status: 'closed', closeReason: 'skipped', closedAt: attempt } : {}),
        },
      });
      if (started.count === 1) {
        const answers = readStoredAnswers(intake.answers);
        if (skipping) await this.logClosed(physicianId, intake, 'skipped', answers.length);
        return { input: this.analysisInput(intake, answers), attempt };
      }
      intake = await this.prisma.caseIntake.findUniqueOrThrow({ where: { id: intake.id } });
    }
    throw new ConflictException({ message: 'O plano desta conversa já está sendo montado' });
  }

  /**
   * O primeiro plano que fica pronto é o da conversa; um plano de outra
   * tentativa que termine depois não toma o lugar dele.
   */
  async completeAnalysis(intakeId: string, interactionId: string): Promise<void> {
    const linked = await this.prisma.caseIntake.updateMany({
      where: { id: intakeId, analysisInteractionId: null },
      data: { analysisInteractionId: interactionId },
    });
    if (linked.count === 0) {
      this.logger.warn(
        `INTAKE_ANALYSIS_DUPLICATE intakeId=${intakeId} interactionId=${interactionId}: a conversa já tinha plano`,
      );
    }
  }

  /** O plano desta tentativa falhou: libera a conversa, se outra tentativa não começou depois. */
  async abandonAnalysis(intakeId: string, attempt: Date): Promise<void> {
    await this.prisma.caseIntake.updateMany({
      where: { id: intakeId, analysisStartedAt: attempt },
      data: { analysisStartedAt: null },
    });
  }

  /** A conversa mais recente do caso — a que a tela mostra. */
  async latest(encounterId: string): Promise<CaseIntake | null> {
    return this.prisma.caseIntake.findFirst({
      where: { encounterId },
      orderBy: { createdAt: 'desc' },
    });
  }

  private analysisInput(intake: CaseIntake, answers: IntakeAnswer[]): ScreenedAnalysisInput {
    const reading = readReading(intake.reading);
    return {
      caseText: intake.caseTextRedacted,
      answeredQuestions: answers.map(
        (answer): AnsweredQuestion => ({
          questionId: answer.questionId,
          question: answer.question,
          answer: answer.answer,
          turnIndex: BEFORE_FIRST_PLAN_TURN,
        }),
      ),
      // CC-602 — o local de plantão escolhido na captura segue para o plano.
      context: readStoredEncounterContext(intake.context),
      redFlags: this.readRedFlags(intake.redFlags),
      demoCase: intake.demoCase ?? undefined,
      piiDetected: intake.piiDetected,
      understanding: reading
        ? { value: understandingOf(reading), model: intake.readingModel }
        : null,
    };
  }

  private async read(caseText: string, redFlags: Record<string, boolean>): Promise<ReadingResult> {
    if (readIntakeMode(this.config) === 'off') return NO_READING;

    const startedAt = Date.now();
    const pending = this.understanding.readForIntake({ caseText, redFlags, logLabel: LOG_LABEL });
    const outcome = await withTimeout(pending, INTAKE_READING_TIMEOUT_MS);
    if (outcome === READING_TIMED_OUT) {
      this.logger.warn(
        `INTAKE_READING_TIMEOUT afterMs=${INTAKE_READING_TIMEOUT_MS}: o caso segue direto ao plano`,
      );
      void pending.then((late) =>
        this.logger.warn(
          `INTAKE_READING_LATE latencyMs=${late.latencyMs} cost=${late.cost.toFixed(4)}`,
        ),
      );
      return { ...NO_READING, path: 'reading_failed', latencyMs: Date.now() - startedAt };
    }

    const base = {
      model: outcome.model,
      cost: outcome.cost,
      latencyMs: outcome.latencyMs,
    };
    if (!outcome.reading) {
      return { path: 'reading_failed', questions: [], reading: null, ...base };
    }
    const decision = decideIntake(outcome.reading);
    return { ...decision, reading: outcome.reading, ...base };
  }

  /** `null` enquanto houver pergunta aberta. */
  private closeReasonAfter(
    questions: IntakeQuestionRecord[],
    answers: IntakeAnswer[],
  ): CaseIntakeCloseReason | null {
    const open = questions.some(
      (candidate) => !answers.some((answer) => answer.questionId === candidate.id),
    );
    return open ? null : 'all_answered';
  }

  /**
   * Grava só se ninguém mexeu na conversa desde a leitura (toque duplo em
   * dois aparelhos); senão devolve o estado atual, sem gravar por cima.
   */
  private async updateIfUnchanged(
    intake: CaseIntake,
    data: Prisma.CaseIntakeUpdateManyMutationInput,
  ): Promise<{ intake: CaseIntake; written: boolean }> {
    const result = await this.prisma.caseIntake.updateMany({
      where: { id: intake.id, updatedAt: intake.updatedAt },
      data,
    });
    const current = await this.prisma.caseIntake.findUniqueOrThrow({ where: { id: intake.id } });
    const written = result.count === 1;
    if (!written) {
      this.logger.warn(`INTAKE_CONCURRENT_UPDATE intakeId=${intake.id}: mantido o estado atual`);
    }
    return { intake: current, written };
  }

  private async logClosed(
    physicianId: string,
    intake: CaseIntake,
    closeReason: CaseIntakeCloseReason,
    answered: number,
  ): Promise<void> {
    this.logger.log(
      `INTAKE_CLOSED intakeId=${intake.id} reason=${closeReason} answered=${answered}`,
    );
    await this.audit.log({
      actorId: physicianId,
      action: 'COPILOT_INTAKE_CLOSED',
      entity: 'Encounter',
      entityId: intake.encounterId,
      payload: { intakeId: intake.id, closeReason, answered },
    });
  }

  private async loadEncounter(physicianId: string, encounterId: string) {
    const encounter = await this.prisma.encounter.findUnique({
      where: { id: encounterId },
      select: { physicianId: true, patientRef: true, status: true },
    });
    if (!encounter) throw new NotFoundException('Encounter not found');
    if (encounter.physicianId !== physicianId) throw new ForbiddenException('Access denied');
    if (encounter.status === 'finalized' || encounter.status === 'cancelled') {
      throw new ForbiddenException('Este caso já foi encerrado');
    }
    return encounter;
  }

  private async loadIntake(physicianId: string, encounterId: string, intakeId: string) {
    const encounter = await this.loadEncounter(physicianId, encounterId);
    const intake = await this.prisma.caseIntake.findFirst({ where: { id: intakeId, encounterId } });
    if (!intake) throw new NotFoundException('Conversa não encontrada');
    return { intake, patientRef: encounter.patientRef };
  }

  private readRedFlags(value: Prisma.JsonValue): Record<string, boolean> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return Object.fromEntries(
      Object.entries(value).filter(
        (entry): entry is [string, boolean] => typeof entry[1] === 'boolean',
      ),
    );
  }
}
