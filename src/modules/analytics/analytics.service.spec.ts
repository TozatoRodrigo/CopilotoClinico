import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AnalyticsService } from './analytics.service';
import { PrismaService } from '../../config/prisma.service';

describe('AnalyticsService', () => {
  let service: AnalyticsService;
  let prisma: {
    document: {
      groupBy: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
    };
    aiInteraction: {
      aggregate: ReturnType<typeof vi.fn>;
      count: ReturnType<typeof vi.fn>;
    };
  };

  beforeEach(() => {
    vi.clearAllMocks();

    prisma = {
      document: {
        groupBy: vi.fn().mockResolvedValue([]),
        findMany: vi.fn().mockResolvedValue([]),
      },
      aiInteraction: {
        aggregate: vi.fn().mockResolvedValue({ _count: { id: 0 } }),
        count: vi.fn().mockResolvedValue(0),
      },
    };

    service = new AnalyticsService(prisma as unknown as PrismaService);
  });

  describe('getStats', () => {
    it('returns only non-sensitive aggregate fields without patient data', async () => {
      prisma.document.groupBy.mockResolvedValue([{ type: 'soap', _count: { id: 5 } }]);
      prisma.document.findMany.mockResolvedValue([]);
      prisma.aiInteraction.aggregate.mockResolvedValue({ _count: { id: 10 } });
      prisma.aiInteraction.count.mockResolvedValue(2);

      const result = await service.getStats(30);

      expect(result).toHaveProperty('period');
      expect(result).toHaveProperty('documents');
      expect(result).toHaveProperty('inference');
      expect(result).toHaveProperty('generatedAt');

      // No patient-sensitive fields
      expect(result).not.toHaveProperty('patientRef');
      expect(result).not.toHaveProperty('physicianId');
      expect(result.documents).not.toHaveProperty('patientRef');
    });

    it('aggregates byType correctly from multiple document types', async () => {
      prisma.document.groupBy.mockResolvedValue([
        { type: 'soap', _count: { id: 10 } },
        { type: 'prescricao', _count: { id: 5 } },
        { type: 'alta', _count: { id: 3 } },
      ]);

      const result = await service.getStats(30);

      expect(result.documents.byType).toEqual({ soap: 10, prescricao: 5, alta: 3 });
      expect(result.documents.total).toBe(18);
    });

    it('calculates uncertaintyRate correctly', async () => {
      prisma.aiInteraction.aggregate.mockResolvedValue({ _count: { id: 20 } });
      prisma.aiInteraction.count.mockResolvedValue(5);

      const result = await service.getStats(30);

      expect(result.inference.total).toBe(20);
      expect(result.inference.uncertaintyRate).toBe(0.25);
    });

    it('returns uncertaintyRate of 0 when no inferences', async () => {
      prisma.aiInteraction.aggregate.mockResolvedValue({ _count: { id: 0 } });
      prisma.aiInteraction.count.mockResolvedValue(0);

      const result = await service.getStats(30);

      expect(result.inference.uncertaintyRate).toBe(0);
    });

    it('returns avgConfirmationMinutes as null when no confirmed documents', async () => {
      prisma.document.findMany.mockResolvedValue([]);

      const result = await service.getStats(30);

      expect(result.documents.confirmed).toBe(0);
      expect(result.documents.avgConfirmationMinutes).toBeNull();
    });

    it('calculates avgConfirmationMinutes when confirmed documents exist', async () => {
      const createdAt = new Date('2025-01-01T10:00:00Z');
      const confirmedAt = new Date('2025-01-01T10:30:00Z'); // 30 minutes later

      prisma.document.findMany.mockResolvedValue([{ createdAt, confirmedAt }]);

      const result = await service.getStats(30);

      expect(result.documents.confirmed).toBe(1);
      expect(result.documents.avgConfirmationMinutes).toBe(30);
    });

    it('sets period based on days parameter', async () => {
      const result = await service.getStats(7);

      expect(result.period).toBe('last7days');
    });

    it('includes generatedAt as ISO string', async () => {
      const result = await service.getStats(30);

      expect(result.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });
  });
});
