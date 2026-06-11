import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { ProtocolsService } from './protocols.service';
import { PrismaService } from '../../config/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateProtocolInput } from './schemas/protocol.schemas';

const physicianId = '550e8400-e29b-41d4-a716-446655440000';
const protocolId = '770e8400-e29b-41d4-a716-446655440002';

function validInput(overrides: Partial<CreateProtocolInput> = {}): CreateProtocolInput {
  return {
    name: 'Síndrome gripal',
    specialty: 'clinica_geral',
    nodes: [
      {
        id: 'q1',
        nodeType: 'question',
        order: 0,
        content: { question: 'Sintomas há mais de 48h?', answerType: 'boolean' },
      },
      {
        id: 'a1',
        nodeType: 'action',
        order: 1,
        content: { action: 'Considerar oseltamivir', citationChunkId: 'chunk-1' },
      },
      {
        id: 'o1',
        nodeType: 'outcome',
        order: 2,
        content: { outcome: 'Conduta sintomática' },
      },
    ],
    edges: [
      { fromNodeId: 'q1', toNodeId: 'a1', condition: { answer: true } },
      { fromNodeId: 'q1', toNodeId: 'o1', condition: { answer: false } },
      { fromNodeId: 'a1', toNodeId: 'o1', condition: null },
    ],
    ...overrides,
  };
}

function dbNode(id: string, nodeType: 'question' | 'action' | 'outcome', content: unknown, order: number) {
  return {
    id,
    protocolId,
    nodeType,
    content,
    order,
    createdAt: new Date('2026-01-01'),
    outgoingEdges: [] as Array<{
      id: string;
      fromNodeId: string;
      toNodeId: string;
      condition: unknown;
      createdAt: Date;
    }>,
  };
}

describe('ProtocolsService', () => {
  let service: ProtocolsService;
  let prisma: {
    protocol: {
      findFirst: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
      findUnique: ReturnType<typeof vi.fn>;
      create: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
    protocolNode: {
      create: ReturnType<typeof vi.fn>;
    };
    protocolEdge: {
      create: ReturnType<typeof vi.fn>;
    };
  };
  let auditService: { log: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();

    prisma = {
      protocol: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
        findUnique: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
      protocolNode: {
        create: vi.fn(),
      },
      protocolEdge: {
        create: vi.fn(),
      },
    };

    auditService = { log: vi.fn().mockResolvedValue(undefined) };
    service = new ProtocolsService(
      prisma as unknown as PrismaService,
      auditService as unknown as AuditService,
    );
  });

  describe('create', () => {
    it('rejects an invalid graph before touching the database', async () => {
      const invalid = validInput({
        edges: [{ fromNodeId: 'q1', toNodeId: 'a1', condition: { answer: true } }], // missing answer: false
      });

      await expect(service.create(physicianId, invalid)).rejects.toThrow(BadRequestException);
      expect(prisma.protocol.create).not.toHaveBeenCalled();
    });

    it('creates version 1 when no previous protocol exists with the same name/specialty', async () => {
      prisma.protocol.findFirst.mockResolvedValue(null);
      prisma.protocol.create.mockResolvedValue({
        id: protocolId,
        name: 'Síndrome gripal',
        specialty: 'clinica_geral',
        version: 1,
        status: 'draft',
        institutionId: null,
        sourceRef: null,
        createdBy: physicianId,
        publishedAt: null,
        createdAt: new Date('2026-01-01'),
        updatedAt: new Date('2026-01-01'),
      });
      prisma.protocolNode.create
        .mockResolvedValueOnce({ id: 'node-q1' })
        .mockResolvedValueOnce({ id: 'node-a1' })
        .mockResolvedValueOnce({ id: 'node-o1' });
      prisma.protocolEdge.create.mockResolvedValue({});
      prisma.protocol.findUnique.mockResolvedValue({
        id: protocolId,
        name: 'Síndrome gripal',
        specialty: 'clinica_geral',
        version: 1,
        status: 'draft',
        institutionId: null,
        sourceRef: null,
        createdBy: physicianId,
        publishedAt: null,
        createdAt: new Date('2026-01-01'),
        updatedAt: new Date('2026-01-01'),
        nodes: [],
      });

      const result = await service.create(physicianId, validInput());

      expect(prisma.protocol.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ version: 1, status: 'draft' }) }),
      );
      expect(prisma.protocolNode.create).toHaveBeenCalledTimes(3);
      expect(prisma.protocolEdge.create).toHaveBeenCalledTimes(3);
      expect(result.id).toBe(protocolId);
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'PROTOCOL_CREATED', entityId: protocolId }),
      );
    });

    it('increments the version when a previous protocol exists with the same name/specialty', async () => {
      prisma.protocol.findFirst.mockResolvedValue({ version: 2 });
      prisma.protocol.create.mockResolvedValue({
        id: protocolId,
        name: 'Síndrome gripal',
        specialty: 'clinica_geral',
        version: 3,
        status: 'draft',
        institutionId: null,
        sourceRef: null,
        createdBy: physicianId,
        publishedAt: null,
        createdAt: new Date('2026-01-01'),
        updatedAt: new Date('2026-01-01'),
      });
      prisma.protocolNode.create.mockResolvedValue({ id: 'node-x' });
      prisma.protocolEdge.create.mockResolvedValue({});
      prisma.protocol.findUnique.mockResolvedValue({ id: protocolId, version: 3, nodes: [] });

      await service.create(physicianId, validInput());

      expect(prisma.protocol.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ version: 3 }) }),
      );
    });
  });

  describe('publish', () => {
    it('throws NotFoundException when the protocol does not exist', async () => {
      prisma.protocol.findUnique.mockResolvedValue(null);

      await expect(service.publish(physicianId, protocolId)).rejects.toThrow(NotFoundException);
    });

    it('throws ConflictException when the protocol is not a draft', async () => {
      prisma.protocol.findUnique.mockResolvedValue({
        id: protocolId,
        status: 'published',
        nodes: [],
      });

      await expect(service.publish(physicianId, protocolId)).rejects.toThrow(ConflictException);
      expect(prisma.protocol.update).not.toHaveBeenCalled();
    });

    it('rejects publishing a draft whose graph is invalid', async () => {
      prisma.protocol.findUnique.mockResolvedValue({
        id: protocolId,
        status: 'draft',
        nodes: [
          dbNode('q1', 'question', { question: 'Sintomas há mais de 48h?', answerType: 'boolean' }, 0),
        ],
      });

      await expect(service.publish(physicianId, protocolId)).rejects.toThrow(BadRequestException);
      expect(prisma.protocol.update).not.toHaveBeenCalled();
    });

    it('publishes a draft with a valid graph and audits PROTOCOL_PUBLISHED', async () => {
      const q1 = dbNode('q1', 'question', { question: 'Sintomas há mais de 48h?', answerType: 'boolean' }, 0);
      const a1 = dbNode('a1', 'action', { action: 'Considerar oseltamivir' }, 1);
      const o1 = dbNode('o1', 'outcome', { outcome: 'Conduta sintomática' }, 2);
      q1.outgoingEdges = [
        { id: 'e1', fromNodeId: 'q1', toNodeId: 'a1', condition: { answer: true }, createdAt: new Date() },
        { id: 'e2', fromNodeId: 'q1', toNodeId: 'o1', condition: { answer: false }, createdAt: new Date() },
      ];
      a1.outgoingEdges = [
        { id: 'e3', fromNodeId: 'a1', toNodeId: 'o1', condition: null, createdAt: new Date() },
      ];

      prisma.protocol.findUnique.mockResolvedValue({
        id: protocolId,
        name: 'Síndrome gripal',
        specialty: 'clinica_geral',
        version: 1,
        status: 'draft',
        nodes: [q1, a1, o1],
      });
      prisma.protocol.update.mockResolvedValue({
        id: protocolId,
        status: 'published',
        publishedAt: new Date('2026-06-11'),
        nodes: [q1, a1, o1],
      });

      const result = await service.publish(physicianId, protocolId);

      expect(prisma.protocol.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: protocolId },
          data: expect.objectContaining({ status: 'published' }),
        }),
      );
      expect(result.status).toBe('published');
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'PROTOCOL_PUBLISHED', entityId: protocolId }),
      );
    });
  });

  describe('reviseAsNewVersion', () => {
    it('throws ConflictException when revising a draft protocol', async () => {
      prisma.protocol.findUnique.mockResolvedValue({ id: protocolId, status: 'draft', nodes: [] });

      await expect(service.reviseAsNewVersion(physicianId, protocolId, validInput())).rejects.toThrow(
        ConflictException,
      );
    });

    it('creates a new version from a published protocol without mutating the previous one', async () => {
      prisma.protocol.findUnique
        .mockResolvedValueOnce({
          id: protocolId,
          name: 'Síndrome gripal',
          specialty: 'clinica_geral',
          institutionId: null,
          version: 1,
          status: 'published',
          nodes: [],
        })
        // findById call inside create() (via the recursive call)
        .mockResolvedValueOnce({
          id: 'new-protocol-id',
          name: 'Síndrome gripal',
          specialty: 'clinica_geral',
          version: 2,
          status: 'draft',
          nodes: [],
        });

      prisma.protocol.findFirst.mockResolvedValue({ version: 1 });
      prisma.protocol.create.mockResolvedValue({
        id: 'new-protocol-id',
        name: 'Síndrome gripal',
        specialty: 'clinica_geral',
        version: 2,
        status: 'draft',
        institutionId: null,
        sourceRef: null,
        createdBy: physicianId,
        publishedAt: null,
        createdAt: new Date('2026-06-11'),
        updatedAt: new Date('2026-06-11'),
      });
      prisma.protocolNode.create.mockResolvedValue({ id: 'node-x' });
      prisma.protocolEdge.create.mockResolvedValue({});

      const result = await service.reviseAsNewVersion(physicianId, protocolId, validInput());

      expect(result.id).toBe('new-protocol-id');
      expect(result.version).toBe(2);
      // the previous protocol was never updated
      expect(prisma.protocol.update).not.toHaveBeenCalled();
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'PROTOCOL_REVISED',
          payload: expect.objectContaining({ previousProtocolId: protocolId, previousVersion: 1, newVersion: 2 }),
        }),
      );
    });
  });
});
