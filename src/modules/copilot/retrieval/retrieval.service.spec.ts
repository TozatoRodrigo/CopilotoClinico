import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RetrievalService } from './retrieval.service';
import { PrismaService } from '../../../config/prisma.service';
import { AiGatewayService } from '../../ai-gateway/ai-gateway.service';
import { RedisService } from '../../redis/redis.service';

describe('RetrievalService', () => {
  let service: RetrievalService;
  let prismaMock: {
    $queryRaw: ReturnType<typeof vi.fn>;
    guidelineChunk: {
      findMany: ReturnType<typeof vi.fn>;
    };
  };
  let aiGatewayMock: {
    embed: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();

    prismaMock = {
      $queryRaw: vi.fn(),
      guidelineChunk: {
        findMany: vi.fn(),
      },
    };

    aiGatewayMock = {
      embed: vi.fn(),
    };

    const redisMock = {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue(undefined),
    } as unknown as RedisService;

    service = new RetrievalService(
      prismaMock as unknown as PrismaService,
      aiGatewayMock as unknown as AiGatewayService,
      redisMock,
    );
  });

  describe('search', () => {
    it('returns chunks with fused scores', async () => {
      aiGatewayMock.embed.mockResolvedValue({
        embeddings: [[0.1, 0.2, 0.3]],
      });

      prismaMock.$queryRaw
        .mockResolvedValueOnce([
          { id: 'chunk-1', similarity: 0.95, institution_id: null },
          { id: 'chunk-2', similarity: 0.85, institution_id: null },
        ])
        .mockResolvedValueOnce([
          { id: 'chunk-2', rank: 0.8, institution_id: null },
          { id: 'chunk-3', rank: 0.6, institution_id: null },
        ]);

      prismaMock.guidelineChunk.findMany.mockResolvedValue([
        {
          id: 'chunk-1',
          text: 'Texto chunk 1',
          source: 'diretriz-a',
          sourceVersion: '1.0',
          specialty: 'cardiologia',
          evidenceLevel: 'A',
          institutionId: null,
          metadata: { page: 1 },
        },
        {
          id: 'chunk-2',
          text: 'Texto chunk 2',
          source: 'diretriz-b',
          sourceVersion: '2.0',
          specialty: 'neurologia',
          evidenceLevel: 'B',
          institutionId: null,
          metadata: null,
        },
        {
          id: 'chunk-3',
          text: 'Texto chunk 3',
          source: 'diretriz-c',
          sourceVersion: '1.0',
          specialty: 'ortopedia',
          evidenceLevel: null,
          institutionId: null,
          metadata: { section: 'intro' },
        },
      ]);

      const result = await service.search('tratamento cardiaco', 5);

      expect(result.totalRetrieved).toBe(3);
      expect(result.chunks).toHaveLength(3);
      expect(result.chunks[0]!.score).toBeGreaterThanOrEqual(result.chunks[1]!.score);
      expect(result.chunks[1]!.score).toBeGreaterThanOrEqual(result.chunks[2]!.score);
      expect(result.chunks[0]!.id).toBe('chunk-2');
    });

    it('returns empty when no results', async () => {
      aiGatewayMock.embed.mockResolvedValue({
        embeddings: [[0.1, 0.2]],
      });

      prismaMock.$queryRaw.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

      const result = await service.search('nonexistent query');

      expect(result.chunks).toEqual([]);
      expect(result.totalRetrieved).toBe(0);
    });

    it('delegates to embedding and raw queries', async () => {
      aiGatewayMock.embed.mockResolvedValue({
        embeddings: [[0.1]],
      });

      prismaMock.$queryRaw
        .mockResolvedValueOnce([{ id: 'c1', similarity: 0.9, institution_id: null }])
        .mockResolvedValueOnce([{ id: 'c1', rank: 0.5, institution_id: null }]);

      prismaMock.guidelineChunk.findMany.mockResolvedValue([
        {
          id: 'c1',
          text: 't',
          source: 's',
          sourceVersion: 'v1',
          specialty: 'spec',
          evidenceLevel: null,
          institutionId: null,
          metadata: null,
        },
      ]);

      await service.search('test query', 3);

      expect(aiGatewayMock.embed).toHaveBeenCalledWith(['test query']);
      expect(prismaMock.$queryRaw).toHaveBeenCalledTimes(2);
      expect(prismaMock.guidelineChunk.findMany).toHaveBeenCalledWith({
        where: { id: { in: ['c1'] } },
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
    });

    it('uses index-compatible vector distance SQL for semantic search', async () => {
      aiGatewayMock.embed.mockResolvedValue({
        embeddings: [[0.1]],
      });

      prismaMock.$queryRaw.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

      await service.search('test query', 3);

      const semanticQuery = String(prismaMock.$queryRaw.mock.calls[0]![0]);
      expect(semanticQuery).toContain('embedding <=>');
      expect(semanticQuery).toContain('embedding IS NOT NULL');
      expect(semanticQuery).not.toContain('embedding::text::vector');
    });

    function findInstitutionFilterSql(callArgs: unknown[]): string {
      const fragment = callArgs.find(
        (arg): arg is { sql: string } =>
          typeof arg === 'object' && arg !== null && 'sql' in arg && 'values' in arg,
      );
      return fragment?.sql ?? '';
    }

    it('restricts queries to global content (institution_id IS NULL) when no institution is given', async () => {
      aiGatewayMock.embed.mockResolvedValue({ embeddings: [[0.1]] });
      prismaMock.$queryRaw.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

      await service.search('test query', 3);

      expect(findInstitutionFilterSql(prismaMock.$queryRaw.mock.calls[0]!)).toContain(
        'institution_id IS NULL',
      );
      expect(findInstitutionFilterSql(prismaMock.$queryRaw.mock.calls[1]!)).toContain(
        'institution_id IS NULL',
      );
    });

    it('includes global and institution-matching content when institutionId is given', async () => {
      aiGatewayMock.embed.mockResolvedValue({ embeddings: [[0.1]] });
      prismaMock.$queryRaw.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

      await service.search('test query', 3, 'institution-a');

      expect(findInstitutionFilterSql(prismaMock.$queryRaw.mock.calls[0]!)).toContain(
        'institution_id IS NULL OR institution_id =',
      );
    });

    it('boosts a chunk from the encounter institution above an equivalently-scored global chunk', async () => {
      aiGatewayMock.embed.mockResolvedValue({ embeddings: [[0.1]] });

      prismaMock.$queryRaw
        .mockResolvedValueOnce([
          { id: 'global-chunk', similarity: 0.5, institution_id: null },
          { id: 'institutional-chunk', similarity: 0.5, institution_id: 'institution-a' },
        ])
        .mockResolvedValueOnce([]);

      prismaMock.guidelineChunk.findMany.mockResolvedValue([
        {
          id: 'global-chunk',
          text: 'Diretriz pública',
          source: 'diretriz-publica',
          sourceVersion: '1.0',
          specialty: 'clinica',
          evidenceLevel: 'A',
          institutionId: null,
          metadata: {},
        },
        {
          id: 'institutional-chunk',
          text: 'Protocolo institucional',
          source: 'protocolo-hc-x',
          sourceVersion: '2.0',
          specialty: 'clinica',
          evidenceLevel: 'A',
          institutionId: 'institution-a',
          metadata: {},
        },
      ]);

      const result = await service.search('caso clinico', 5, 'institution-a');

      expect(result.chunks[0]!.id).toBe('institutional-chunk');
      expect(result.chunks[0]!.institutionId).toBe('institution-a');
    });
  });
});
