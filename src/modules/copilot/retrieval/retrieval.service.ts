import { createHash } from 'node:crypto';
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
import {
  DEFAULT_OFFICIAL_CHRONIC_PENALTY,
  DEFAULT_OFFICIAL_MAX_PER_DOCUMENT,
  DEFAULT_OFFICIAL_MIN_SEMANTIC_SCORE,
  DEFAULT_OFFICIAL_TOP_K,
  selectOfficialChunks,
  type OfficialCareSetting,
  type OfficialHit,
} from './official-search';

/**
 * ADR-010 — Chunks da base oficial do MS (PCDT/DDT/DB/PU), fonte "oficial, não
 * revisada". Pool separado da base curada: nunca entra em `chunks` nem mexe em
 * `coverage`, para o prompt poder tratá-la em bloco próprio.
 */
export interface OfficialRetrieval {
  /** `false` quando `OFFICIAL_GUIDELINES_ENABLED=false`. */
  enabled: boolean;
  /** `score` = similaridade efetiva (já penalizada quando o documento é crônico). */
  chunks: RetrievedChunk[];
  bestSemanticScore: number;
  discardedByFloor: number;
}

const OFFICIAL_DISABLED: OfficialRetrieval = {
  enabled: false,
  chunks: [],
  bestSemanticScore: 0,
  discardedByFloor: 0,
};

/** Candidatos lidos do banco por vaga: folga para o teto por documento. */
const OFFICIAL_CANDIDATES_PER_SLOT = 6;
const CARE_SETTINGS: readonly OfficialCareSetting[] = ['agudo', 'cronico', 'misto', 'indefinido'];

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
  /** ADR-010 — base oficial do MS, em pool separado. */
  official: OfficialRetrieval;
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
   * ADR-010 — ligada por padrão (decisão de produto de 24/09/2026).
   * `OFFICIAL_GUIDELINES_ENABLED=false` tira a base oficial do retrieval sem
   * redeploy e sem apagar dados.
   */
  private officialEnabled(): boolean {
    const raw = this.config.get<string | boolean | undefined>('OFFICIAL_GUIDELINES_ENABLED');
    if (raw === undefined || raw === null || raw === '') return true;
    return !['false', '0', 'off', 'no'].includes(String(raw).trim().toLowerCase());
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

    const officialEnabled = this.officialEnabled();
    const cacheKey = this.cacheKey(query, topK, institutionId, officialEnabled);
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
        official: parsed.official ?? OFFICIAL_DISABLED,
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

    // Calculada mesmo quando a base curada não cobre o caso: é justamente aí
    // que um PCDT (ex.: acidente ofídico) pode ser a única fonte disponível.
    const official = officialEnabled
      ? await this.searchOfficial(queryEmbedding)
      : OFFICIAL_DISABLED;

    if (selectedIds.length === 0) {
      const empty: RetrievalResult = {
        chunks: [],
        totalRetrieved: 0,
        coverage: 'none',
        bestSemanticScore: floor.bestSemanticScore,
        discardedByFloor: floor.discardedCount,
        official,
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
      official,
    };

    await this.redis.set(cacheKey, JSON.stringify(result), 60);
    return result;
  }

  /**
   * ADR-010 — busca na base oficial. Só semântica: a coluna `text_tsv` ainda
   * não é populada (ver plano, §5), então a busca lexical não acharia nada.
   * Conteúdo oficial é sempre global (sem instituição).
   */
  /**
   * Chave do cache da busca (TTL 60 s).
   *
   * Antes a chave usava só `base64(query).slice(0, 64)` — os ~48 primeiros
   * caracteres do caso. Dois casos que começam igual ("Paciente do sexo
   * masculino, 45 anos, ...") colidiam e o segundo recebia, por até 60 s, a
   * evidência do PRIMEIRO: diretriz de outro paciente no prompt. Visto em
   * produção em 24/09/2026. Agora a chave é o hash da consulta INTEIRA mais
   * tudo que muda o resultado — inclusive os limiares, para uma recalibração
   * por env valer na hora em vez de servir seleção antiga do cache.
   */
  private cacheKey(
    query: string,
    topK: number,
    institutionId: string | null | undefined,
    officialEnabled: boolean,
  ): string {
    const digest = createHash('sha256')
      .update(
        JSON.stringify({
          query,
          topK,
          institutionId: institutionId ?? null,
          officialEnabled,
          relevance: this.relevanceThresholds(),
          official: this.officialOptions(),
        }),
      )
      .digest('hex');
    return `retrieval:${digest}`;
  }

  private officialOptions() {
    return {
      minSemanticScore: this.numericConfig(
        'OFFICIAL_MIN_SEMANTIC_SCORE',
        DEFAULT_OFFICIAL_MIN_SEMANTIC_SCORE,
      ),
      chronicPenalty: this.numericConfig(
        'OFFICIAL_CHRONIC_PENALTY',
        DEFAULT_OFFICIAL_CHRONIC_PENALTY,
      ),
      maxPerDocument: this.numericConfig(
        'OFFICIAL_MAX_CHUNKS_PER_DOCUMENT',
        DEFAULT_OFFICIAL_MAX_PER_DOCUMENT,
      ),
      topK: this.numericConfig('OFFICIAL_RETRIEVAL_TOP_K', DEFAULT_OFFICIAL_TOP_K),
    };
  }

  private async searchOfficial(embedding: number[]): Promise<OfficialRetrieval> {
    const options = this.officialOptions();
    if (options.topK <= 0) return { ...OFFICIAL_DISABLED, enabled: true };

    const vectorStr = `[${embedding.join(',')}]`;
    const rows = await this.prisma.$queryRaw<
      Array<{
        id: string;
        similarity: number;
        document_id: string | null;
        care_setting: string | null;
      }>
    >`
      SELECT id, 1 - (embedding <=> ${vectorStr}::vector) AS similarity, document_id,
             metadata->>'careSetting' AS care_setting
      FROM guideline_chunks
      WHERE embedding IS NOT NULL
        AND status = 'official_unreviewed'
        AND valid_from <= NOW()
        AND (valid_to IS NULL OR valid_to > NOW())
        AND institution_id IS NULL
      ORDER BY embedding <=> ${vectorStr}::vector
      LIMIT ${options.topK * OFFICIAL_CANDIDATES_PER_SLOT}
    `;

    const hits: OfficialHit[] = rows.map((row) => ({
      chunkId: row.id,
      similarity: Number(row.similarity),
      // Sem documento, cada chunk conta como documento próprio no teto.
      documentId: row.document_id ?? row.id,
      careSetting: CARE_SETTINGS.includes(row.care_setting as OfficialCareSetting)
        ? (row.care_setting as OfficialCareSetting)
        : 'indefinido',
    }));

    const selection = selectOfficialChunks(hits, options);

    this.logger.log(
      `OFFICIAL_RETRIEVAL best=${selection.bestSemanticScore.toFixed(3)} candidates=${hits.length} ` +
        `kept=${selection.selected.length} discarded=${selection.discardedByFloor} ` +
        `docs=${new Set(selection.selected.map((hit) => hit.documentId)).size}`,
    );

    if (selection.selected.length === 0) {
      return {
        enabled: true,
        chunks: [],
        bestSemanticScore: selection.bestSemanticScore,
        discardedByFloor: selection.discardedByFloor,
      };
    }

    const scoreById = new Map(selection.selected.map((hit) => [hit.chunkId, hit.effectiveScore]));
    const chunks = await this.fetchChunks([...scoreById.keys()]);

    return {
      enabled: true,
      chunks: sortByScore(chunks.map((chunk) => ({ ...chunk, score: scoreById.get(chunk.id)! }))),
      bestSemanticScore: selection.bestSemanticScore,
      discardedByFloor: selection.discardedByFloor,
    };
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
