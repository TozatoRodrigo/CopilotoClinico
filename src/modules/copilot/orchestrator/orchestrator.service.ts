import { Injectable, Inject, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../config/prisma.service';
import { readBooleanFlag } from '../../../config/feature-flag';
import { AiGatewayService } from '../../ai-gateway/ai-gateway.service';
import { currentRequestContext } from '../../../shared/request-context/request-context';
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
  redactPatientRef,
  rejectInjection as rejectInjectionAndAudit,
} from '../guardrails/clinical-text-screening';
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
import { validateOutputV2 } from '../guardrails/output-validator-v2';
import { validateOutputV3 } from '../guardrails/output-validator-v3';
import { findDoseMentions } from '../guardrails/dose-detector';
import type { AnalyzeInput, RespondInput } from '../schemas/copilot.schemas';
import { calculateInferenceCost } from './model-pricing';
import {
  COPILOT_OUTPUT_JSON_SCHEMA,
  COPILOT_OUTPUT_V2_JSON_SCHEMA,
} from '../schemas/copilot-output.json-schema';
import {
  preliminaryReasonFor,
  preliminaryReasonForV2,
  type ContainmentContext,
} from './preliminary-containment';
import {
  UNDERSTANDING_CORRECTION_QUESTION_ID,
  type CaseUnderstanding,
  type CitationOrigin,
  type DecisionPromptVersion,
  type KnowledgeSource,
  type PreliminaryReason,
  type WebEvidenceItem,
} from '../../../shared/contracts/clinical';
import {
  UnderstandingService,
  type UnderstandingOutcome,
} from '../understanding/understanding.service';
import { WebResearchService, type ResearchOutcome } from '../research/web-research.service';
import { isWebEvidenceId } from '../research/web-evidence';
import {
  SourceVerificationService,
  type SourceVerificationOutcome,
} from '../research/source-verification.service';
import { applySourceLinkText, type SourceLink } from '../research/source-links';
import { buildDecisionV2Prompt, type DecisionV2PromptInput } from './decision-prompt-v2';
import { buildDecisionV3Prompt } from './decision-prompt-v3';
import { buildDecisionV4Prompt } from './decision-prompt-v4';
import {
  chooseDecisionModel,
  isStagedDecisionPrompt,
  readDecisionPipeline,
  type DecisionModelChoice,
  type DecisionPipeline,
} from './decision.settings';

const DEFAULT_MAX_TURNS = 5;

/**
 * F1 — rótulo, no bloco de perguntas e respostas, das respostas que não
 * respondem a uma pergunta do Copiloto. Sem ele, o modelo leria o id cru.
 */
const RESERVED_QUESTION_LABELS: Readonly<Record<string, string>> = {
  [UNDERSTANDING_CORRECTION_QUESTION_ID]: 'Correção do médico ao entendimento',
};
const RECOMMENDATION_CATEGORY_ORDER = {
  stabilization: 0,
  diagnostic: 1,
  therapeutic: 2,
  verify: 3,
} as const;

/** F1 — decisão v2: o que fazer agora vem antes do que depende de dado. */
const RECOMMENDATION_LAYER_ORDER = { now: 0, depends: 1 } as const;

/**
 * CC-03 — no último turno não há próxima rodada para responder perguntas:
 * "recommendations" nunca pode ficar vazio. Na v2 e na v3, o que ainda
 * depende de dado vai na camada "depends" em vez de virar recomendação
 * preliminar.
 */
const FINAL_TURN_INSTRUCTIONS_STAGED =
  'Este é o último turno permitido para esta análise. NÃO inclua clarifyingQuestions (a lista deve ficar vazia). Como não há próximo turno, "recommendations" NÃO PODE ficar vazio: dê ao menos uma conduta com a melhor evidência e informação disponíveis. O que ainda depender de dado ausente vai na camada "depends", com esse dado em "dependsOn".';
const FINAL_TURN_INSTRUCTIONS: Record<DecisionPromptVersion, string> = {
  v1: 'Este é o último turno permitido para esta análise. NÃO inclua novas clarifyingQuestions (a lista deve ficar vazia). Como não há próximo turno, "recommendations" NÃO PODE ficar vazio: forneça ao menos uma recomendação preliminar com base na melhor evidência e informação disponíveis, mesmo que incompletas. Se ainda houver incerteza sobre a cobertura da diretriz, defina uncertainty=true e descreva uncertaintyReason, mas isso não substitui a obrigação de recomendar algo — declare a incerteza E recomende, não incerteza no lugar de recomendar.',
  v2: FINAL_TURN_INSTRUCTIONS_STAGED,
  v3: FINAL_TURN_INSTRUCTIONS_STAGED,
  v4: FINAL_TURN_INSTRUCTIONS_STAGED,
};

const STAGED_PROMPT_BUILDERS: Record<
  Exclude<DecisionPromptVersion, 'v1'>,
  (input: DecisionV2PromptInput) => BuiltPrompt
> = {
  v2: buildDecisionV2Prompt,
  v3: buildDecisionV3Prompt,
  v4: buildDecisionV4Prompt,
};

/**
 * F1 — busca não feita (`COPILOT_KNOWLEDGE_SOURCE=model_only|web|verify`):
 * nenhum trecho e nenhuma chamada ao provedor de embedding.
 */
const NO_RETRIEVAL: RetrievalResult = {
  chunks: [],
  totalRetrieved: 0,
  coverage: 'none',
  bestSemanticScore: 0,
  discardedByFloor: 0,
  official: { enabled: false, chunks: [], bestSemanticScore: 0, discardedByFloor: 0 },
};

export interface RecommendationSource {
  /** F1 — `null` em conhecimento geral do modelo (decisão v2): não há trecho citado. */
  chunkId: string | null;
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
  /**
   * F1 — Etapa 1 (ADR-013), gravada em `rawOutput`. Ausente com
   * `COPILOT_REASONING=legacy`; `null` quando a etapa falhou e a análise
   * seguiu pela busca de sempre.
   */
  understanding?: CaseUnderstanding | null;
  /**
   * F1 — trechos da pesquisa web entregues à decisão (`web`) ou achados pela
   * verificação depois dela (`verify`), gravados para auditoria e para o
   * gabarito. Vazio quando a pesquisa falhou e a decisão seguiu só com o
   * conhecimento do modelo.
   */
  webEvidence?: WebEvidenceItem[];
};

const CHIEF_COMPLAINT_MAX_LENGTH = 140;

/**
 * RD-E7 — resumo curto exibido como título do caso em Plantão/Casos, no
 * lugar de patientRef. Só chamado no turno 0 (analyze/analyzeStream) — não
 * na reanálise (continueAnalysis/continueAnalysisStream) — para o "título"
 * do caso não mudar a cada resposta de pergunta esclarecedora.
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
 * do médico. Centralizado porque todos os caminhos do orquestrador (análise
 * inicial e reanálise, com ou sem streaming) montam citações da mesma forma.
 */
interface ResolvedSource {
  source: string;
  sourceVersion: string;
  text: string;
  institutionId: string | null;
  origin: CitationOrigin;
  sourceUrl: string;
  chunk?: { metadata: Record<string, unknown> };
}

/**
 * F1 — conhecimento geral do modelo (decisão v2): nenhuma fonte para mostrar,
 * só o rótulo de origem.
 */
const MODEL_KNOWLEDGE_SOURCE: ResolvedSource = {
  source: 'Conhecimento geral do modelo',
  sourceVersion: '',
  text: '',
  institutionId: null,
  origin: 'model_knowledge',
  sourceUrl: '',
};

function resolveCitationSource(
  citationChunkId: string | null,
  chunks: RetrievedChunk[],
  attachments: AttachmentForCitation[],
  webEvidence: readonly WebEvidenceItem[] = [],
): ResolvedSource {
  if (citationChunkId === null) return MODEL_KNOWLEDGE_SOURCE;

  // F1 — página oficial achada pela pesquisa web: o link leva à página.
  const webItem = isWebEvidenceId(citationChunkId)
    ? webEvidence.find((item) => item.id === citationChunkId)
    : undefined;
  if (webItem) {
    return {
      source: webItem.title ?? webItem.domain,
      sourceVersion: webItem.domain,
      text: webItem.citedText,
      institutionId: null,
      origin: 'web_official',
      sourceUrl: webItem.url,
    };
  }

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
     *
     * F1 — `null` quando a base não foi consultada (`model_only`/`web`).
     */
    retrievalCoverage: RetrievalCoverage | null;
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
    /** F1 — duração da Etapa 1. Só com `COPILOT_REASONING=stages`. */
    understandingLatencyMs?: number;
    /** F1 — fonte de conhecimento e prompt da decisão efetivos neste turno. */
    knowledgeSource: KnowledgeSource;
    decisionPrompt: DecisionPromptVersion;
    /** F1 — duração da pesquisa web. Só quando ela rodou. */
    researchLatencyMs?: number;
  };
}

export type StreamEvent =
  /** F1 — sai antes do primeiro delta, para o médico conferir o entendimento em segundos. */
  | { type: 'understanding'; understanding: CaseUnderstanding }
  | { type: 'delta'; delta: string }
  | { type: 'done'; result: OrchestratorResult }
  | { type: 'error'; errors: string[] };

export interface AnsweredQuestion {
  questionId: string;
  question: string;
  answer: string;
  turnIndex: number;
}

type DecidedRecommendation = CopilotOutput['recommendations'][number];

function compareRecommendations(left: DecidedRecommendation, right: DecidedRecommendation): number {
  // F1 — só v2 e v3 têm camada; na v1 os dois lados são `undefined` e empatam.
  const layerDelta =
    (left.layer ? RECOMMENDATION_LAYER_ORDER[left.layer] : 0) -
    (right.layer ? RECOMMENDATION_LAYER_ORDER[right.layer] : 0);
  if (layerDelta !== 0) {
    return layerDelta;
  }

  const categoryDelta =
    RECOMMENDATION_CATEGORY_ORDER[left.category] - RECOMMENDATION_CATEGORY_ORDER[right.category];
  if (categoryDelta !== 0) {
    return categoryDelta;
  }

  return right.confidence - left.confidence;
}

function sortRecommendations<T extends DecidedRecommendation>(recommendations: T[]): T[] {
  return [...recommendations].sort(compareRecommendations);
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

/**
 * F1 — custo da interação: análise (tentativa + retry) mais a Etapa 1 e a
 * pesquisa web, que também foram pagas mesmo quando falharam.
 */
function analysisCost(
  prepared: { stage: UnderstandingOutcome | null; research: ResearchOutcome | null },
  attempt: { cost: number },
): number {
  return attempt.cost + (prepared.stage?.cost ?? 0) + (prepared.research?.cost ?? 0);
}

/**
 * F1 — achados corrigíveis das decisões v2 e v3 viram aviso na resposta aceita: já
 * tiveram o seu retry e nunca bloqueiam (emenda de 10/10/2026 ao ADR-012).
 */
function acceptCorrectable(validation: ValidationResult): ValidationResult {
  if (!validation.correctable?.length) return validation;
  return {
    ...validation,
    warnings: [...(validation.warnings ?? []), ...validation.correctable],
    correctable: [],
  };
}

function hasCorrectable(validation: ValidationResult): boolean {
  return (validation.correctable?.length ?? 0) > 0;
}

/** F1 — JSON Schema da saída na versão do prompt de decisão (v2 e v3 têm o mesmo contrato). */
function responseSchemaOf(pipeline: DecisionPipeline) {
  return isStagedDecisionPrompt(pipeline.decisionPrompt)
    ? COPILOT_OUTPUT_V2_JSON_SCHEMA
    : COPILOT_OUTPUT_JSON_SCHEMA;
}

/**
 * KB-005/KB-006 — cobertura da base mostrada ao médico. F1 — `null` quando a
 * base não foi consultada: nunca afirmar cobertura que não foi medida.
 */
function coverageOf(prepared: {
  pipeline: DecisionPipeline;
  retrievalResult: RetrievalResult;
}): RetrievalCoverage | null {
  return prepared.pipeline.knowledgeSource === 'internal_kb'
    ? displayedCoverage(prepared.retrievalResult)
    : null;
}

/**
 * F1 — o que a pesquisa web (ou a verificação, em `verify`) fez, para a
 * trilha técnica (`params`).
 */
function researchTrace(research: ResearchOutcome) {
  return {
    model: research.model,
    webSearchRequests: research.usage?.webSearchRequests ?? 0,
    evidenceItems: research.evidence.length,
    latencyMs: research.latencyMs,
    cost: research.cost,
    fallbackReason: research.fallbackReason,
  };
}

const NO_SOURCE_LINKS: ReadonlyMap<number, SourceLink> = new Map();

/**
 * Verificação com fonte (`verify`): a conduta ganha a fonte oficial que a
 * sustenta — origem e campos de fonte iguais aos de uma recomendação que
 * cita `web:N` no modo web, para a UI mostrar o link —, a dose como o trecho
 * a escreve e, quando a fonte diverge, no quê. O rótulo preliminar já veio
 * da contenção com a origem DECIDIDA: a verificação acrescenta fonte, dose e
 * divergência, e nunca tira uma cautela que a decisão já tinha (ex.: dose sem
 * fonte continua `unverified_dose`, com a dose da fonte ao lado).
 */
function withSourceLink(
  recommendation: EnrichedRecommendation,
  link: SourceLink,
  resolved: ResolvedSource,
): EnrichedRecommendation {
  return {
    ...recommendation,
    ...applySourceLinkText(recommendation, link),
    basis: 'source',
    citationChunkId: link.citationId,
    chunkId: link.citationId,
    source: resolved.source,
    sourceVersion: resolved.sourceVersion,
    sourceText: resolved.text,
    sourceUrl: resolved.sourceUrl,
    origin: resolved.origin,
  };
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

/**
 * Turno 0 (analyze/analyzeStream, ou a conversa do Copiloto guiado com as
 * respostas dadas antes do plano) ou reanálise com respostas
 * (continueAnalysis/continueAnalysisStream).
 */
type AnalysisTurn =
  | { kind: 'initial'; answeredQuestions: AnsweredQuestion[] }
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
  /** F1 — prompt da decisão e fonte de conhecimento efetivos neste turno. */
  pipeline: DecisionPipeline;
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
  /**
   * Sufixo dos logs: '' (analyze), ' (stream)', ' (conversa)', ' (conversa
   * stream)', ' (respond)' ou ' (respond stream)'.
   */
  logLabel: string;
  /** F1 — Etapa 1 deste turno; `null` com `COPILOT_REASONING=legacy`. */
  stage: UnderstandingOutcome | null;
  /** Modelo da decisão deste turno, pela gravidade do caso (`chooseDecisionModel`). */
  decisionModel: DecisionModelChoice;
  /**
   * F1 — pesquisa web deste turno; `null` fora de `COPILOT_KNOWLEDGE_SOURCE=web`.
   * Em `verify`, é `null` até a decisão e passa a ser a verificação depois
   * dela (ver `settleAnalysis`): o rastro, o custo e a evidência gravados são
   * os mesmos do modo web.
   */
  research: ResearchOutcome | null;
}

/** F1 — evidência de um turno: busca na base interna e/ou pesquisa web. */
interface GatheredEvidence {
  retrievalResult: RetrievalResult;
  research: ResearchOutcome | null;
}

/** Turno 0 depois da redação de PII e da barreira de injeção. */
interface ScreenedCase {
  startedAt: number;
  maxTurns: number;
  institutionId: string | null;
  /** Texto do caso já redigido (PII + patientRef), gravado em `inputRedacted`. */
  caseText: string;
  /** ADR-014 — perguntas e respostas da conversa antes do plano; vazio sem ela. */
  answeredQuestions: AnsweredQuestion[];
  piiDetected: boolean;
}

/** O que o turno 0 lê do pedido, venha ele da captura ou da conversa do Copiloto guiado. */
type InitialRequest = Pick<AnalyzeInput, 'context' | 'redFlags' | 'demoCase'>;

/**
 * ADR-014 — turno 0 vindo da conversa do Copiloto guiado: o caso e as
 * respostas já passaram pela redação de PII e pela barreira de injeção quando
 * o médico os mandou (intake.service.ts).
 */
export interface ScreenedAnalysisInput extends InitialRequest {
  caseText: string;
  answeredQuestions: AnsweredQuestion[];
  piiDetected: boolean;
  /**
   * Entendimento que a leitura do caso já fez, quando o médico não respondeu
   * nada: a Etapa 1 não roda de novo. Com respostas, ela refaz o entendimento.
   */
  understanding: { value: CaseUnderstanding; model: string | null } | null;
}

const ANSWERED_QUESTIONS_HEADER = '--- Informações adicionais fornecidas pelo médico ---';

/** O caso com o bloco "P: … R: …" das respostas do médico, como a análise o lê. */
function withAnsweredQuestions(caseText: string, answers: readonly AnsweredQuestion[]): string {
  if (answers.length === 0) return caseText;
  const qaBlock = answers.map((qa) => `P: ${qa.question}\nR: ${qa.answer}`).join('\n\n');
  return `${caseText}\n\n${ANSWERED_QUESTIONS_HEADER}\n${qaBlock}`;
}

/**
 * Reanálise depois da interação-pai, do teto de turnos, da redação de PII e
 * da barreira de injeção nas respostas e da auditoria delas.
 */
interface ScreenedFollowUp {
  startedAt: number;
  maxTurns: number;
  /** CC-03 — último turno permitido: a decisão não pode ficar sem conduta. */
  finalTurn: boolean;
  institutionId: string | null;
  context: EncounterContext;
  /** Texto do caso do turno 0, já redigido — o que vai para `inputRedacted`. */
  baseCaseText: string;
  /** Caso + todas as perguntas e respostas acumuladas, já redigidas. */
  augmentedCaseText: string;
  piiDetected: boolean;
  /** CC-05 — demoCase/redFlags herdados do turno anterior. */
  params: InheritableParams;
  turn: Extract<AnalysisTurn, { kind: 'follow_up' }>;
}

type AnalysisOutcome =
  | { valid: true; result: OrchestratorResult }
  | { valid: false; errors: string[] };

@Injectable()
export class OrchestratorService {
  private readonly logger = new Logger(OrchestratorService.name);
  /**
   * Verificação com fonte depois da decisão (`verify`). Montada aqui, e não
   * injetada: depende só do gateway e da config que o orquestrador já recebe,
   * e assim todo contexto que monta o orquestrador — o servidor, o gabarito
   * clínico (evals/, com a sua própria lista de providers) e os testes — tem a
   * verificação sem mudar a sua lista de providers. As chamadas passam pelo
   * mesmo gateway, então o custo aparece onde aparecem as outras.
   */
  private readonly sourceVerification: SourceVerificationService;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AiGatewayService) private readonly aiGateway: AiGatewayService,
    @Inject(RetrievalService) private readonly retrieval: RetrievalService,
    @Inject(AttachmentsService) private readonly attachments: AttachmentsService,
    @Inject(EncountersService) private readonly encounters: EncountersService,
    @Inject(AuditService) private readonly auditService: AuditService,
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(UnderstandingService) private readonly understanding: UnderstandingService,
    @Inject(WebResearchService) private readonly webResearch: WebResearchService,
  ) {
    this.sourceVerification = new SourceVerificationService(aiGateway, config);
  }

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

  /**
   * F1 — flags do turno (raciocínio, prompt da decisão, fonte de
   * conhecimento), lidas uma vez por turno e sem redeploy para voltar.
   */
  private decisionModel(stage: UnderstandingOutcome | null, logLabel: string): DecisionModelChoice {
    const choice = chooseDecisionModel(this.config, stage?.understanding ?? null);
    this.logger.log(
      `DECISION_MODEL${logLabel} route=${choice.route} model=${choice.model ?? 'AI_MODEL'}`,
    );
    return choice;
  }

  private decisionPipeline(logLabel: string): DecisionPipeline {
    const { pipeline, downgrades } = readDecisionPipeline(this.config);
    for (const downgrade of downgrades) {
      this.logger.warn(`DECISION_PIPELINE_DOWNGRADE${logLabel}: ${downgrade}`);
    }
    return pipeline;
  }

  /**
   * F1 — Etapa 1 (ADR-013) com `COPILOT_REASONING=stages`; `null` no
   * `legacy`, e aí nada no turno muda. O resto do pipeline decide pelo `stage`.
   */
  private async understandingStage(
    caseText: string,
    redFlags: Record<string, boolean> | undefined,
    pipeline: DecisionPipeline,
    logLabel: string,
  ): Promise<UnderstandingOutcome | null> {
    if (pipeline.reasoning !== 'stages') return null;
    return this.understanding.understand({ caseText, redFlags, logLabel });
  }

  /**
   * F1 — evidência do turno pela fonte de conhecimento:
   * - `internal_kb`: busca na base (Etapa 2 da ADR-013 com entendimento; a de
   *   sempre, pelo texto do caso, sem ele);
   * - `model_only`: nenhuma busca e nenhuma chamada de embedding;
   * - `web`: pesquisa em fontes oficiais a partir do entendimento; sem
   *   entendimento ou sem resultado, segue como `model_only`;
   * - `verify`: a decisão roda exatamente como em `model_only`; a pesquisa
   *   vem depois dela, para conferir as condutas (`verifySources`).
   */
  private async gatherEvidence(
    caseText: string,
    stage: UnderstandingOutcome | null,
    institutionId: string | null | undefined,
    pipeline: DecisionPipeline,
    logLabel: string,
  ): Promise<GatheredEvidence> {
    if (pipeline.knowledgeSource === 'internal_kb') {
      return {
        retrievalResult: await this.retrieveEvidence(caseText, stage, institutionId, logLabel),
        research: null,
      };
    }
    if (pipeline.knowledgeSource === 'model_only' || pipeline.knowledgeSource === 'verify') {
      return { retrievalResult: NO_RETRIEVAL, research: null };
    }
    if (!stage?.understanding) {
      this.logger.warn(
        `WEB_RESEARCH_FALLBACK${logLabel}: sem entendimento do caso não há o que pesquisar — a decisão segue só com o conhecimento do modelo`,
      );
      return { retrievalResult: NO_RETRIEVAL, research: null };
    }
    const research = await this.webResearch.research({
      understanding: stage.understanding,
      logLabel,
    });
    return { retrievalResult: NO_RETRIEVAL, research };
  }

  /**
   * F1 — Etapa 2 (ADR-013): com entendimento, busca pelas consultas dele;
   * sem (legacy ou etapa que falhou), a busca de sempre pelo texto do caso.
   */
  private async retrieveEvidence(
    caseText: string,
    stage: UnderstandingOutcome | null,
    institutionId: string | null | undefined,
    logLabel: string,
  ): Promise<RetrievalResult> {
    if (stage?.understanding) {
      return this.retrieval.searchMany(stage.understanding.searchQueries, 5, institutionId);
    }
    if (stage) {
      this.logger.warn(
        `UNDERSTANDING_FALLBACK${logLabel}: sem entendimento, busca pelo texto do caso`,
      );
    }
    return this.retrieval.search(caseText, 5, institutionId);
  }

  /** F1 — o prompt da decisão da versão do turno, com a mesma evidência. */
  private buildDecisionPrompt(
    pipeline: DecisionPipeline,
    input: {
      caseText: string;
      evidence: GatheredEvidence;
      attachments: AttachmentForCitation[];
      context: EncounterContext;
      redFlags: Record<string, boolean>;
      locale: string | undefined;
      unreviewedSourcesPreliminary: boolean;
      stage: UnderstandingOutcome | null;
      finalTurn: boolean;
    },
  ): BuiltPrompt {
    const additionalInstructions = input.finalTurn
      ? FINAL_TURN_INSTRUCTIONS[pipeline.decisionPrompt]
      : undefined;
    const understanding = input.stage?.understanding ?? undefined;
    const evidence = promptEvidence(input.evidence.retrievalResult, input.attachments);

    if (isStagedDecisionPrompt(pipeline.decisionPrompt)) {
      // v2, v3 e v4: a mesma mensagem do usuário; só o system prompt muda.
      const buildStaged = STAGED_PROMPT_BUILDERS[pipeline.decisionPrompt];
      return buildStaged({
        caseText: input.caseText,
        understanding,
        redFlags: input.redFlags,
        context: input.context,
        locale: input.locale,
        retrievedChunks: evidence.retrievedChunks,
        coverage: evidence.coverage,
        officialChunks: evidence.officialChunks ?? [],
        physicianAttachments: input.attachments,
        webEvidence: input.evidence.research?.evidence ?? [],
        additionalInstructions,
      });
    }

    return buildPrompt({
      caseText: input.caseText,
      ...evidence,
      context: input.context,
      // S20-CLIN-01 / CC-05 — red flags confirmadas pelo médico (herdadas
      // entre turnos): sem isto, sumiam do prompt a partir do turno 2.
      redFlags: input.redFlags,
      // PI-05 — instrui o idioma de resposta conforme a conta do médico.
      locale: input.locale,
      additionalInstructions,
      unreviewedSourcesPreliminary: input.unreviewedSourcesPreliminary,
      understanding,
    });
  }

  async analyze(
    physicianId: string,
    encounterId: string,
    input: AnalyzeInput,
  ): Promise<OrchestratorResult> {
    const screened = await this.screenInitialCase(physicianId, encounterId, input, '');
    return this.analyzeInitial(physicianId, encounterId, input, screened, null, '');
  }

  /** ADR-014 — turno 0 a partir da conversa do Copiloto guiado. */
  async analyzeScreened(
    physicianId: string,
    encounterId: string,
    input: ScreenedAnalysisInput,
  ): Promise<OrchestratorResult> {
    const logLabel = ' (conversa)';
    const screened = await this.screenedFromConversation(physicianId, encounterId, input);
    return this.analyzeInitial(
      physicianId,
      encounterId,
      input,
      screened,
      input.understanding,
      logLabel,
    );
  }

  async *analyzeStream(
    physicianId: string,
    encounterId: string,
    input: AnalyzeInput,
  ): AsyncGenerator<StreamEvent> {
    const logLabel = ' (stream)';
    const screened = await this.screenInitialCase(physicianId, encounterId, input, logLabel);
    yield* this.streamInitial(physicianId, encounterId, input, screened, null, logLabel);
  }

  /** ADR-014 — turno 0 a partir da conversa do Copiloto guiado, por streaming. */
  async *analyzeScreenedStream(
    physicianId: string,
    encounterId: string,
    input: ScreenedAnalysisInput,
  ): AsyncGenerator<StreamEvent> {
    const logLabel = ' (conversa stream)';
    const screened = await this.screenedFromConversation(physicianId, encounterId, input);
    yield* this.streamInitial(
      physicianId,
      encounterId,
      input,
      screened,
      input.understanding,
      logLabel,
    );
  }

  private async analyzeInitial(
    physicianId: string,
    encounterId: string,
    request: InitialRequest,
    screened: ScreenedCase,
    precomputed: ScreenedAnalysisInput['understanding'],
    logLabel: string,
  ): Promise<OrchestratorResult> {
    const pipeline = this.decisionPipeline(logLabel);
    const stage = await this.initialStage(screened, request, pipeline, precomputed, logLabel);
    const prepared = await this.prepareInitialAnalysis(
      physicianId,
      encounterId,
      request,
      screened,
      { pipeline, stage },
      logLabel,
    );
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

  private async *streamInitial(
    physicianId: string,
    encounterId: string,
    request: InitialRequest,
    screened: ScreenedCase,
    precomputed: ScreenedAnalysisInput['understanding'],
    logLabel: string,
  ): AsyncGenerator<StreamEvent> {
    const pipeline = this.decisionPipeline(logLabel);
    const stage = await this.initialStage(screened, request, pipeline, precomputed, logLabel);
    // F1 — o entendimento sai assim que fica pronto, antes da busca e do
    // primeiro delta: o médico confere em segundos se o caso foi entendido.
    if (stage?.understanding) {
      yield { type: 'understanding', understanding: stage.understanding };
    }
    const prepared = await this.prepareInitialAnalysis(
      physicianId,
      encounterId,
      request,
      screened,
      { pipeline, stage },
      logLabel,
    );
    yield* this.streamDecision(prepared);
  }

  /**
   * Decisão por streaming, comum à análise inicial e à reanálise: deltas do
   * modelo, a mesma segunda chance do POST e a mesma gravação
   * (`settleAnalysis`), terminando em `done` ou `error`.
   */
  private async *streamDecision(prepared: PreparedAnalysis): AsyncGenerator<StreamEvent> {
    // F0-B — iteração manual: o valor de retorno do gerador (texto final,
    // modelo, usage) é o que dá o custo real da análise, e `for await` o
    // descartaria.
    const stream: AsyncIterator<string, StreamCompletionResult> = this.aiGateway.completeStream({
      model: prepared.decisionModel.model,
      stage: 'decision',
      messages: promptMessages(prepared.prompt),
      responseSchema: responseSchemaOf(prepared.pipeline),
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

  /**
   * F1 — Etapa 1 do turno 0. ADR-014 — quando a leitura do caso já entendeu o
   * caso e o médico não respondeu nada, o entendimento dela vale: refazer a
   * etapa só atrasaria o plano. Com respostas, o entendimento é refeito com
   * elas. No `legacy`, nada muda.
   */
  private async initialStage(
    screened: ScreenedCase,
    request: InitialRequest,
    pipeline: DecisionPipeline,
    precomputed: ScreenedAnalysisInput['understanding'],
    logLabel: string,
  ): Promise<UnderstandingOutcome | null> {
    if (pipeline.reasoning !== 'stages') return null;
    if (precomputed && screened.answeredQuestions.length === 0) {
      return {
        understanding: precomputed.value,
        model: precomputed.model,
        usage: null,
        cost: 0,
        latencyMs: 0,
      };
    }
    return this.understandingStage(
      withAnsweredQuestions(screened.caseText, screened.answeredQuestions),
      request.redFlags,
      pipeline,
      logLabel,
    );
  }

  async continueAnalysis(
    physicianId: string,
    encounterId: string,
    input: RespondInput,
  ): Promise<OrchestratorResult> {
    const logLabel = ' (respond)';
    const screened = await this.screenFollowUp(physicianId, encounterId, input, logLabel);
    // F1 — a resposta do médico pode mudar a síndrome: o entendimento é
    // refeito com o caso e todas as perguntas e respostas acumuladas.
    const pipeline = this.decisionPipeline(logLabel);
    const stage = await this.understandingStage(
      screened.augmentedCaseText,
      screened.params.redFlags,
      pipeline,
      logLabel,
    );
    const prepared = await this.prepareFollowUp(
      physicianId,
      encounterId,
      screened,
      { pipeline, stage },
      logLabel,
    );

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
   * Reanálise por streaming (responder às perguntas, complementar o caso,
   * corrigir o entendimento): os mesmos eventos de `analyzeStream`. Na
   * produção, uma reanálise com `COPILOT_REASONING=stages` levou 81 s sem nada
   * na tela; aqui o entendimento refeito sai em segundos e os deltas mostram
   * que o plano está sendo montado.
   *
   * Abre em duas etapas. O que recusa o pedido (interação de outro
   * atendimento, teto de turnos, injeção) é exceção ao abrir, antes de
   * qualquer byte da resposta: vira o mesmo 4xx do POST /respond. Aceito o
   * pedido, os eventos; a falha de validação vira `error`.
   *
   * Preparação e gravação são as do POST /respond (`screenFollowUp`,
   * `prepareFollowUp`, `settleAnalysis`): a interação, a auditoria e o
   * resultado do `done` são os mesmos.
   */
  async continueAnalysisStream(
    physicianId: string,
    encounterId: string,
    input: RespondInput,
  ): Promise<AsyncGenerator<StreamEvent>> {
    const logLabel = ' (respond stream)';
    const screened = await this.screenFollowUp(physicianId, encounterId, input, logLabel);
    return this.streamFollowUp(physicianId, encounterId, screened, logLabel);
  }

  private async *streamFollowUp(
    physicianId: string,
    encounterId: string,
    screened: ScreenedFollowUp,
    logLabel: string,
  ): AsyncGenerator<StreamEvent> {
    const pipeline = this.decisionPipeline(logLabel);
    const stage = await this.understandingStage(
      screened.augmentedCaseText,
      screened.params.redFlags,
      pipeline,
      logLabel,
    );
    // F1 — o entendimento refeito sai antes da busca e do primeiro delta,
    // como na análise inicial: o médico confere se a resposta mudou o caso.
    if (stage?.understanding) {
      yield { type: 'understanding', understanding: stage.understanding };
    }
    const prepared = await this.prepareFollowUp(
      physicianId,
      encounterId,
      screened,
      { pipeline, stage },
      logLabel,
    );
    yield* this.streamDecision(prepared);
  }

  /**
   * Turno 0, comum a analyze() e analyzeStream(): redação de PII e barreira
   * de injeção, antes de qualquer chamada ao modelo — inclusive a Etapa 1.
   */
  private async screenInitialCase(
    physicianId: string,
    encounterId: string,
    input: AnalyzeInput,
    logLabel: string,
  ): Promise<ScreenedCase> {
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

    return {
      startedAt,
      maxTurns,
      institutionId: encounter.institutionId,
      caseText: fullyRedacted,
      answeredQuestions: [],
      piiDetected: piiResult.hasPII,
    };
  }

  /** ADR-014 — a conversa já redigiu o caso e as respostas; aqui só a posse do caso. */
  private async screenedFromConversation(
    physicianId: string,
    encounterId: string,
    input: ScreenedAnalysisInput,
  ): Promise<ScreenedCase> {
    const startedAt = Date.now();
    const encounter = await this.encounters.findById(physicianId, encounterId);
    return {
      startedAt,
      maxTurns: this.maxTurns(),
      institutionId: encounter.institutionId,
      caseText: input.caseText,
      answeredQuestions: input.answeredQuestions,
      piiDetected: input.piiDetected,
    };
  }

  /** Turno 0, comum a analyze() e analyzeStream(): evidência e prompt. */
  private async prepareInitialAnalysis(
    physicianId: string,
    encounterId: string,
    input: InitialRequest,
    screened: ScreenedCase,
    { pipeline, stage }: { pipeline: DecisionPipeline; stage: UnderstandingOutcome | null },
    logLabel: string,
  ): Promise<PreparedAnalysis> {
    const caseText = withAnsweredQuestions(screened.caseText, screened.answeredQuestions);
    const evidence = await this.gatherEvidence(
      caseText,
      stage,
      screened.institutionId,
      pipeline,
      logLabel,
    );
    // F4 — referências que o médico anexou a este atendimento. Conteúdo não
    // curado: entra no prompt em bloco próprio e é citável só como preliminar.
    const attachments = await this.loadAttachments(encounterId);
    this.logger.debug(`Retrieved ${evidence.retrievalResult.totalRetrieved} chunks${logLabel}`);

    // S20-CLIN-01 — red flags marcadas pelo médico na captura: vão para o
    // prompt e para `params` (rastreabilidade CFM, herança entre turnos).
    const params: InheritableParams = {
      demoCase: input.demoCase ?? null,
      redFlags: input.redFlags ?? {},
    };
    const locale = await this.getPhysicianLocale(physicianId);
    const unreviewedSourcesPreliminary = this.unreviewedSourcesPreliminary();

    const prompt = this.buildDecisionPrompt(pipeline, {
      caseText,
      evidence,
      attachments,
      context: {
        hasCT: input.context.hasCT,
        isSus: input.context.isSus,
        hasLab: input.context.hasLab,
        hasICU: input.context.hasICU,
      },
      // S20-CLIN-01 — injeta red flags explícitas do médico no prompt.
      redFlags: params.redFlags,
      locale,
      unreviewedSourcesPreliminary,
      stage,
      finalTurn: false,
    });

    return {
      pipeline,
      physicianId,
      encounterId,
      startedAt: screened.startedAt,
      maxTurns: screened.maxTurns,
      inputRedacted: screened.caseText,
      piiDetected: screened.piiDetected,
      retrievalResult: evidence.retrievalResult,
      attachments,
      prompt,
      params,
      unreviewedSourcesPreliminary,
      turn: { kind: 'initial', answeredQuestions: screened.answeredQuestions },
      logLabel,
      stage,
      decisionModel: this.decisionModel(stage, logLabel),
      research: evidence.research,
    };
  }

  /**
   * Reanálise, comum a continueAnalysis() e continueAnalysisStream():
   * interação-pai, teto de turnos, redação de PII e barreira de injeção nas
   * respostas, auditoria das respostas e o caso aumentado — tudo antes de
   * qualquer chamada ao modelo, inclusive a Etapa 1.
   */
  private async screenFollowUp(
    physicianId: string,
    encounterId: string,
    input: RespondInput,
    logLabel: string,
  ): Promise<ScreenedFollowUp> {
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

    const parentOutput = parentInteraction.rawOutput as unknown as EnrichedCopilotOutput;
    const clarifyingQuestions = parentOutput.clarifyingQuestions ?? [];

    // Camada 1+2: PII mask + redação patientRef nas respostas do médico (LGPD-005)
    const piiResults = input.answers.map((a) => maskPII(String(a.answer)));
    const piiDetected = piiResults.some((r) => r.hasPII);
    const redactedAnswers = piiResults.map((r) =>
      redactPatientRef(r.redacted, encounter.patientRef),
    );

    await this.rejectInjection(
      { physicianId, encounterId, logLabel },
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
        question: question?.question ?? RESERVED_QUESTION_LABELS[a.questionId] ?? a.questionId,
        answer: redactedAnswers[index] ?? '',
        turnIndex: parentInteraction.turnIndex,
      };
    });

    const previousAnswers =
      (parentInteraction.answeredQuestions as unknown as AnsweredQuestion[] | null) ?? [];
    const allAnsweredQuestions = [...previousAnswers, ...newAnswers];

    const baseCaseText = parentInteraction.inputRedacted ?? '';
    const augmentedCaseText = withAnsweredQuestions(baseCaseText, allAnsweredQuestions);

    return {
      startedAt,
      maxTurns,
      // CC-03 — último turno permitido: ver FINAL_TURN_INSTRUCTIONS.
      finalTurn: newTurnIndex === maxTurns - 1,
      institutionId: encounter.institutionId,
      context: (encounter.context as unknown as EncounterContext | null) ?? {
        hasCT: false,
        isSus: false,
        hasLab: false,
        hasICU: false,
      },
      baseCaseText,
      augmentedCaseText,
      piiDetected,
      params: inheritedParams,
      turn: {
        kind: 'follow_up',
        index: newTurnIndex,
        parentInteractionId: parentInteraction.id,
        answeredQuestions: allAnsweredQuestions,
      },
    };
  }

  /** Reanálise, comum a continueAnalysis() e continueAnalysisStream(): evidência e prompt. */
  private async prepareFollowUp(
    physicianId: string,
    encounterId: string,
    screened: ScreenedFollowUp,
    { pipeline, stage }: { pipeline: DecisionPipeline; stage: UnderstandingOutcome | null },
    logLabel: string,
  ): Promise<PreparedAnalysis> {
    const evidence = await this.gatherEvidence(
      screened.augmentedCaseText,
      stage,
      screened.institutionId,
      pipeline,
      logLabel,
    );
    const attachments = await this.loadAttachments(encounterId);
    this.logger.debug(`Retrieved ${evidence.retrievalResult.totalRetrieved} chunks${logLabel}`);

    const locale = await this.getPhysicianLocale(physicianId);
    const unreviewedSourcesPreliminary = this.unreviewedSourcesPreliminary();

    // CC-03 — no turno final, clarifyingQuestions É obrigatoriamente vazio
    // (não há próximo turno para respondê-las), então "recommendations" NUNCA
    // pode ficar vazio aqui, sob pena de violar a Rule 7 (dead end) do system
    // prompt — ver FINAL_TURN_INSTRUCTIONS.
    const prompt = this.buildDecisionPrompt(pipeline, {
      caseText: screened.augmentedCaseText,
      evidence,
      attachments,
      context: screened.context,
      // CC-05 — herdadas do turno anterior.
      redFlags: screened.params.redFlags,
      locale,
      unreviewedSourcesPreliminary,
      stage,
      finalTurn: screened.finalTurn,
    });

    return {
      pipeline,
      physicianId,
      encounterId,
      startedAt: screened.startedAt,
      maxTurns: screened.maxTurns,
      inputRedacted: screened.baseCaseText,
      piiDetected: screened.piiDetected,
      retrievalResult: evidence.retrievalResult,
      attachments,
      prompt,
      // CC-05 — repropaga demoCase/redFlags (inclusive em falha de validação)
      // para que o PRÓXIMO turno continue herdando a cadeia de red flags.
      params: screened.params,
      unreviewedSourcesPreliminary,
      turn: screened.turn,
      logLabel,
      stage,
      decisionModel: this.decisionModel(stage, logLabel),
      research: evidence.research,
    };
  }

  /** Barreira de injeção — ver clinical-text-screening.ts. */
  private async rejectInjection(
    request: { physicianId: string; encounterId: string; logLabel: string },
    scan: InjectionScanResult,
    evidence: { piiDetected: boolean; patientRefRedacted: boolean; inputLength: number },
  ): Promise<void> {
    await rejectInjectionAndAudit(
      { audit: this.auditService, logger: this.logger },
      request,
      scan,
      evidence,
    );
  }

  private validate(prepared: PreparedAnalysis, content: string): ValidationResult {
    const decisionContext = { understanding: prepared.stage?.understanding ?? null };
    // A v4 muda as regras do prompt, não o contrato: valida como a v3.
    if (prepared.pipeline.decisionPrompt === 'v3' || prepared.pipeline.decisionPrompt === 'v4') {
      return validateOutputV3(content, prepared.prompt.retrievedChunkIds, decisionContext);
    }
    if (prepared.pipeline.decisionPrompt === 'v2') {
      return validateOutputV2(content, prepared.prompt.retrievedChunkIds, decisionContext);
    }
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
        model: prepared.decisionModel.model,
        stage: 'decision',
        messages,
        responseSchema: responseSchemaOf(prepared.pipeline),
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
    const firstIsValid = attempt.validation.valid && attempt.validation.output !== null;
    if (firstIsValid && !hasCorrectable(attempt.validation)) return attempt;
    if (!attempt.retryable) return attempt;

    // F1 — na v2 e na v3, achado corrigível (camada sem dado, dose sem fonte…) também
    // ganha o retry, junto com os erros que bloqueiam.
    const feedback = [...attempt.validation.errors, ...(attempt.validation.correctable ?? [])];
    this.logger.warn(
      `Output validation failed on first attempt${prepared.logLabel}, retrying once: ${feedback.join(', ')}`,
    );
    // Resposta vazia (ex.: truncada antes de qualquer texto) não entra como
    // turno do assistente: a API rejeita mensagem de assistente vazia.
    const retryMessages: ChatMessage[] = [
      ...promptMessages(prepared.prompt),
      ...(attempt.content ? [{ role: 'assistant' as const, content: attempt.content }] : []),
      { role: 'user', content: validationFeedback(feedback) },
    ];
    const retried = await this.requestCompletion(prepared, retryMessages, attempt.cost);
    if (retried.validation.valid && retried.validation.output) {
      return { ...retried, validation: acceptCorrectable(retried.validation) };
    }
    if (!firstIsValid) return retried;

    // F1 — o retry de um achado corrigível piorou a resposta (JSON inválido,
    // truncamento, recusa): fica a primeira, com os achados como aviso. Uma
    // regra que nunca bloqueia não pode deixar o médico sem resposta.
    this.logger.warn(
      `DECISION_V2_RETRY_DISCARDED${prepared.logLabel}: o retry falhou (${retried.validation.errors.join(', ')}); mantida a primeira resposta`,
    );
    return { ...attempt, cost: retried.cost, validation: acceptCorrectable(attempt.validation) };
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
          rawOutput: {
            raw: attempt.content,
            validationErrors: validation.errors,
            // F1 — o que a Etapa 1 entendeu e o que a pesquisa achou ajudam a
            // triar a falha.
            ...(prepared.stage
              ? { understanding: prepared.stage.understanding as Prisma.InputJsonValue | null }
              : {}),
            ...(prepared.research
              ? {
                  webEvidence: prepared.research.evidence as unknown as Prisma.InputJsonValue,
                }
              : {}),
          },
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

    // Verificação com fonte (`verify`): depois de uma decisão válida e antes
    // de gravar — no streaming, depois dos deltas e antes do `done`. Daqui em
    // diante, `research` é a verificação: rastro, custo, tempo e evidência
    // saem como no modo web.
    const verification = await this.verifySources(prepared, validation.output);
    const settled: PreparedAnalysis = verification
      ? { ...prepared, research: verification }
      : prepared;

    const output = isStagedDecisionPrompt(settled.pipeline.decisionPrompt)
      ? this.enrichOutputV2(settled, validation.output, verification?.links)
      : this.enrichOutput(settled, validation.output);
    const citations = this.buildCitations(settled, output);
    const interaction = await this.prisma.aiInteraction.create({
      data: {
        ...this.interactionRecord(settled, attempt),
        rawOutput: output as unknown as Prisma.InputJsonValue,
        // ADR-014 — `sources` guarda as citações como a resposta as devolve
        // (com figura e tabela da evidência), para a conversa do caso mostrar
        // o plano igual depois de recarregar.
        citations: {
          recommendations: output.recommendations,
          sources: citations,
        } as unknown as Prisma.InputJsonValue,
        uncertainty: output.uncertainty,
        uncertaintyReason: output.uncertaintyReason,
      },
    });

    await this.encounters.update(settled.physicianId, settled.encounterId, {
      status: 'in_review',
    });
    const cost = analysisCost(settled, attempt);
    await this.recordTurn(settled, interaction.id, output, cost);

    const { retrievalResult } = settled;
    return {
      valid: true,
      result: {
        interactionId: interaction.id,
        output,
        citations,
        metadata: {
          piiDetected: settled.piiDetected,
          // Chegar aqui implica scan limpo: entrada com injeção é recusada
          // antes de qualquer chamada ao modelo (rejectInjection).
          injectionDetected: false,
          chunksRetrieved: retrievalResult.totalRetrieved,
          retrievalCoverage: coverageOf(settled),
          officialChunksRetrieved: retrievalResult.official.chunks.length,
          latencyMs: Date.now() - settled.startedAt,
          cost,
          model: attempt.model,
          turnIndex: turnIndexOf(settled.turn),
          maxTurns: settled.maxTurns,
          ...(settled.stage ? { understandingLatencyMs: settled.stage.latencyMs } : {}),
          knowledgeSource: settled.pipeline.knowledgeSource,
          decisionPrompt: settled.pipeline.decisionPrompt,
          ...(settled.research ? { researchLatencyMs: settled.research.latencyMs } : {}),
        },
      },
    };
  }

  /**
   * Verificação com fonte depois da decisão (`verify`); `null` nos outros
   * modos. Sem entendimento não há síndrome nem hipóteses para pesquisar: a
   * saída da decisão segue intacta, como a pesquisa do modo web sem ele.
   */
  private async verifySources(
    prepared: PreparedAnalysis,
    output: CopilotOutput,
  ): Promise<SourceVerificationOutcome | null> {
    if (prepared.pipeline.knowledgeSource !== 'verify') return null;
    const understanding = prepared.stage?.understanding;
    if (!understanding) {
      this.logger.warn(
        `SOURCE_VERIFICATION_FALLBACK${prepared.logLabel}: sem entendimento do caso não há o que verificar — segue a saída da decisão`,
      );
      return null;
    }
    return this.sourceVerification.verify({
      understanding,
      recommendations: output.recommendations,
      logLabel: prepared.logLabel,
    });
  }

  /** Campos de `ai_interactions` comuns à gravação válida e à de falha. */
  private interactionRecord(prepared: PreparedAnalysis, attempt: CompletionAttempt) {
    const { retrievalResult, turn } = prepared;
    return {
      encounterId: prepared.encounterId,
      inputRedacted: prepared.inputRedacted,
      retrievedChunkIds: prepared.prompt.retrievedChunkIds,
      model: attempt.model,
      // Liga a interação às chamadas de IA da mesma requisição (ai_calls).
      requestId: currentRequestContext()?.requestId ?? null,
      // S20-CLIN-01 — red flags marcadas pelo médico, para rastreabilidade
      // CFM (qualquer auditoria futura reconstrói quais bandeiras o médico
      // confirmou, independentemente do texto do caso); CC-05 — herdadas
      // pelo próximo turno. KB-005/KB-006 — cobertura persistida para GET
      // /copilot/latest reconstruir o aviso num carregamento fresco de
      // página, sem depender do sessionStorage da sessão ao vivo.
      params: {
        demoCase: prepared.params.demoCase,
        redFlags: prepared.params.redFlags,
        retrievalCoverage: coverageOf(prepared),
        officialChunksRetrieved: retrievalResult.official.chunks.length,
        // F1 — modelo da Etapa 1 (pode ser outro que o da análise, via
        // AI_UNDERSTANDING_MODEL): a trilha registra toda IA que o médico viu.
        ...(prepared.stage ? { understandingModel: prepared.stage.model } : {}),
        // F1 — prompt e fonte de conhecimento efetivos, e o que a pesquisa
        // web fez (modelo, buscas, custo, motivo do fallback).
        knowledgeSource: prepared.pipeline.knowledgeSource,
        decisionPrompt: prepared.pipeline.decisionPrompt,
        decisionRoute: prepared.decisionModel.route,
        ...(prepared.research ? { research: researchTrace(prepared.research) } : {}),
      },
      latencyMs: Date.now() - prepared.startedAt,
      cost: analysisCost(prepared, attempt),
      ...(turn.kind === 'follow_up'
        ? {
            turnIndex: turn.index,
            parentInteractionId: turn.parentInteractionId,
            answeredQuestions: turn.answeredQuestions as unknown as Prisma.InputJsonValue,
          }
        : {}),
      // ADR-014 — respostas da conversa antes do plano: ficam no turno 0 para
      // as reanálises seguintes continuarem lendo o que o médico já contou.
      ...(turn.kind === 'initial' && turn.answeredQuestions.length > 0
        ? { answeredQuestions: turn.answeredQuestions as unknown as Prisma.InputJsonValue }
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
      ...(prepared.stage ? { understanding: prepared.stage.understanding } : {}),
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

  /**
   * F1 — decisões v2 e v3 (ADR-013): a fonte de cada recomendação vem da base
   * que ela declarou e a contenção v2 decide o rótulo. Recomendação `source`
   * cujo id não está entre os citáveis — o que sobrou depois do retry — é
   * mostrada como conhecimento geral do modelo: nada no prompt a sustenta.
   *
   * `links` (só em `verify`): os vínculos da verificação com fonte, pelo
   * índice da recomendação na saída da decisão — por isso entram antes da
   * ordenação.
   */
  private enrichOutputV2(
    prepared: PreparedAnalysis,
    output: CopilotOutput,
    links: ReadonlyMap<number, SourceLink> = NO_SOURCE_LINKS,
  ): EnrichedCopilotOutput {
    const chunks = citableChunks(prepared.retrievalResult);
    const citableIds = new Set(prepared.prompt.retrievedChunkIds);
    const webEvidence = prepared.research?.evidence ?? [];
    let demoted = 0;

    const decided = output.recommendations.map((rec, index) => ({ rec, link: links.get(index) }));
    decided.sort((left, right) => compareRecommendations(left.rec, right.rec));
    const recommendations = decided.map(({ rec, link }): EnrichedRecommendation => {
      const cited = rec.citationChunkId !== null && citableIds.has(rec.citationChunkId);
      const citationChunkId = rec.basis === 'source' && cited ? rec.citationChunkId : null;
      if (rec.basis === 'source' && citationChunkId === null) demoted += 1;
      const resolved = resolveCitationSource(
        citationChunkId,
        chunks,
        prepared.attachments,
        webEvidence,
      );
      const preliminaryReason = preliminaryReasonForV2({
        // Inalcançável: o schema da v2 exige a camada. Na dúvida, o lado
        // seguro é esperar o dado.
        layer: rec.layer ?? 'depends',
        origin: resolved.origin,
        carriesDose: findDoseMentions(`${rec.action} ${rec.rationale}`).length > 0,
        sourceConflict: Boolean(link?.conflict),
      });
      const enriched: EnrichedRecommendation = {
        ...rec,
        citationChunkId,
        basis: citationChunkId === null ? ('model_knowledge' as const) : ('source' as const),
        preliminary: preliminaryReason !== null,
        ...(preliminaryReason ? { preliminaryReason } : {}),
        chunkId: citationChunkId,
        source: resolved.source,
        sourceVersion: resolved.sourceVersion,
        sourceText: resolved.text,
        sourceUrl: resolved.sourceUrl,
        origin: resolved.origin,
      };
      if (!link) return enriched;
      return withSourceLink(
        enriched,
        link,
        resolveCitationSource(link.citationId, chunks, prepared.attachments, webEvidence),
      );
    });

    if (demoted > 0) {
      this.logger.warn(
        `DECISION_V2_CITATION_DEMOTED${prepared.logLabel}: ${demoted} recomendação(ões) "source" sem id citável, mostradas como conhecimento geral do modelo`,
      );
    }

    return {
      ...output,
      ...(prepared.stage ? { understanding: prepared.stage.understanding } : {}),
      ...(prepared.research ? { webEvidence } : {}),
      recommendations,
    };
  }

  private buildCitations(
    prepared: PreparedAnalysis,
    output: EnrichedCopilotOutput,
  ): OrchestratorResult['citations'] {
    const chunks = citableChunks(prepared.retrievalResult);
    const webEvidence = prepared.research?.evidence ?? [];
    // F1 — conhecimento geral do modelo não tem fonte a citar.
    return output.recommendations.flatMap((rec) => {
      if (rec.chunkId === null) return [];
      const resolved = resolveCitationSource(
        rec.chunkId,
        chunks,
        prepared.attachments,
        webEvidence,
      );
      return {
        chunkId: rec.chunkId,
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
