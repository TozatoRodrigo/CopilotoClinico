import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as Sentry from '@sentry/node';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { GuidelinesService, type IngestGuidelineInput } from './guidelines.service';
import { PrismaService } from '../../config/prisma.service';
import { AiGatewayService } from '../ai-gateway/ai-gateway.service';
import { AuditService } from '../audit/audit.service';
import { freeTextHash } from '../audit/audit-payload';
import { modelDeidentifier } from '../../../tests/helpers/fake-deid';

vi.mock('@sentry/node', () => ({ captureMessage: vi.fn() }));

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
      findFirst: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
      count: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
      updateMany: ReturnType<typeof vi.fn>;
    };
    $executeRaw: ReturnType<typeof vi.fn>;
    $queryRawUnsafe: ReturnType<typeof vi.fn>;
  };
  let aiGateway: {
    embeddingsEnabled: ReturnType<typeof vi.fn>;
    embed: ReturnType<typeof vi.fn>;
  };
  let auditService: { log: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();

    prisma = {
      guidelineChunk: {
        create: vi.fn(),
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        findMany: vi.fn(),
        count: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
      },
      $executeRaw: vi.fn().mockResolvedValue(1),
      $queryRawUnsafe: vi.fn().mockResolvedValue([]),
    };

    aiGateway = {
      embeddingsEnabled: vi.fn(() => true),
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

    it('S21-CLIN-01: persists subtipo on chunk metadata when provided (required for the diagnostic-coherence guardrail to engage)', async () => {
      prisma.guidelineChunk.create.mockResolvedValue({ id: 'chunk-uuid-1' });

      await service.ingest({ ...baseIngestInput, subtipo: 'hemorragico' });

      expect(prisma.guidelineChunk.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          metadata: expect.objectContaining({ subtipo: 'hemorragico' }),
        }),
      });
    });

    it('S21-CLIN-01: defaults subtipo to null when not provided (most cenarios have no mutually-exclusive dichotomy)', async () => {
      prisma.guidelineChunk.create.mockResolvedValue({ id: 'chunk-uuid-1' });

      await service.ingest(baseIngestInput);

      expect(prisma.guidelineChunk.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          metadata: expect.objectContaining({ subtipo: null }),
        }),
      });
    });

    it('handles long text by creating multiple chunks', async () => {
      // KB-005/KB-006 — o chunking passou a cortar em fronteira de frase, com
      // alvo de 1200 caracteres: um bloco só de 'X' sem pontuação é UM chunk.
      // Para exercitar o caminho de múltiplos chunks o texto precisa ter
      // frases de verdade, como uma diretriz real tem.
      const longText = Array.from(
        { length: 6 },
        (_, i) => `Recomendação número ${i}. ${'palavra '.repeat(60)}fim.`,
      ).join(' ');
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

  /**
   * F4 — caminho de sugestão aberto a qualquer médico autenticado. O ponto
   * mais importante destes testes é o que ele NÃO faz: não supersede.
   */
  /**
   * F4 — extração de texto no servidor. O médico do reporte original converteu
   * o PDF para .md e .txt à mão e ainda assim recebeu erro; converter um
   * artigo de 47 páginas é trabalho que o servidor faz melhor.
   */
  describe('extractDocumentText', () => {
    it('devolve o texto de um arquivo de texto simples', async () => {
      const result = await service.extractDocumentText({
        mimeType: 'text/plain',
        data: Buffer.from('Conteúdo da diretriz enviada.', 'utf-8').toString('base64'),
      });

      expect(result.text).toBe('Conteúdo da diretriz enviada.');
      expect(result.truncated).toBe(false);
    });

    it('traduz falha de extração em BadRequest com instrução para o médico', async () => {
      await expect(
        service.extractDocumentText({
          mimeType: 'application/pdf',
          data: Buffer.from('não é um PDF', 'utf-8').toString('base64'),
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('não persiste nada — extração é só leitura', async () => {
      await service.extractDocumentText({
        mimeType: 'text/plain',
        data: Buffer.from('Conteúdo da diretriz enviada.', 'utf-8').toString('base64'),
      });

      expect(prisma.guidelineChunk.create).not.toHaveBeenCalled();
      expect(auditService.log).not.toHaveBeenCalled();
    });
  });

  describe('suggestGuideline', () => {
    it('cria chunks pending_review marcados com quem sugeriu', async () => {
      prisma.guidelineChunk.create.mockResolvedValue({ id: 'chunk-uuid-1' });

      const result = await service.suggestGuideline({
        ...baseIngestInput,
        suggestedBy: 'physician-77',
      });

      expect(prisma.guidelineChunk.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          status: 'pending_review',
          metadata: expect.objectContaining({ suggestedBy: 'physician-77' }),
        }),
      });
      expect(result.chunksCreated).toBe(1);
    });

    it('NUNCA supersede conteúdo já aprovado — seria escalação de privilégio num endpoint aberto', async () => {
      prisma.guidelineChunk.create.mockResolvedValue({ id: 'chunk-uuid-1' });

      // Um médico poderia sugerir algo com source de uma diretriz existente e
      // versão nova; se isso superseder, remove do retrieval conteúdo que
      // passou por curadoria. `ingestForReview` (só curador) supersede;
      // `suggestGuideline` não pode.
      await service.suggestGuideline({
        ...baseIngestInput,
        source: 'Surviving Sepsis Campaign',
        sourceVersion: '9.9-falsa',
        suggestedBy: 'physician-77',
      });

      expect(prisma.guidelineChunk.updateMany).not.toHaveBeenCalled();
    });

    it('registra a sugestão na auditoria com o médico como actor', async () => {
      prisma.guidelineChunk.create.mockResolvedValue({ id: 'chunk-uuid-1' });

      await service.suggestGuideline({ ...baseIngestInput, suggestedBy: 'physician-77' });

      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          actorId: 'physician-77',
          action: 'GUIDELINE_SUGGESTED',
          entity: 'GuidelineChunk',
        }),
      );
    });

    it('não força o médico a inventar metadados de curadoria: aceita defaults', async () => {
      prisma.guidelineChunk.create.mockResolvedValue({ id: 'chunk-uuid-1' });

      await service.suggestGuideline({
        text: baseIngestInput.text,
        source: 'Artigo enviado pelo Dr. do plantão',
        sourceVersion: 'sem versão informada',
        specialty: 'nao_classificada',
        suggestedBy: 'physician-77',
      });

      expect(prisma.guidelineChunk.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ specialty: 'nao_classificada' }),
      });
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
    const pendingChunk = {
      id: 'chunk-pending-1',
      source: 'Diretriz X',
      sourceVersion: '2.0',
      status: 'pending_review',
    };

    it('stores the masked reason in reviewNote and audits GUIDELINE_REJECTED with its hash only', async () => {
      const reason = '  Texto desatualizado, falar com curadoria@hospital.org  ';
      const maskedNote = 'Texto desatualizado, falar com [REDACTED_EMAIL]';
      prisma.guidelineChunk.findUnique.mockResolvedValue(pendingChunk);
      prisma.guidelineChunk.update.mockResolvedValue({
        ...pendingChunk,
        status: 'rejected',
        reviewedBy: 'curator-1',
        reviewedAt: new Date('2026-06-13'),
        reviewNote: maskedNote,
      });

      const result = await service.rejectChunk('chunk-pending-1', 'curator-1', reason);

      expect(prisma.guidelineChunk.update).toHaveBeenCalledWith({
        where: { id: 'chunk-pending-1' },
        data: {
          status: 'rejected',
          reviewedBy: 'curator-1',
          reviewedAt: expect.any(Date),
          reviewNote: maskedNote,
        },
      });
      expect(result.status).toBe('rejected');
      expect(result.reviewNote).toBe(maskedNote);
      expect(auditService.log).toHaveBeenCalledWith({
        actorId: 'curator-1',
        action: 'GUIDELINE_REJECTED',
        entity: 'GuidelineChunk',
        entityId: 'chunk-pending-1',
        payload: {
          source: 'Diretriz X',
          sourceVersion: '2.0',
          reasonHash: freeTextHash(maskedNote),
        },
      });
      const auditCalls = JSON.stringify(auditService.log.mock.calls);
      expect(auditCalls).not.toContain('Texto desatualizado');
      expect(auditCalls).not.toContain('curadoria@hospital.org');
    });

    it('stores a null reviewNote and reasonHash when no reason is given', async () => {
      prisma.guidelineChunk.findUnique.mockResolvedValue(pendingChunk);
      prisma.guidelineChunk.update.mockResolvedValue({ ...pendingChunk, status: 'rejected' });

      await service.rejectChunk('chunk-pending-1', 'curator-1');

      expect(prisma.guidelineChunk.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ reviewNote: null }) }),
      );
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          payload: expect.objectContaining({ reasonHash: null }),
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

      prisma.guidelineChunk.findFirst.mockResolvedValue(mockChunk);

      const result = await service.getChunkById('chunk-uuid-1', ['inst-a']);

      expect(prisma.guidelineChunk.findFirst).toHaveBeenCalledWith({
        where: {
          id: 'chunk-uuid-1',
          OR: [{ institutionId: null }, { institutionId: { in: ['inst-a'] } }],
        },
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
      prisma.guidelineChunk.findFirst.mockResolvedValue(null);

      const result = await service.getChunkById('non-existent', []);

      expect(result).toBeNull();
    });

    it('CC-019 — sem vínculo, só o trecho global é achado pelo id', async () => {
      prisma.guidelineChunk.findFirst.mockResolvedValue(null);

      await service.getChunkById('chunk-de-outro-hospital', []);

      expect(prisma.guidelineChunk.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            id: 'chunk-de-outro-hospital',
            OR: [{ institutionId: null }, { institutionId: { in: [] } }],
          },
        }),
      );
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
    // S24-GUIDE-01 — antes, um termo curto/vazio devolvia `[]` sem consultar
    // o banco, e a tela de Biblioteca (que só chamava a busca a partir de 2
    // caracteres) ficava sempre vazia até o médico digitar algo, mesmo
    // havendo diretrizes aprovadas. Agora query vazia lista tudo que está
    // aprovado (modo biblioteca); só filtra por relevância quando há termo.
    it('lists approved chunks (does not return empty / skip the query) when the search term is shorter than 2 chars', async () => {
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
          rank: 0,
        },
      ]);

      const result = await service.searchChunks('a');

      expect(result).toHaveLength(1);
      expect(prisma.$queryRawUnsafe).toHaveBeenCalledTimes(1);
      const [sql] = prisma.$queryRawUnsafe.mock.calls[0]!;
      expect(sql).toContain("status = 'approved'");
      expect(sql).not.toContain('plainto_tsquery');
    });

    it('lists approved chunks for a whitespace-only query too', async () => {
      prisma.$queryRawUnsafe.mockResolvedValue([]);

      await service.searchChunks('   ');

      expect(prisma.$queryRawUnsafe).toHaveBeenCalledTimes(1);
      const [sql] = prisma.$queryRawUnsafe.mock.calls[0]!;
      expect(sql).not.toContain('plainto_tsquery');
    });

    it('browse mode (no query) defaults to limit and passes it as $1', async () => {
      prisma.$queryRawUnsafe.mockResolvedValue([]);

      await service.searchChunks('');

      expect(prisma.$queryRawUnsafe).toHaveBeenCalledWith(expect.any(String), 20);
    });

    it('browse mode (no query) applies the specialty filter as $2', async () => {
      prisma.$queryRawUnsafe.mockResolvedValue([]);

      await service.searchChunks('', 'Clínica Médica');

      expect(prisma.$queryRawUnsafe).toHaveBeenCalledWith(
        expect.stringContaining('gc.specialty = $2'),
        20,
        'Clínica Médica',
      );
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
        expect.stringContaining('gc.specialty = $3'),
        'gripe',
        20,
        'Clínica Médica',
      );
    });

    it('respects custom limit', async () => {
      prisma.$queryRawUnsafe.mockResolvedValue([]);

      await service.searchChunks('febre', undefined, 5);

      expect(prisma.$queryRawUnsafe).toHaveBeenCalledWith(expect.any(String), 'febre', 5);
    });

    it('CC-019 — com instituições, só trechos globais e delas, filtrados no banco', async () => {
      prisma.$queryRawUnsafe.mockResolvedValue([]);

      await service.searchChunks('anafilaxia', 'clinica_medica', 40, ['inst-1']);

      expect(prisma.$queryRawUnsafe).toHaveBeenCalledWith(
        expect.stringContaining(
          'AND (gc.institution_id IS NULL OR gc.institution_id = ANY($4::uuid[]))',
        ),
        'anafilaxia',
        40,
        'clinica_medica',
        ['inst-1'],
      );
    });

    it('CC-019 — a biblioteca (sem termo) filtra do mesmo jeito', async () => {
      prisma.$queryRawUnsafe.mockResolvedValue([]);

      await service.searchChunks('', undefined, 50, ['inst-1', 'inst-2']);

      expect(prisma.$queryRawUnsafe).toHaveBeenCalledWith(
        expect.stringContaining(
          'AND (gc.institution_id IS NULL OR gc.institution_id = ANY($2::uuid[]))',
        ),
        50,
        ['inst-1', 'inst-2'],
      );
    });

    it.each([
      ['busca', 'anafilaxia'],
      ['biblioteca', ''],
    ])('CC-019 — %s sem instituições: só trechos globais', async (_mode, query) => {
      prisma.$queryRawUnsafe.mockResolvedValue([]);

      await service.searchChunks(query, undefined, 20, []);
      await service.searchChunks(query);

      for (const [sql] of prisma.$queryRawUnsafe.mock.calls) {
        expect(sql).toContain('AND gc.institution_id IS NULL');
        expect(sql).not.toContain('institution_id = ANY');
      }
    });
  });

  describe('consult', () => {
    // CC-203 — a consulta abre com o caso escrito: o nome que só o modelo
    // local acha também não vai ao provedor de embedding.
    it('mascara o nome achado pelo modelo local antes do embedding', async () => {
      aiGateway.embed.mockResolvedValue({ embeddings: [[0.1, 0.2]] });
      const withModel = new GuidelinesService(
        prisma as unknown as PrismaService,
        aiGateway as unknown as AiGatewayService,
        auditService as unknown as AuditService,
        modelDeidentifier(['Maria da Silva']),
      );

      await withModel.consult('Maria da Silva picada por escorpião há 1 hora', { semantic: true });

      const embedded = aiGateway.embed.mock.calls[0]![0] as string[];
      expect(embedded[0]).toBe('[NOME] picada por escorpião há 1 hora');
    });

    it('mascara PII antes do embedding e junta as duas buscas', async () => {
      aiGateway.embed.mockResolvedValue({ embeddings: [[0.1, 0.2]] });
      prisma.$queryRawUnsafe
        .mockResolvedValueOnce([
          {
            chunkId: 'off-1',
            source: 'PCDT — Acidentes Escorpiônicos',
            sourceVersion: 'Portaria nº 59',
            specialty: 'toxicologia',
            text: 'Soro antiescorpiônico',
            status: 'official_unreviewed',
            institutionId: null,
            metadata: {
              documentKey: 'pcdt:escorpionicos',
              section: '7. TRATAMENTO',
              url: 'https://x/pdf',
            },
            similarity: '0.61',
          },
        ])
        .mockResolvedValueOnce([]);

      const results = await service.consult('Paciente CPF 123.456.789-09 picado por escorpião', {
        semantic: true,
      });

      const embedded = aiGateway.embed.mock.calls[0]![0] as string[];
      expect(embedded[0]).not.toContain('123.456.789-09');
      expect(results).toEqual([
        expect.objectContaining({
          chunkId: 'off-1',
          origin: 'official_unreviewed',
          similarity: 0.61,
        }),
      ]);
      // As duas consultas SQL só olham conteúdo aprovado ou oficial vigente.
      for (const call of prisma.$queryRawUnsafe.mock.calls) {
        expect(call[0]).toContain("gc.status IN ('approved', 'official_unreviewed')");
        expect(call[0]).toContain('gc.valid_to IS NULL');
      }
    });

    // 11/10/2026: a conta da OpenAI ficou sem crédito e "Consultar
    // diretrizes" passou a responder 500. Sem vetor, a consulta segue por
    // palavra-chave.
    const keywordHit = {
      chunkId: 'off-1',
      source: 'PCDT — Acidentes Escorpiônicos',
      sourceVersion: '2026',
      specialty: 'toxicologia',
      text: 'Soro antiescorpiônico nos casos moderados e graves',
      status: 'official_unreviewed',
      institutionId: null,
      metadata: { documentKey: 'pcdt:escorpionicos' },
      similarity: null,
    };

    it('com EMBEDDING_PROVIDER=none, busca por palavra-chave sem chamar o provedor nem alertar', async () => {
      aiGateway.embeddingsEnabled.mockReturnValue(false);
      prisma.$queryRawUnsafe.mockResolvedValueOnce([]).mockResolvedValueOnce([keywordHit]);

      const results = await service.consult(
        'Criança de 4 anos com dor na perna após picada de escorpião',
        { semantic: true },
      );

      expect(aiGateway.embed).not.toHaveBeenCalled();
      expect(Sentry.captureMessage).not.toHaveBeenCalled();
      const [allTerms, anyTerm] = prisma.$queryRawUnsafe.mock.calls;
      // Primeiro todos os termos (consulta curta); depois qualquer termo (caso inteiro).
      expect(allTerms![0]).toContain("websearch_to_tsquery('portuguese', $1)");
      // Qualquer termo, pesado pela raridade (IDF) de cada um na base.
      expect(anyTerm![0]).toContain('tsvector_to_array');
      expect(anyTerm![0]).toContain('ORDER BY sum(w.idf) DESC');
      expect(anyTerm![0]).not.toContain('::vector');
      expect(results).toEqual([
        expect.objectContaining({ chunkId: 'off-1', matchedBy: 'keyword', similarity: 0 }),
      ]);
    });

    it('com o provedor fora do ar (sem crédito), alerta e segue por palavra-chave', async () => {
      aiGateway.embed.mockRejectedValue(new Error('AI provider embed error: 429'));
      prisma.$queryRawUnsafe.mockResolvedValueOnce([keywordHit]).mockResolvedValueOnce([]);

      const results = await service.consult('escorpião', { semantic: true });

      expect(Sentry.captureMessage).toHaveBeenCalledWith(
        expect.stringContaining('GUIDELINE_EMBEDDING_UNAVAILABLE consulta'),
        'error',
      );
      expect(results.map((result) => result.chunkId)).toEqual(['off-1']);
    });

    // CC-010 — quem revogou o processamento por IA consulta só por
    // palavra-chave: o caso não vai ao provedor de embedding.
    it('sem consentimento de IA, busca por palavra-chave sem chamar o provedor', async () => {
      prisma.$queryRawUnsafe.mockResolvedValueOnce([keywordHit]).mockResolvedValueOnce([]);

      const results = await service.consult('Picada de escorpião há 1 hora', { semantic: false });

      expect(aiGateway.embed).not.toHaveBeenCalled();
      expect(Sentry.captureMessage).not.toHaveBeenCalled();
      expect(results.map((result) => result.chunkId)).toEqual(['off-1']);
    });
  });

  describe('sem embedding na ingestão', () => {
    it('grava os trechos sem vetor em vez de falhar a sugestão', async () => {
      aiGateway.embeddingsEnabled.mockReturnValue(false);
      prisma.guidelineChunk.create.mockResolvedValue({ id: 'chunk-uuid-1' });

      const result = await service.ingest(baseIngestInput);

      expect(result).toHaveLength(1);
      expect(aiGateway.embed).not.toHaveBeenCalled();
      expect(prisma.guidelineChunk.create).toHaveBeenCalledTimes(1);
      // Sem o UPDATE do embedding: o trecho fica para a busca textual.
      expect(prisma.$executeRaw).not.toHaveBeenCalled();
    });

    it('com o provedor fora do ar, alerta e grava os trechos mesmo assim', async () => {
      aiGateway.embed.mockRejectedValue(new Error('AI provider embed error: 429'));
      prisma.guidelineChunk.create.mockResolvedValue({ id: 'chunk-uuid-1' });

      const result = await service.ingest(baseIngestInput);

      expect(result).toHaveLength(1);
      expect(prisma.$executeRaw).not.toHaveBeenCalled();
      expect(Sentry.captureMessage).toHaveBeenCalledWith(
        expect.stringContaining('GUIDELINE_EMBEDDING_UNAVAILABLE WHO HTN 2023 v1.0'),
        'error',
      );
    });
  });
});
