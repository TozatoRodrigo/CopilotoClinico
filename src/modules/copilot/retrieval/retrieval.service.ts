import { Injectable, Inject, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../config/prisma.service';
import { AiGatewayService } from '../../ai-gateway/ai-gateway.service';
import { RedisService } from '../../redis/redis.service';
import {
  reciprocalRankFuse,
  applyInstitutionBoost,
  applyRelevanceFloor,
  sortByScore,
  DEFAULT_MIN_SEMANTIC_SCORE,
  DEFAULT_STRONG_SEMANTIC_SCORE,
  DEFAULT_MIN_KEYWORD_RANK,
  type RetrievalCoverage,
  type RetrievedChunk,
  type SearchHit,
} from './hybrid-search';

export interface RetrievalResult {
  chunks: RetrievedChunk[];
  totalRetrieved: number;
  /**
   * KB-005/KB-006 — o quanto a base de fato cobre esta consulta.
   * `none` significa que nenhum chunk passou no piso de relevância: o prompt
   * cai no caminho de "declarar a lacuna e perguntar" em vez de recomendar
   * citando o vizinho semântico mais próximo.
   */
  coverage: RetrievalCoverage;
  /** Melhor similaridade de cosseno entre os candidatos, antes do piso. */
  bestSemanticScore: number;
  /** Quantos candidatos foram descartados pelo piso de relevância. */
  discardedByFloor: number;
}

@Injectable()
export class RetrievalService {
  private readonly logger = new Logger(RetrievalService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AiGatewayService) private readonly aiGateway: AiGatewayService,
    @Inject(RedisService) private readonly redis: RedisService,
    @Inject(ConfigService) private readonly config: ConfigService,
  ) {}

  /**
   * Limiares do piso de relevância, lidos do ambiente a cada busca para
   * permitir recalibração sem redeploy. `RETRIEVAL_MIN_SEMANTIC_SCORE=0`
   * desliga o piso e restaura o comportamento anterior.
   */
  private relevanceThresholds(): {
    minSemanticScore: number;
    strongSemanticScore: number;
    minKeywordRank: number;
  } {
    return {
      minSemanticScore: this.numericConfig(
        'RETRIEVAL_MIN_SEMANTIC_SCORE',
        DEFAULT_MIN_SEMANTIC_SCORE,
      ),
      strongSemanticScore: this.numericConfig(
        'RETRIEVAL_STRONG_SEMANTIC_SCORE',
        DEFAULT_STRONG_SEMANTIC_SCORE,
      ),
      minKeywordRank: this.numericConfig('RETRIEVAL_MIN_KEYWORD_RANK', DEFAULT_MIN_KEYWORD_RANK),
    };
  }

  /**
   * Variáveis de ambiente chegam como string. Valor ausente, vazio ou não
   * numérico cai no default — um typo na env nunca deve desligar o piso
   * silenciosamente nem travar a busca.
   */
  private numericConfig(key: string, fallback: number): number {
    const raw = this.config.get<string | number | undefined>(key);
    if (raw === undefined || raw === null || raw === '') return fallback;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) {
      this.logger.warn(`${key}="${String(raw)}" não é numérico — usando default ${fallback}`);
      return fallback;
    }
    return parsed;
  }

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
      const parsed = JSON.parse(cached) as Partial<RetrievalResult> & {
        chunks: RetrievedChunk[];
        totalRetrieved: number;
      };
      // Entradas gravadas por uma versão anterior ao piso de relevância não
      // têm os campos de cobertura. O TTL de 60s faz isso se resolver sozinho
      // logo após um deploy, mas o default explícito evita que a janela
      // produza `undefined` num campo tipado como obrigatório.
      return {
        ...parsed,
        coverage: parsed.coverage ?? (parsed.chunks.length > 0 ? 'full' : 'none'),
        bestSemanticScore: parsed.bestSemanticScore ?? 0,
        discardedByFloor: parsed.discardedByFloor ?? 0,
      };
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

    const rankedIds = [...boostedScores.entries()].sort(([, a], [, b]) => b - a).map(([id]) => id);

    // O piso é aplicado ANTES do corte em topK: um chunk relevante em 6º lugar
    // não pode ser perdido porque cinco chunks irrelevantes ficaram na frente.
    const floor = applyRelevanceFloor(rankedIds, {
      semanticScores: new Map(semanticHits.map((hit) => [hit.chunkId, hit.score])),
      keywordScores: new Map(keywordHits.map((hit) => [hit.chunkId, hit.score])),
      ...this.relevanceThresholds(),
    });

    // Observabilidade para calibrar o piso com dados reais de produção
    // (ver docs/runbook.md — "Calibrar o piso de relevância").
    this.logger.log(
      `RETRIEVAL_COVERAGE coverage=${floor.coverage} best=${floor.bestSemanticScore.toFixed(3)} ` +
        `candidates=${rankedIds.length} kept=${floor.keptChunkIds.length} discarded=${floor.discardedCount}`,
    );

    const selectedIds = floor.keptChunkIds.slice(0, topK);

    if (selectedIds.length === 0) {
      const empty: RetrievalResult = {
        chunks: [],
        totalRetrieved: 0,
        coverage: 'none',
        bestSemanticScore: floor.bestSemanticScore,
        discardedByFloor: floor.discardedCount,
      };
      await this.redis.set(cacheKey, JSON.stringify(empty), 60);
      return empty;
    }

    const chunks = await this.fetchChunks(selectedIds);
    const scored = chunks.map((chunk) => ({
      ...chunk,
      score: boostedScores.get(chunk.id) ?? 0,
    }));

    const result: RetrievalResult = {
      chunks: sortByScore(scored),
      totalRetrieved: scored.length,
      coverage: floor.coverage,
      bestSemanticScore: floor.bestSemanticScore,
      discardedByFloor: floor.discardedCount,
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
