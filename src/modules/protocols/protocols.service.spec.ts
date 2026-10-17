import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
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

function dbNode(
  id: string,
  nodeType: 'question' | 'action' | 'outcome',
  content: unknown,
  order: number,
) {
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
    physician: {
      findUnique: ReturnType<typeof vi.fn>;
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
      // CC-020 — por padrão quem chama é curador; o bloco do CC-020 cobre os outros papéis.
      physician: {
        findUnique: vi.fn().mockResolvedValue({ role: 'PHYSICIAN', isCurator: true }),
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

  describe('findAll', () => {
    it('restricts to global protocols (institutionId IS NULL) when no institution is given', async () => {
      prisma.protocol.findMany.mockResolvedValue([]);

      await service.findAll({ specialty: 'clinica_geral' });

      expect(prisma.protocol.findMany).toHaveBeenCalledWith({
        where: { specialty: 'clinica_geral', institutionId: null },
        orderBy: [{ name: 'asc' }, { version: 'desc' }],
      });
    });

    it('includes global and institution-matching protocols when institutionId is given', async () => {
      const institutionId = 'institution-a';
      prisma.protocol.findMany.mockResolvedValue([]);

      await service.findAll({ institutionId });

      expect(prisma.protocol.findMany).toHaveBeenCalledWith({
        where: { OR: [{ institutionId: null }, { institutionId }] },
        orderBy: [{ name: 'asc' }, { version: 'desc' }],
      });
    });
  });

  describe('findById', () => {
    it('returns a global protocol regardless of the requesting institution', async () => {
      prisma.protocol.findUnique.mockResolvedValue({
        id: protocolId,
        institutionId: null,
        nodes: [],
      });

      const result = await service.findById(protocolId, 'institution-a');

      expect(result.id).toBe(protocolId);
    });

    it('returns a protocol belonging to the requesting institution', async () => {
      prisma.protocol.findUnique.mockResolvedValue({
        id: protocolId,
        institutionId: 'institution-a',
        nodes: [],
      });

      const result = await service.findById(protocolId, 'institution-a');

      expect(result.id).toBe(protocolId);
    });

    it('throws NotFoundException for a protocol belonging to another institution', async () => {
      prisma.protocol.findUnique.mockResolvedValue({
        id: protocolId,
        institutionId: 'institution-b',
        nodes: [],
      });

      await expect(service.findById(protocolId, 'institution-a')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('does not enforce isolation when institutionId is not informed (internal calls)', async () => {
      prisma.protocol.findUnique.mockResolvedValue({
        id: protocolId,
        institutionId: 'institution-b',
        nodes: [],
      });

      const result = await service.findById(protocolId);

      expect(result.id).toBe(protocolId);
    });
  });

  describe('publish', () => {
    it('throws NotFoundException when the protocol does not exist', async () => {
      prisma.protocol.findUnique.mockResolvedValue(null);

      await expect(service.publish(physicianId, protocolId, [])).rejects.toThrow(NotFoundException);
    });

    it('throws ConflictException when the protocol is not a draft', async () => {
      prisma.protocol.findUnique.mockResolvedValue({
        id: protocolId,
        institutionId: null,
        status: 'published',
        nodes: [],
      });

      await expect(service.publish(physicianId, protocolId, [])).rejects.toThrow(ConflictException);
      expect(prisma.protocol.update).not.toHaveBeenCalled();
    });

    it('rejects publishing a draft whose graph is invalid', async () => {
      prisma.protocol.findUnique.mockResolvedValue({
        id: protocolId,
        institutionId: null,
        status: 'draft',
        nodes: [
          dbNode(
            'q1',
            'question',
            { question: 'Sintomas há mais de 48h?', answerType: 'boolean' },
            0,
          ),
        ],
      });

      await expect(service.publish(physicianId, protocolId, [])).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.protocol.update).not.toHaveBeenCalled();
    });

    it('publishes a draft with a valid graph and audits PROTOCOL_PUBLISHED', async () => {
      const q1 = dbNode(
        'q1',
        'question',
        { question: 'Sintomas há mais de 48h?', answerType: 'boolean' },
        0,
      );
      const a1 = dbNode('a1', 'action', { action: 'Considerar oseltamivir' }, 1);
      const o1 = dbNode('o1', 'outcome', { outcome: 'Conduta sintomática' }, 2);
      q1.outgoingEdges = [
        {
          id: 'e1',
          fromNodeId: 'q1',
          toNodeId: 'a1',
          condition: { answer: true },
          createdAt: new Date(),
        },
        {
          id: 'e2',
          fromNodeId: 'q1',
          toNodeId: 'o1',
          condition: { answer: false },
          createdAt: new Date(),
        },
      ];
      a1.outgoingEdges = [
        { id: 'e3', fromNodeId: 'a1', toNodeId: 'o1', condition: null, createdAt: new Date() },
      ];

      prisma.protocol.findUnique.mockResolvedValue({
        id: protocolId,
        name: 'Síndrome gripal',
        specialty: 'clinica_geral',
        institutionId: null,
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

      const result = await service.publish(physicianId, protocolId, []);

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

  describe('CC-019 — protocolo de outra instituição', () => {
    const draftOfOtherHospital = {
      id: protocolId,
      institutionId: 'inst-outro-hospital',
      status: 'draft',
      nodes: [],
    };

    it('findVisibleById: devolve o da instituição de vínculo ativo', async () => {
      prisma.protocol.findUnique.mockResolvedValue(draftOfOtherHospital);

      await expect(
        service.findVisibleById(protocolId, ['inst-outro-hospital']),
      ).resolves.toMatchObject({ id: protocolId });
    });

    it('publicar o rascunho de outra instituição é 404, sem publicar nem devolver o protocolo', async () => {
      prisma.protocol.findUnique.mockResolvedValue(draftOfOtherHospital);

      await expect(service.publish(physicianId, protocolId, ['inst-meu'])).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.protocol.update).not.toHaveBeenCalled();
    });

    it('revisar o protocolo de outra instituição é 404, sem criar versão', async () => {
      prisma.protocol.findUnique.mockResolvedValue({
        ...draftOfOtherHospital,
        status: 'published',
      });

      await expect(
        service.reviseAsNewVersion(physicianId, protocolId, validInput(), []),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.protocol.create).not.toHaveBeenCalled();
    });
  });

  describe('reviseAsNewVersion', () => {
    it('throws ConflictException when revising a draft protocol', async () => {
      prisma.protocol.findUnique.mockResolvedValue({
        id: protocolId,
        institutionId: null,
        status: 'draft',
        nodes: [],
      });

      await expect(
        service.reviseAsNewVersion(physicianId, protocolId, validInput(), []),
      ).rejects.toThrow(ConflictException);
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

      const result = await service.reviseAsNewVersion(physicianId, protocolId, validInput(), []);

      expect(result.id).toBe('new-protocol-id');
      expect(result.version).toBe(2);
      // the previous protocol was never updated
      expect(prisma.protocol.update).not.toHaveBeenCalled();
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'PROTOCOL_REVISED',
          payload: expect.objectContaining({
            previousProtocolId: protocolId,
            previousVersion: 1,
            newVersion: 2,
          }),
        }),
      );
    });
  });
  describe('CC-020 — só curador ou ADMIN escreve protocolo', () => {
    const plainPhysician = { role: 'PHYSICIAN', isCurator: false };

    function publishableDraft(institutionId: string | null = null) {
      const q1 = dbNode(
        'q1',
        'question',
        { question: 'Sintomas há mais de 48h?', answerType: 'boolean' },
        0,
      );
      const a1 = dbNode('a1', 'action', { action: 'Considerar oseltamivir' }, 1);
      const o1 = dbNode('o1', 'outcome', { outcome: 'Conduta sintomática' }, 2);
      q1.outgoingEdges = [
        {
          id: 'e1',
          fromNodeId: 'q1',
          toNodeId: 'a1',
          condition: { answer: true },
          createdAt: new Date(),
        },
        {
          id: 'e2',
          fromNodeId: 'q1',
          toNodeId: 'o1',
          condition: { answer: false },
          createdAt: new Date(),
        },
      ];
      a1.outgoingEdges = [
        { id: 'e3', fromNodeId: 'a1', toNodeId: 'o1', condition: null, createdAt: new Date() },
      ];
      return {
        id: protocolId,
        name: 'Síndrome gripal',
        specialty: 'clinica_geral',
        institutionId,
        version: 1,
        status: 'draft',
        nodes: [q1, a1, o1],
      };
    }

    function mockCreatedVersion(version: number) {
      prisma.protocol.findFirst.mockResolvedValue(version > 1 ? { version: version - 1 } : null);
      prisma.protocol.create.mockResolvedValue({
        id: 'new-protocol-id',
        name: 'Síndrome gripal',
        specialty: 'clinica_geral',
        version,
        institutionId: null,
      });
      prisma.protocolNode.create.mockResolvedValue({ id: 'node-x' });
      prisma.protocolEdge.create.mockResolvedValue({});
    }

    it('lê papel e flag do banco, não do token', async () => {
      prisma.physician.findUnique.mockResolvedValue(plainPhysician);

      await expect(service.create(physicianId, validInput())).rejects.toThrow(ForbiddenException);
      expect(prisma.physician.findUnique).toHaveBeenCalledWith({
        where: { id: physicianId },
        select: { role: true, isCurator: true },
      });
    });

    it.each([
      ['global', undefined],
      ['institucional', 'inst-a'],
    ])(
      'médico sem papel não cria protocolo %s: 403 e nada gravado',
      async (_scope, institutionId) => {
        prisma.physician.findUnique.mockResolvedValue(plainPhysician);

        await expect(service.create(physicianId, validInput({ institutionId }))).rejects.toThrow(
          ForbiddenException,
        );
        expect(prisma.protocol.create).not.toHaveBeenCalled();
        expect(prisma.protocolNode.create).not.toHaveBeenCalled();
        expect(auditService.log).not.toHaveBeenCalled();
      },
    );

    it('médico sem papel não publica: 403 antes de ler o protocolo (não confirma que ele existe)', async () => {
      prisma.physician.findUnique.mockResolvedValue(plainPhysician);
      prisma.protocol.findUnique.mockResolvedValue(publishableDraft());
      const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

      await expect(service.publish(physicianId, protocolId, [])).rejects.toThrow(
        ForbiddenException,
      );
      expect(prisma.protocol.findUnique).not.toHaveBeenCalled();
      expect(prisma.protocol.update).not.toHaveBeenCalled();
      expect(auditService.log).not.toHaveBeenCalled();
      // A recusa aparece no log, sem identificar o médico.
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('PROTOCOL_WRITE_DENIED action=publish'),
      );
      expect(JSON.stringify(warn.mock.calls)).not.toContain(physicianId);
      warn.mockRestore();
    });

    it('médico sem papel não cria versão nova: 403 e nada gravado', async () => {
      prisma.physician.findUnique.mockResolvedValue(plainPhysician);

      await expect(
        service.reviseAsNewVersion(physicianId, protocolId, validInput(), []),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.protocol.findUnique).not.toHaveBeenCalled();
      expect(prisma.protocol.create).not.toHaveBeenCalled();
      expect(auditService.log).not.toHaveBeenCalled();
    });

    it('COMPLIANCE sem a flag de curador também não escreve', async () => {
      prisma.physician.findUnique.mockResolvedValue({ role: 'COMPLIANCE', isCurator: false });

      await expect(service.publish(physicianId, protocolId, [])).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('médico que não existe mais não escreve', async () => {
      prisma.physician.findUnique.mockResolvedValue(null);

      await expect(service.create(physicianId, validInput())).rejects.toThrow(ForbiddenException);
      expect(prisma.protocol.create).not.toHaveBeenCalled();
    });

    it('ADMIN publica protocolo global, e a auditoria registra o papel que autorizou', async () => {
      prisma.physician.findUnique.mockResolvedValue({ role: 'ADMIN', isCurator: false });
      prisma.protocol.findUnique.mockResolvedValue(publishableDraft());
      prisma.protocol.update.mockResolvedValue({ id: protocolId, status: 'published', nodes: [] });

      await expect(service.publish(physicianId, protocolId, [])).resolves.toMatchObject({
        status: 'published',
      });
      expect(auditService.log).toHaveBeenCalledWith({
        actorId: physicianId,
        action: 'PROTOCOL_PUBLISHED',
        entity: 'Protocol',
        entityId: protocolId,
        payload: {
          name: 'Síndrome gripal',
          specialty: 'clinica_geral',
          version: 1,
          authorizedAs: 'admin',
        },
      });
    });

    it('curador cria protocolo global e a auditoria registra o papel', async () => {
      mockCreatedVersion(1);
      prisma.protocol.findUnique.mockResolvedValue({ id: 'new-protocol-id', nodes: [] });

      await service.create(physicianId, validInput());

      expect(auditService.log).toHaveBeenCalledWith({
        actorId: physicianId,
        action: 'PROTOCOL_CREATED',
        entity: 'Protocol',
        entityId: 'new-protocol-id',
        payload: {
          name: 'Síndrome gripal',
          specialty: 'clinica_geral',
          version: 1,
          authorizedAs: 'curator',
        },
      });
    });

    it('curador cria versão nova: papel conferido uma vez, e nas duas linhas da auditoria', async () => {
      mockCreatedVersion(2);
      prisma.protocol.findUnique
        .mockResolvedValueOnce({ ...publishableDraft(), status: 'published' })
        .mockResolvedValueOnce({ id: 'new-protocol-id', version: 2, nodes: [] });

      await service.reviseAsNewVersion(physicianId, protocolId, validInput(), []);

      expect(prisma.physician.findUnique).toHaveBeenCalledTimes(1);
      const actions = auditService.log.mock.calls.map(([entry]) => [
        entry.action,
        entry.payload.authorizedAs,
      ]);
      expect(actions).toEqual([
        ['PROTOCOL_CREATED', 'curator'],
        ['PROTOCOL_REVISED', 'curator'],
      ]);
    });

    it('curador sem vínculo com a instituição do protocolo continua recebendo 404 (CC-019)', async () => {
      prisma.protocol.findUnique.mockResolvedValue(publishableDraft('inst-outro-hospital'));

      await expect(service.publish(physicianId, protocolId, ['inst-meu'])).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.protocol.update).not.toHaveBeenCalled();
    });

    it('curador com vínculo publica o protocolo institucional', async () => {
      prisma.protocol.findUnique.mockResolvedValue(publishableDraft('inst-meu'));
      prisma.protocol.update.mockResolvedValue({ id: protocolId, status: 'published', nodes: [] });

      await expect(service.publish(physicianId, protocolId, ['inst-meu'])).resolves.toMatchObject({
        status: 'published',
      });
    });
  });
});
