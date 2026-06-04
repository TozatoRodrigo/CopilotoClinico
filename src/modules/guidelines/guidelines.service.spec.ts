import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GuidelinesService, type IngestGuidelineInput } from './guidelines.service';
import { PrismaService } from '../../config/prisma.service';
import { AiGatewayService } from '../ai-gateway/ai-gateway.service';

const baseIngestInput: IngestGuidelineInput = {
  text: 'Hypertension should be treated with ACE inhibitors as first-line therapy.',
  source: 'WHO HTN 2023',
  sourceVersion: '1.0',
  specialty: 'cardiology',
  evidenceLevel: 'A',
};

const mockEmbedding = [0.1, 0.2, 0.3];

describe('GuidelinesService', () => {
  let service: GuidelinesService;
  let prisma: {
    guidelineChunk: {
      create: ReturnType<typeof vi.fn>;
      findUnique: ReturnType<typeof vi.fn>;
    };
    $executeRawUnsafe: ReturnType<typeof vi.fn>;
  };
  let aiGateway: {
    embed: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();

    prisma = {
      guidelineChunk: {
        create: vi.fn(),
        findUnique: vi.fn(),
      },
      $executeRawUnsafe: vi.fn().mockResolvedValue(1),
    };

    aiGateway = {
      embed: vi.fn().mockResolvedValue({ embeddings: [mockEmbedding] }),
    };

    service = new GuidelinesService(
      prisma as unknown as PrismaService,
      aiGateway as unknown as AiGatewayService,
    );
  });

  describe('ingest', () => {
    it('creates chunks and stores them with embeddings', async () => {
      prisma.guidelineChunk.create.mockResolvedValue({ id: 'chunk-uuid-1' });

      const result = await service.ingest(baseIngestInput);

      expect(result).toHaveLength(1);
      expect(aiGateway.embed).toHaveBeenCalledWith([baseIngestInput.text]);
      expect(prisma.guidelineChunk.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          source: baseIngestInput.source,
          sourceVersion: baseIngestInput.sourceVersion,
          specialty: baseIngestInput.specialty,
          evidenceLevel: baseIngestInput.evidenceLevel,
          text: baseIngestInput.text,
        }),
      });
      expect(prisma.$executeRawUnsafe).toHaveBeenCalledWith(
        `UPDATE guideline_chunks SET embedding = $1::vector WHERE id = $2`,
        '[0.1,0.2,0.3]',
        'chunk-uuid-1',
      );
    });

    it('handles long text by creating multiple chunks', async () => {
      const longText = 'X'.repeat(1200);
      const input: IngestGuidelineInput = { ...baseIngestInput, text: longText };

      aiGateway.embed.mockResolvedValue({
        embeddings: [mockEmbedding, mockEmbedding, mockEmbedding],
      });

      prisma.guidelineChunk.create.mockResolvedValue({ id: 'chunk-uuid' });

      const result = await service.ingest(input);

      expect(result.length).toBeGreaterThan(1);
      expect(aiGateway.embed).toHaveBeenCalled();
      expect(prisma.guidelineChunk.create).toHaveBeenCalledTimes(result.length);
      expect(prisma.$executeRawUnsafe).toHaveBeenCalledTimes(result.length);
    });

    it('handles empty text gracefully', async () => {
      const input: IngestGuidelineInput = { ...baseIngestInput, text: '' };

      const result = await service.ingest(input);

      expect(result).toEqual([]);
      expect(aiGateway.embed).not.toHaveBeenCalled();
      expect(prisma.guidelineChunk.create).not.toHaveBeenCalled();
      expect(prisma.$executeRawUnsafe).not.toHaveBeenCalled();
    });
  });

  describe('getChunkById', () => {
    it('returns a single chunk by ID', async () => {
      const mockChunk = {
        id: 'chunk-uuid-1',
        source: 'WHO HTN 2023',
        sourceVersion: '1.0',
        specialty: 'cardiology',
        evidenceLevel: 'A',
        text: 'Some guideline text',
        metadata: { charStart: 0, charEnd: 20, chunkIndex: 0 },
        validFrom: new Date(),
        validTo: null,
      };

      prisma.guidelineChunk.findUnique.mockResolvedValue(mockChunk);

      const result = await service.getChunkById('chunk-uuid-1');

      expect(prisma.guidelineChunk.findUnique).toHaveBeenCalledWith({
        where: { id: 'chunk-uuid-1' },
        select: {
          id: true,
          source: true,
          sourceVersion: true,
          specialty: true,
          evidenceLevel: true,
          text: true,
          metadata: true,
          validFrom: true,
          validTo: true,
        },
      });
      expect(result).toEqual(mockChunk);
    });

    it('returns null for non-existent ID', async () => {
      prisma.guidelineChunk.findUnique.mockResolvedValue(null);

      const result = await service.getChunkById('non-existent');

      expect(result).toBeNull();
    });
  });
});
