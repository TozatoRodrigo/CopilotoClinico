import { Injectable, Inject, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../config/prisma.service';
import { readBooleanFlag } from '../../../config/feature-flag';
import { AiGatewayService } from '../../ai-gateway/ai-gateway.service';
import { AiRefusalError, AiTruncatedError } from '../../ai-gateway/ai-gateway.errors';
import type {
  CompletionUsage,
  StreamCompletionResult,
} from '../../ai-gateway/providers/provider.interface';
import { RetrievalService, type RetrievalResult } from '../retrieval/retrieval.service';
import type { RetrievalCoverage, RetrievedChunk } from '../retrieval/hybrid-search';
import { EncountersService } from '../../encounters/encounters.service';
import { AttachmentsService } from '../../encounters/attachments/attachments.service';
import { AuditService } from '../../audit/audit.service';
import { maskPII } from '../guardrails/pii-filter';
import { scanForInjection, type InjectionScanResult } from '../guardrails/injection-defense';
import {
  buildPrompt,
  attachmentCitationId,
  isAttachmentCitation,
  type BuiltPrompt,
  type EncounterContext,
  type PromptInput,
} from './prompt-builder';
import {
  validateOutput,
  ambiguousSubtypeChunkIds,
  type CopilotOutput,
  type ValidationResult,
} from '../guardrails/output-validator';
import type { AnalyzeInput, RespondInput } from '../schemas/copilot.schemas';
import { calculateInferenceCost } from './model-pricing';
import { COPILOT_OUTPUT_JSON_SCHEMA } from '../schemas/copilot-output.json-schema';
import { preliminaryReasonFor, type ContainmentContext } from './preliminary-containment';
import type { CitationOrigin, PreliminaryReason } from '../../../shared/contracts/clinical';

const DEFAULT_MAX_TURNS = 5;
const RECOMMENDATION_CATEGORY_ORDER = {
  stabilization: 0,
  diagnostic: 1,
  therapeutic: 2,
  verify: 3,
} as const;

export interface RecommendationSource {
  chunkId: string;
  source: string;
  sourceVersion: string;
  sourceText: string;
  sourceUrl: string;
  /**
   * Gravada junto da recomendação (rawOutput/citations) para o rótulo de
   * origem sobreviver a um recarregamento da página — ADR-010 e F4.
   */
  origin: CitationOrigin;
}

export type EnrichedRecommendation = CopilotOutput['recommendations'][number] &
  RecommendationSource & {
    /** F0-C — presente sempre que `preliminary` é true. */
    preliminaryReason?: PreliminaryReason;
  };

export type EnrichedCopilotOutput = Omit<CopilotOutput, 'recommendations'> & {
  recommendations: EnrichedRecommendation[];
};

const CHIEF_COMPLAINT_MAX_LENGTH = 140;

/**
 * RD-E7 — resumo curto exibido como título do caso em Plantão/Casos, no
 * lugar de patientRef. Só chamado no turno 0 (analyze/analyzeStream) — não
 * em continueAnalysis() — para o "título" do caso não mudar a cada resposta
 * de pergunta esclarecedora.
 *
 * KB-006 — NUNCA derivar de `differentials[0].hypothesis`. Um diferencial é,
 * pela definição do próprio system prompt, "um lembrete, não um bloqueador":
 * uma hipótese a manter em mente, não o diagnóstico do caso. Usá-lo como
 * título transformava uma hipótese em identidade do atendimento — foi assim
 * que um provável quadro de cefaleia em salvas virou um caso chamado
 * "Hemorragia intracerebral" na lista, no cabeçalho e no SBAR gerado,
 * ancorando o médico e contaminando o registro médico-legal.
 *
 * Ordem atual, da mais para a menos factual: achado de alarme observado
 * (red flag descreve o que FOI VISTO, não o que se suspeita) → trecho inicial
 * do texto do próprio médico, já redigido (fullyRedacted, sem PII) → `null`
 * (a UI cai de volta para patientRef).
 */
function deriveChiefComplaint(
  output: EnrichedCopilotOutput,
  redactedCaseText: string,
): string | null {
  const source = output.redFlags[0]?.finding ?? firstClause(redactedCaseText);
  if (!source) return null;
  const trimmed = source.trim();
  if (!trimmed) return null;
  return trimmed.length > CHIEF_COMPLAINT_MAX_LENGTH
    ? `${trimmed.slice(0, CHIEF_COMPLAINT_MAX_LENGTH - 1)}…`
    : trimmed;
}

/**
 * Primeira oração do texto clínico, usada como fallback de título. Recebe o
 * texto JÁ redigido pelo pipeline de PII — o título é persistido e exibido em
 * lista, então nunca pode carregar identificador de paciente.
 */
function firstClause(text: string): string | null {
  const clause = text
    .trim()
    .split(/(?<=[.;!?])\s|\n/)[0]
    ?.trim();
  return clause && clause.length > 0 ? clause : null;
}

/**
 * ADR-010 — trechos que podem ser citados: base curada + base oficial do MS.
 * Usado para validar a saída e resolver a fonte de cada citação.
 */
function citableChunks(result: RetrievalResult): RetrievedChunk[] {
  return [...result.chunks, ...result.official.chunks];
}

/**
 * ADR-010 — cobertura mostrada ao médico. Quando só a base oficial achou algo,
 * "nenhuma diretriz cobre este cenário" seria falso: a resposta pode citar um
 * PCDT. Vira `partial` — "confira se a fonte citada trata da mesma
 * apresentação", o aviso certo para uma fonte não revisada. A cobertura que
 * vai para o PROMPT continua sendo a da base curada.
 */
function displayedCoverage(result: RetrievalResult): RetrievalCoverage {
  return result.coverage === 'none' && result.official.chunks.length > 0
    ? 'partial'
    : result.coverage;
}

function toPromptContext(chunk: RetrievedChunk) {
  return {
    chunkId: chunk.id,
    text: chunk.text,
    source: chunk.source,
    sourceVersion: chunk.sourceVersion,
    score: chunk.score,
  };
}

/**
 * Evidência que os três caminhos entregam ao prompt, montada do mesmo jeito:
 * base curada, cobertura (KB-005/KB-006 — 'partial' injeta o aviso de encaixe
 * fraco), base oficial do MS em bloco próprio (ADR-010) e anexos do médico
 * (F4).
 */
function promptEvidence(
  retrievalResult: RetrievalResult,
  attachments: AttachmentForCitation[],
): Pick<PromptInput, 'retrievedChunks' | 'coverage' | 'officialChunks' | 'physicianAttachments'> {
  return {
    retrievedChunks: retrievalResult.chunks.map(toPromptContext),
    coverage: retrievalResult.coverage,
    officialChunks: retrievalResult.official.chunks.map(toPromptContext),
    physicianAttachments: attachments,
  };
}

interface AttachmentForCitation {
  citationId: string;
  filename: string;
  text: string;
}

/**
 * F4 — resolve a fonte de uma citação, seja ela um chunk curado ou um anexo
 * do médico. Centralizado porque os três caminhos do orquestrador (analyze,
 * analyzeStream, continueAnalysis) montam citações da mesma forma.
 */
function resolveCitationSource(
  citationChunkId: string,
  chunks: RetrievedChunk[],
  attachments: AttachmentForCitation[],
): {
  source: string;
  sourceVersion: string;
  text: string;
  institutionId: string | null;
  origin: CitationOrigin;
  sourceUrl: string;
  chunk?: { metadata: Record<string, unknown> };
} {
  if (isAttachmentCitation(citationChunkId)) {
    const attachment = attachments.find((item) => item.citationId === citationChunkId);
    return {
      source: attachment ? `Anexo do médico — ${attachment.filename}` : 'Anexo do médico',
      sourceVersion: 'não curada',
      text: attachment?.text ?? '',
      institutionId: null,
      origin: 'physician_attachment',
      sourceUrl: '',
    };
  }

  const chunk = chunks.find((c) => c.id === citationChunkId);

  // ADR-010 — trecho da base oficial do MS: o link leva ao PDF oficial, não
  // ao endpoint de chunks (que só serve conteúdo curado).
  if (chunk?.metadata.origin === 'official_unreviewed') {
    const documentUrl = chunk.metadata.url;
    return {
      source: chunk.source,
      sourceVersion: chunk.sourceVersion,
      text: chunk.text,
      institutionId: null,
      origin: 'official_unreviewed',
      sourceUrl: typeof documentUrl === 'string' ? documentUrl : '',
      chunk,
    };
  }

  return {
    source: chunk?.source ?? 'Unknown',
    sourceVersion: chunk?.sourceVersion ?? 'Unknown',
    text: chunk?.text ?? '',
    institutionId: chunk?.institutionId ?? null,
    origin: curatedOrigin(chunk),
    sourceUrl: `/v1/guidelines/chunks/${citationChunkId}`,
    chunk,
  };
}

/**
 * ADR-012 — "Diretriz pública" e "Protocolo institucional" o médico lê como
 * conteúdo revisado; só valem para chunk assinado por médico com CRM
 * verificado. Chunk sem assinatura — ou id que não resolve para chunk nenhum
 * — vira `curated_unsigned`. `!clinicallySigned` também cobre resultado de
 * cache gravado antes do campo existir.
 */
function curatedOrigin(chunk: RetrievedChunk | undefined): CitationOrigin {
  if (!chunk?.clinicallySigned) return 'curated_unsigned';
  return chunk.institutionId ? 'institutional' : 'public';
}

export interface OrchestratorResult {
  interactionId: string;
  output: EnrichedCopilotOutput;
  citations: Array<{
    chunkId: string;
    source: string;
    sourceVersion: string;
    text: string;
    institutionId: string | null;
    origin: CitationOrigin;
  }>;
  metadata: {
    piiDetected: boolean;
    injectionDetected: boolean;
    chunksRetrieved: number;
    /**
     * KB-005/KB-006 — o quanto a base cobriu este caso, vindo do piso de
     * relevância. `none` = nenhum chunk passou e a análise seguiu pelo
     * caminho de "declarar a lacuna e perguntar"; `partial` = os chunks
     * entraram com aviso de encaixe fraco. A UI usa isto para dizer ao médico
     * que a base não cobre o cenário, em vez de deixá-lo achar que a ausência
     * de recomendação é indecisão do modelo.
     */
    retrievalCoverage: RetrievalCoverage;
    /** ADR-010 — trechos da base oficial do MS entregues ao modelo. */
    officialChunksRetrieved: number;
    latencyMs: number;
    cost: number;
    model: string;
    /**
     * UX-03 — turno desta interação (0 = análise inicial) e teto configurado
     * de turnos (`COPILOT_MAX_TURNS`). Expostos para o front poder mostrar
     * "Rodada N de M" sem duplicar a constante — a config de verdade
     * continua vivendo só no backend.
     */
    turnIndex: number;
    maxTurns: number;
  };
}

export type StreamEvent =
  | { type: 'delta'; delta: string }
  | { type: 'done'; result: OrchestratorResult }
  | { type: 'error'; errors: string[] };

export interface AnsweredQuestion {
  questionId: string;
  question: string;
  answer: string;
  turnIndex: number;
}

function sortRecommendations<T extends CopilotOutput['recommendations'][number]>(
  recommendations: T[],
): T[] {
  return [...recommendations].sort((left, right) => {
    const categoryDelta =
      RECOMMENDATION_CATEGORY_ORDER[left.category] - RECOMMENDATION_CATEGORY_ORDER[right.category];
    if (categoryDelta !== 0) {
      return categoryDelta;
    }

    return right.confidence - left.confidence;
  });
}

/**
 * LGPD-005: Redação explícita do patientRef no texto clínico.
 *
 * Mesmo após LGPD-001 (patientRef como identificador opaco), o médico pode
 * digitar o valor do patientRef no texto livre do caso clínico. Esta função
 * garante que o valor nunca chegue ao provider de IA, independente da camada
 * de pseudonimização da integração hospitalar.
 *
 * Defense-in-depth: opera APÓS maskPII() para cobrir casos que o filtro
 * geral de PII não captura (ex: identificadores de prontuário específicos).
 */
// S25-QC-01 — patientRef agora é opcional (consulta rápida); o `!patientRef`
// já cobria string vazia e continua cobrindo `null`/`undefined` sem mudança
// de comportamento.
function redactPatientRef(text: string, patientRef: string | null): string {
  if (!patientRef) return text;
  return text.split(patientRef).join('[PATIENT_REF_REDACTED]');
}

interface ChunkMetadata {
  metadata: Record<string, unknown>;
}

function extractEvidenceFromChunk(chunk: ChunkMetadata | undefined): {
  evidenceFigure?: { url: string; caption?: string } | null;
  evidenceTable?: { caption?: string; columns: string[]; rows: string[][] } | null;
} {
  if (!chunk?.metadata) return {};
  const result: {
    evidenceFigure?: { url: string; caption?: string } | null;
    evidenceTable?: { caption?: string; columns: string[]; rows: string[][] } | null;
  } = {};

  const figure = chunk.metadata['evidenceFigure'] as { url?: string; caption?: string } | undefined;
  if (figure?.url) {
    result.evidenceFigure = { url: figure.url, caption: figure.caption };
  }

  const table = chunk.metadata['evidenceTable'] as
    | { caption?: string; columns?: string[]; rows?: string[][] }
    | undefined;
  if (table?.columns && Array.isArray(table.columns) && table.rows && Array.isArray(table.rows)) {
    result.evidenceTable = {
      caption: table.caption,
      columns: table.columns,
      rows: table.rows,
    };
  }

  return result;
}

/** demoCase/redFlags gravados em `params` — e herdados entre turnos (CC-05). */
interface InheritableParams {
  demoCase: string | null;
  redFlags: Record<string, boolean>;
}

/**
 * CC-05 — Extrai demoCase/redFlags do `params` persistido de uma interação
 * anterior, para propagação transitiva entre turnos de reanálise.
 *
 * Sem isto, `continueAnalysis()` (respond) não repassava as red flags que o
 * médico confirmou explicitamente na captura (S20-CLIN-01) — a partir do
 * 2º turno, o prompt esquecia que a paciente era gestante, por exemplo. Como
 * `params` é `Prisma.JsonValue`, o shape é validado defensivamente aqui em
 * vez de um cast cego.
 */
function extractInteractionParams(params: Prisma.JsonValue | null): InheritableParams {
  if (!params || typeof params !== 'object' || Array.isArray(params)) {
    return { demoCase: null, redFlags: {} };
  }

  const record = params as Record<string, unknown>;

  const demoCase = typeof record.demoCase === 'string' ? record.demoCase : null;

  const rawRedFlags = record.redFlags;
  const redFlags: Record<string, boolean> = {};
  if (rawRedFlags && typeof rawRedFlags === 'object' && !Array.isArray(rawRedFlags)) {
    for (const [key, value] of Object.entries(rawRedFlags as Record<string, unknown>)) {
      if (typeof value === 'boolean') {
        redFlags[key] = value;
      }
    }
  }

  return { demoCase, redFlags };
}

type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };

function promptMessages(prompt: BuiltPrompt): ChatMessage[] {
  return [
    { role: 'system', content: prompt.system },
    { role: 'user', content: prompt.user },
  ];
}

/**
 * Feedback do retry de validação. A mensagem do validador entra literalmente:
 * os guardrails são escritos para dizer ao modelo O QUE fazer, não só o que
 * está errado (ver DEAD END em output-validator.ts).
 */
function validationFeedback(errors: string[]): string {
  return (
    `A resposta anterior falhou na validação pelos seguintes motivos: ${errors.join('; ')}. ` +
    'Gere novamente o JSON completo, corrigindo exatamente esses problemas e mantendo o restante da ' +
    'resposta clinicamente equivalente. Responda apenas com o JSON, sem texto adicional.'
  );
}

/**
 * F0-C — custo de UMA chamada ao modelo. Sem `usage` o custo é desconhecido e
 * conta 0 (provider que não informa uso). O pipeline soma tentativa + retry.
 */
function inferenceCostOf(model: string, usage: CompletionUsage | undefined): number {
  return usage ? calculateInferenceCost({ model, usage }) : 0;
}

/** Uma resposta do modelo já validada. */
interface CompletionAttempt {
  content: string;
  model: string;
  /** Custo acumulado das chamadas até aqui (tentativa + retry). */
  cost: number;
  validation: ValidationResult;
  /**
   * F0-B — recusa por política: o fallback do provider já tentou outro
   * modelo, então repetir o mesmo pedido só gasta tempo do plantão.
   */
  retryable: boolean;
}

function failedValidation(errors: string[]): ValidationResult {
  return { valid: false, output: null, errors, unfoundedRecommendations: [] };
}

/**
 * F0-B — truncamento e recusa chegam do gateway como erros tipados. Viram uma
 * tentativa inválida para seguir o caminho de sempre (retry com feedback,
 * falha gravada com `params` para a trilha CFM) em vez de um 500 sem rastro.
 * Qualquer outro erro continua subindo: é falha de infraestrutura.
 */
function providerFailureAttempt(error: unknown, previousCost: number): CompletionAttempt | null {
  if (error instanceof AiTruncatedError) {
    return {
      content: '',
      model: error.details.model,
      cost: previousCost + inferenceCostOf(error.details.model, error.details.usage),
      validation: failedValidation([
        'OUTPUT TRUNCATED: the response hit the output token limit before the JSON was complete. ' +
          'Generate the complete JSON again, more concisely: keep "reasoning" short and every list ' +
          'within its maximum size.',
      ]),
      retryable: true,
    };
  }
  if (error instanceof AiRefusalError) {
    return {
      content: '',
      model: error.details.model,
      cost: previousCost + inferenceCostOf(error.details.model, error.details.usage),
      validation: failedValidation([
        `MODEL REFUSAL: the model declined to analyze this case (category: ${
          error.details.category ?? 'unspecified'
        }).`,
      ]),
      retryable: false,
    };
  }
  return null;
}

/** Turno 0 (analyze/analyzeStream) ou reanálise com respostas (continueAnalysis). */
type AnalysisTurn =
  | { kind: 'initial' }
  | {
      kind: 'follow_up';
      index: number;
      parentInteractionId: string;
      answeredQuestions: AnsweredQuestion[];
    };

function turnIndexOf(turn: AnalysisTurn): number {
  return turn.kind === 'initial' ? 0 : turn.index;
}

/**
 * F0-C — tudo que os três caminhos do orquestrador têm em comum depois de
 * montar o prompt. Antes, cada caminho repetia validação, retry, enriquecimento
 * e persistência — e o streaming, o caminho principal da captura, ficou para
 * trás: sem retry, sem `params`, sem a contenção de fonte não revisada.
 */
interface PreparedAnalysis {
  physicianId: string;
  encounterId: string;
  startedAt: number;
  maxTurns: number;
  /** Texto do caso já redigido (PII + patientRef) gravado em `inputRedacted`. */
  inputRedacted: string;
  piiDetected: boolean;
  retrievalResult: RetrievalResult;
  attachments: AttachmentForCitation[];
  prompt: BuiltPrompt;
  params: InheritableParams;
  unreviewedSourcesPreliminary: boolean;
  turn: AnalysisTurn;
  /** Sufixo dos logs: '' (analyze), ' (stream)' ou ' (respond)'. */
  logLabel: string;
}

type AnalysisOutcome =
  | { valid: true; result: OrchestratorResult }
  | { valid: false; errors: string[] };

@Injectable()
export class OrchestratorService {
  private readonly logger = new Logger(OrchestratorService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AiGatewayService) private readonly aiGateway: AiGatewayService,
    @Inject(RetrievalService) private readonly retrieval: RetrievalService,
    @Inject(AttachmentsService) private readonly attachments: AttachmentsService,
    @Inject(EncountersService) private readonly encounters: EncountersService,
    @Inject(AuditService) private readonly auditService: AuditService,
    @Inject(ConfigService) private readonly config: ConfigService,
  ) {}

  /**
   * F4 — anexos deste atendimento no formato que o prompt espera. O id de
   * citação é derivado do id do anexo (`anexo:<uuid>`), o que permite ao
   * validador de saída e à UI reconhecerem a fonte como não curada.
   */
  private async loadAttachments(encounterId: string): Promise<AttachmentForCitation[]> {
    const attachments = await this.attachments.forPrompt(encounterId);
    return attachments.map((attachment) => ({
      citationId: attachmentCitationId(attachment.id),
      filename: attachment.filename,
      text: attachment.text,
    }));
  }

  /**
   * PI-05 — locale de UI salvo na conta do médico, para instruir o modelo a
   * responder no idioma certo (ver LANGUAGE RULE em prompt-builder.ts).
   * Falha "aberta" para undefined (comportamento pt-BR de sempre) em vez de
   * lançar: a ausência do preceptor no idioma certo nunca deve bloquear a
   * análise clínica.
   */
  private async getPhysicianLocale(physicianId: string): Promise<string | undefined> {
    const physician = await this.prisma.physician.findUnique({
      where: { id: physicianId },
      select: { locale: true },
    });
    return physician?.locale;
  }

  private maxTurns(): number {
    return this.config.get<number>('COPILOT_MAX_TURNS', DEFAULT_MAX_TURNS);
  }

  /**
   * ADR-012 — kill-switch da contenção de fonte não revisada. Ligado por
   * padrão; `UNREVIEWED_SOURCES_PRELIMINARY=false` volta ao comportamento da
   * ADR-010 (prompt incluso) sem redeploy.
   */
  private unreviewedSourcesPreliminary(): boolean {
    return readBooleanFlag(this.config, 'UNREVIEWED_SOURCES_PRELIMINARY', true);
  }

  async analyze(
    physicianId: string,
    encounterId: string,
    input: AnalyzeInput,
  ): Promise<OrchestratorResult> {
    const prepared = await this.prepareInitialAnalysis(physicianId, encounterId, input, '');
    const attempt = await this.completeWithRetry(prepared);
    const outcome = await this.settleAnalysis(prepared, attempt);
    if (!outcome.valid) {
      throw new BadRequestException({
        message: 'AI output validation failed',
        errors: outcome.errors,
      });
    }
    return outcome.result;
  }

  async *analyzeStream(
    physicianId: string,
    encounterId: string,
    input: AnalyzeInput,
  ): AsyncGenerator<StreamEvent> {
    const prepared = await this.prepareInitialAnalysis(
      physicianId,
      encounterId,
      input,
      ' (stream)',
    );

    // F0-B — iteração manual: o valor de retorno do gerador (texto final,
    // modelo, usage) é o que dá o custo real da análise, e `for await` o
    // descartaria.
    const stream: AsyncIterator<string, StreamCompletionResult> = this.aiGateway.completeStream({
      messages: promptMessages(prepared.prompt),
      responseSchema: COPILOT_OUTPUT_JSON_SCHEMA,
    });
    let streamed: CompletionAttempt;
    try {
      let next = await stream.next();
      try {
        while (!next.done) {
          yield { type: 'delta', delta: next.value };
          next = await stream.next();
        }
      } finally {
        // Consumidor saiu antes do fim: fecha o stream para o modelo parar de gerar.
        if (!next.done) await stream.return?.();
      }
      // `content` é o texto autoritativo: após um fallback de recusa no meio do
      // stream, os deltas também trazem o trecho parcial do modelo que recusou.
      const streamedResult = next.value;
      streamed = {
        content: streamedResult.content,
        model: streamedResult.model,
        cost: inferenceCostOf(streamedResult.model, streamedResult.usage),
        validation: this.validate(prepared, streamedResult.content),
        retryable: true,
      };
    } catch (error) {
      const failed = providerFailureAttempt(error, 0);
      if (!failed) throw error;
      streamed = failed;
    }

    // F0-C — o streaming ganha a mesma segunda chance do POST: se o JSON
    // transmitido falha na validação, um retry SEM streaming com o feedback do
    // validador, e o `done` traz o resultado do retry. Os deltas já enviados
    // nunca foram exibidos como conteúdo clínico (use-copilot-stream.ts só os
    // usa como sinal de progresso), então não há o que desfazer na tela.
    const attempt = await this.retryOnceIfInvalid(prepared, streamed);
    const outcome = await this.settleAnalysis(prepared, attempt);

    if (!outcome.valid) {
      yield { type: 'error', errors: outcome.errors };
      return;
    }
    yield { type: 'done', result: outcome.result };
  }

  async continueAnalysis(
    physicianId: string,
    encounterId: string,
    input: RespondInput,
  ): Promise<OrchestratorResult> {
    const startedAt = Date.now();

    const encounter = await this.encounters.findById(physicianId, encounterId);

    const parentInteraction = await this.prisma.aiInteraction.findFirst({
      where: { id: input.interactionId, encounterId },
    });
    if (!parentInteraction) {
      throw new NotFoundException('Interaction not found');
    }

    // CC-05 — herda demoCase/redFlags do turno anterior (propagação transitiva:
    // turno 3 herda o que o turno 2 herdou do turno 1, e assim por diante).
    const inheritedParams = extractInteractionParams(parentInteraction.params);

    const maxTurns = this.maxTurns();
    const newTurnIndex = parentInteraction.turnIndex + 1;
    if (newTurnIndex >= maxTurns) {
      throw new BadRequestException({
        message: `Maximum number of conversation turns (${maxTurns}) reached for this encounter`,
      });
    }
    const forceFinal = newTurnIndex === maxTurns - 1;

    const parentOutput = parentInteraction.rawOutput as unknown as EnrichedCopilotOutput;
    const clarifyingQuestions = parentOutput.clarifyingQuestions ?? [];

    // Camada 1+2: PII mask + redação patientRef nas respostas do médico (LGPD-005)
    const piiResults = input.answers.map((a) => maskPII(String(a.answer)));
    const piiDetected = piiResults.some((r) => r.hasPII);
    const redactedAnswers = piiResults.map((r) =>
      redactPatientRef(r.redacted, encounter.patientRef),
    );

    await this.rejectInjection(
      { physicianId, encounterId, logLabel: ' (respond)' },
      scanForInjection(redactedAnswers.join('\n')),
      {
        piiDetected,
        patientRefRedacted:
          piiResults.map((r) => r.redacted).join('\n') !== redactedAnswers.join('\n'),
        inputLength: input.answers.reduce((sum, a) => sum + String(a.answer).length, 0),
      },
    );

    // DEC-005: registra a submissão de respostas do médico na cadeia de
    // auditoria. Por minimização de dados (LGPD), o conteúdo das respostas
    // nunca é gravado em texto claro — apenas seu hash SHA-256.
    await this.auditService.log({
      actorId: physicianId,
      action: 'COPILOT_QUESTION_ANSWERED',
      entity: 'Encounter',
      entityId: encounterId,
      payload: {
        interactionId: parentInteraction.id,
        turnIndex: newTurnIndex,
        questionIds: input.answers.map((a) => a.questionId),
        answersHash: createHash('sha256').update(JSON.stringify(input.answers)).digest('hex'),
      },
    });

    const newAnswers: AnsweredQuestion[] = input.answers.map((a, index) => {
      const question = clarifyingQuestions.find((q) => q.id === a.questionId);
      return {
        questionId: a.questionId,
        question: question?.question ?? a.questionId,
        answer: redactedAnswers[index] ?? '',
        turnIndex: parentInteraction.turnIndex,
      };
    });

    const previousAnswers =
      (parentInteraction.answeredQuestions as unknown as AnsweredQuestion[] | null) ?? [];
    const allAnsweredQuestions = [...previousAnswers, ...newAnswers];

    const qaBlock = allAnsweredQuestions
      .map((qa) => `P: ${qa.question}\nR: ${qa.answer}`)
      .join('\n\n');

    const baseCaseText = parentInteraction.inputRedacted ?? '';
    const augmentedCaseText = `${baseCaseText}\n\n--- Informações adicionais fornecidas pelo médico ---\n${qaBlock}`;

    const retrievalResult = await this.retrieval.search(
      augmentedCaseText,
      5,
      encounter.institutionId,
    );
    const attachments = await this.loadAttachments(encounterId);
    this.logger.debug(`Retrieved ${retrievalResult.totalRetrieved} chunks (respond)`);

    const encounterContext = (encounter.context as unknown as EncounterContext | null) ?? {
      hasCT: false,
      isSus: false,
      hasLab: false,
      hasICU: false,
    };

    const locale = await this.getPhysicianLocale(physicianId);
    const unreviewedSourcesPreliminary = this.unreviewedSourcesPreliminary();

    const prompt = buildPrompt({
      caseText: augmentedCaseText,
      ...promptEvidence(retrievalResult, attachments),
      context: encounterContext,
      // CC-05 — sem isto, as red flags que o médico confirmou no turno 1
      // (S20-CLIN-01) desapareciam do prompt a partir do turno 2.
      redFlags: inheritedParams.redFlags,
      // PI-05 — instrui o idioma de resposta conforme a conta do médico.
      locale,
      // CC-03 — no turno final, clarifyingQuestions É obrigatoriamente vazio
      // (não há próximo turno para respondê-las), então "recommendations"
      // NUNCA pode ficar vazio aqui, sob pena de violar a Rule 7 (dead end)
      // do system prompt. Mesmo com incerteza remanescente, o modelo deve
      // arriscar ao menos uma recomendação preliminar com a melhor evidência
      // disponível — silêncio não é uma opção neste turno.
      additionalInstructions: forceFinal
        ? 'Este é o último turno permitido para esta análise. NÃO inclua novas clarifyingQuestions (a lista deve ficar vazia). Como não há próximo turno, "recommendations" NÃO PODE ficar vazio: forneça ao menos uma recomendação preliminar com base na melhor evidência e informação disponíveis, mesmo que incompletas. Se ainda houver incerteza sobre a cobertura da diretriz, defina uncertainty=true e descreva uncertaintyReason, mas isso não substitui a obrigação de recomendar algo — declare a incerteza E recomende, não incerteza no lugar de recomendar.'
        : undefined,
      unreviewedSourcesPreliminary,
    });

    const prepared: PreparedAnalysis = {
      physicianId,
      encounterId,
      startedAt,
      maxTurns,
      inputRedacted: baseCaseText,
      piiDetected,
      retrievalResult,
      attachments,
      prompt,
      // CC-05 — repropaga demoCase/redFlags (inclusive em falha de validação)
      // para que o PRÓXIMO turno continue herdando a cadeia de red flags.
      params: inheritedParams,
      unreviewedSourcesPreliminary,
      turn: {
        kind: 'follow_up',
        index: newTurnIndex,
        parentInteractionId: parentInteraction.id,
        answeredQuestions: allAnsweredQuestions,
      },
      logLabel: ' (respond)',
    };

    const attempt = await this.completeWithRetry(prepared);
    const outcome = await this.settleAnalysis(prepared, attempt);
    if (!outcome.valid) {
      throw new BadRequestException({
        message: 'AI output validation failed',
        errors: outcome.errors,
      });
    }
    return outcome.result;
  }

  /**
   * Turno 0, comum a analyze() e analyzeStream(): redação de PII, barreira de
   * injeção, retrieval e prompt.
   */
  private async prepareInitialAnalysis(
    physicianId: string,
    encounterId: string,
    input: AnalyzeInput,
    logLabel: string,
  ): Promise<PreparedAnalysis> {
    const startedAt = Date.now();
    // UX-03 — a análise inicial é sempre o turno 0; maxTurns vem da mesma
    // config que já governa o teto de reanálises em continueAnalysis().
    const maxTurns = this.maxTurns();

    // Buscar encounter para obter patientRef — necessário para redação explícita (LGPD-005)
    const encounter = await this.encounters.findById(physicianId, encounterId);

    // Camada 1: filtro geral de PII (CPF, CNPJ, telefone, email, CEP, datas, RG)
    const piiResult = maskPII(input.caseText);
    this.logger.debug(
      `PII detection${logLabel}: ${piiResult.hasPII ? 'FOUND' : 'NONE'} (${piiResult.detections.length} items)`,
    );

    // Camada 2: redação explícita do patientRef (LGPD-005 defense-in-depth)
    // Garante que o identificador do paciente nunca chegue ao provider de IA,
    // mesmo que o médico o tenha digitado no texto livre do caso clínico.
    const fullyRedacted = redactPatientRef(piiResult.redacted, encounter.patientRef);

    await this.rejectInjection(
      { physicianId, encounterId, logLabel },
      scanForInjection(fullyRedacted),
      {
        piiDetected: piiResult.hasPII,
        patientRefRedacted: piiResult.redacted !== fullyRedacted,
        inputLength: input.caseText.length,
      },
    );

    const retrievalResult = await this.retrieval.search(fullyRedacted, 5, encounter.institutionId);
    // F4 — referências que o médico anexou a este atendimento. Conteúdo não
    // curado: entra no prompt em bloco próprio e é citável só como preliminar.
    const attachments = await this.loadAttachments(encounterId);
    this.logger.debug(`Retrieved ${retrievalResult.totalRetrieved} chunks${logLabel}`);

    // S20-CLIN-01 — red flags marcadas pelo médico na captura: vão para o
    // prompt e para `params` (rastreabilidade CFM, herança entre turnos).
    const params: InheritableParams = {
      demoCase: input.demoCase ?? null,
      redFlags: input.redFlags ?? {},
    };
    const locale = await this.getPhysicianLocale(physicianId);
    const unreviewedSourcesPreliminary = this.unreviewedSourcesPreliminary();

    const prompt = buildPrompt({
      caseText: fullyRedacted,
      ...promptEvidence(retrievalResult, attachments),
      context: {
        hasCT: input.context.hasCT,
        isSus: input.context.isSus,
        hasLab: input.context.hasLab,
        hasICU: input.context.hasICU,
      },
      // S20-CLIN-01 — injeta red flags explícitas do médico no prompt.
      redFlags: params.redFlags,
      // PI-05 — instrui o idioma de resposta conforme a conta do médico.
      locale,
      unreviewedSourcesPreliminary,
    });

    return {
      physicianId,
      encounterId,
      startedAt,
      maxTurns,
      inputRedacted: fullyRedacted,
      piiDetected: piiResult.hasPII,
      retrievalResult,
      attachments,
      prompt,
      params,
      unreviewedSourcesPreliminary,
      turn: { kind: 'initial' },
      logLabel,
    };
  }

  /**
   * Barreira de injeção: audita a tentativa sem gravar o texto clínico (só
   * tamanho e sinais) e recusa a análise antes de qualquer chamada ao modelo.
   */
  private async rejectInjection(
    request: { physicianId: string; encounterId: string; logLabel: string },
    scan: InjectionScanResult,
    evidence: { piiDetected: boolean; patientRefRedacted: boolean; inputLength: number },
  ): Promise<void> {
    if (scan.safe) return;

    this.logger.warn(`Injection detected${request.logLabel}: ${scan.reasons.join(', ')}`);
    await this.auditService.log({
      actorId: request.physicianId,
      action: 'PROMPT_INJECTION_DETECTED',
      entity: 'Encounter',
      entityId: request.encounterId,
      payload: {
        reasons: scan.reasons,
        confidence: scan.confidence,
        ...evidence,
      },
    });
    throw new BadRequestException({
      message: 'Input contains potentially unsafe content',
      reasons: scan.reasons,
    });
  }

  private validate(prepared: PreparedAnalysis, content: string): ValidationResult {
    return validateOutput(
      content,
      prepared.prompt.retrievedChunkIds,
      citableChunks(prepared.retrievalResult),
    );
  }

  private async completeWithRetry(prepared: PreparedAnalysis): Promise<CompletionAttempt> {
    const firstAttempt = await this.requestCompletion(prepared, promptMessages(prepared.prompt), 0);
    return this.retryOnceIfInvalid(prepared, firstAttempt);
  }

  private async requestCompletion(
    prepared: PreparedAnalysis,
    messages: ChatMessage[],
    previousCost: number,
  ): Promise<CompletionAttempt> {
    try {
      const completion = await this.aiGateway.complete({
        messages,
        responseSchema: COPILOT_OUTPUT_JSON_SCHEMA,
      });
      return {
        content: completion.content,
        model: completion.model,
        cost: previousCost + inferenceCostOf(completion.model, completion.usage),
        validation: this.validate(prepared, completion.content),
        retryable: true,
      };
    } catch (error) {
      const failed = providerFailureAttempt(error, previousCost);
      if (!failed) throw error;
      return failed;
    }
  }

  /**
   * Cheaper/weaker models occasionally violate a schema refinement (e.g. a
   * critical red flag paired with a non-preliminary recommendation) despite
   * the instruction being in the prompt. One bounded retry with the exact
   * validation error fed back as feedback resolves most of these without
   * materially changing cost/latency on the (common) first-try-valid path.
   */
  private async retryOnceIfInvalid(
    prepared: PreparedAnalysis,
    attempt: CompletionAttempt,
  ): Promise<CompletionAttempt> {
    if (attempt.validation.valid && attempt.validation.output) return attempt;
    if (!attempt.retryable) return attempt;

    this.logger.warn(
      `Output validation failed on first attempt${prepared.logLabel}, retrying once: ${attempt.validation.errors.join(', ')}`,
    );
    // Resposta vazia (ex.: truncada antes de qualquer texto) não entra como
    // turno do assistente: a API rejeita mensagem de assistente vazia.
    const retryMessages: ChatMessage[] = [
      ...promptMessages(prepared.prompt),
      ...(attempt.content ? [{ role: 'assistant' as const, content: attempt.content }] : []),
      { role: 'user', content: validationFeedback(attempt.validation.errors) },
    ];
    return this.requestCompletion(prepared, retryMessages, attempt.cost);
  }

  /**
   * Persiste a interação (válida ou não) e, se válida, devolve o resultado
   * enriquecido. Falha de validação também é gravada — com `params` — para a
   * trilha CFM reconstruir o que o médico informou mesmo quando a análise não
   * saiu.
   */
  private async settleAnalysis(
    prepared: PreparedAnalysis,
    attempt: CompletionAttempt,
  ): Promise<AnalysisOutcome> {
    const { validation } = attempt;
    if (!validation.valid || !validation.output) {
      this.logger.error(
        `Output validation failed${prepared.logLabel}: ${validation.errors.join(', ')}`,
      );
      await this.prisma.aiInteraction.create({
        data: {
          ...this.interactionRecord(prepared, attempt),
          rawOutput: { raw: attempt.content, validationErrors: validation.errors },
          uncertainty: true,
          uncertaintyReason: 'Output validation failed',
        },
      });
      return { valid: false, errors: validation.errors };
    }

    if (validation.warnings?.length) {
      // Não bloqueia (ver S21-CLIN-01 em output-validator.ts): fica no log para
      // medir com que frequência a evidência traz subtipos de conduta oposta.
      this.logger.warn(
        `OUTPUT_VALIDATION_WARNING${prepared.logLabel}: ${validation.warnings.join(' | ')}`,
      );
    }
    const output = this.enrichOutput(prepared, validation.output);
    const interaction = await this.prisma.aiInteraction.create({
      data: {
        ...this.interactionRecord(prepared, attempt),
        rawOutput: output as unknown as Prisma.InputJsonValue,
        citations: {
          recommendations: output.recommendations,
        } as unknown as Prisma.InputJsonValue,
        uncertainty: output.uncertainty,
        uncertaintyReason: output.uncertaintyReason,
      },
    });

    await this.encounters.update(prepared.physicianId, prepared.encounterId, {
      status: 'in_review',
    });
    await this.recordTurn(prepared, interaction.id, output, attempt.cost);

    const { retrievalResult } = prepared;
    return {
      valid: true,
      result: {
        interactionId: interaction.id,
        output,
        citations: this.buildCitations(prepared, output),
        metadata: {
          piiDetected: prepared.piiDetected,
          // Chegar aqui implica scan limpo: entrada com injeção é recusada
          // antes de qualquer chamada ao modelo (rejectInjection).
          injectionDetected: false,
          chunksRetrieved: retrievalResult.totalRetrieved,
          retrievalCoverage: displayedCoverage(retrievalResult),
          officialChunksRetrieved: retrievalResult.official.chunks.length,
          latencyMs: Date.now() - prepared.startedAt,
          cost: attempt.cost,
          model: attempt.model,
          turnIndex: turnIndexOf(prepared.turn),
          maxTurns: prepared.maxTurns,
        },
      },
    };
  }

  /** Campos de `ai_interactions` comuns à gravação válida e à de falha. */
  private interactionRecord(prepared: PreparedAnalysis, attempt: CompletionAttempt) {
    const { retrievalResult, turn } = prepared;
    return {
      encounterId: prepared.encounterId,
      inputRedacted: prepared.inputRedacted,
      retrievedChunkIds: prepared.prompt.retrievedChunkIds,
      model: attempt.model,
      // S20-CLIN-01 — red flags marcadas pelo médico, para rastreabilidade
      // CFM (qualquer auditoria futura reconstrói quais bandeiras o médico
      // confirmou, independentemente do texto do caso); CC-05 — herdadas
      // pelo próximo turno. KB-005/KB-006 — cobertura persistida para GET
      // /copilot/latest reconstruir o aviso num carregamento fresco de
      // página, sem depender do sessionStorage da sessão ao vivo.
      params: {
        demoCase: prepared.params.demoCase,
        redFlags: prepared.params.redFlags,
        retrievalCoverage: displayedCoverage(retrievalResult),
        officialChunksRetrieved: retrievalResult.official.chunks.length,
      },
      latencyMs: Date.now() - prepared.startedAt,
      cost: attempt.cost,
      ...(turn.kind === 'follow_up'
        ? {
            turnIndex: turn.index,
            parentInteractionId: turn.parentInteractionId,
            answeredQuestions: turn.answeredQuestions as unknown as Prisma.InputJsonValue,
          }
        : {}),
    };
  }

  /**
   * Fontes resolvidas + contenção F0-C: decide `preliminary` e
   * `preliminaryReason` de cada recomendação de forma determinística — ver
   * preliminary-containment.ts.
   */
  private enrichOutput(prepared: PreparedAnalysis, output: CopilotOutput): EnrichedCopilotOutput {
    const chunks = citableChunks(prepared.retrievalResult);
    const containment: ContainmentContext = {
      ambiguousSubtypeChunkIds: ambiguousSubtypeChunkIds(chunks),
      unreviewedSourcesPreliminary: prepared.unreviewedSourcesPreliminary,
      hasClarifyingQuestions: output.clarifyingQuestions.length > 0,
    };

    return {
      ...output,
      recommendations: sortRecommendations(output.recommendations).map((rec) => {
        const resolved = resolveCitationSource(rec.citationChunkId, chunks, prepared.attachments);
        const preliminaryReason = preliminaryReasonFor(
          { ...rec, origin: resolved.origin },
          containment,
        );
        return {
          ...rec,
          preliminary: preliminaryReason !== null,
          ...(preliminaryReason ? { preliminaryReason } : {}),
          chunkId: rec.citationChunkId,
          source: resolved.source,
          sourceVersion: resolved.sourceVersion,
          sourceText: resolved.text,
          sourceUrl: resolved.sourceUrl,
          origin: resolved.origin,
        };
      }),
    };
  }

  private buildCitations(
    prepared: PreparedAnalysis,
    output: EnrichedCopilotOutput,
  ): OrchestratorResult['citations'] {
    const chunks = citableChunks(prepared.retrievalResult);
    return output.recommendations.map((rec) => {
      const resolved = resolveCitationSource(rec.citationChunkId, chunks, prepared.attachments);
      return {
        chunkId: rec.citationChunkId,
        source: resolved.source,
        sourceVersion: resolved.sourceVersion,
        text: resolved.text,
        institutionId: resolved.institutionId,
        origin: resolved.origin,
        ...extractEvidenceFromChunk(resolved.chunk),
      };
    });
  }

  /**
   * Efeitos de fim de turno. Turno 0 fixa o título do caso (RD-E7);
   * reanálise registra COPILOT_ANALYSIS_REFINED (DEC-005) e nunca mexe no
   * título. Os dois registram as perguntas emitidas.
   */
  private async recordTurn(
    prepared: PreparedAnalysis,
    interactionId: string,
    output: EnrichedCopilotOutput,
    cost: number,
  ): Promise<void> {
    const { physicianId, encounterId, turn } = prepared;

    if (turn.kind === 'initial') {
      await this.encounters.updateChiefComplaint(
        encounterId,
        deriveChiefComplaint(output, prepared.inputRedacted),
      );
    } else {
      await this.auditService.log({
        actorId: physicianId,
        action: 'COPILOT_ANALYSIS_REFINED',
        entity: 'Encounter',
        entityId: encounterId,
        payload: {
          interactionId,
          parentInteractionId: turn.parentInteractionId,
          turnIndex: turn.index,
          uncertainty: output.uncertainty,
          cost,
        },
      });
    }

    await this.logQuestionsEmittedIfAny(
      physicianId,
      encounterId,
      interactionId,
      turnIndexOf(turn),
      output.clarifyingQuestions,
    );
  }

  /**
   * DEC-005: registra COPILOT_QUESTIONS_EMITTED na cadeia de auditoria
   * sempre que a análise (inicial ou de um turno subsequente) gera novas
   * perguntas de esclarecimento para o médico.
   */
  private async logQuestionsEmittedIfAny(
    physicianId: string,
    encounterId: string,
    interactionId: string,
    turnIndex: number,
    questions: EnrichedCopilotOutput['clarifyingQuestions'],
  ): Promise<void> {
    if (!questions?.length) return;

    await this.auditService.log({
      actorId: physicianId,
      action: 'COPILOT_QUESTIONS_EMITTED',
      entity: 'Encounter',
      entityId: encounterId,
      payload: {
        interactionId,
        turnIndex,
        questionIds: questions.map((q) => q.id),
      },
    });
  }
}
