import * as Sentry from '@sentry/node';
import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { KnowledgeCardDraft, KnowledgeCardStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../../config/prisma.service';
import { AiGatewayService } from '../../ai-gateway/ai-gateway.service';
import { AiRefusalError, AiTruncatedError } from '../../ai-gateway/ai-gateway.errors';
import type { CompletionUsage } from '../../ai-gateway/providers/provider.interface';
import { AuditService } from '../../audit/audit.service';
import { sha256Hex, toJsonValue } from '../../audit/audit-hash';
import { calculateInferenceCost } from '../../copilot/orchestrator/model-pricing';
import { GuidelinesService } from '../../guidelines/guidelines.service';
import { currentRequestContext } from '../../../shared/request-context/request-context';
import type { PsSyndrome } from '../../../shared/contracts/clinical';
import type {
  KnowledgeCardCitation,
  KnowledgeCardContent,
  KnowledgeCardDraftPage,
  KnowledgeCardDraftRejection,
  KnowledgeCardDraftResult,
} from '../../../shared/contracts/knowledge-cards';
import {
  loadSourceChunks,
  prepareCardContent,
  sourceChunkProblem,
  toCardSource,
  type SourceChunk,
} from '../card-sources';
import { sourceContentSha256 } from '../domain/draft-provenance';
import { toDraftRun } from '../knowledge-card-views';
import { KNOWLEDGE_CARD_AUDIT_ACTIONS, KNOWLEDGE_CARD_AUDIT_ENTITY } from '../knowledge-card-audit';
import {
  buildCardDraftPrompt,
  CARD_DRAFT_JSON_SCHEMA,
  CARD_DRAFT_SYSTEM_PROMPT,
  MAX_CARDS_PER_DRAFT,
  parseCardDraftResponse,
  type DraftedCard,
} from './card-draft-prompt';
import {
  CARD_DRAFT_EFFORT,
  CARD_DRAFT_FLAG,
  DEFAULT_DRAFT_SOURCES,
  isCardDraftEnabled,
  readCardDraftModel,
} from './card-draft.settings';

export interface CardDraftRequest {
  topic: string;
  syndrome: PsSyndrome | null;
  institutionId: string | null;
  /** Trechos escolhidos; sem eles, a consulta de diretrizes escolhe pelo tema. */
  chunkIds?: readonly string[];
  /** Admin que pediu; `null` pelo script. */
  requestedBy: string | null;
  /** `false` deixa os cartões em rascunho, fora da fila de revisão. */
  submitForReview: boolean;
}

interface DraftSource {
  key: string;
  chunk: SourceChunk;
}

interface AcceptedCard {
  content: KnowledgeCardContent;
  contentSha256: string;
}

interface CreatedCard extends AcceptedCard {
  id: string;
}

interface ModelOutcome {
  servedModel: string | null;
  usage: CompletionUsage | null;
  content: string | null;
  failureReason: string | null;
}

const PROMPT_SHA256 = sha256Hex(CARD_DRAFT_SYSTEM_PROMPT);
const FAILURE_REASON_MAX_CHARS = 300;

function blankToNull(value: string | null): string | null {
  return value && value.trim() !== '' ? value : null;
}

/** Rejeições como JSON do Prisma (o tipo do contrato é interface, sem assinatura de índice). */
function rejectionsJson(rejections: readonly KnowledgeCardDraftRejection[]): Prisma.InputJsonArray {
  return rejections.map((rejection) => ({
    index: rejection.index,
    question: rejection.question,
    issues: rejection.issues.map((issue) => ({ path: issue.path, message: issue.message })),
  }));
}

function citationsOf(card: DraftedCard): KnowledgeCardCitation[] {
  return [
    ...card.answerCitations,
    ...card.claims.flatMap((claim) => [
      ...claim.citations,
      ...(claim.dose ? [claim.dose.citation] : []),
    ]),
  ];
}

/**
 * Do cartão do modelo ao conteúdo de entrada: campos opcionais vazios viram
 * `null`, e as fontes do cartão são só os trechos que ele cita — a chave
 * ("S3") é a do prompt.
 */
function toContentInput(card: DraftedCard, sources: readonly DraftSource[]) {
  const cited = new Set(citationsOf(card).map((citation) => citation.sourceKey));
  return {
    question: card.question,
    population: blankToNull(card.population),
    answer: card.answer,
    answerCitations: card.answerCitations,
    claims: card.claims.map((claim) => ({
      kind: claim.kind,
      text: claim.text,
      dose: claim.dose
        ? {
            ...claim.dose,
            route: blankToNull(claim.dose.route),
            frequency: blankToNull(claim.dose.frequency),
            maxDose: blankToNull(claim.dose.maxDose),
          }
        : null,
      citations: claim.citations,
    })),
    sources: sources
      .filter((source) => cited.has(source.key))
      .map((source) => ({ key: source.key, chunkId: source.chunk.id })),
  };
}

/**
 * CC-403 (ADR-019) — rascunho de cartões por IA com citação obrigatória.
 *
 * Dado um tema e trechos de diretriz já ingeridos, pede ao modelo cartões em
 * JSON (etapa `card_draft` no rastro) e passa cada um pela checagem
 * determinística de citação: o cartão com trecho que não está na fonte, ou
 * com dose fora do trecho citado, é rejeitado antes de chegar à revisão —
 * fica só no registro do rascunho, com o motivo.
 *
 * O pedido inteiro é gravado em `knowledge_card_drafts`, inclusive quando o
 * modelo falha (o custo foi gasto). O id e o hash dos trechos entregues são a
 * origem do rascunho que a regra anti-circularidade (CC-412) confere.
 */
@Injectable()
export class KnowledgeCardDraftService {
  private readonly logger = new Logger(KnowledgeCardDraftService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AiGatewayService) private readonly aiGateway: AiGatewayService,
    @Inject(GuidelinesService) private readonly guidelines: GuidelinesService,
    @Inject(AuditService) private readonly auditService: AuditService,
    @Inject(ConfigService) private readonly config: ConfigService,
  ) {}

  async draft(request: CardDraftRequest): Promise<KnowledgeCardDraftResult> {
    if (!isCardDraftEnabled(this.config)) {
      throw new ServiceUnavailableException(
        `Rascunho de cartões por IA desligado (${CARD_DRAFT_FLAG})`,
      );
    }
    await this.assertInstitution(request.institutionId);
    const sources = await this.resolveSources(request);

    const draftId = randomUUID();
    const requestedModel =
      readCardDraftModel(this.config) ?? this.config.getOrThrow<string>('AI_MODEL');
    const startedAt = Date.now();
    const outcome = await this.callModel(requestedModel, request, sources);

    const parsed = outcome.content === null ? null : parseCardDraftResponse(outcome.content);
    const failureReason =
      outcome.failureReason ?? (parsed && !parsed.success ? parsed.reason : null);
    const { accepted, rejections } = parsed?.success
      ? this.evaluateCards(parsed.cards, sources, request.institutionId)
      : { accepted: [], rejections: [] };

    const status: KnowledgeCardStatus = request.submitForReview ? 'in_review' : 'draft';
    const created: CreatedCard[] = accepted.map((card) => ({ ...card, id: randomUUID() }));
    const draftRow = await this.prisma.$transaction(async (tx) => {
      const row = await tx.knowledgeCardDraft.create({
        data: {
          id: draftId,
          topic: request.topic,
          syndrome: request.syndrome,
          institutionId: request.institutionId,
          requestedBy: request.requestedBy,
          status: failureReason === null ? 'completed' : 'failed',
          requestedModel,
          servedModel: outcome.servedModel,
          promptSha256: PROMPT_SHA256,
          sourceContentSha256: sourceContentSha256(sources.map((source) => source.chunk.text)),
          sourceChunkIds: sources.map((source) => source.chunk.id),
          cardsAccepted: accepted.length,
          cardsRejected: rejections.length,
          rejections: rejectionsJson(rejections),
          failureReason: failureReason?.slice(0, FAILURE_REASON_MAX_CHARS) ?? null,
          costUsd: outcome.usage
            ? calculateInferenceCost({
                model: outcome.servedModel ?? requestedModel,
                usage: outcome.usage,
              })
            : 0,
          latencyMs: Date.now() - startedAt,
          requestId: currentRequestContext()?.requestId ?? null,
        },
      });
      for (const card of created) {
        await tx.knowledgeCard.create({
          data: {
            id: card.id,
            institutionId: request.institutionId,
            topic: request.topic,
            syndrome: request.syndrome,
            status,
            currentVersion: 1,
            versions: {
              create: {
                version: 1,
                content: toJsonValue({ ...card.content }) as Prisma.InputJsonValue,
                contentSha256: card.contentSha256,
                authorKind: 'ai',
                draftId,
              },
            },
          },
          select: { id: true },
        });
      }
      return row;
    });

    await this.auditDrafted(request.requestedBy, draftId, status, created);
    this.logDraft(draftRow, outcome);
    return { draft: toDraftRun(draftRow), cardIds: created.map((card) => card.id) };
  }

  async listDrafts(query: { limit: number; offset: number }): Promise<KnowledgeCardDraftPage> {
    const [rows, total] = await Promise.all([
      this.prisma.knowledgeCardDraft.findMany({
        orderBy: { createdAt: 'desc' },
        take: query.limit,
        skip: query.offset,
      }),
      this.prisma.knowledgeCardDraft.count(),
    ]);
    return { items: rows.map(toDraftRun), total };
  }

  private async assertInstitution(institutionId: string | null): Promise<void> {
    if (institutionId === null) return;
    const institution = await this.prisma.institution.findUnique({
      where: { id: institutionId },
      select: { id: true },
    });
    if (!institution) throw new BadRequestException('Instituição não encontrada');
  }

  /**
   * Trechos pedidos, ou os que a consulta de diretrizes acha pelo tema (base
   * curada e oficial, só conteúdo global). Todo trecho precisa ser fonte
   * válida para a instituição do cartão — senão o pedido nem vai ao modelo.
   */
  private async resolveSources(request: CardDraftRequest): Promise<DraftSource[]> {
    const chunkIds = request.chunkIds?.length
      ? [...new Set(request.chunkIds)]
      : (await this.guidelines.consult(request.topic, DEFAULT_DRAFT_SOURCES)).map(
          (result) => result.chunkId,
        );
    if (chunkIds.length === 0) {
      throw new UnprocessableEntityException(
        'Nenhum trecho de diretriz encontrado para o tema; informe os trechos (chunkIds)',
      );
    }

    const chunks = await loadSourceChunks(this.prisma, chunkIds);
    const issues = chunkIds.flatMap((chunkId, index) => {
      const problem = sourceChunkProblem(chunks.get(chunkId), {
        institutionId: request.institutionId,
        alreadyCited: false,
      });
      return problem ? [{ path: `chunkIds[${index}]`, message: problem }] : [];
    });
    if (issues.length > 0) {
      throw new BadRequestException({ message: 'Trechos que não podem ser fonte', issues });
    }
    return chunkIds.map((chunkId, index) => ({
      key: `S${index + 1}`,
      chunk: chunks.get(chunkId) as SourceChunk,
    }));
  }

  /**
   * Recusa e truncamento foram cobrados: o custo conta. Outro erro é de
   * provedor ou de rede: vai para o log de erro e para o Sentry, sem texto.
   */
  private async callModel(
    model: string,
    request: CardDraftRequest,
    sources: readonly DraftSource[],
  ): Promise<ModelOutcome> {
    try {
      const completion = await this.aiGateway.complete({
        model,
        effort: CARD_DRAFT_EFFORT,
        stage: 'card_draft',
        messages: [
          { role: 'system', content: CARD_DRAFT_SYSTEM_PROMPT },
          {
            role: 'user',
            content: buildCardDraftPrompt({
              topic: request.topic,
              syndrome: request.syndrome,
              sources: sources.map(({ key, chunk }) => ({
                key,
                title: chunk.source,
                sourceVersion: chunk.sourceVersion,
                section: toCardSource(key, chunk).section,
                text: chunk.text,
              })),
            }),
          },
        ],
        responseSchema: CARD_DRAFT_JSON_SCHEMA,
      });
      return {
        servedModel: completion.model,
        usage: completion.usage,
        content: completion.content,
        failureReason: null,
      };
    } catch (error) {
      if (error instanceof AiRefusalError || error instanceof AiTruncatedError) {
        return {
          servedModel: error.details.model,
          usage: error.details.usage,
          content: null,
          failureReason: error.message,
        };
      }
      const errorType = error instanceof Error ? error.name : 'unknown';
      this.logger.error(`KNOWLEDGE_CARD_DRAFT_PROVIDER_ERROR: ${errorType}`);
      Sentry.captureException(error);
      return {
        servedModel: null,
        usage: null,
        content: null,
        failureReason: `erro do provedor: ${errorType}`,
      };
    }
  }

  /** Cada cartão do modelo, por si: um fora do formato ou da fonte não derruba os outros. */
  private evaluateCards(
    cards: readonly DraftedCard[],
    sources: readonly DraftSource[],
    institutionId: string | null,
  ): { accepted: AcceptedCard[]; rejections: KnowledgeCardDraftRejection[] } {
    const accepted: AcceptedCard[] = [];
    const rejections: KnowledgeCardDraftRejection[] = [];
    cards.forEach((card, index) => {
      const result = this.evaluateCard(card, index, sources, institutionId);
      if ('issues' in result) rejections.push(result);
      else accepted.push(result);
    });
    return { accepted, rejections };
  }

  private evaluateCard(
    card: DraftedCard,
    index: number,
    sources: readonly DraftSource[],
    institutionId: string | null,
  ): AcceptedCard | KnowledgeCardDraftRejection {
    if (index >= MAX_CARDS_PER_DRAFT) {
      return {
        index,
        question: card.question,
        issues: [
          { path: '', message: `acima do teto de ${MAX_CARDS_PER_DRAFT} cartões por rascunho` },
        ],
      };
    }
    const chunks = new Map(sources.map(({ chunk }) => [chunk.id, chunk]));
    const prepared = prepareCardContent(toContentInput(card, sources), chunks, { institutionId });
    if (!prepared.ok) return { index, question: card.question, issues: prepared.issues };
    return { content: prepared.content, contentSha256: prepared.contentSha256 };
  }

  /** Um evento por cartão criado; falha na trilha não desfaz o rascunho, mas não some. */
  private async auditDrafted(
    requestedBy: string | null,
    draftId: string,
    status: KnowledgeCardStatus,
    created: readonly CreatedCard[],
  ): Promise<void> {
    for (const card of created) {
      try {
        await this.auditService.log({
          actorId: requestedBy ?? 'system',
          action: KNOWLEDGE_CARD_AUDIT_ACTIONS.drafted,
          entity: KNOWLEDGE_CARD_AUDIT_ENTITY,
          entityId: card.id,
          payload: { draftId, version: 1, contentSha256: card.contentSha256, status },
        });
      } catch (error) {
        this.logger.error(`KNOWLEDGE_CARD_AUDIT_FAILED action=CARD_DRAFTED card=${card.id}`);
        Sentry.captureException(error);
      }
    }
  }

  /** Só metadados: nada do tema, dos trechos ou dos cartões no log. */
  private logDraft(row: KnowledgeCardDraft, outcome: ModelOutcome): void {
    const summary =
      `draft=${row.id} status=${row.status} accepted=${row.cardsAccepted} rejected=${row.cardsRejected} ` +
      `model=${outcome.servedModel ?? '-'} latencyMs=${row.latencyMs} costUsd=${row.costUsd}`;
    if (row.status === 'failed') {
      this.logger.warn(`KNOWLEDGE_CARD_DRAFT_FAILED ${summary}: ${row.failureReason ?? '-'}`);
    } else {
      this.logger.log(`KNOWLEDGE_CARD_DRAFT ${summary}`);
    }
  }
}
