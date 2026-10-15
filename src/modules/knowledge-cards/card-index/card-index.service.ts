import * as Sentry from '@sentry/node';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../config/prisma.service';
import { CARD_EMBEDDER, type CardEmbedder, type CardEmbedderIdentity } from './card-embedder';
import {
  INDEX_CARD_SELECT,
  indexDecision,
  needsEmbedding,
  type CardIndexEntryDraft,
  type CardIndexRemovalReason,
} from './card-index-eligibility';
import {
  distinctCardQueries,
  mergeCardHits,
  toVectorLiteral,
  type CardQueryHit,
  type CardSearchOutcome,
  type CardSearchRequest,
} from './card-search';

/** O que uma sincronização fez — vai para o log e para o `pnpm cards:reindex`. */
export interface CardIndexSyncReport {
  /** Linhas gravadas com vetor novo (cartão novo, versão nova, texto ou modelo trocado). */
  embedded: number;
  /** Linhas gravadas sem vetor: provedor desligado ou fora do ar. */
  withoutEmbedding: number;
  /** Já estavam no índice com o vetor certo. */
  unchanged: number;
  /** Cartões que não podem estar no índice, por motivo. */
  ineligible: Partial<Record<CardIndexRemovalReason, number>>;
  /** Linhas de fato apagadas do índice (inclusive de cartões que perderam a versão publicada). */
  removed: number;
}

type SyncScope = { kind: 'cards'; cardIds: string[] } | { kind: 'all' };

function countBy<T extends string>(items: readonly T[]): Partial<Record<T, number>> {
  const counts: Partial<Record<T, number>> = {};
  for (const item of items) counts[item] = (counts[item] ?? 0) + 1;
  return counts;
}

function formatCounts(counts: Partial<Record<string, number>>): string {
  const entries = Object.entries(counts);
  return entries.length > 0 ? entries.map(([key, value]) => `${key}:${value}`).join(',') : '-';
}

/**
 * CC-406 (ADR-019) — índice semântico dos cartões revisados.
 *
 * Só versão publicada e válida entra (`indexDecision`). O índice é refeito ao
 * publicar uma versão nova, perde o cartão ao arquivar e, na varredura diária
 * e no `pnpm cards:reindex`, perde o que venceu e ganha o vetor que faltava.
 * Mesmo antes da varredura, a busca nunca devolve cartão vencido, arquivado
 * ou de revisor sem CRM verificado: confere tudo de novo na consulta.
 *
 * Nada de texto de cartão ou de consulta no log: ids, contagens e
 * similaridades.
 */
@Injectable()
export class CardIndexService {
  private readonly logger = new Logger(CardIndexService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(CARD_EMBEDDER) private readonly embedder: CardEmbedder,
  ) {}

  /**
   * Depois de uma transição que muda a versão publicada ou tira o cartão de
   * uso (aprovar, arquivar). A transição já foi gravada: falhar aqui não a
   * desfaz — o cartão só fica fora da busca (o lado seguro: a análise segue
   * como antes dos cartões) até o próximo reindex, e o erro vai para o
   * Sentry.
   */
  async syncCard(cardId: string): Promise<CardIndexSyncReport | null> {
    try {
      return await this.sync({ kind: 'cards', cardIds: [cardId] });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.error(`CARD_INDEX_SYNC_FAILED card=${cardId}: ${reason}`);
      Sentry.captureMessage(`CARD_INDEX_SYNC_FAILED: ${reason}`, 'error');
      return null;
    }
  }

  /**
   * Todos os cartões: indexa o que falta, reembute o que mudou de texto ou de
   * modelo e tira o que não pode mais estar (arquivado, vencido, órfão).
   * `pnpm cards:reindex` e a varredura diária. Erro de banco sobe.
   */
  async syncAll(): Promise<CardIndexSyncReport> {
    return this.sync({ kind: 'all' });
  }

  /**
   * Vizinhos mais próximos de cada consulta entre os cartões válidos, já
   * juntos pela melhor similaridade. Sem embedding (desligado ou falhou), não
   * há busca: `unavailable`, e a análise segue sem cartões.
   */
  async search(request: CardSearchRequest): Promise<CardSearchOutcome> {
    const queries = distinctCardQueries(request.queries);
    if (queries.length === 0) return { status: 'unavailable', reason: 'no_queries' };
    if (!this.embedder.enabled()) return { status: 'unavailable', reason: 'embeddings_disabled' };

    const identity = this.embedder.identity();
    const vectors = await this.embedOrNull(queries, 'query', identity);
    if (!vectors) return { status: 'unavailable', reason: 'embedding_failed' };

    const perQuery = await Promise.all(
      vectors.map((vector) =>
        this.nearestCards(vector, identity.model, request.institutionId, request.limitPerQuery),
      ),
    );
    const hits = mergeCardHits(perQuery);
    this.logger.log(
      `CARD_SEARCH queries=${queries.length} candidates=${hits.length} ` +
        `best=${(hits[0]?.similarity ?? 0).toFixed(3)} model=${identity.model}`,
    );
    return { status: 'ok', hits };
  }

  private async sync(scope: SyncScope): Promise<CardIndexSyncReport> {
    const now = new Date();
    const cards = await this.prisma.knowledgeCard.findMany({
      where:
        scope.kind === 'all'
          ? { publishedVersionId: { not: null } }
          : { id: { in: scope.cardIds } },
      select: INDEX_CARD_SELECT,
    });
    const byId = new Map(cards.map((card) => [card.id, card]));
    const cardIds = scope.kind === 'all' ? cards.map((card) => card.id) : scope.cardIds;

    const entries: CardIndexEntryDraft[] = [];
    const removals: Array<{ cardId: string; reason: CardIndexRemovalReason }> = [];
    for (const cardId of cardIds) {
      const decision = indexDecision(byId.get(cardId) ?? null, now);
      if (decision.action === 'index') entries.push(decision.entry);
      else removals.push({ cardId, reason: decision.reason });
    }

    const removed = await this.removeFromIndex(scope, entries, removals);
    const { embedded, withoutEmbedding, unchanged } = await this.writeEntries(entries);

    const report: CardIndexSyncReport = {
      embedded,
      withoutEmbedding,
      unchanged,
      ineligible: countBy(removals.map((removal) => removal.reason)),
      removed,
    };
    this.logger.log(
      `CARD_INDEX_SYNC scope=${scope.kind === 'all' ? 'all' : scope.cardIds.join(',')} ` +
        `embedded=${embedded} withoutEmbedding=${withoutEmbedding} unchanged=${unchanged} ` +
        `ineligible=${formatCounts(report.ineligible)} removed=${removed}`,
    );
    return report;
  }

  /**
   * Tira do índice o que não pode estar. Na varredura completa, tudo que não
   * é elegível agora — inclusive linha de cartão que nem tem mais versão
   * publicada. Devolve quantas linhas saíram.
   */
  private async removeFromIndex(
    scope: SyncScope,
    entries: readonly CardIndexEntryDraft[],
    removals: ReadonlyArray<{ cardId: string; reason: CardIndexRemovalReason }>,
  ): Promise<number> {
    if (scope.kind === 'cards' && removals.length === 0) return 0;
    const where: Prisma.KnowledgeCardIndexEntryWhereInput =
      scope.kind === 'cards'
        ? { cardId: { in: removals.map((removal) => removal.cardId) } }
        : { cardId: { notIn: entries.map((entry) => entry.cardId) } };
    const { count } = await this.prisma.knowledgeCardIndexEntry.deleteMany({ where });
    return count;
  }

  private async writeEntries(
    entries: readonly CardIndexEntryDraft[],
  ): Promise<Pick<CardIndexSyncReport, 'embedded' | 'withoutEmbedding' | 'unchanged'>> {
    if (entries.length === 0) return { embedded: 0, withoutEmbedding: 0, unchanged: 0 };

    const identity = this.embedder.identity();
    const indexed = await this.prisma.knowledgeCardIndexEntry.findMany({
      where: { cardId: { in: entries.map((entry) => entry.cardId) } },
      select: { cardId: true, versionId: true, textSha256: true, embeddingModel: true },
    });
    const indexedById = new Map(indexed.map((row) => [row.cardId, row]));
    const stale = entries.filter((entry) =>
      needsEmbedding(entry, indexedById.get(entry.cardId), identity.model),
    );
    if (stale.length === 0) return { embedded: 0, withoutEmbedding: 0, unchanged: entries.length };

    const vectors = this.embedder.enabled()
      ? await this.embedOrNull(
          stale.map((entry) => entry.text),
          'document',
          identity,
        )
      : null;
    for (const [index, entry] of stale.entries()) {
      await this.upsert(entry, vectors?.[index] ?? null, identity);
    }
    return {
      embedded: vectors ? stale.length : 0,
      withoutEmbedding: vectors ? 0 : stale.length,
      unchanged: entries.length - stale.length,
    };
  }

  /**
   * Grava a linha do cartão. Sem vetor, grava mesmo assim (a busca a ignora
   * e o reindex a completa): versão nova com o provedor fora do ar não pode
   * deixar no índice o vetor da versão anterior.
   */
  private async upsert(
    entry: CardIndexEntryDraft,
    vector: number[] | null,
    identity: CardEmbedderIdentity,
  ): Promise<void> {
    const literal = vector ? toVectorLiteral(vector) : null;
    const provider = vector ? identity.provider : null;
    const model = vector ? identity.model : null;
    await this.prisma.$executeRaw(Prisma.sql`
      INSERT INTO knowledge_card_index
        (card_id, version_id, institution_id, syndrome, valid_until, content_sha256,
         text_sha256, embedding, embedding_provider, embedding_model, indexed_at)
      VALUES
        (${entry.cardId}::uuid, ${entry.versionId}::uuid, ${entry.institutionId}::uuid,
         ${entry.syndrome}, ${entry.validUntil}, ${entry.contentSha256}, ${entry.textSha256},
         ${literal}::vector, ${provider}, ${model}, NOW())
      ON CONFLICT (card_id) DO UPDATE SET
        version_id = EXCLUDED.version_id,
        institution_id = EXCLUDED.institution_id,
        syndrome = EXCLUDED.syndrome,
        valid_until = EXCLUDED.valid_until,
        content_sha256 = EXCLUDED.content_sha256,
        text_sha256 = EXCLUDED.text_sha256,
        embedding = EXCLUDED.embedding,
        embedding_provider = EXCLUDED.embedding_provider,
        embedding_model = EXCLUDED.embedding_model,
        indexed_at = NOW()
    `);
  }

  /**
   * Os cartões mais próximos de UM vetor. Confere de novo, na consulta, tudo
   * o que a indexação conferiu — versão publicada, aprovada, válida, revisor
   * com CRM verificado, cartão não arquivado: uma sincronização que falhou
   * nunca serve cartão que saiu de uso. Só compara vetores do modelo atual e
   * da mesma dimensão (a coluna não fixa dimensão).
   */
  private async nearestCards(
    vector: readonly number[],
    model: string,
    institutionId: string | null,
    limit: number,
  ): Promise<CardQueryHit[]> {
    const literal = toVectorLiteral(vector);
    const institutionFilter = institutionId
      ? Prisma.sql`AND (i.institution_id IS NULL OR i.institution_id = ${institutionId}::uuid)`
      : Prisma.sql`AND i.institution_id IS NULL`;
    const rows = await this.prisma.$queryRaw<
      Array<{ card_id: string; version_id: string; similarity: number }>
    >(Prisma.sql`
      SELECT i.card_id, i.version_id, 1 - (i.embedding <=> ${literal}::vector) AS similarity
      FROM knowledge_card_index i
      JOIN knowledge_cards c ON c.id = i.card_id
      JOIN knowledge_card_versions v ON v.id = i.version_id
      JOIN physicians p ON p.id = v.reviewer_id
      WHERE i.embedding IS NOT NULL
        AND i.embedding_model = ${model}
        AND vector_dims(i.embedding) = ${vector.length}
        AND i.valid_until > NOW()
        AND c.status <> 'archived'
        AND c.published_version_id = i.version_id
        AND v.review_decision = 'approved'
        AND p.crm_verified = true
        ${institutionFilter}
      ORDER BY i.embedding <=> ${literal}::vector
      LIMIT ${limit}
    `);
    return rows.map((row) => ({
      cardId: row.card_id,
      versionId: row.version_id,
      similarity: Number(row.similarity),
    }));
  }

  /**
   * Vetores, ou `null` quando o provedor falha: o cartão entra sem vetor (ou
   * a busca não roda) e a falha vai para o log e o Sentry para ser corrigida.
   */
  private async embedOrNull(
    texts: readonly string[],
    purpose: 'document' | 'query',
    identity: CardEmbedderIdentity,
  ): Promise<number[][] | null> {
    try {
      return await this.embedder.embed(texts, purpose);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `CARD_EMBEDDING_UNAVAILABLE purpose=${purpose} texts=${texts.length} ` +
          `provider=${identity.provider} model=${identity.model}: ${reason}`,
      );
      Sentry.captureMessage(`CARD_EMBEDDING_UNAVAILABLE purpose=${purpose}: ${reason}`, 'error');
      return null;
    }
  }
}
