import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { GuidelinesService, type IngestGuidelineInput } from './guidelines.service';
import { PrismaService } from '../../config/prisma.service';
import { AiGatewayService } from '../ai-gateway/ai-gateway.service';
import { AuditService } from '../audit/audit.service';

const baseIngestInput: IngestGuidelineInput = {
  text: 'Hypertension should be treated with ACE inhibitors as first-line therapy.',
  source: 'WHO HTN 2023',
  sourceVersion: '1.0',
  specialty: 'cardiology',
  evidenceLevel: 'A',
  cenario: 'crise_hipertensiva',
  redFlags: ['dor toracica', 'deficit neurologico focal'],
};

const mockEmbedding = [0.1, 0.2, 0.3];

describe('GuidelinesService', () => {
  let service: GuidelinesService;
  let prisma: {
    guidelineChunk: {
      create: ReturnType<typeof vi.fn>;
      findUnique: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
      count: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
      updateMany: ReturnType<typeof vi.fn>;
    };
    $executeRaw: ReturnType<typeof vi.fn>;
    $queryRawUnsafe: ReturnType<typeof vi.fn>;
  };
  let aiGateway: {
    embed: ReturnType<typeof vi.fn>;
  };
  let auditService: { log: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();

    prisma = {
      guidelineChunk: {
        create: vi.fn(),
        findUnique: vi.fn(),
        findMany: vi.fn(),
        count: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
      },
      $executeRaw: vi.fn().mockResolvedValue(1),
      $queryRawUnsafe: vi.fn().mockResolvedValue([]),
    };

    aiGateway = {
      embed: vi.fn().mockResolvedValue({ embeddings: [mockEmbedding] }),
    };

    auditService = { log: vi.fn().mockResolvedValue(undefined) };

    service = new GuidelinesService(
      prisma as unknown as PrismaService,
      aiGateway as unknown as AiGatewayService,
      auditService as unknown as AuditService,
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
          status: 'approved',
          metadata: expect.objectContaining({
            cenario: 'crise_hipertensiva',
            redFlags: ['dor toracica', 'deficit neurologico focal'],
          }),
        }),
      });
      expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
    });

    it('PROT-004: persists institutionId on chunks when provided', async () => {
      prisma.guidelineChunk.create.mockResolvedValue({ id: 'chunk-uuid-1' });

      await service.ingest({ ...baseIngestInput, institutionId: 'institution-a' });

      expect(prisma.guidelineChunk.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ institutionId: 'institution-a' }),
      });
    });

    it('PROT-004: defaults institutionId to null when not provided', async () => {
      prisma.guidelineChunk.create.mockResolvedValue({ id: 'chunk-uuid-1' });

      await service.ingest(baseIngestInput);

      expect(prisma.guidelineChunk.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ institutionId: null }),
      });
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
      expect(prisma.$executeRaw).toHaveBeenCalledTimes(result.length);
    });

    it('handles empty text gracefully', async () => {
      const input: IngestGuidelineInput = { ...baseIngestInput, text: '' };

      const result = await service.ingest(input);

      expect(result).toEqual([]);
      expect(aiGateway.embed).not.toHaveBeenCalled();
      expect(prisma.guidelineChunk.create).not.toHaveBeenCalled();
      expect(prisma.$executeRaw).not.toHaveBeenCalled();
    });

    it('logs audit event after ingestion', async () => {
      prisma.guidelineChunk.create.mockResolvedValue({ id: 'chunk-uuid-1' });

      await service.ingest(baseIngestInput);

      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          actorId: 'system',
          action: 'GUIDELINE_INGESTED',
          entity: 'GuidelineChunk',
          entityId: `${baseIngestInput.source}@${baseIngestInput.sourceVersion}`,
        }),
      );
    });
  });

  describe('ingestForReview', () => {
    it('creates chunks as pending_review and audits GUIDELINE_BATCH_INGESTED', async () => {
      prisma.guidelineChunk.create.mockResolvedValue({ id: 'chunk-uuid-1' });
      prisma.guidelineChunk.updateMany.mockResolvedValue({ count: 0 });

      const result = await service.ingestForReview(baseIngestInput);

      expect(prisma.guidelineChunk.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ status: 'pending_review' }),
      });
      expect(result).toEqual({
        source: baseIngestInput.source,
        sourceVersion: baseIngestInput.sourceVersion,
        chunksCreated: 1,
        superseded: 0,
      });
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          actorId: 'system',
          action: 'GUIDELINE_BATCH_INGESTED',
          entity: 'GuidelineChunk',
          entityId: `${baseIngestInput.source}@${baseIngestInput.sourceVersion}`,
          payload: expect.objectContaining({ chunksCreated: 1, superseded: 0 }),
        }),
      );
    });

    it('marks chunks from previous versions of the same source as superseded', async () => {
      prisma.guidelineChunk.create.mockResolvedValue({ id: 'chunk-uuid-2' });
      prisma.guidelineChunk.updateMany.mockResolvedValue({ count: 3 });

      const result = await service.ingestForReview({ ...baseIngestInput, sourceVersion: '2.0' });

      expect(prisma.guidelineChunk.updateMany).toHaveBeenCalledWith({
        where: {
          source: baseIngestInput.source,
          sourceVersion: { not: '2.0' },
          institutionId: null,
          status: { in: ['approved', 'pending_review'] },
        },
        data: { status: 'superseded' },
      });
      expect(result.superseded).toBe(3);
    });

    it('handles empty text gracefully without auditing or superseding', async () => {
      const result = await service.ingestForReview({ ...baseIngestInput, text: '' });

      expect(result).toEqual({
        source: baseIngestInput.source,
        sourceVersion: baseIngestInput.sourceVersion,
        chunksCreated: 0,
        superseded: 0,
      });
      expect(prisma.guidelineChunk.updateMany).not.toHaveBeenCalled();
      expect(auditService.log).not.toHaveBeenCalled();
    });
  });

  describe('listPending', () => {
    it('returns chunks with status pending_review', async () => {
      const pendingChunks = [
        {
          id: 'chunk-pending-1',
          source: 'Diretriz X',
          sourceVersion: '2.0',
          specialty: 'clinica',
          evidenceLevel: 'A',
          text: 'Texto pendente',
          metadata: {},
          createdAt: new Date('2026-06-13'),
        },
      ];
      prisma.guidelineChunk.findMany.mockResolvedValue(pendingChunks);

      const result = await service.listPending();

      expect(prisma.guidelineChunk.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { status: 'pending_review' } }),
      );
      expect(result).toEqual(pendingChunks);
    });
  });

  describe('approveChunk', () => {
    it('approves a pending chunk, records the reviewer and audits GUIDELINE_APPROVED', async () => {
      const chunk = {
        id: 'chunk-pending-1',
        source: 'Diretriz X',
        sourceVersion: '2.0',
        status: 'pending_review',
      };
      prisma.guidelineChunk.findUnique.mockResolvedValue(chunk);
      prisma.guidelineChunk.update.mockResolvedValue({
        ...chunk,
        status: 'approved',
        reviewedBy: 'curator-1',
        reviewedAt: new Date('2026-06-13'),
      });

      const result = await service.approveChunk('chunk-pending-1', 'curator-1');

      expect(prisma.guidelineChunk.update).toHaveBeenCalledWith({
        where: { id: 'chunk-pending-1' },
        data: { status: 'approved', reviewedBy: 'curator-1', reviewedAt: expect.any(Date) },
      });
      expect(result.status).toBe('approved');
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          actorId: 'curator-1',
          action: 'GUIDELINE_APPROVED',
          entity: 'GuidelineChunk',
          entityId: 'chunk-pending-1',
        }),
      );
    });

    it('throws NotFoundException for an unknown chunk id', async () => {
      prisma.guidelineChunk.findUnique.mockResolvedValue(null);

      await expect(service.approveChunk('missing-chunk', 'curator-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws ConflictException when the chunk is not pending_review', async () => {
      prisma.guidelineChunk.findUnique.mockResolvedValue({
        id: 'chunk-1',
        source: 'Diretriz X',
        sourceVersion: '1.0',
        status: 'approved',
      });

      await expect(service.approveChunk('chunk-1', 'curator-1')).rejects.toThrow(ConflictException);
      expect(prisma.guidelineChunk.update).not.toHaveBeenCalled();
    });
  });

  describe('rejectChunk', () => {
    it('rejects a pending chunk, records the reviewer/reason and audits GUIDELINE_REJECTED', async () => {
      const chunk = {
        id: 'chunk-pending-1',
        source: 'Diretriz X',
        sourceVersion: '2.0',
        status: 'pending_review',
      };
      prisma.guidelineChunk.findUnique.mockResolvedValue(chunk);
      prisma.guidelineChunk.update.mockResolvedValue({
        ...chunk,
        status: 'rejected',
        reviewedBy: 'curator-1',
        reviewedAt: new Date('2026-06-13'),
      });

      const result = await service.rejectChunk('chunk-pending-1', 'curator-1', 'Texto desatualizado');

      expect(prisma.guidelineChunk.update).toHaveBeenCalledWith({
        where: { id: 'chunk-pending-1' },
        data: { status: 'rejected', reviewedBy: 'curator-1', reviewedAt: expect.any(Date) },
      });
      expect(result.status).toBe('rejected');
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          actorId: 'curator-1',
          action: 'GUIDELINE_REJECTED',
          entity: 'GuidelineChunk',
          entityId: 'chunk-pending-1',
          payload: expect.objectContaining({ reason: 'Texto desatualizado' }),
        }),
      );
    });

    it('throws ConflictException when the chunk is not pending_review', async () => {
      prisma.guidelineChunk.findUnique.mockResolvedValue({
        id: 'chunk-1',
        source: 'Diretriz X',
        sourceVersion: '1.0',
        status: 'rejected',
      });

      await expect(service.rejectChunk('chunk-1', 'curator-1')).rejects.toThrow(ConflictException);
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

  describe('listSources', () => {
    it('returns aggregated source list with chunk counts', async () => {
      const now = new Date();
      prisma.guidelineChunk.findMany.mockResolvedValue([
        { source: 'WHO HTN 2023', sourceVersion: '1.0', validFrom: now, validTo: null },
        {
          source: 'CFM 2022',
          sourceVersion: '2.0',
          validFrom: now,
          validTo: new Date('2025-01-01'),
        },
      ]);
      prisma.guidelineChunk.count.mockResolvedValueOnce(3).mockResolvedValueOnce(0);

      const result = await service.listSources();

      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({
        source: 'WHO HTN 2023',
        sourceVersion: '1.0',
        chunkCount: 3,
        active: true,
      });
      expect(result[1]).toMatchObject({
        source: 'CFM 2022',
        sourceVersion: '2.0',
        chunkCount: 0,
        active: false,
      });
    });

    it('returns empty array when no guidelines exist', async () => {
      prisma.guidelineChunk.findMany.mockResolvedValue([]);

      const result = await service.listSources();

      expect(result).toEqual([]);
    });
  });

  describe('deactivateSource', () => {
    it('sets validTo on active chunks and returns count', async () => {
      prisma.guidelineChunk.updateMany.mockResolvedValue({ count: 5 });

      const result = await service.deactivateSource('WHO HTN 2023', '1.0');

      expect(prisma.guidelineChunk.updateMany).toHaveBeenCalledWith({
        where: { source: 'WHO HTN 2023', sourceVersion: '1.0', validTo: null },
        data: { validTo: expect.any(Date) },
      });
      expect(result).toEqual({ deactivated: 5 });
    });

    it('logs audit event after deactivation', async () => {
      prisma.guidelineChunk.updateMany.mockResolvedValue({ count: 2 });

      await service.deactivateSource('CFM 2022', '2.0', 'admin-user-id');

      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          actorId: 'admin-user-id',
          action: 'GUIDELINE_DEACTIVATED',
          entity: 'GuidelineChunk',
          entityId: 'CFM 2022@2.0',
        }),
      );
    });

    it('returns zero deactivated when no active chunks exist', async () => {
      prisma.guidelineChunk.updateMany.mockResolvedValue({ count: 0 });

      const result = await service.deactivateSource('NONEXISTENT', '1.0');

      expect(result).toEqual({ deactivated: 0 });
    });
  });

  describe('searchChunks', () => {
    it('returns empty array for query shorter than 2 chars', async () => {
      const result = await service.searchChunks('a');
      expect(result).toEqual([]);
      expect(prisma.$queryRawUnsafe).not.toHaveBeenCalled();
    });

    it('returns empty array for whitespace-only query', async () => {
      const result = await service.searchChunks('   ');
      expect(result).toEqual([]);
      expect(prisma.$queryRawUnsafe).not.toHaveBeenCalled();
    });

    it('calls $queryRawUnsafe with query and default limit', async () => {
      prisma.$queryRawUnsafe.mockResolvedValue([
        {
          id: 'chunk-1',
          source: 'WHO HTN 2023',
          sourceVersion: '1.0',
          specialty: 'cardiology',
          evidenceLevel: 'A',
          text: 'ACE inhibitors first-line',
          metadata: {},
          validFrom: new Date('2023-01-01'),
          institutionId: null,
          reviewerName: 'Dr. Silva',
          rank: 0.95,
        },
      ]);

      const result = await service.searchChunks('hipertensao');

      expect(result).toHaveLength(1);
      expect(result[0]!.source).toBe('WHO HTN 2023');
      expect(result[0]!.reviewerName).toBe('Dr. Silva');
      expect(prisma.$queryRawUnsafe).toHaveBeenCalledTimes(1);
      expect(prisma.$queryRawUnsafe).toHaveBeenCalledWith(
        expect.stringContaining('plainto_tsquery'),
        'hipertensao',
        20,
      );
    });

    it('passes specialty filter when provided', async () => {
      prisma.$queryRawUnsafe.mockResolvedValue([]);

      await service.searchChunks('gripe', 'Clínica Médica');

      expect(prisma.$queryRawUnsafe).toHaveBeenCalledWith(
        expect.stringContaining("gc.specialty = $3"),
        'gripe',
        20,
        'Clínica Médica',
      );
    });

    it('respects custom limit', async () => {
      prisma.$queryRawUnsafe.mockResolvedValue([]);

      await service.searchChunks('febre', undefined, 5);

      expect(prisma.$queryRawUnsafe).toHaveBeenCalledWith(
        expect.any(String),
        'febre',
        5,
      );
    });
  });
});
