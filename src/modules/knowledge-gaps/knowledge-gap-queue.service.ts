import * as Sentry from '@sentry/node';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../config/prisma.service';
import { AuditService } from '../audit/audit.service';
import { sha256Hex } from '../audit/audit-hash';
import { maskFreeText } from '../copilot/guardrails/pii-filter';
import { KnowledgeCardDraftService } from '../knowledge-cards/drafting/card-draft.service';
import {
  CARD_DRAFT_FLAG,
  isCardDraftEnabled,
} from '../knowledge-cards/drafting/card-draft.settings';
import {
  KNOWLEDGE_GAP_SOURCES,
  KNOWLEDGE_GAP_STATUSES,
  KNOWLEDGE_GAP_WEEKLY_TOP,
  type DraftFromKnowledgeGapResponse,
  type KnowledgeGapQueueItem,
  type KnowledgeGapQueuePage,
  type KnowledgeGapSource,
  type KnowledgeGapStatus,
  type KnowledgeGapWeeklyItem,
  type KnowledgeGapWeeklyReport,
} from '../../shared/contracts/knowledge-gaps';
import { specificSyndrome } from './gap-grouping';
import { compareByPriority } from './gap-severity';
import { KNOWLEDGE_GAP_AUDIT_ACTIONS, KNOWLEDGE_GAP_AUDIT_ENTITY } from './knowledge-gap-audit';
import type {
  DismissKnowledgeGapInput,
  DraftFromKnowledgeGapInput,
  KnowledgeGapQueueQueryInput,
} from './knowledge-gap.schemas';
import {
  aggregateGroupStats,
  asPsSyndrome,
  GROUP_SELECT,
  recentNotes,
  toBaseQueueItem,
  topQueries,
  type BaseQueueItem,
  type GroupRow,
  type GroupStats,
} from './knowledge-gap-views';

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;
/** Lacunas lidas por página da fila para montar consultas e notas. */
const DETAIL_ROWS_PER_PAGE = 2000;

/** De onde cada ação pode partir. */
const DRAFTABLE: readonly KnowledgeGapStatus[] = ['open', 'drafting'];
const DISMISSABLE: readonly KnowledgeGapStatus[] = ['open', 'drafting'];
const REOPENABLE: readonly KnowledgeGapStatus[] = ['drafting', 'covered', 'dismissed'];

/**
 * CC-409 — fila de criação de cartões para o curador.
 *
 * Grupos de lacunas na ordem de `compareByPriority` (ocorrências × gravidade
 * da síndrome), com as ações: gerar rascunho de cartão por IA (CC-403, atrás
 * de `KNOWLEDGE_CARDS_DRAFT_ENABLED`), descartar com motivo e reabrir. O
 * fechamento por cartão publicado é do `KnowledgeGapsService`, chamado na
 * aprovação. O relatório semanal alimenta o painel do beta (CC-705) e o
 * ritual de sexta.
 *
 * A contagem é feita em memória sobre um `groupBy`: centenas a poucos
 * milhares de grupos no beta. Se a fila passar disso, a ordem vira SQL.
 */
@Injectable()
export class KnowledgeGapQueueService {
  private readonly logger = new Logger(KnowledgeGapQueueService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(KnowledgeCardDraftService) private readonly drafts: KnowledgeCardDraftService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(ConfigService) private readonly config: ConfigService,
  ) {}

  async list(query: KnowledgeGapQueueQueryInput, now = new Date()): Promise<KnowledgeGapQueuePage> {
    const ranked = (await this.baseItems(now)).filter((item) => item.occurrences > 0);
    const countsByStatus = Object.fromEntries(
      KNOWLEDGE_GAP_STATUSES.map((status) => [
        status,
        ranked.filter((item) => item.status === status).length,
      ]),
    ) as Record<KnowledgeGapStatus, number>;
    const filtered = query.status ? ranked.filter((item) => item.status === query.status) : ranked;
    const page = filtered.slice(query.offset, query.offset + query.limit);
    return {
      items: await this.withDetails(page),
      total: filtered.length,
      countsByStatus,
      draftEnabled: isCardDraftEnabled(this.config),
    };
  }

  /**
   * "Gerar rascunho de cartão": o rascunho por IA do CC-403 com o tema do
   * grupo (ou o tema ajustado pelo curador) e a síndrome dele, global. Com
   * cartão aceito pela checagem de citação, o grupo vai para "em rascunho";
   * sem nenhum, continua aberto com o rascunho registrado.
   */
  async draft(
    curatorId: string,
    groupId: string,
    input: DraftFromKnowledgeGapInput,
  ): Promise<DraftFromKnowledgeGapResponse> {
    // Antes de tudo: com a flag desligada, nada muda e nada vai à IA.
    if (!isCardDraftEnabled(this.config)) {
      throw new ServiceUnavailableException(
        `Rascunho de cartões por IA desligado (${CARD_DRAFT_FLAG})`,
      );
    }
    const group = await this.loadGroup(groupId);
    this.assertFrom(group, DRAFTABLE, 'Reabra a lacuna antes de pedir rascunho');
    const topic = (input.topic ?? group.topic).trim();
    if (topic.length < 3) {
      throw new BadRequestException('Esta lacuna não tem consulta: informe o tema do cartão');
    }

    const result = await this.drafts.draft({
      topic,
      syndrome: asPsSyndrome(specificSyndrome(group.syndrome)),
      institutionId: null,
      requestedBy: curatorId,
      submitForReview: input.submitForReview,
    });
    const drafting = result.cardIds.length > 0;
    await this.prisma.knowledgeGapGroup.updateMany({
      where: { id: groupId, status: { in: [...DRAFTABLE] } },
      data: {
        draftId: result.draft.id,
        ...(drafting ? { status: 'drafting', statusChangedAt: new Date() } : {}),
      },
    });
    await this.auditSafely(curatorId, KNOWLEDGE_GAP_AUDIT_ACTIONS.draftRequested, groupId, {
      draftId: result.draft.id,
      draftStatus: result.draft.status,
      cardsAccepted: result.draft.cardsAccepted,
      cardsRejected: result.draft.cardsRejected,
      topicChanged: topic !== group.topic,
    });
    this.logger.log(
      `KNOWLEDGE_GAP_DRAFTED group=${groupId} draft=${result.draft.id} ` +
        `status=${result.draft.status} accepted=${result.draft.cardsAccepted} ` +
        `rejected=${result.draft.cardsRejected}`,
    );
    return { item: await this.item(groupId), draft: result };
  }

  /** "Descartar com motivo": o grupo sai da fila; novas lacunas dele continuam contando. */
  async dismiss(
    curatorId: string,
    groupId: string,
    input: DismissKnowledgeGapInput,
  ): Promise<KnowledgeGapQueueItem> {
    const group = await this.loadGroup(groupId);
    this.assertFrom(group, DISMISSABLE, 'Só lacuna aberta ou em rascunho pode ser descartada');
    const reason = maskFreeText(input.reason) ?? input.reason;
    await this.transition(group, {
      status: 'dismissed',
      dismissReason: reason,
      statusChangedAt: new Date(),
    });
    await this.auditSafely(curatorId, KNOWLEDGE_GAP_AUDIT_ACTIONS.dismissed, groupId, {
      previousStatus: group.status,
      reasonSha256: sha256Hex(reason),
    });
    this.logger.log(`KNOWLEDGE_GAP_DISMISSED group=${groupId} previousStatus=${group.status}`);
    return this.item(groupId);
  }

  /** Volta para a fila: rascunho que não vingou, cobertura errada ou descarte desfeito. */
  async reopen(curatorId: string, groupId: string): Promise<KnowledgeGapQueueItem> {
    const group = await this.loadGroup(groupId);
    this.assertFrom(group, REOPENABLE, 'A lacuna já está aberta');
    await this.transition(group, {
      status: 'open',
      dismissReason: null,
      coveredByCardId: null,
      statusChangedAt: new Date(),
    });
    await this.auditSafely(curatorId, KNOWLEDGE_GAP_AUDIT_ACTIONS.reopened, groupId, {
      previousStatus: group.status,
      previousCoveredByCardId: group.coveredByCard?.id ?? null,
    });
    this.logger.log(`KNOWLEDGE_GAP_REOPENED group=${groupId} previousStatus=${group.status}`);
    return this.item(groupId);
  }

  /**
   * As lacunas dos 7 dias até `endingAt`: total por fonte, grupos novos e
   * fechados, e os 10 grupos com mais ocorrências na semana (sem os
   * descartados). Sem consulta nem nota: o relatório circula no ritual.
   */
  async weeklyReport(endingAt = new Date()): Promise<KnowledgeGapWeeklyReport> {
    const from = new Date(endingAt.getTime() - WEEK_MS);
    const window = { gte: from, lt: endingAt };
    const [sourceRows, weekStats, allStats, newGroups, covered, dismissed] = await Promise.all([
      this.prisma.knowledgeGap.groupBy({
        by: ['source'],
        where: { createdAt: window },
        _count: { _all: true },
      }),
      this.statsByGroup({ createdAt: window }),
      this.statsByGroup(),
      this.prisma.knowledgeGapGroup.count({ where: { createdAt: window } }),
      this.prisma.knowledgeGapGroup.count({
        where: { status: 'covered', statusChangedAt: window },
      }),
      this.prisma.knowledgeGapGroup.count({
        where: { status: 'dismissed', statusChangedAt: window },
      }),
    ]);

    const bySource = Object.fromEntries(
      KNOWLEDGE_GAP_SOURCES.map((source) => [
        source,
        sourceRows.find((row) => row.source === source)?._count._all ?? 0,
      ]),
    ) as Record<KnowledgeGapSource, number>;
    const groups = await this.prisma.knowledgeGapGroup.findMany({
      where: { id: { in: [...weekStats.keys()] }, status: { not: 'dismissed' } },
      select: GROUP_SELECT,
    });
    const top = groups
      .map((group) => ({
        week: weekStats.get(group.id) as GroupStats,
        base: toBaseQueueItem(group, allStats.get(group.id), 0),
      }))
      .sort(
        (a, b) =>
          b.week.occurrences - a.week.occurrences ||
          compareByPriority(rankable(a.base), rankable(b.base)),
      )
      .slice(0, KNOWLEDGE_GAP_WEEKLY_TOP)
      .map(
        ({ week, base }): KnowledgeGapWeeklyItem => ({
          id: base.id,
          topic: base.topic,
          syndrome: base.syndrome,
          severity: base.severity,
          status: base.status,
          occurrencesInWeek: week.occurrences,
          occurrences: base.occurrences,
          sourcesInWeek: week.sources,
          lastSeenAt: base.lastSeenAt,
        }),
      );

    return {
      from: from.toISOString(),
      to: endingAt.toISOString(),
      occurrences: Object.values(bySource).reduce((sum, count) => sum + count, 0),
      bySource,
      newGroups,
      closed: { covered, dismissed },
      top,
    };
  }

  /** Todos os grupos (ou os pedidos), na ordem da fila, sem consultas nem notas. */
  private async baseItems(now: Date, groupIds?: readonly string[]): Promise<BaseQueueItem[]> {
    const where = groupIds ? { id: { in: [...groupIds] } } : undefined;
    const gapWhere = groupIds ? { groupId: { in: [...groupIds] } } : {};
    const [groups, stats, recent] = await Promise.all([
      this.prisma.knowledgeGapGroup.findMany({ where, select: GROUP_SELECT }),
      this.statsByGroup(gapWhere),
      this.statsByGroup({ ...gapWhere, createdAt: { gte: new Date(now.getTime() - WEEK_MS) } }),
    ]);
    return groups
      .map((group: GroupRow) =>
        toBaseQueueItem(group, stats.get(group.id), recent.get(group.id)?.occurrences ?? 0),
      )
      .sort((a, b) => compareByPriority(rankable(a), rankable(b)));
  }

  private async statsByGroup(
    where: Prisma.KnowledgeGapWhereInput = {},
  ): Promise<Map<string, GroupStats>> {
    const rows = await this.prisma.knowledgeGap.groupBy({
      by: ['groupId', 'source'],
      where: { ...where, groupId: where.groupId ?? { not: null } },
      _count: { _all: true },
      _min: { createdAt: true },
      _max: { createdAt: true },
    });
    return aggregateGroupStats(rows);
  }

  /** Consultas e notas só dos grupos da página. */
  private async withDetails(items: readonly BaseQueueItem[]): Promise<KnowledgeGapQueueItem[]> {
    if (items.length === 0) return [];
    const rows = await this.prisma.knowledgeGap.findMany({
      where: { groupId: { in: items.map((item) => item.id) } },
      select: { groupId: true, searchQueries: true, note: true, createdAt: true },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      take: DETAIL_ROWS_PER_PAGE,
    });
    return items.map((item) => {
      const own = rows.filter((row) => row.groupId === item.id);
      return { ...item, queries: topQueries(own), notes: recentNotes(own) };
    });
  }

  private async item(groupId: string): Promise<KnowledgeGapQueueItem> {
    const [base] = await this.baseItems(new Date(), [groupId]);
    if (!base) throw new NotFoundException('Lacuna não encontrada');
    const [item] = await this.withDetails([base]);
    return item as KnowledgeGapQueueItem;
  }

  private async loadGroup(groupId: string): Promise<GroupRow> {
    const group = await this.prisma.knowledgeGapGroup.findUnique({
      where: { id: groupId },
      select: GROUP_SELECT,
    });
    if (!group) throw new NotFoundException('Lacuna não encontrada');
    return group;
  }

  private assertFrom(group: GroupRow, allowed: readonly KnowledgeGapStatus[], message: string) {
    if (!allowed.includes(group.status)) throw new ConflictException(message);
  }

  /** Muda o status só se ninguém mudou no meio (409). */
  private async transition(
    group: GroupRow,
    data: Prisma.KnowledgeGapGroupUncheckedUpdateManyInput,
  ): Promise<void> {
    const { count } = await this.prisma.knowledgeGapGroup.updateMany({
      where: { id: group.id, status: group.status },
      data,
    });
    if (count !== 1) {
      throw new ConflictException('A lacuna mudou enquanto você decidia; recarregue a fila');
    }
  }

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

function rankable(item: BaseQueueItem) {
  return {
    id: item.id,
    priority: item.priority,
    severity: item.severity,
    lastSeenAt: new Date(item.lastSeenAt),
  };
}
