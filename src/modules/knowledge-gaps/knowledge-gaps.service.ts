import * as Sentry from '@sentry/node';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../config/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { PsSyndrome } from '../../shared/contracts/clinical';
import type { KnowledgeGapSource } from '../../shared/contracts/knowledge-gaps';
import {
  cardCoversGroup,
  findMatchingGroup,
  gapTerms,
  specificSyndrome,
  type GroupCandidate,
} from './gap-grouping';
import { KNOWLEDGE_GAP_AUDIT_ACTIONS, KNOWLEDGE_GAP_AUDIT_ENTITY } from './knowledge-gap-audit';

/** Uma lacuna, já sem texto do caso: o que a fonte sabe dizer do tema. */
export interface KnowledgeGapInput {
  source: KnowledgeGapSource;
  /** Análise em que a lacuna apareceu; `null` na pergunta rápida. */
  interactionId: string | null;
  syndrome: PsSyndrome | null;
  /** Consultas já mascaradas: as da busca dirigida, ou a pergunta rápida. */
  searchQueries: readonly string[];
  /** Só o "não encontrei"; já mascarada. `undefined` mantém a nota anterior. */
  note?: string | null;
  /**
   * Atendimento da análise (não é gravado): uma lacuna por atendimento, fonte
   * e grupo — a reanálise do mesmo caso não conta de novo.
   */
  dedupeEncounterId?: string;
}

export interface KnowledgeGapRecordResult {
  /** `false` quando o atendimento já tinha esta lacuna (`dedupeEncounterId`). */
  recorded: boolean;
  gapId: string | null;
  groupId: string;
  newGroup: boolean;
}

export interface KnowledgeGapMaintenanceResult {
  purged: number;
  grouped: number;
  emptyGroupsRemoved: number;
}

/**
 * Retenção das lacunas: 180 dias. As consultas e a nota são texto mascarado
 * derivado do caso; meio ano cobre a escrita dos cartões do beta (CC-410) e
 * a comparação entre semanas. O grupo fechado fica como histórico da
 * decisão do curador; o aberto que ficou vazio sai.
 */
export const KNOWLEDGE_GAP_RETENTION_DAYS = 180;
const DAY_MS = 24 * 60 * 60 * 1000;
/** Lacunas sem grupo agrupadas por varredura (as gravadas antes da CC-409). */
const GROUPING_BATCH = 500;
/** Serializa o agrupamento: duas lacunas iguais ao mesmo tempo não abrem dois grupos. */
const GAP_GROUPING_ADVISORY_LOCK_ID = 4_090_409;
const TOPIC_MAX_CHARS = 200;

const OPEN_STATUSES = ['open', 'drafting'] as const;

/**
 * CC-409 — registro único de lacunas (`knowledge_gaps`) e agrupamento.
 *
 * As três fontes passam por `record`: "não encontrei o que precisava"
 * (CC-703), decisão sem cartão aplicável (CC-408) e pergunta rápida sem
 * cartão (CC-501). Cada lacuna cai num grupo (`knowledge_gap_groups`) pela
 * comparação determinística de `gap-grouping.ts`; o grupo é o item da fila
 * do curador.
 *
 * Nada de médico aqui: a lacuna da análise sai com o atendimento (cascata da
 * análise), a da pergunta rápida não tem dono, e quem trata o grupo fica só
 * na trilha de auditoria.
 */
@Injectable()
export class KnowledgeGapsService {
  private readonly logger = new Logger(KnowledgeGapsService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  /**
   * Grava a lacuna no grupo dela. Com análise, é idempotente por análise e
   * fonte (índice único da CC-703): o segundo toque só atualiza a nota.
   */
  async record(input: KnowledgeGapInput): Promise<KnowledgeGapRecordResult> {
    const searchQueries = input.searchQueries.map((query) => query.trim()).filter(Boolean);
    const terms = gapTerms(searchQueries);
    const result = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${GAP_GROUPING_ADVISORY_LOCK_ID})`;

      const existing = input.interactionId
        ? await tx.knowledgeGap.findUnique({
            where: {
              interactionId_source: { interactionId: input.interactionId, source: input.source },
            },
            select: { id: true, groupId: true },
          })
        : null;
      const noteUpdate = input.note === undefined ? {} : { note: input.note };
      if (existing?.groupId) {
        await tx.knowledgeGap.update({
          where: { id: existing.id },
          data: { syndrome: input.syndrome, searchQueries, ...noteUpdate },
        });
        return { recorded: true, gapId: existing.id, groupId: existing.groupId, newGroup: false };
      }

      const signal = { syndrome: input.syndrome, terms, topic: searchQueries[0] ?? '' };
      const match = await this.matchGroup(tx, signal);
      if (match && input.dedupeEncounterId && !existing) {
        const duplicate = await tx.knowledgeGap.findFirst({
          where: {
            source: input.source,
            groupId: match.id,
            interaction: { encounterId: input.dedupeEncounterId },
          },
          select: { id: true },
        });
        if (duplicate) return { recorded: false, gapId: null, groupId: match.id, newGroup: false };
      }
      const groupId = match ? match.id : await this.openGroup(tx, signal);
      const data = { syndrome: input.syndrome, searchQueries, groupId, ...noteUpdate };
      const gap = existing
        ? await tx.knowledgeGap.update({ where: { id: existing.id }, data, select: { id: true } })
        : await tx.knowledgeGap.create({
            data: { source: input.source, interactionId: input.interactionId, ...data },
            select: { id: true },
          });
      return { recorded: true, gapId: gap.id, groupId, newGroup: match === null };
    });

    this.logger.log(
      `KNOWLEDGE_GAP_RECORDED source=${input.source} recorded=${result.recorded} ` +
        `gapId=${result.gapId ?? '-'} groupId=${result.groupId} newGroup=${result.newGroup} ` +
        `syndrome=${input.syndrome ?? '-'} queries=${searchQueries.length} terms=${terms.length}`,
    );
    return result;
  }

  /**
   * Um cartão foi publicado: fecha os grupos abertos (ou em rascunho) que ele
   * cobre — o grupo que pediu o rascunho de onde o cartão saiu e, para
   * cartão global, os grupos em que o tema e a pergunta dele cairiam. O
   * cartão de uma instituição só fecha pelo rascunho: a lacuna não diz de
   * que instituição veio.
   */
  async closeGroupsCoveredBy(cardId: string, actorId: string): Promise<number> {
    const card = await this.prisma.knowledgeCard.findUnique({
      where: { id: cardId },
      select: {
        id: true,
        topic: true,
        syndrome: true,
        institutionId: true,
        status: true,
        publishedVersion: { select: { content: true } },
        versions: { select: { draftId: true } },
      },
    });
    if (!card || card.status !== 'published' || !card.publishedVersion) return 0;

    const draftIds = new Set(card.versions.flatMap((version) => version.draftId ?? []));
    const texts = [card.topic, questionOf(card.publishedVersion.content)];
    const groups = await this.prisma.knowledgeGapGroup.findMany({
      where: { status: { in: [...OPEN_STATUSES] } },
      select: { id: true, syndrome: true, signature: true, draftId: true, status: true },
    });
    const covered = groups.filter(
      (group) =>
        (group.draftId !== null && draftIds.has(group.draftId)) ||
        (card.institutionId === null && cardCoversGroup({ syndrome: card.syndrome, texts }, group)),
    );
    if (covered.length === 0) return 0;

    const statusChangedAt = new Date();
    const closed: string[] = [];
    for (const group of covered) {
      // Um por vez, condicionado ao status lido: o curador pode ter
      // descartado o grupo no meio.
      const { count } = await this.prisma.knowledgeGapGroup.updateMany({
        where: { id: group.id, status: { in: [...OPEN_STATUSES] } },
        data: { status: 'covered', coveredByCardId: card.id, statusChangedAt },
      });
      if (count === 1) {
        closed.push(group.id);
        await this.auditSafely(actorId, KNOWLEDGE_GAP_AUDIT_ACTIONS.covered, group.id, {
          cardId: card.id,
          previousStatus: group.status,
          byDraft: group.draftId !== null && draftIds.has(group.draftId),
        });
      }
    }
    this.logger.log(`KNOWLEDGE_GAP_COVERED card=${card.id} groups=${closed.length}`);
    return closed.length;
  }

  /**
   * Varredura diária: apaga lacunas além da retenção, agrupa as que ficaram
   * sem grupo (gravadas antes da CC-409) e tira grupos abertos vazios.
   */
  async maintain(now = new Date()): Promise<KnowledgeGapMaintenanceResult> {
    const cutoff = new Date(now.getTime() - KNOWLEDGE_GAP_RETENTION_DAYS * DAY_MS);
    const { count: purged } = await this.prisma.knowledgeGap.deleteMany({
      where: { createdAt: { lt: cutoff } },
    });

    const pending = await this.prisma.knowledgeGap.findMany({
      where: { groupId: null },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: GROUPING_BATCH,
      select: { id: true, syndrome: true, searchQueries: true },
    });
    for (const gap of pending) {
      const searchQueries = gap.searchQueries.map((query) => query.trim()).filter(Boolean);
      await this.prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(${GAP_GROUPING_ADVISORY_LOCK_ID})`;
        const signal = {
          syndrome: gap.syndrome,
          terms: gapTerms(searchQueries),
          topic: searchQueries[0] ?? '',
        };
        const match = await this.matchGroup(tx, signal);
        const groupId = match ? match.id : await this.openGroup(tx, signal);
        await tx.knowledgeGap.update({ where: { id: gap.id }, data: { groupId } });
      });
    }

    const { count: emptyGroupsRemoved } = await this.prisma.knowledgeGapGroup.deleteMany({
      where: { status: 'open', gaps: { none: {} } },
    });
    const result = { purged, grouped: pending.length, emptyGroupsRemoved };
    this.logger.log(
      `KNOWLEDGE_GAP_MAINTENANCE purged=${purged} grouped=${pending.length} ` +
        `emptyGroupsRemoved=${emptyGroupsRemoved} retentionDays=${KNOWLEDGE_GAP_RETENTION_DAYS}`,
    );
    return result;
  }

  /**
   * Grupos que podem receber a lacuna: com síndrome definida, os da mesma
   * síndrome e os sem síndrome; sem síndrome, todos. O resto da regra é de
   * `findMatchingGroup`.
   */
  private async matchGroup(
    tx: Prisma.TransactionClient,
    signal: { syndrome: string | null; terms: readonly string[] },
  ): Promise<GroupCandidate | null> {
    const syndrome = specificSyndrome(signal.syndrome);
    const candidates = await tx.knowledgeGapGroup.findMany({
      where: syndrome
        ? { OR: [{ syndrome }, { syndrome: null }, { syndrome: 'outro' }] }
        : undefined,
      select: { id: true, syndrome: true, signature: true, createdAt: true },
    });
    const match = findMatchingGroup(signal, candidates);
    // O grupo sem síndrome adota a primeira síndrome definida que chega: a
    // fila mostra a gravidade dela, e o rascunho a recebe.
    if (match && syndrome && specificSyndrome(match.syndrome) === null) {
      await tx.knowledgeGapGroup.update({ where: { id: match.id }, data: { syndrome } });
    }
    return match;
  }

  private async openGroup(
    tx: Prisma.TransactionClient,
    signal: { syndrome: string | null; terms: readonly string[]; topic: string },
  ): Promise<string> {
    const group = await tx.knowledgeGapGroup.create({
      data: {
        syndrome: signal.syndrome,
        signature: [...signal.terms],
        topic: signal.topic.slice(0, TOPIC_MAX_CHARS),
      },
      select: { id: true },
    });
    return group.id;
  }

  /** Falhar a trilha não desfaz o fechamento, mas não some: log e Sentry. */
  private async auditSafely(
    actorId: string,
    action: string,
    groupId: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    try {
      await this.audit.log({
        actorId,
        action,
        entity: KNOWLEDGE_GAP_AUDIT_ENTITY,
        entityId: groupId,
        payload,
      });
    } catch (error) {
      this.logger.error(`KNOWLEDGE_GAP_AUDIT_FAILED action=${action} group=${groupId}`);
      Sentry.captureException(error);
    }
  }
}

/** Pergunta do cartão publicado; o conteúdo já foi validado ao gravar. */
function questionOf(content: Prisma.JsonValue): string {
  if (content && typeof content === 'object' && !Array.isArray(content)) {
    const question = (content as Record<string, unknown>).question;
    if (typeof question === 'string') return question;
  }
  return '';
}
