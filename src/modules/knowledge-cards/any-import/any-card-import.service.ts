import { randomUUID } from 'node:crypto';
import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import type { KnowledgeCardStatus, Prisma } from '@prisma/client';
import * as Sentry from '@sentry/node';
import { PrismaService } from '../../../config/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { toJsonValue } from '../../audit/audit-hash';
import type { AnyCardToolId } from '../../../shared/contracts/knowledge-cards';
import { transition } from '../domain/card-lifecycle';
import { KNOWLEDGE_CARD_AUDIT_ACTIONS, KNOWLEDGE_CARD_AUDIT_ENTITY } from '../knowledge-card-audit';
import {
  ANY_CONTENT_REVIEWER_NAME,
  prepareAnyCards,
  type AnyCardRejection,
  type PreparedAnyCard,
  type ReviewerCrm,
} from './any-card-import';
import type { ReviewFindingsIndex } from './review-findings';

/**
 * CC-405 (ADR-019) — importa o conteúdo das ferramentas do ANY como cartões
 * em revisão, com o revisor indicado. Idempotente pela chave do item
 * (`knowledge_cards.source_key`):
 *
 * - item novo → cartão novo, versão 1, "em revisão";
 * - item com o mesmo conteúdo (mesmo hash) → nada muda;
 * - item com conteúdo novo (o dado do motor mudou) → versão nova, de volta a
 *   "em revisão"; a versão publicada, se houver, segue valendo até a nova ser
 *   assinada (a mesma regra do "corrigir");
 * - cartão arquivado → fica arquivado: a importação não ressuscita o que o
 *   revisor tirou de uso.
 *
 * Sem IA: o conteúdo sai do mapeamento determinístico do motor
 * (`any-card-catalog.ts`) e passa pela mesma checagem de citação de toda
 * versão. Não existe "aguardando assinatura" no ciclo do cartão: o status é
 * `in_review`, e o lote é assinado em `approveImportBatch`.
 */

export interface AnyImportRequest {
  toolId: AnyCardToolId | null;
  /** Revisor indicado (o Dr. Gustavo Moreira): o único que assina o lote. */
  reviewerId: string;
  findings: ReviewFindingsIndex;
  /** Quem pediu; o comando de terminal não tem usuário. */
  requestedBy: string | null;
}

export interface AnyImportReviewer {
  id: string;
  name: string | null;
  crmUf: string;
  crmNumber: string;
  crmVerified: boolean;
}

export interface AnyImportResult {
  importId: string;
  toolId: AnyCardToolId | null;
  anyCommits: string[];
  created: string[];
  updated: string[];
  unchanged: string[];
  /** Arquivados: a importação não mexe. */
  skipped: string[];
  rejections: AnyCardRejection[];
}

const CARD_SELECT = {
  id: true,
  sourceKey: true,
  status: true,
  currentVersion: true,
  publishedVersionId: true,
  versions: { orderBy: { version: 'desc' }, take: 1, select: { contentSha256: true } },
} as const satisfies Prisma.KnowledgeCardSelect;

type ExistingCard = Prisma.KnowledgeCardGetPayload<{ select: typeof CARD_SELECT }>;

type PlannedChange =
  | { kind: 'create'; card: PreparedAnyCard; cardId: string }
  | {
      kind: 'update';
      card: PreparedAnyCard;
      existing: ExistingCard;
      to: KnowledgeCardStatus;
    }
  | { kind: 'unchanged' | 'skipped'; card: PreparedAnyCard };

function rejectionsJson(rejections: readonly AnyCardRejection[]): Prisma.InputJsonArray {
  return rejections.map((rejection) => ({
    itemId: rejection.itemId,
    issues: rejection.issues.map((issue) => ({ path: issue.path, message: issue.message })),
  }));
}

function flagsJson(card: PreparedAnyCard): Prisma.InputJsonArray {
  return card.reviewFlags.map((flag) => ({
    ref: flag.ref,
    title: flag.title,
    detail: flag.detail,
  }));
}

/** Uma importação grava ~200 cartões numa transação só: folga sobre o padrão de 5 s. */
const IMPORT_TRANSACTION_TIMEOUT_MS = 120_000;

function plan(card: PreparedAnyCard, existing: ExistingCard | undefined): PlannedChange {
  if (!existing) return { kind: 'create', card, cardId: randomUUID() };
  if (existing.status === 'archived') return { kind: 'skipped', card };
  if (existing.versions[0]?.contentSha256 === card.contentSha256)
    return { kind: 'unchanged', card };
  const edited = transition(
    { status: existing.status, hasPublishedVersion: existing.publishedVersionId !== null },
    'edit',
  );
  // Corrigir mantém o rascunho como rascunho; o conteúdo importado vai sempre para revisão.
  const to: KnowledgeCardStatus = edited.ok && edited.to !== 'draft' ? edited.to : 'in_review';
  return { kind: 'update', card, existing, to };
}

@Injectable()
export class AnyCardImportService {
  private readonly logger = new Logger(AnyCardImportService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly auditService: AuditService,
  ) {}

  /**
   * O revisor indicado: pelo CRM informado ou, sem ele, o único médico
   * cadastrado com o nome do autor do ANY. Nome ambíguo ou ausente é erro —
   * indicar a pessoa errada para assinar dose não pode ser silencioso.
   */
  async findReviewer(crm: ReviewerCrm | null): Promise<AnyImportReviewer> {
    const select = {
      id: true,
      name: true,
      crmUf: true,
      crmNumber: true,
      crmVerified: true,
    } as const;
    if (crm) {
      const found = await this.prisma.physician.findFirst({
        where: { crmUf: crm.uf, crmNumber: crm.number },
        select,
      });
      if (!found) throw new BadRequestException(`Nenhum médico com CRM ${crm.number}/${crm.uf}`);
      return found;
    }
    const matches = await this.prisma.physician.findMany({
      where: { name: { contains: ANY_CONTENT_REVIEWER_NAME, mode: 'insensitive' } },
      select,
      take: 2,
    });
    if (matches.length !== 1 || !matches[0]) {
      throw new BadRequestException(
        `${matches.length === 0 ? 'Nenhum' : 'Mais de um'} médico com o nome "${ANY_CONTENT_REVIEWER_NAME}": informe --reviewer-crm`,
      );
    }
    return matches[0];
  }

  async import(request: AnyImportRequest): Promise<AnyImportResult> {
    const reviewer = await this.prisma.physician.findUnique({
      where: { id: request.reviewerId },
      select: { id: true },
    });
    if (!reviewer) throw new BadRequestException('Revisor indicado não encontrado');

    const prepared = prepareAnyCards(request.toolId, request.findings);
    const existing = await this.prisma.knowledgeCard.findMany({
      where: { sourceKey: { in: prepared.cards.map((card) => card.sourceKey) } },
      select: CARD_SELECT,
    });
    const bySourceKey = new Map(existing.map((card) => [card.sourceKey, card]));
    const changes = prepared.cards.map((card) => plan(card, bySourceKey.get(card.sourceKey)));
    const keysOf = (kind: PlannedChange['kind']) =>
      changes.filter((change) => change.kind === kind).map((change) => change.card.sourceKey);

    const importId = randomUUID();
    await this.prisma.$transaction(
      async (tx) => {
        await tx.knowledgeCardImport.create({
          data: {
            id: importId,
            toolId: request.toolId,
            assignedReviewerId: request.reviewerId,
            anyCommits: prepared.anyCommits,
            itemsTotal: prepared.cards.length + prepared.rejections.length,
            cardsCreated: keysOf('create').length,
            cardsUpdated: keysOf('update').length,
            cardsUnchanged: keysOf('unchanged').length,
            cardsSkipped: keysOf('skipped').length,
            rejections: rejectionsJson(prepared.rejections),
          },
        });
        for (const change of changes) {
          if (change.kind === 'create')
            await this.createCard(tx, change, importId, request.reviewerId);
          if (change.kind === 'update')
            await this.addVersion(tx, change, importId, request.reviewerId);
        }
      },
      { timeout: IMPORT_TRANSACTION_TIMEOUT_MS, maxWait: IMPORT_TRANSACTION_TIMEOUT_MS },
    );

    await this.auditImported(request, importId, changes);
    const result: AnyImportResult = {
      importId,
      toolId: request.toolId,
      anyCommits: prepared.anyCommits,
      created: keysOf('create'),
      updated: keysOf('update'),
      unchanged: keysOf('unchanged'),
      skipped: keysOf('skipped'),
      rejections: prepared.rejections,
    };
    // Só contagens: nada do conteúdo clínico no log.
    this.logger.log(
      `KNOWLEDGE_CARD_ANY_IMPORT import=${importId} tool=${request.toolId ?? 'todas'} ` +
        `created=${result.created.length} updated=${result.updated.length} ` +
        `unchanged=${result.unchanged.length} skipped=${result.skipped.length} ` +
        `rejected=${result.rejections.length}`,
    );
    return result;
  }

  private async createCard(
    tx: Prisma.TransactionClient,
    change: Extract<PlannedChange, { kind: 'create' }>,
    importId: string,
    reviewerId: string,
  ): Promise<void> {
    const { card } = change;
    await tx.knowledgeCard.create({
      data: {
        id: change.cardId,
        institutionId: null,
        topic: card.draft.topic,
        syndrome: card.draft.syndrome,
        status: 'in_review',
        currentVersion: 1,
        sourceKey: card.sourceKey,
        assignedReviewerId: reviewerId,
        versions: {
          create: {
            version: 1,
            content: toJsonValue({ ...card.content }) as Prisma.InputJsonValue,
            contentSha256: card.contentSha256,
            authorKind: 'import',
            importId,
            reviewFlags: flagsJson(card),
          },
        },
      },
      select: { id: true },
    });
  }

  private async addVersion(
    tx: Prisma.TransactionClient,
    change: Extract<PlannedChange, { kind: 'update' }>,
    importId: string,
    reviewerId: string,
  ): Promise<void> {
    const { card, existing } = change;
    const nextVersion = existing.currentVersion + 1;
    // Mesma trava otimista do "corrigir": se o cartão mudou desde a leitura, a importação inteira volta.
    const updated = await tx.knowledgeCard.updateMany({
      where: { id: existing.id, status: existing.status, currentVersion: existing.currentVersion },
      data: {
        status: change.to,
        currentVersion: nextVersion,
        topic: card.draft.topic,
        syndrome: card.draft.syndrome,
        assignedReviewerId: reviewerId,
      },
    });
    if (updated.count !== 1) {
      throw new Error(`KNOWLEDGE_CARD_IMPORT_CONFLICT card=${existing.id}`);
    }
    await tx.knowledgeCardVersion.create({
      data: {
        cardId: existing.id,
        version: nextVersion,
        content: toJsonValue({ ...card.content }) as Prisma.InputJsonValue,
        contentSha256: card.contentSha256,
        authorKind: 'import',
        importId,
        reviewFlags: flagsJson(card),
      },
    });
  }

  /** Um evento por cartão criado ou atualizado; falha na trilha não desfaz a importação, mas não some. */
  private async auditImported(
    request: AnyImportRequest,
    importId: string,
    changes: readonly PlannedChange[],
  ): Promise<void> {
    for (const change of changes) {
      if (change.kind !== 'create' && change.kind !== 'update') continue;
      const cardId = change.kind === 'create' ? change.cardId : change.existing.id;
      try {
        await this.auditService.log({
          actorId: request.requestedBy ?? 'system',
          action: KNOWLEDGE_CARD_AUDIT_ACTIONS.imported,
          entity: KNOWLEDGE_CARD_AUDIT_ENTITY,
          entityId: cardId,
          payload: {
            importId,
            sourceKey: change.card.sourceKey,
            version: change.kind === 'create' ? 1 : change.existing.currentVersion + 1,
            contentSha256: change.card.contentSha256,
            from: change.kind === 'create' ? null : change.existing.status,
            to: change.kind === 'create' ? 'in_review' : change.to,
            assignedReviewerId: request.reviewerId,
            reviewFlags: change.card.reviewFlags.length,
          },
        });
      } catch (error) {
        this.logger.error(`KNOWLEDGE_CARD_AUDIT_FAILED action=CARD_IMPORTED card=${cardId}`);
        Sentry.captureException(error);
      }
    }
  }
}
