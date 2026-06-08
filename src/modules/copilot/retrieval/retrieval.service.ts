import { Injectable, Inject, Logger } from '@nestjs/common';
import { PrismaService } from '../../../config/prisma.service';
import { AiGatewayService } from '../../ai-gateway/ai-gateway.service';
import {
  reciprocalRankFuse,
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
  ) {}

  async search(query: string, topK: number = 5): Promise<RetrievalResult> {
    this.logger.debug(`Hybrid search: query="${query.substring(0, 50)}...", topK=${topK}`);

    const embeddingResponse = await this.aiGateway.embed([query]);
    const queryEmbedding = embeddingResponse.embeddings[0];
    if (!queryEmbedding) {
      throw new Error('Failed to generate query embedding');
    }

    const semanticHits = await this.semanticSearch(queryEmbedding, topK * 2);
    const keywordHits = await this.keywordSearch(query, topK * 2);

    const fusedScores = reciprocalRankFuse(semanticHits, keywordHits);

    const sortedIds = [...fusedScores.entries()]
      .sort(([, a], [, b]) => b - a)
      .slice(0, topK)
      .map(([id]) => id);

    if (sortedIds.length === 0) {
      return { chunks: [], totalRetrieved: 0 };
    }

    const chunks = await this.fetchChunks(sortedIds);
    const scored = chunks.map((chunk) => ({
      ...chunk,
      score: fusedScores.get(chunk.id) ?? 0,
    }));

    return {
      chunks: sortByScore(scored),
      totalRetrieved: scored.length,
    };
  }

  private async semanticSearch(embedding: number[], limit: number): Promise<SearchHit[]> {
    const vectorStr = `[${embedding.join(',')}]`;

    const results = await this.prisma.$queryRaw<Array<{ id: string; similarity: number }>>`
      SELECT id, 1 - (embedding <=> ${vectorStr}::vector) as similarity
      FROM guideline_chunks
      WHERE embedding IS NOT NULL
        AND valid_from <= NOW()
        AND (valid_to IS NULL OR valid_to > NOW())
      ORDER BY embedding <=> ${vectorStr}::vector
      LIMIT ${limit}
    `;

    return results.map((r) => ({
      chunkId: r.id,
      score: r.similarity,
    }));
  }

  private async keywordSearch(query: string, limit: number): Promise<SearchHit[]> {
    const results = await this.prisma.$queryRaw<Array<{ id: string; rank: number }>>`
      SELECT id, ts_rank(text_tsv, plainto_tsquery('portuguese', ${query})) as rank
      FROM guideline_chunks
      WHERE text_tsv @@ plainto_tsquery('portuguese', ${query})
        AND valid_from <= NOW()
        AND (valid_to IS NULL OR valid_to > NOW())
      ORDER BY rank DESC
      LIMIT ${limit}
    `;

    return results.map((r) => ({
      chunkId: r.id,
      score: r.rank,
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
      metadata: (c.metadata ?? {}) as unknown as Record<string, unknown>,
    }));
  }
}
