import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DocumentsService } from './documents.service';
import { PrismaService } from '../../config/prisma.service';
import { AuditService } from '../audit/audit.service';
import { StorageService } from '../storage/storage.service';
import { NotFoundException, ForbiddenException, ConflictException } from '@nestjs/common';

const physicianId = '550e8400-e29b-41d4-a716-446655440000';
const otherPhysicianId = '660e8400-e29b-41d4-a716-446655440001';
const encounterId = '770e8400-e29b-41d4-a716-446655440002';
const aiInteractionId = '880e8400-e29b-41d4-a716-446655440003';
const documentId = '990e8400-e29b-41d4-a716-446655440004';

const copilotRawOutput = {
  reasoning: 'Patient shows signs of hypertension',
  recommendations: [
    {
      action: 'Initiate ACE inhibitor therapy',
      rationale: 'BP consistently above 140/90',
      citationChunkId: 'chunk-1',
      confidence: 0.85,
    },
  ],
  uncertainty: false,
  uncertaintyReason: null,
  differentials: [],
  // PI-04 — generateSBAR() itera redFlags/clarifyingQuestions para montar
  // as seções de vigilâncias/pendências; faltavam aqui (fixture antigo,
  // anterior a esses campos existirem no schema real do copilot output).
  redFlags: [],
  clarifyingQuestions: [],
};

const baseDocument = {
  id: documentId,
  encounterId,
  type: 'soap',
  content: {
    subjective: 'Patient shows signs of hypertension',
    objective: 'Raciocínio clínico: Patient shows signs of hypertension',
    assessment: 'Baseado em 1 recomendações fundamentadas em diretrizes',
    plan: '- Initiate ACE inhibitor therapy (BP consistently above 140/90)',
  },
  physicianEdits: null,
  confirmedBy: null,
  confirmedAt: null,
  contentHash: 'abc123hash',
  createdAt: new Date('2025-01-01'),
};

describe('DocumentsService', () => {
  let service: DocumentsService;
  let auditService: AuditService;
  let storageService: { isAvailable: ReturnType<typeof vi.fn>; upload: ReturnType<typeof vi.fn>; getPresignedUrl: ReturnType<typeof vi.fn> };
  let prisma: {
    encounter: {
      findUnique: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
    physician: {
      findUnique: ReturnType<typeof vi.fn>;
    };
    aiInteraction: {
      findUnique: ReturnType<typeof vi.fn>;
      findFirst: ReturnType<typeof vi.fn>;
    };
    document: {
      create: ReturnType<typeof vi.fn>;
      findUnique: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
    };
  };

  beforeEach(() => {
    vi.clearAllMocks();

    prisma = {
      encounter: {
        findUnique: vi.fn(),
        update: vi.fn(),
      },
      physician: {
        findUnique: vi.fn().mockResolvedValue({ crmVerified: true }),
      },
      aiInteraction: {
        findUnique: vi.fn(),
        findFirst: vi.fn().mockResolvedValue(null),
      },
      document: {
        create: vi.fn(),
        findUnique: vi.fn(),
        update: vi.fn(),
        findMany: vi.fn(),
      },
    };

    auditService = { log: vi.fn().mockResolvedValue(undefined) } as unknown as AuditService;
    storageService = {
      isAvailable: vi.fn().mockReturnValue(false),
      upload: vi.fn(),
      getPresignedUrl: vi.fn(),
    };
    service = new DocumentsService(
      prisma as unknown as PrismaService,
      auditService,
      storageService as unknown as StorageService,
    );
  });

  describe('generate', () => {
    it('creates document with content hash', async () => {
      prisma.encounter.findUnique.mockResolvedValue({
        physicianId,
        patientRef: 'PAT-001',
      });
      prisma.aiInteraction.findUnique.mockResolvedValue({
        rawOutput: copilotRawOutput,
      });
      prisma.document.create.mockResolvedValue(baseDocument);

      const result = await service.generate(physicianId, encounterId, {
        type: 'soap',
        aiInteractionId,
      });

      expect(prisma.document.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            encounterId,
            physicianId,
            type: 'soap',
            contentHash: expect.stringMatching(/^[a-f0-9]{64}$/),
          }),
        }),
      );
      expect(result).toEqual(baseDocument);
    });

    it('creates SBAR document', async () => {
      prisma.encounter.findUnique.mockResolvedValue({
        physicianId,
        patientRef: 'PAT-001',
      });
      prisma.aiInteraction.findUnique.mockResolvedValue({
        rawOutput: copilotRawOutput,
      });
      prisma.document.create.mockResolvedValue({
        ...baseDocument,
        type: 'sbar',
      });

      const result = await service.generate(physicianId, encounterId, {
        type: 'sbar',
        aiInteractionId,
      });

      expect(prisma.document.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ type: 'sbar' }),
        }),
      );
      expect(result.type).toBe('sbar');
    });

    it('throws NotFoundException for missing encounter', async () => {
      prisma.encounter.findUnique.mockResolvedValue(null);

      await expect(
        service.generate(physicianId, encounterId, {
          type: 'soap',
          aiInteractionId,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException for wrong physician', async () => {
      prisma.encounter.findUnique.mockResolvedValue({
        physicianId: otherPhysicianId,
        patientRef: 'PAT-001',
      });

      await expect(
        service.generate(physicianId, encounterId, {
          type: 'soap',
          aiInteractionId,
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws NotFoundException for missing AI interaction', async () => {
      prisma.encounter.findUnique.mockResolvedValue({
        physicianId,
        patientRef: 'PAT-001',
      });
      prisma.aiInteraction.findUnique.mockResolvedValue(null);

      await expect(
        service.generate(physicianId, encounterId, {
          type: 'soap',
          aiInteractionId,
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('edit', () => {
    it('saves physician edits before confirmation', async () => {
      prisma.document.findUnique.mockResolvedValue({
        physicianId,
        confirmedBy: null,
      });
      prisma.document.update.mockResolvedValue({
        ...baseDocument,
        physicianEdits: { subjective: 'Edited text' },
      });

      const result = await service.edit(physicianId, documentId, {
        physicianEdits: { subjective: 'Edited text' },
      });

      expect(prisma.document.update).toHaveBeenCalledWith({
        where: { id: documentId },
        data: { physicianEdits: { subjective: 'Edited text' } },
        select: expect.any(Object),
      });
      expect(result.physicianEdits).toEqual({ subjective: 'Edited text' });
    });

    it('throws NotFoundException for missing document', async () => {
      prisma.document.findUnique.mockResolvedValue(null);

      await expect(
        service.edit(physicianId, documentId, {
          physicianEdits: { subjective: 'Edited' },
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException for wrong physician', async () => {
      prisma.document.findUnique.mockResolvedValue({
        physicianId: otherPhysicianId,
        confirmedBy: null,
      });

      await expect(
        service.edit(physicianId, documentId, {
          physicianEdits: { subjective: 'Edited' },
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws ForbiddenException for confirmed document', async () => {
      prisma.document.findUnique.mockResolvedValue({
        physicianId,
        confirmedBy: physicianId,
      });

      await expect(
        service.edit(physicianId, documentId, {
          physicianEdits: { subjective: 'Edited' },
        }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('confirm — CLIN-003 gate de confirmação humana auditável', () => {
    const docBase = {
      physicianId,
      confirmedBy: null,
      encounterId,
      content: baseDocument.content,
      physicianEdits: null,
    };

    // Cenário 1: confirmação normal → 200, confirmedAt preenchido, contentHash atualizado
    it('confirma documento draft: seta confirmedBy, confirmedAt e contentHash canônico', async () => {
      prisma.document.findUnique.mockResolvedValue(docBase);
      prisma.document.update.mockResolvedValue({
        ...baseDocument,
        confirmedBy: physicianId,
        confirmedAt: new Date(),
      });
      prisma.encounter.update.mockResolvedValue({});

      const result = await service.confirm(physicianId, documentId);

      expect(prisma.document.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: documentId },
          data: expect.objectContaining({
            confirmedBy: physicianId,
            confirmedAt: expect.any(Date),
            contentHash: expect.stringMatching(/^[a-f0-9]{64}$/),
          }),
        }),
      );
      expect(prisma.encounter.update).toHaveBeenCalledWith({
        where: { id: encounterId },
        data: { status: 'finalized' },
      });
      expect(result.confirmedBy).toBe(physicianId);
    });

    // Cenário 2: confirmação dupla → 409 ConflictException
    it('retorna 409 ConflictException ao tentar confirmar documento já confirmado', async () => {
      prisma.document.findUnique.mockResolvedValue({
        ...docBase,
        confirmedBy: physicianId, // já confirmado
      });

      await expect(service.confirm(physicianId, documentId)).rejects.toThrow(ConflictException);
    });

    // Cenário 3: médico diferente do autor pode confirmar (cobertura de plantão)
    it('permite que médico diferente do autor confirme o documento', async () => {
      prisma.document.findUnique.mockResolvedValue({
        ...docBase,
        physicianId: otherPhysicianId, // autor é outro médico
      });
      prisma.document.update.mockResolvedValue({
        ...baseDocument,
        confirmedBy: physicianId, // confirmado pelo médico atual
        confirmedAt: new Date(),
      });
      prisma.encounter.update.mockResolvedValue({});

      const result = await service.confirm(physicianId, documentId);

      expect(result.confirmedBy).toBe(physicianId);
    });

    // Cenário 4: uncertain=true na auditoria quando interaction tinha incerteza
    it('inclui uncertain=true no payload da auditoria quando análise tinha incerteza', async () => {
      prisma.document.findUnique.mockResolvedValue(docBase);
      prisma.document.update.mockResolvedValue({
        ...baseDocument,
        confirmedBy: physicianId,
        confirmedAt: new Date(),
        contentHash: 'newhash',
      });
      prisma.encounter.update.mockResolvedValue({});
      // Sobrescrever o mock default (null) com uma interaction incerta
      prisma.aiInteraction.findFirst.mockResolvedValue({
        uncertainty: true,
        uncertaintyReason: 'Insufficient evidence for pediatric dosing',
      });

      await service.confirm(physicianId, documentId);

      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'DOCUMENT_CONFIRMED',
          payload: expect.objectContaining({
            uncertain: true,
            uncertaintyReason: 'Insufficient evidence for pediatric dosing',
          }),
        }),
      );
    });

    // Cenário 5: hash calculado sobre physicianEdits quando existem edições
    it('usa physicianEdits para computar contentHash quando médico editou o documento', async () => {
      const edits = { subjective: 'Edited by physician', plan: 'Updated plan' };
      prisma.document.findUnique.mockResolvedValue({
        ...docBase,
        physicianEdits: edits,
      });
      prisma.document.update.mockResolvedValue({
        ...baseDocument,
        physicianEdits: edits,
        confirmedBy: physicianId,
        confirmedAt: new Date(),
      });
      prisma.encounter.update.mockResolvedValue({});

      await service.confirm(physicianId, documentId);

      // O contentHash no update deve ser o hash das edições, não do conteúdo original
      const updateCall = prisma.document.update.mock.calls[0] as [
        { data: { contentHash: string } },
      ];
      const confirmedHash = updateCall[0].data.contentHash;
      expect(confirmedHash).toMatch(/^[a-f0-9]{64}$/);
      // Deve diferir do hash do conteúdo original (baseDocument.contentHash = 'abc123hash')
      expect(confirmedHash).not.toBe('abc123hash');
    });

    it('throws NotFoundException para documento inexistente', async () => {
      prisma.document.findUnique.mockResolvedValue(null);

      await expect(service.confirm(physicianId, documentId)).rejects.toThrow(NotFoundException);
    });

    // Cenário 6: upload do PDF para o storage é best-effort (fire-and-forget) e
    // re-busca o documento (com o join de physician) para renderizar o PDF —
    // cobre o refactor que unificou a renderização usada por upload e download.
    it('faz upload do PDF ao storage quando disponível, buscando physician para o PDF', async () => {
      storageService.isAvailable.mockReturnValue(true);
      prisma.document.findUnique
        .mockResolvedValueOnce(docBase) // lookup inicial do confirm()
        .mockResolvedValueOnce({
          // re-busca dentro de uploadDocumentPdf (PDF_DOCUMENT_SELECT)
          id: documentId,
          physicianId,
          type: 'soap',
          content: baseDocument.content,
          physicianEdits: null,
          confirmedBy: physicianId,
          confirmedAt: new Date('2025-01-02'),
          encounterId,
          contentHash: 'newhash',
          physician: { name: 'Ana Teste', crmUf: 'SP', crmNumber: '123456' },
        });
      prisma.document.update.mockResolvedValue({
        ...baseDocument,
        confirmedBy: physicianId,
        confirmedAt: new Date(),
      });
      prisma.encounter.update.mockResolvedValue({});

      await service.confirm(physicianId, documentId);

      await vi.waitFor(() => expect(storageService.upload).toHaveBeenCalled());

      expect(storageService.upload).toHaveBeenCalledWith(
        `documents/${encounterId}/${documentId}.pdf`,
        expect.any(Buffer),
        'application/pdf',
      );
      expect(prisma.document.update).toHaveBeenCalledWith({
        where: { id: documentId },
        data: { pdfObjectKey: `documents/${encounterId}/${documentId}.pdf` },
      });
    });
  });

  describe('findByEncounter', () => {
    it('returns documents for own encounter', async () => {
      prisma.encounter.findUnique.mockResolvedValue({ physicianId });
      prisma.document.findMany.mockResolvedValue([baseDocument]);

      const result = await service.findByEncounter(physicianId, encounterId);

      expect(prisma.document.findMany).toHaveBeenCalledWith({
        where: { encounterId },
        orderBy: { createdAt: 'desc' },
        select: expect.any(Object),
      });
      expect(result).toEqual([baseDocument]);
    });

    it('throws NotFoundException for missing encounter', async () => {
      prisma.encounter.findUnique.mockResolvedValue(null);

      await expect(service.findByEncounter(physicianId, encounterId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws ForbiddenException for another physician encounter', async () => {
      prisma.encounter.findUnique.mockResolvedValue({
        physicianId: otherPhysicianId,
      });

      await expect(service.findByEncounter(physicianId, encounterId)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('getDownloadUrl', () => {
    it('returns presigned URL when pdfObjectKey exists', async () => {
      prisma.document.findUnique.mockResolvedValue({
        physicianId,
        pdfObjectKey: 'documents/enc-1/doc-1.pdf',
      });
      storageService.getPresignedUrl.mockResolvedValue('https://minio/presigned-url');

      const result = await service.getDownloadUrl(physicianId, documentId);

      expect(result).toBe('https://minio/presigned-url');
    });

    it('returns null when pdfObjectKey is not set', async () => {
      prisma.document.findUnique.mockResolvedValue({
        physicianId,
        pdfObjectKey: null,
      });

      const result = await service.getDownloadUrl(physicianId, documentId);

      expect(result).toBeNull();
    });

    it('throws NotFoundException for non-existent document', async () => {
      prisma.document.findUnique.mockResolvedValue(null);

      await expect(service.getDownloadUrl(physicianId, documentId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws ForbiddenException when physician does not own document', async () => {
      prisma.document.findUnique.mockResolvedValue({
        physicianId: otherPhysicianId,
        pdfObjectKey: 'documents/enc-1/doc-1.pdf',
      });

      await expect(service.getDownloadUrl(physicianId, documentId)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('getDownloadPdf', () => {
    const physicianStub = { name: 'Ana Teste', crmUf: 'SP', crmNumber: '123456' };

    it('generates the PDF on demand when storage is unavailable (no pdfObjectKey)', async () => {
      prisma.document.findUnique.mockResolvedValue({
        ...baseDocument,
        physicianId,
        physician: physicianStub,
        confirmedBy: physicianId,
        confirmedAt: new Date('2025-01-02'),
      });

      const result = await service.getDownloadPdf(physicianId, documentId);

      expect(result).not.toBeNull();
      expect(result?.buffer).toBeInstanceOf(Buffer);
      expect(result?.buffer.length).toBeGreaterThan(0);
      expect(result?.filename).toBe(`soap-${documentId.slice(0, 8)}_2025-01-02.pdf`);
    });

    it('uses physicianEdits over content when present', async () => {
      prisma.document.findUnique.mockResolvedValue({
        ...baseDocument,
        physicianId,
        physician: physicianStub,
        confirmedBy: physicianId,
        confirmedAt: new Date('2025-01-02'),
      });
      const withoutEdits = await service.getDownloadPdf(physicianId, documentId);

      prisma.document.findUnique.mockResolvedValue({
        ...baseDocument,
        physicianId,
        physician: physicianStub,
        physicianEdits: { plan: 'Plano completamente diferente' },
        confirmedBy: physicianId,
        confirmedAt: new Date('2025-01-02'),
      });
      const withEdits = await service.getDownloadPdf(physicianId, documentId);

      // Conteúdos diferentes devem produzir PDFs diferentes — prova que
      // physicianEdits (não content) foi usado quando presente.
      expect(withEdits?.buffer.equals(withoutEdits!.buffer)).toBe(false);
    });

    it('returns null when document is not confirmed yet', async () => {
      prisma.document.findUnique.mockResolvedValue({ ...baseDocument, physicianId });

      const result = await service.getDownloadPdf(physicianId, documentId);

      expect(result).toBeNull();
    });

    it('throws NotFoundException for non-existent document', async () => {
      prisma.document.findUnique.mockResolvedValue(null);

      await expect(service.getDownloadPdf(physicianId, documentId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws ForbiddenException when physician does not own document', async () => {
      prisma.document.findUnique.mockResolvedValue({
        ...baseDocument,
        physicianId: otherPhysicianId,
        confirmedBy: otherPhysicianId,
        confirmedAt: new Date('2025-01-02'),
      });

      await expect(service.getDownloadPdf(physicianId, documentId)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });
});
