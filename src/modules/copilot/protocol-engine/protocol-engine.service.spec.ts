import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ProtocolEngineService } from './protocol-engine.service';
import { PrismaService } from '../../../config/prisma.service';
import { EncountersService } from '../../encounters/encounters.service';
import { ProtocolsService } from '../../protocols/protocols.service';
import { AuditService } from '../../audit/audit.service';

const physicianId = '550e8400-e29b-41d4-a716-446655440000';
const encounterId = '660e8400-e29b-41d4-a716-446655440001';
const protocolId = '770e8400-e29b-41d4-a716-446655440002';
const runId = '880e8400-e29b-41d4-a716-446655440003';

interface NodeFixture {
  id: string;
  protocolId: string;
  nodeType: 'question' | 'action' | 'outcome';
  content: Record<string, unknown>;
  order: number;
  createdAt: Date;
  outgoingEdges: Array<{
    id: string;
    fromNodeId: string;
    toNodeId: string;
    condition: Record<string, unknown> | null;
    createdAt: Date;
  }>;
}

function edge(fromNodeId: string, toNodeId: string, condition: Record<string, unknown> | null) {
  return {
    id: `${fromNodeId}->${toNodeId}`,
    fromNodeId,
    toNodeId,
    condition,
    createdAt: new Date('2026-01-01'),
  };
}

function node(
  id: string,
  nodeType: NodeFixture['nodeType'],
  content: Record<string, unknown>,
  order: number,
  outgoingEdges: NodeFixture['outgoingEdges'] = [],
): NodeFixture {
  return { id, protocolId, nodeType, content, order, createdAt: new Date('2026-01-01'), outgoingEdges };
}

/**
 * Protocolo de 6 nós (sepse simplificado):
 *
 *   q1 (boolean: SIRS >= 2 critérios?)
 *     -- true  --> a1 (ação: coletar lactato/hemoculturas) --> q2
 *     -- false --> o1 (outcome: não segue protocolo de sepse)
 *
 *   q2 (choice: lactato <2 / >=2)
 *     -- '<2'  --> a2 (ação: observação) --> o1
 *     -- '>=2' --> o2 (outcome: sepse confirmada, iniciar bundle 1h)
 */
function buildProtocol(overrides: Partial<{ status: string; version: number }> = {}) {
  return {
    id: protocolId,
    name: 'Sepse',
    specialty: 'emergencia',
    version: overrides.version ?? 1,
    status: overrides.status ?? 'published',
    institutionId: null,
    sourceRef: null,
    createdBy: physicianId,
    publishedAt: new Date('2026-01-01'),
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    nodes: [
      node('q1', 'question', { question: 'SIRS >= 2 critérios?', answerType: 'boolean' }, 0, [
        edge('q1', 'a1', { answer: true }),
        edge('q1', 'o1', { answer: false }),
      ]),
      node('a1', 'action', { action: 'Coletar lactato e hemoculturas' }, 1, [edge('a1', 'q2', null)]),
      node(
        'q2',
        'question',
        { question: 'Lactato (mmol/L)?', answerType: 'choice', choices: ['<2', '>=2'] },
        2,
        [edge('q2', 'a2', { answer: '<2' }), edge('q2', 'o2', { answer: '>=2' })],
      ),
      node('a2', 'action', { action: 'Observação clínica' }, 3, [edge('a2', 'o1', null)]),
      node('o1', 'outcome', { outcome: 'Não segue protocolo de sepse / observação' }, 4, []),
      node('o2', 'outcome', { outcome: 'Sepse confirmada — iniciar bundle 1h' }, 5, []),
    ] as NodeFixture[],
  };
}

describe('ProtocolEngineService', () => {
  let service: ProtocolEngineService;
  let prisma: {
    protocolRun: {
      create: ReturnType<typeof vi.fn>;
      findUnique: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
  };
  let encountersService: { findById: ReturnType<typeof vi.fn> };
  let protocolsService: { findById: ReturnType<typeof vi.fn> };
  let auditService: { log: ReturnType<typeof vi.fn> };

  /** Estado simulado da tabela protocol_runs (uma linha). */
  let runStore: Record<string, unknown> | null;

  beforeEach(() => {
    vi.clearAllMocks();
    runStore = null;

    prisma = {
      protocolRun: {
        create: vi.fn().mockImplementation(({ data }) => {
          runStore = {
            id: runId,
            createdAt: new Date('2026-06-12'),
            updatedAt: new Date('2026-06-12'),
            abandonReason: null,
            ...data,
          };
          return Promise.resolve(runStore);
        }),
        findUnique: vi.fn().mockImplementation(() => Promise.resolve(runStore)),
        update: vi.fn().mockImplementation(({ data }) => {
          runStore = { ...(runStore as Record<string, unknown>), ...data, updatedAt: new Date('2026-06-12') };
          return Promise.resolve(runStore);
        }),
      },
    };

    encountersService = {
      findById: vi.fn().mockResolvedValue({ id: encounterId, physicianId }),
    };
    protocolsService = {
      findById: vi.fn().mockResolvedValue(buildProtocol()),
    };
    auditService = { log: vi.fn().mockResolvedValue(undefined) };

    service = new ProtocolEngineService(
      prisma as unknown as PrismaService,
      encountersService as unknown as EncountersService,
      protocolsService as unknown as ProtocolsService,
      auditService as unknown as AuditService,
    );
  });

  describe('startRun', () => {
    it('starts a run at the initial question node and audits PROTOCOL_RUN_STARTED', async () => {
      const run = await service.startRun(physicianId, encounterId, protocolId);

      expect(encountersService.findById).toHaveBeenCalledWith(physicianId, encounterId);
      expect(run.status).toBe('in_progress');
      expect(run.currentNode?.id).toBe('q1');
      expect(run.protocolVersion).toBe(1);
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'PROTOCOL_RUN_STARTED', entityId: runId }),
      );
    });

    it('rejects starting a run for a protocol that is not published', async () => {
      protocolsService.findById.mockResolvedValue(buildProtocol({ status: 'draft' }));

      await expect(service.startRun(physicianId, encounterId, protocolId)).rejects.toThrow(
        ConflictException,
      );
      expect(prisma.protocolRun.create).not.toHaveBeenCalled();
    });
  });

  describe('answerNode — validação de tipo (422)', () => {
    it('rejects a non-boolean answer for a boolean question node', async () => {
      await service.startRun(physicianId, encounterId, protocolId);

      await expect(service.answerNode(physicianId, runId, 'sim')).rejects.toThrow(
        UnprocessableEntityException,
      );
    });

    it('rejects a choice answer that is not one of the listed choices', async () => {
      await service.startRun(physicianId, encounterId, protocolId);
      await service.answerNode(physicianId, runId, true); // -> a1 -> q2 (choice)

      await expect(service.answerNode(physicianId, runId, 'desconhecido')).rejects.toThrow(
        UnprocessableEntityException,
      );
    });
  });

  describe('answerNode — execução de ponta a ponta (6 nós)', () => {
    it.each([
      {
        name: 'SIRS negativo -> não segue protocolo',
        answers: [false],
        expectedPath: ['q1', 'o1'],
        expectedOutcome: 'Não segue protocolo de sepse / observação',
      },
      {
        name: 'SIRS positivo + lactato baixo -> observação',
        answers: [true, '<2'],
        expectedPath: ['q1', 'q2', 'o1'],
        expectedOutcome: 'Não segue protocolo de sepse / observação',
      },
      {
        name: 'SIRS positivo + lactato alto -> bundle de sepse',
        answers: [true, '>=2'],
        expectedPath: ['q1', 'q2', 'o2'],
        expectedOutcome: 'Sepse confirmada — iniciar bundle 1h',
      },
    ])('$name', async ({ answers, expectedPath, expectedOutcome }) => {
      let run = await service.startRun(physicianId, encounterId, protocolId);
      const visited: string[] = [run.currentNode!.id];

      for (const answer of answers) {
        run = await service.answerNode(physicianId, runId, answer);
        visited.push(run.currentNode!.id);
      }

      expect(visited).toEqual(expectedPath);
      expect(run.status).toBe('completed');
      expect(run.currentNode?.nodeType).toBe('outcome');
      expect((run.currentNode?.content as { outcome: string }).outcome).toBe(expectedOutcome);
      expect(run.answers).toHaveLength(answers.length);

      // PROTOCOL_STEP é registrado a cada transição, com hash (não o valor bruto da resposta)
      const stepCalls = auditService.log.mock.calls.filter(
        ([params]) => params.action === 'PROTOCOL_STEP',
      );
      expect(stepCalls).toHaveLength(answers.length);
      for (const [params] of stepCalls) {
        expect(params.payload).toHaveProperty('answerHash');
        expect(typeof params.payload.answerHash).toBe('string');
        expect(params.payload).not.toHaveProperty('answer');
      }

      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'PROTOCOL_RUN_COMPLETED', entityId: runId }),
      );
    });

    it('reconstructs the full traversed path from the audit trail', async () => {
      let run = await service.startRun(physicianId, encounterId, protocolId);
      run = await service.answerNode(physicianId, runId, true); // q1 -> a1 -> q2
      run = await service.answerNode(physicianId, runId, '>=2'); // q2 -> o2

      expect(run.currentNode?.id).toBe('o2');

      const stepCalls = auditService.log.mock.calls
        .filter(([params]) => params.action === 'PROTOCOL_STEP')
        .map(([params]) => params.payload as { nodeId: string; nextNodeId: string });

      // Reconstrói o caminho a partir dos pares (nodeId -> nextNodeId)
      const reconstructedPath = [stepCalls[0].nodeId, ...stepCalls.map((s) => s.nextNodeId)];
      expect(reconstructedPath).toEqual(['q1', 'q2', 'o2']);
    });
  });

  describe('answerNode — estado do run', () => {
    it('rejects answering a run that already finished', async () => {
      await service.startRun(physicianId, encounterId, protocolId);
      await service.answerNode(physicianId, runId, false); // -> completed

      await expect(service.answerNode(physicianId, runId, true)).rejects.toThrow(ConflictException);
    });

    it('throws NotFoundException for an unknown run id', async () => {
      runStore = null;

      await expect(service.answerNode(physicianId, 'unknown-run', true)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('versionamento do run', () => {
    it('pins the protocol id/version at start; publishing a new version does not affect the run', async () => {
      const run = await service.startRun(physicianId, encounterId, protocolId);
      expect(run.protocolVersion).toBe(1);

      // Simula uma nova versão publicada (Protocol v2 é uma linha diferente);
      // o run continua referenciando o mesmo protocolId/version (v1).
      protocolsService.findById.mockResolvedValue(buildProtocol({ version: 1 }));

      const updated = await service.answerNode(physicianId, runId, false);

      expect(protocolsService.findById).toHaveBeenLastCalledWith(protocolId);
      expect(updated.protocolVersion).toBe(1);
    });
  });

  describe('abandonRun', () => {
    it('requires a reason, marks the run as abandoned and audits PROTOCOL_RUN_ABANDONED', async () => {
      await service.startRun(physicianId, encounterId, protocolId);

      const result = await service.abandonRun(physicianId, runId, 'Paciente recusou continuidade');

      expect(result.status).toBe('abandoned');
      expect(result.abandonReason).toBe('Paciente recusou continuidade');
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'PROTOCOL_RUN_ABANDONED',
          entityId: runId,
          payload: expect.objectContaining({ reason: 'Paciente recusou continuidade' }),
        }),
      );
    });

    it('rejects abandoning a run that already finished', async () => {
      await service.startRun(physicianId, encounterId, protocolId);
      await service.answerNode(physicianId, runId, false); // -> completed

      await expect(service.abandonRun(physicianId, runId, 'motivo qualquer')).rejects.toThrow(
        ConflictException,
      );
    });
  });
});
