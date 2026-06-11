import { Injectable, Inject, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../config/prisma.service';
import { AiGatewayService } from '../../ai-gateway/ai-gateway.service';
import { RedisService } from '../../redis/redis.service';
import {
  reciprocalRankFuse,
  applyInstitutionBoost,
  sortByScore,
  type RetrievedChunk,
  type SearchHit,
} from './hybrid-search';

export interface RetrievalResult {
  chunks: RetrievedChunk[];
  totalRetrieved: number;
}

@Injectable()
export class RetrievalService {
  private readonly logger = new Logger(RetrievalService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AiGatewayService) private readonly aiGateway: AiGatewayService,
    @Inject(RedisService) private readonly redis: RedisService,
  ) {}

  /**
   * @param institutionId Instituição do encounter (PROT-004). `undefined`/`null`
   * restringe a busca a conteúdo global (institution_id IS NULL). Quando
   * informado, a busca retorna conteúdo global + da instituição (isolamento
   * hard via WHERE — chunks de outras instituições nunca são retornados) e
   * aplica boost de ranking aos chunks institucionais.
   */
  async search(
    query: string,
    topK: number = 5,
    institutionId?: string | null,
  ): Promise<RetrievalResult> {
    this.logger.debug(`Hybrid search: query="${query.substring(0, 50)}...", topK=${topK}`);

    const cacheKey = `retrieval:${Buffer.from(query).toString('base64').slice(0, 64)}:${topK}:${institutionId ?? 'global'}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      this.logger.debug('Retrieval cache hit');
      return JSON.parse(cached) as RetrievalResult;
    }

    const embeddingResponse = await this.aiGateway.embed([query]);
    const queryEmbedding = embeddingResponse.embeddings[0];
    if (!queryEmbedding) {
      throw new Error('Failed to generate query embedding');
    }

    const semanticHits = await this.semanticSearch(queryEmbedding, topK * 2, institutionId);
    const keywordHits = await this.keywordSearch(query, topK * 2, institutionId);

    const fusedScores = reciprocalRankFuse(semanticHits, keywordHits);

    const chunkInstitutions = new Map<string, string | null>();
    for (const hit of [...semanticHits, ...keywordHits]) {
      chunkInstitutions.set(hit.chunkId, hit.institutionId);
    }
    const boostedScores = applyInstitutionBoost(fusedScores, chunkInstitutions, institutionId);

    const sortedIds = [...boostedScores.entries()]
      .sort(([, a], [, b]) => b - a)
      .slice(0, topK)
      .map(([id]) => id);

    if (sortedIds.length === 0) {
      return { chunks: [], totalRetrieved: 0 };
    }

    const chunks = await this.fetchChunks(sortedIds);
    const scored = chunks.map((chunk) => ({
      ...chunk,
      score: boostedScores.get(chunk.id) ?? 0,
    }));

    const result: RetrievalResult = {
      chunks: sortByScore(scored),
      totalRetrieved: scored.length,
    };

    await this.redis.set(cacheKey, JSON.stringify(result), 60);
    return result;
  }

  /**
   * PROT-004: filtro hard de isolamento — sem instituição informada, apenas
   * conteúdo global (institution_id IS NULL); com instituição informada,
   * conteúdo global + da própria instituição. Conteúdo de outras
   * instituições nunca é incluído no resultado da query.
   */
  private institutionFilter(institutionId?: string | null): Prisma.Sql {
    return institutionId
      ? Prisma.sql`AND (institution_id IS NULL OR institution_id = ${institutionId}::uuid)`
      : Prisma.sql`AND institution_id IS NULL`;
  }

  private async semanticSearch(
    embedding: number[],
    limit: number,
    institutionId?: string | null,
  ): Promise<SearchHit[]> {
    const vectorStr = `[${embedding.join(',')}]`;

    const results = await this.prisma.$queryRaw<
      Array<{ id: string; similarity: number; institution_id: string | null }>
    >`
      SELECT id, 1 - (embedding <=> ${vectorStr}::vector) as similarity, institution_id
      FROM guideline_chunks
      WHERE embedding IS NOT NULL
        AND status = 'approved'
        AND valid_from <= NOW()
        AND (valid_to IS NULL OR valid_to > NOW())
        ${this.institutionFilter(institutionId)}
      ORDER BY embedding <=> ${vectorStr}::vector
      LIMIT ${limit}
    `;

    return results.map((r) => ({
      chunkId: r.id,
      score: r.similarity,
      institutionId: r.institution_id,
    }));
  }

  private async keywordSearch(
    query: string,
    limit: number,
    institutionId?: string | null,
  ): Promise<SearchHit[]> {
    const results = await this.prisma.$queryRaw<
      Array<{ id: string; rank: number; institution_id: string | null }>
    >`
      SELECT id, ts_rank(text_tsv, plainto_tsquery('portuguese', ${query})) as rank, institution_id
      FROM guideline_chunks
      WHERE text_tsv @@ plainto_tsquery('portuguese', ${query})
        AND status = 'approved'
        AND valid_from <= NOW()
        AND (valid_to IS NULL OR valid_to > NOW())
        ${this.institutionFilter(institutionId)}
      ORDER BY rank DESC
      LIMIT ${limit}
    `;

    return results.map((r) => ({
      chunkId: r.id,
      score: r.rank,
      institutionId: r.institution_id,
    }));
  }

  private async fetchChunks(ids: string[]): Promise<Omit<RetrievedChunk, 'score'>[]> {
    const chunks = await this.prisma.guidelineChunk.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        text: true,
        source: true,
        sourceVersion: true,
        specialty: true,
        evidenceLevel: true,
        institutionId: true,
        metadata: true,
      },
    });

    return chunks.map((c) => ({
      id: c.id,
      text: c.text,
      source: c.source,
      sourceVersion: c.sourceVersion,
      specialty: c.specialty,
      evidenceLevel: c.evidenceLevel,
      institutionId: c.institutionId,
      metadata: (c.metadata ?? {}) as unknown as Record<string, unknown>,
    }));
  }
}
