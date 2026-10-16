import Anthropic from '@anthropic-ai/sdk';
import { BadRequestException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { PrismaService } from '../../src/config/prisma.service';
import { AiRefusalError, AiTruncatedError } from '../../src/modules/ai-gateway/ai-gateway.errors';
import { readChoice } from '../../src/modules/ai-gateway/ai-gateway.settings';
import { claudeCapabilities } from '../../src/modules/ai-gateway/providers/claude-models';
import type {
  OrchestratorResult,
  OrchestratorService,
} from '../../src/modules/copilot/orchestrator/orchestrator.service';
import type { EncountersService } from '../../src/modules/encounters/encounters.service';
import type { ConversationService } from '../../src/modules/copilot/intake/conversation.service';
import type { IntakeService } from '../../src/modules/copilot/intake/intake.service';
import {
  StoredIntakeReadingSchema,
  understandingOf as readingUnderstandingOf,
} from '../../src/modules/copilot/intake/intake-reading.schema';
import { normalize } from '../../src/modules/copilot/guardrails/output-validator';
import type {
  CaseUnderstanding,
  IntakeQuestion,
  IntakeView,
  WebEvidenceItem,
} from '../../src/shared/contracts/clinical';
import { StoredCaseUnderstandingSchema } from '../../src/modules/copilot/understanding/case-understanding.schema';
import type { ClinicalCase, Funnel } from './case.schema';
import type { RunStatus } from './graders/deterministic';
import { costUsd, isSameModel } from './pricing';
import type { CompletionRecorder, RecordedCompletion } from './recorder';
import {
  ResearchTraceSchema,
  WebEvidenceItemSchema,
  type ErrorRow,
  type EvalMode,
  type FailureClass,
  type FunnelExchange,
  type FunnelTurn,
  type IntakeTrace,
  type ResearchTrace,
  type ResultRow,
  type SimulatorCall,
} from './records';
import { NOT_INFORMED, type PhysicianSimulator } from './simulator';
import { DEFAULT_RETRY_POLICY, retryWhile, withTimeout, type RetryPolicy } from './scheduling';

/**
 * F0-A — Uma execução de um caso pelo pipeline real, do jeito que o médico o
 * dispara: atendimento novo + `OrchestratorService.analyze` (turno 0).
 *
 * Gabarito v2 — no modo afunilamento, o turno 0 recebe só a abertura; o
 * médico simulado responde às perguntas e o caso segue por
 * `continueAnalysis`, como quando o médico responde na tela, até não haver
 * pergunta ou até o terceiro turno.
 *
 * CC-106 — o afunilamento entra pela conversa do Copiloto guiado (ADR-014),
 * como a tela: leitura do caso, portão de perguntas e respostas do médico
 * simulado antes do primeiro plano.
 */

/** Turnos do afunilamento: a análise inicial e até duas rodadas de respostas. */
export const MAX_FUNNEL_TURNS = 3;

export const EVAL_PHYSICIAN_EMAIL = 'gabarito-clinico@avaliacao.local';

/**
 * Médico sintético dono de todos os atendimentos da avaliação. Sem
 * instituição: o retrieval enxerga só a base global, igual a um médico sem
 * vínculo. O hash de senha não é bcrypt válido — a conta não faz login.
 */
export async function ensureEvalPhysician(prisma: PrismaService): Promise<string> {
  const physician = await prisma.physician.upsert({
    where: { email: EVAL_PHYSICIAN_EMAIL },
    update: {},
    create: {
      email: EVAL_PHYSICIAN_EMAIL,
      name: 'Avaliação automática (gabarito clínico)',
      crmUf: 'SP',
      crmNumber: '000000',
      passwordHash: '!sem-login',
      locale: 'pt-BR',
    },
    select: { id: true },
  });
  return physician.id;
}

export interface PipelineServices {
  orchestrator: OrchestratorService;
  encounters: EncountersService;
  prisma: PrismaService;
  recorder: CompletionRecorder;
  physicianId: string;
  /**
   * Fallback de recusa da Anthropic ativo para o modelo da variante: uma
   * resposta servida por OUTRO modelo é esperada (é o que o médico recebe em
   * produção) e fica marcada; sem fallback ativo, modelo trocado invalida a
   * execução.
   */
  refusalFallback: boolean;
  /** Só no modo afunilamento. */
  simulator?: PhysicianSimulator;
  /** CC-106 — só no modo afunilamento: a conversa antes do plano (ADR-014). */
  guided?: GuidedServices;
}

export interface GuidedServices {
  intake: IntakeService;
  conversation: ConversationService;
}

/** Mesma decisão do AnthropicProvider: modelo com suporte e AI_REFUSAL_FALLBACK ≠ off. */
export function isRefusalFallbackActive(
  providerName: string,
  model: string,
  config: ConfigService,
): boolean {
  return (
    providerName === 'anthropic' &&
    claudeCapabilities(model).refusalFallback &&
    readChoice(config, 'AI_REFUSAL_FALLBACK', ['default', 'off'] as const, 'default') === 'default'
  );
}

const DEFAULT_CONTEXT = { hasCT: false, isSus: false, hasLab: false, hasICU: false };

type AttemptOutcome =
  | {
      kind: 'answered';
      encounterId: string;
      result: OrchestratorResult;
      retrievedChunkIds: string[];
      /** F1 — o que a pesquisa web fez (`params.research`); `null` quando não rodou. */
      research: ResearchTrace | null;
      completions: RecordedCompletion[];
      wallClockMs: number;
      /** Afunilamento: um item por turno; vazio no caso completo. */
      turns: FunnelTurn[];
      /** CC-106 — afunilamento: a conversa antes do 1º plano. */
      intake: IntakeTrace | null;
    }
  | {
      kind: 'no_answer';
      status: Exclude<RunStatus, 'ok'>;
      encounterId: string;
      interactionId: string | null;
      validationErrors: string[];
      rawContent: string | null;
      /** F1 — o que a Etapa 1 entendeu antes de a análise falhar. */
      understanding: CaseUnderstanding | null;
      /** F1 — evidência e rastro da pesquisa web antes de a análise falhar. */
      webEvidence: WebEvidenceItem[] | null;
      research: ResearchTrace | null;
      retrievedChunkIds: string[];
      completions: RecordedCompletion[];
      wallClockMs: number;
      /** Afunilamento: os turnos respondidos antes do que falhou. */
      turns: FunnelTurn[];
      /** CC-106 — afunilamento: a conversa antes do 1º plano. */
      intake: IntakeTrace | null;
    }
  | {
      kind: 'infra_error';
      failureClass: FailureClass;
      retryable: boolean;
      message: string;
      completions: RecordedCompletion[];
    };

const VALIDATION_FAILED_MESSAGE = 'AI output validation failed';
const UNSAFE_INPUT_MESSAGE = 'Input contains potentially unsafe content';
// Prefixos que a contenção clínica (F0-C) põe em `errors` ao converter os
// erros tipados do gateway em tentativa inválida.
const TRUNCATION_MARKER = 'OUTPUT TRUNCATED';
const REFUSAL_MARKER = 'MODEL REFUSAL';

function badRequestBody(
  error: unknown,
): { message?: unknown; errors?: unknown; reasons?: unknown } | null {
  if (!(error instanceof BadRequestException)) return null;
  const body = error.getResponse();
  return typeof body === 'object' && body !== null ? body : null;
}

/**
 * "AI output validation failed" cobre três desfechos. Com a contenção clínica
 * (F0-C), truncamento e recusa chegam marcados em `errors`; sem ela, o erro
 * tipado sobe direto (tratado em attemptCase). Na falta de marcador, vale o
 * motivo de parada da ÚLTIMA chamada gravada — a que decidiu a falha.
 */
export function noAnswerStatus(
  validationErrors: string[],
  completions: RecordedCompletion[],
): Exclude<RunStatus, 'ok'> {
  const markers = validationErrors.map((error) => error.trimStart());
  if (markers.some((error) => error.startsWith(REFUSAL_MARKER))) return 'refusal';
  if (markers.some((error) => error.startsWith(TRUNCATION_MARKER))) return 'truncated';
  const stopReason = completions.at(-1)?.stopReason;
  if (stopReason === 'refusal') return 'refusal';
  if (stopReason === 'max_tokens') return 'truncated';
  return 'invalid_output';
}

const TRANSIENT_STATUS = (status: number) => status === 429 || status >= 500;

const PROVIDER_STATUS = /AI provider (?:embed )?error: (\d{3})/;
const NETWORK_CODES = new Set([
  'ECONNRESET',
  'ECONNREFUSED',
  'ETIMEDOUT',
  'EAI_AGAIN',
  'ENOTFOUND',
  'EPIPE',
]);

function errorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  const code = 'code' in error ? error.code : undefined;
  if (typeof code === 'string') return code;
  const cause = 'cause' in error ? error.cause : undefined;
  return cause === error ? undefined : errorCode(cause);
}

/** Retry só no que outra tentativa pode resolver: 429, 5xx e rede. */
export function classifyInfraError(error: unknown): {
  failureClass: FailureClass;
  retryable: boolean;
} {
  // Anthropic: erros do SDK oficial (o provider já repete 2x por dentro).
  if (error instanceof Anthropic.APIConnectionError)
    return { failureClass: 'network', retryable: true };
  if (error instanceof Anthropic.APIError && typeof error.status === 'number') {
    const transient = TRANSIENT_STATUS(error.status);
    return {
      failureClass: transient ? 'provider_transient' : 'provider_rejected',
      retryable: transient,
    };
  }

  // OpenAI: o provider lança "AI provider error: <status>".
  const message = error instanceof Error ? error.message : String(error);
  const providerStatus = PROVIDER_STATUS.exec(message)?.[1];
  if (providerStatus) {
    const transient = TRANSIENT_STATUS(Number(providerStatus));
    return {
      failureClass: transient ? 'provider_transient' : 'provider_rejected',
      retryable: transient,
    };
  }

  const code = errorCode(error);
  if (code && /^P1\d{3}$/.test(code)) return { failureClass: 'database', retryable: false };
  if (error instanceof Error && error.name.startsWith('PrismaClient')) {
    return { failureClass: 'database', retryable: false };
  }
  if (
    (code && (NETWORK_CODES.has(code) || code.startsWith('UND_ERR'))) ||
    message === 'fetch failed'
  ) {
    return { failureClass: 'network', retryable: true };
  }
  return { failureClass: 'harness', retryable: false };
}

async function storedFailure(prisma: PrismaService, encounterId: string) {
  return prisma.aiInteraction.findFirst({
    where: { encounterId },
    orderBy: { createdAt: 'desc' },
    select: { id: true, retrievedChunkIds: true, rawOutput: true, params: true },
  });
}

function rawContentOf(rawOutput: unknown): string | null {
  if (typeof rawOutput !== 'object' || rawOutput === null || !('raw' in rawOutput)) return null;
  return typeof rawOutput.raw === 'string' ? rawOutput.raw : null;
}

/** F1 — a falha de validação grava em `rawOutput` o entendimento da Etapa 1. */
function understandingOf(rawOutput: unknown): CaseUnderstanding | null {
  if (typeof rawOutput !== 'object' || rawOutput === null || !('understanding' in rawOutput)) {
    return null;
  }
  const parsed = StoredCaseUnderstandingSchema.safeParse(rawOutput.understanding);
  return parsed.success ? parsed.data : null;
}

/** F1 — a falha de validação grava em `rawOutput` a evidência da pesquisa web. */
function webEvidenceOf(rawOutput: unknown): WebEvidenceItem[] | null {
  if (typeof rawOutput !== 'object' || rawOutput === null || !('webEvidence' in rawOutput)) {
    return null;
  }
  const parsed = WebEvidenceItemSchema.array().safeParse(rawOutput.webEvidence);
  return parsed.success ? parsed.data : null;
}

/** F1 — o orquestrador grava o rastro da pesquisa web em `params.research`. */
function researchTraceOf(params: unknown): ResearchTrace | null {
  if (typeof params !== 'object' || params === null || !('research' in params)) return null;
  const parsed = ResearchTraceSchema.safeParse(params.research);
  return parsed.success ? parsed.data : null;
}

function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

type InfraFailure = Extract<AttemptOutcome, { kind: 'infra_error' }>;

/** Falha que não é desfecho do modelo: filtro de injeção, provedor, rede, banco, harness. */
function infraFailure(error: unknown, completions: RecordedCompletion[]): InfraFailure {
  const body = badRequestBody(error);
  if (body?.message === UNSAFE_INPUT_MESSAGE) {
    return {
      kind: 'infra_error',
      failureClass: 'input_rejected',
      retryable: false,
      message: `O filtro de injeção do pipeline bloqueou o texto do caso: ${stringList(body.reasons).join(', ')}`,
      completions,
    };
  }
  const message = error instanceof Error ? error.message : String(error);
  return { kind: 'infra_error', ...classifyInfraError(error), message, completions };
}

/**
 * Uma chamada ao orquestrador (análise ou resposta às perguntas), com os
 * desfechos classificados. `completions` é do chamador e acumula as chamadas
 * de todos os turnos.
 */
async function invokePipeline(
  services: PipelineServices,
  encounterId: string,
  startedAt: number,
  completions: RecordedCompletion[],
  call: () => Promise<OrchestratorResult>,
): Promise<AttemptOutcome> {
  try {
    const result = await services.recorder.run(completions, call);
    const interaction = await services.prisma.aiInteraction.findUnique({
      where: { id: result.interactionId },
      select: { retrievedChunkIds: true, params: true },
    });
    return {
      kind: 'answered',
      encounterId,
      result,
      retrievedChunkIds: interaction?.retrievedChunkIds ?? [],
      research: researchTraceOf(interaction?.params),
      completions,
      wallClockMs: Date.now() - startedAt,
      turns: [],
      intake: null,
    };
  } catch (error) {
    // Gateway sem a contenção clínica: truncamento e recusa sobem como erro
    // tipado, sem interação persistida.
    if (error instanceof AiTruncatedError || error instanceof AiRefusalError) {
      const stored = await storedFailure(services.prisma, encounterId);
      return {
        kind: 'no_answer',
        status: error instanceof AiRefusalError ? 'refusal' : 'truncated',
        encounterId,
        interactionId: stored?.id ?? null,
        validationErrors: [error.message],
        rawContent: null,
        understanding: understandingOf(stored?.rawOutput),
        webEvidence: webEvidenceOf(stored?.rawOutput),
        research: researchTraceOf(stored?.params),
        retrievedChunkIds: stored?.retrievedChunkIds ?? [],
        completions,
        wallClockMs: Date.now() - startedAt,
        turns: [],
        intake: null,
      };
    }

    const body = badRequestBody(error);
    if (body?.message !== VALIDATION_FAILED_MESSAGE) return infraFailure(error, completions);

    const stored = await storedFailure(services.prisma, encounterId);
    const validationErrors = stringList(body.errors);
    return {
      kind: 'no_answer',
      status: noAnswerStatus(validationErrors, completions),
      encounterId,
      interactionId: stored?.id ?? null,
      validationErrors,
      rawContent: rawContentOf(stored?.rawOutput) ?? completions.at(-1)?.content ?? null,
      understanding: understandingOf(stored?.rawOutput),
      webEvidence: webEvidenceOf(stored?.rawOutput),
      research: researchTraceOf(stored?.params),
      retrievedChunkIds: stored?.retrievedChunkIds ?? [],
      completions,
      wallClockMs: Date.now() - startedAt,
      turns: [],
      intake: null,
    };
  }
}

/** `completions` é do chamador: se o teto de tempo estourar, o que já foi gravado não se perde. */
async function attemptCase(
  services: PipelineServices,
  clinicalCase: ClinicalCase,
  completions: RecordedCompletion[],
  mode: EvalMode,
): Promise<AttemptOutcome> {
  const startedAt = Date.now();
  const context = clinicalCase.input.context ?? DEFAULT_CONTEXT;
  const funnel = mode === 'funnel' ? clinicalCase.input.funnel : undefined;
  const { simulator, guided } = services;
  if (mode === 'funnel' && (!funnel || !simulator || !guided)) {
    return {
      kind: 'infra_error',
      failureClass: 'harness',
      retryable: false,
      message: funnel
        ? 'modo afunilamento sem médico simulado ou sem a conversa do Copiloto guiado configurados'
        : `caso ${clinicalCase.id} não tem input.funnel`,
      completions,
    };
  }

  let encounterId: string;
  try {
    const encounter = await services.encounters.create(services.physicianId, {
      vertical: 'general',
      context,
    });
    encounterId = encounter.id;
  } catch (error) {
    return {
      kind: 'infra_error',
      ...classifyInfraError(error),
      message: String(error),
      completions,
    };
  }

  if (funnel && simulator && guided) {
    return runGuidedFunnel({
      services,
      guided,
      simulator,
      funnel,
      encounterId,
      startedAt,
      completions,
      request: { caseText: funnel.opening, context, redFlags: clinicalCase.input.redFlags },
    });
  }
  return invokePipeline(services, encounterId, startedAt, completions, () =>
    services.orchestrator.analyze(services.physicianId, encounterId, {
      caseText: clinicalCase.input.caseText,
      context,
      redFlags: clinicalCase.input.redFlags,
    }),
  );
}

interface GuidedRun {
  services: PipelineServices;
  guided: GuidedServices;
  simulator: PhysicianSimulator;
  funnel: Funnel;
  encounterId: string;
  startedAt: number;
  completions: RecordedCompletion[];
  request: Parameters<IntakeService['start']>[2];
}

/** Chamada à conversa (leitura, resposta, leitura do banco) com as falhas classificadas como no pipeline. */
async function guidedCall<Value>(
  run: GuidedRun,
  call: () => Promise<Value>,
): Promise<{ kind: 'ok'; value: Value } | InfraFailure> {
  try {
    return { kind: 'ok', value: await run.services.recorder.run(run.completions, call) };
  } catch (error) {
    return infraFailure(error, run.completions);
  }
}

/**
 * CC-106 — afunilamento pelo fluxo da tela do Copiloto guiado (ADR-014): a
 * leitura do caso lê a abertura e o portão decide se pergunta; o médico
 * simulado responde às perguntas, uma por vez, até a conversa fechar; o
 * plano sai da conversa (`ConversationService.analyze`) e segue pelas rodadas
 * de resposta do plano. Com COPILOT_INTAKE=off a conversa vai direto ao
 * plano, como em produção.
 */
async function runGuidedFunnel(run: GuidedRun): Promise<AttemptOutcome> {
  const { services, guided, encounterId, startedAt, completions } = run;
  const started = await guidedCall(run, () =>
    guided.intake.start(services.physicianId, encounterId, run.request),
  );
  if (started.kind !== 'ok') return started;
  const firstQuestionMs = started.value.questions.length > 0 ? Date.now() - startedAt : null;

  const answered = await answerIntakeQuestions(run, started.value);
  if (answered.kind !== 'ok') return answered;
  const intake = await intakeTrace(run, { ...answered.value, firstQuestionMs });
  if (intake.kind !== 'ok') return intake;

  const first = await invokePipeline(services, encounterId, startedAt, completions, () =>
    guided.conversation.analyze(services.physicianId, encounterId, started.value.intakeId),
  );
  const outcome =
    first.kind === 'answered'
      ? await continueFunnel(services, run.funnel, run.simulator, encounterId, startedAt, first)
      : first;
  return outcome.kind === 'infra_error' ? outcome : { ...outcome, intake: intake.value };
}

/** Opção de toque de quem não sabe ("Não sei", "Não examinei"), já sem acento e sem caixa. */
const UNKNOWN_CHOICE = /^nao (sei|examinei|avaliei|medi)\b/;

/**
 * A resposta como o médico a daria na tela. Sem fato no roteiro, vale a
 * opção de quem não sabe ("Não sei", "Não examinei"), quando a pergunta tem:
 * "Não informado." começa pela opção "Não" e encerraria a conversa como
 * resposta urgente quando "Não" é a resposta grave.
 */
function intakeExchange(question: IntakeQuestion, simulated: FunnelExchange | undefined) {
  const exchange = simulated ?? {
    questionId: question.id,
    question: question.question,
    answer: NOT_INFORMED,
    factIds: [],
  };
  if (exchange.answer !== NOT_INFORMED) return exchange;
  const unknown = question.choices.find((choice) => UNKNOWN_CHOICE.test(normalize(choice)));
  return unknown ? { ...exchange, answer: unknown } : exchange;
}

interface AnsweredIntake {
  view: IntakeView;
  exchanges: FunnelExchange[];
  simulator: SimulatorCall | null;
}

/**
 * O médico simulado responde de uma vez às perguntas que a leitura fez — o
 * portão as decide todas antes da primeira — e as respostas entram uma a
 * uma, como na tela, até a conversa fechar (todas respondidas ou resposta
 * urgente).
 */
async function answerIntakeQuestions(
  run: GuidedRun,
  view: IntakeView,
): Promise<{ kind: 'ok'; value: AnsweredIntake } | InfraFailure> {
  if (view.status !== 'asking' || view.questions.length === 0) {
    return { kind: 'ok', value: { view, exchanges: [], simulator: null } };
  }

  let simulated;
  try {
    simulated = await run.simulator.answer(
      run.funnel,
      view.questions.map((question) => ({
        id: question.id,
        question: question.question,
        choices: question.choices,
      })),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      kind: 'infra_error',
      ...classifyInfraError(error),
      message: `médico simulado: ${message}`,
      completions: run.completions,
    };
  }

  let current = view;
  const exchanges: FunnelExchange[] = [];
  for (const question of view.questions) {
    if (current.status !== 'asking') break;
    const exchange = intakeExchange(
      question,
      simulated.exchanges.find((candidate) => candidate.questionId === question.id),
    );
    const posted = await guidedCall(run, () =>
      run.guided.intake.answer(run.services.physicianId, run.encounterId, view.intakeId, {
        questionId: question.id,
        answer: exchange.answer,
        channel: 'text',
      }),
    );
    if (posted.kind !== 'ok') return posted;
    exchanges.push(exchange);
    current = posted.value;
  }
  return {
    kind: 'ok',
    value: {
      view: current,
      exchanges,
      simulator: {
        model: simulated.model,
        costUsd: simulated.costUsd,
        latencyMs: simulated.latencyMs,
      },
    },
  };
}

/** O que a conversa gravou da leitura (entendimento, modelo, custo e tempo), lido como a tela lê. */
async function intakeTrace(
  run: GuidedRun,
  answered: AnsweredIntake & { firstQuestionMs: number | null },
): Promise<{ kind: 'ok'; value: IntakeTrace } | InfraFailure> {
  const { view } = answered;
  const stored = await guidedCall(run, () =>
    run.services.prisma.caseIntake.findUnique({
      where: { id: view.intakeId },
      select: { reading: true, readingModel: true, cost: true, latencyMs: true },
    }),
  );
  if (stored.kind !== 'ok') return stored;
  const reading = StoredIntakeReadingSchema.safeParse(stored.value?.reading);
  return {
    kind: 'ok',
    value: {
      intakeId: view.intakeId,
      path: view.path,
      closeReason: view.closeReason,
      understanding: reading.success ? readingUnderstandingOf(reading.data) : null,
      readingModel: stored.value?.readingModel ?? null,
      readingMs: stored.value?.latencyMs ?? 0,
      readingCostUsd: stored.value?.cost ?? 0,
      questions: view.questions.map((question) => ({
        id: question.id,
        question: question.question,
        answerType: question.answerType,
        choices: question.choices,
        separates: question.separates,
        why: question.why,
      })),
      exchanges: answered.exchanges,
      simulator: answered.simulator,
      firstQuestionMs: answered.firstQuestionMs,
    },
  };
}

/**
 * Exames e avaliações que o Copiloto mandou fazer agora: no plantão, o
 * resultado volta ao médico sem que o Copiloto precise perguntar por ele.
 */
function orderedNow(recommendations: OrchestratorResult['output']['recommendations']): string[] {
  return recommendations
    .filter(
      (recommendation) =>
        recommendation.category === 'diagnostic' &&
        (recommendation.layer ? recommendation.layer === 'now' : !recommendation.preliminary),
    )
    .map((recommendation) => recommendation.action);
}

/**
 * Afunilamento: enquanto o Copiloto pergunta ou manda fazer exames e há
 * turno, o médico simulado responde (e devolve os resultados) e o caso é
 * reanalisado. A linha avaliada é o último turno; os anteriores ficam em
 * `turns`.
 */
async function continueFunnel(
  services: PipelineServices,
  funnel: NonNullable<ClinicalCase['input']['funnel']>,
  simulator: PhysicianSimulator,
  encounterId: string,
  startedAt: number,
  first: Extract<AttemptOutcome, { kind: 'answered' }>,
): Promise<AttemptOutcome> {
  const turns: FunnelTurn[] = [];
  let current = first;

  for (;;) {
    const { output, metadata, interactionId } = current.result;
    const turnIndex = metadata.turnIndex;
    const lastTurn = Math.min(MAX_FUNNEL_TURNS, metadata.maxTurns) - 1;
    const questions = output.clarifyingQuestions.map((question) => ({
      id: question.id,
      question: question.question,
    }));
    const orders = orderedNow(output.recommendations);
    const finish = () => {
      turns.push({ turnIndex, output, exchanges: [], simulator: null });
      return { ...current, wallClockMs: Date.now() - startedAt, turns };
    };
    if ((questions.length === 0 && orders.length === 0) || turnIndex >= lastTurn) return finish();

    let simulated;
    try {
      simulated = await simulator.answer(funnel, questions, orders);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        kind: 'infra_error',
        ...classifyInfraError(error),
        message: `médico simulado: ${message}`,
        completions: current.completions,
      };
    }
    // Sem pergunta e sem resultado novo dos pedidos, não há o que reanalisar.
    if (simulated.exchanges.length === 0) return finish();
    turns.push({
      turnIndex,
      output,
      exchanges: simulated.exchanges,
      simulator: {
        model: simulated.model,
        costUsd: simulated.costUsd,
        latencyMs: simulated.latencyMs,
      },
    });

    const next = await invokePipeline(services, encounterId, startedAt, current.completions, () =>
      services.orchestrator.continueAnalysis(services.physicianId, encounterId, {
        interactionId,
        answers: simulated.exchanges.map((exchange) => ({
          questionId: exchange.questionId,
          answer: exchange.answer,
        })),
      }),
    );
    if (next.kind === 'infra_error') return next;
    if (next.kind === 'no_answer') return { ...next, turns };
    current = next;
  }
}

function servedModelMismatch(completions: RecordedCompletion[]): string | null {
  const mismatch = completions.find(
    (completion) =>
      completion.servedModel && !isSameModel(completion.requestedModel, completion.servedModel),
  );
  return mismatch ? `pedido ${mismatch.requestedModel}, servido ${mismatch.servedModel}` : null;
}

function tokenTotals(completions: RecordedCompletion[]) {
  return completions.reduce(
    (totals, completion) => ({
      promptTokens: totals.promptTokens + (completion.usage?.promptTokens ?? 0),
      completionTokens: totals.completionTokens + (completion.usage?.completionTokens ?? 0),
    }),
    { promptTokens: 0, completionTokens: 0 },
  );
}

function computedCost(completions: RecordedCompletion[]): number | null {
  let total = 0;
  for (const completion of completions) {
    if (!completion.usage || !completion.servedModel) continue;
    const cost = costUsd(completion.servedModel, completion.usage);
    if (cost === null) return null;
    total += cost;
  }
  return total;
}

export interface CaseRunKey {
  runId: string;
  variant: string;
  rep: number;
}

export type CaseRunRow = { kind: 'result'; row: ResultRow } | { kind: 'error'; row: ErrorRow };

export interface CaseRunOptions {
  caseTimeoutMs: number;
  mode?: EvalMode;
  retryPolicy?: RetryPolicy;
}

type TimedAttempt =
  | { timedOut: true; completions: RecordedCompletion[] }
  | { timedOut: false; outcome: AttemptOutcome };

export async function runCase(
  services: PipelineServices,
  clinicalCase: ClinicalCase,
  key: CaseRunKey,
  options: CaseRunOptions,
): Promise<CaseRunRow> {
  const startedAt = new Date().toISOString();
  const base = { runId: key.runId, variant: key.variant, caseId: clinicalCase.id, rep: key.rep };

  const { result: attempt, attempts } = await retryWhile<TimedAttempt>(
    async () => {
      const completions: RecordedCompletion[] = [];
      const timed = await withTimeout(
        attemptCase(services, clinicalCase, completions, options.mode ?? 'complete'),
        options.caseTimeoutMs,
      );
      return timed.timedOut
        ? { timedOut: true, completions: [...completions] }
        : { timedOut: false, outcome: timed.value };
    },
    (timed) => !timed.timedOut && timed.outcome.kind === 'infra_error' && timed.outcome.retryable,
    options.retryPolicy ?? DEFAULT_RETRY_POLICY,
  );

  if (attempt.timedOut) {
    return {
      kind: 'error',
      row: {
        ...base,
        failureClass: 'timeout',
        message: `Caso passou do teto de ${options.caseTimeoutMs} ms`,
        harnessAttempts: attempts,
        completions: attempt.completions,
        startedAt,
      },
    };
  }

  const { outcome } = attempt;
  if (outcome.kind === 'infra_error') {
    return {
      kind: 'error',
      row: {
        ...base,
        failureClass: outcome.failureClass,
        message: outcome.message,
        harnessAttempts: attempts,
        completions: [...outcome.completions],
        startedAt,
      },
    };
  }

  const completions = [...outcome.completions];
  const mismatch = servedModelMismatch(completions);
  const servedByFallback = mismatch !== null && services.refusalFallback;
  if (mismatch && !servedByFallback) {
    return {
      kind: 'error',
      row: {
        ...base,
        failureClass: 'served_model_mismatch',
        message: mismatch,
        harnessAttempts: attempts,
        completions,
        startedAt,
      },
    };
  }

  const shared = {
    ...base,
    mode: options.mode ?? 'complete',
    turns: outcome.turns,
    intake: outcome.intake,
    harnessAttempts: attempts,
    servedByFallback,
    encounterId: outcome.encounterId,
    retrievedChunkIds: outcome.retrievedChunkIds,
    completions,
    startedAt,
  };
  const tokens = tokenTotals(completions);

  if (outcome.kind === 'no_answer') {
    return {
      kind: 'result',
      row: {
        ...shared,
        status: outcome.status,
        servedModel: completions.at(-1)?.servedModel ?? null,
        interactionId: outcome.interactionId,
        output: null,
        understanding: outcome.understanding,
        webEvidence: outcome.webEvidence,
        research: outcome.research,
        citations: [],
        metadata: null,
        validationErrors: outcome.validationErrors,
        rawContent: outcome.rawContent,
        latency: { pipelineMs: null, wallClockMs: outcome.wallClockMs },
        cost: { pipelineReportedUsd: null, computedUsd: computedCost(completions), ...tokens },
      },
    };
  }

  const { result } = outcome;
  return {
    kind: 'result',
    row: {
      ...shared,
      status: 'ok',
      servedModel: result.metadata.model,
      interactionId: result.interactionId,
      output: result.output,
      understanding: result.output.understanding ?? null,
      webEvidence: result.output.webEvidence ?? null,
      research: outcome.research,
      citations: result.citations,
      metadata: result.metadata,
      validationErrors: [],
      rawContent: null,
      latency: { pipelineMs: result.metadata.latencyMs, wallClockMs: outcome.wallClockMs },
      cost: {
        pipelineReportedUsd: result.metadata.cost,
        computedUsd: computedCost(completions),
        ...tokens,
      },
    },
  };
}
