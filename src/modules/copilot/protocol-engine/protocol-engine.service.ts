import {
  Injectable,
  Inject,
  NotFoundException,
  ConflictException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { createHash } from 'crypto';
import { Prisma, ProtocolRun } from '@prisma/client';
import { PrismaService } from '../../../config/prisma.service';
import { EncountersService } from '../../encounters/encounters.service';
import { ProtocolsService } from '../../protocols/protocols.service';
import { AuditService } from '../../audit/audit.service';
import type { ProtocolGraphNode } from '../../protocols/protocol-graph-validator';

type ProtocolWithGraph = Awaited<ReturnType<ProtocolsService['findById']>>;
type ProtocolNodeWithEdges = ProtocolWithGraph['nodes'][number];
type ProtocolEdgeWithCondition = ProtocolNodeWithEdges['outgoingEdges'][number];
type NodeContent = ProtocolGraphNode['content'];

export interface RunAnswer {
  nodeId: string;
  answerType: NodeContent['answerType'];
  answer: unknown;
  answeredAt: string;
}

/**
 * Encontra o nó inicial do grafo (sem transições de entrada).
 * Protocolos publicados já passaram pela validação de grafo (PROT-001),
 * que garante exatamente um nó inicial.
 */
function findStartNode(nodes: ProtocolNodeWithEdges[]): ProtocolNodeWithEdges {
  const hasIncoming = new Set(nodes.flatMap((n) => n.outgoingEdges.map((e) => e.toNodeId)));
  const start = nodes.find((n) => !hasIncoming.has(n.id));
  if (!start) throw new ConflictException('Protocolo sem nó inicial definido');
  return start;
}

/**
 * Avança automaticamente por nós "action" (que não exigem resposta do
 * médico) até encontrar um nó "question" ou "outcome".
 */
function autoAdvance(nodes: ProtocolNodeWithEdges[], nodeId: string): string {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const visited = new Set<string>();

  let current = byId.get(nodeId);
  while (
    current &&
    current.nodeType === 'action' &&
    current.outgoingEdges.length === 1 &&
    !visited.has(current.id)
  ) {
    visited.add(current.id);
    const onlyEdge = current.outgoingEdges.find(() => true);
    if (!onlyEdge) break;
    current = byId.get(onlyEdge.toNodeId);
  }

  return current?.id ?? nodeId;
}

function validateAnswer(node: ProtocolNodeWithEdges, answer: unknown): void {
  const content = node.content as NodeContent;

  switch (content.answerType) {
    case 'boolean':
      if (typeof answer !== 'boolean') {
        throw new UnprocessableEntityException(
          `Resposta inválida para o nó "${node.id}": esperado um valor booleano`,
        );
      }
      break;
    case 'choice': {
      const choices = content.choices ?? [];
      if (typeof answer !== 'string' || !choices.includes(answer)) {
        throw new UnprocessableEntityException(
          `Resposta inválida para o nó "${node.id}": esperado uma das opções [${choices.join(', ')}]`,
        );
      }
      break;
    }
    case 'number':
      if (typeof answer !== 'number' || !Number.isFinite(answer)) {
        throw new UnprocessableEntityException(
          `Resposta inválida para o nó "${node.id}": esperado um número`,
        );
      }
      break;
    case 'text':
      if (typeof answer !== 'string' || answer.trim().length === 0) {
        throw new UnprocessableEntityException(
          `Resposta inválida para o nó "${node.id}": esperado um texto não vazio`,
        );
      }
      break;
    default:
      throw new UnprocessableEntityException(
        `O nó "${node.id}" não possui um tipo de resposta (answerType) válido`,
      );
  }
}

function findMatchingEdge(
  edges: ProtocolEdgeWithCondition[],
  answer: unknown,
): ProtocolEdgeWithCondition | undefined {
  const hasAnswerCondition = (edge: ProtocolEdgeWithCondition): boolean => {
    const condition = edge.condition as { answer?: unknown } | null;
    return !!condition && Object.prototype.hasOwnProperty.call(condition, 'answer');
  };

  const exact = edges.find((edge) => {
    if (!hasAnswerCondition(edge)) return false;
    const condition = edge.condition as { answer?: unknown };
    return condition.answer === answer;
  });
  if (exact) return exact;

  return edges.find((edge) => !hasAnswerCondition(edge));
}

@Injectable()
export class ProtocolEngineService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(EncountersService) private readonly encounters: EncountersService,
    @Inject(ProtocolsService) private readonly protocolsService: ProtocolsService,
    @Inject(AuditService) private readonly auditService: AuditService,
  ) {}

  async startRun(physicianId: string, encounterId: string, protocolId: string) {
    await this.encounters.findById(physicianId, encounterId);

    const protocol = await this.protocolsService.findById(protocolId);
    if (protocol.status !== 'published') {
      throw new ConflictException('Apenas protocolos publicados podem ser executados');
    }

    const startNode = findStartNode(protocol.nodes);
    const currentNodeId = autoAdvance(protocol.nodes, startNode.id);
    const currentNode = protocol.nodes.find((n) => n.id === currentNodeId);
    const status = currentNode?.nodeType === 'outcome' ? 'completed' : 'in_progress';

    const run = await this.prisma.protocolRun.create({
      data: {
        encounterId,
        protocolId: protocol.id,
        protocolVersion: protocol.version,
        currentNodeId,
        status,
        answers: [],
        startedBy: physicianId,
      },
    });

    await this.auditService
      .log({
        actorId: physicianId,
        action: 'PROTOCOL_RUN_STARTED',
        entity: 'ProtocolRun',
        entityId: run.id,
        payload: {
          encounterId,
          protocolId: protocol.id,
          protocolVersion: protocol.version,
          currentNodeId,
        },
      })
      .catch(() => undefined);

    return this.toRunView(run, protocol);
  }

  async getRun(physicianId: string, runId: string) {
    const run = await this.findRunOrThrow(runId);
    await this.encounters.findById(physicianId, run.encounterId);

    const protocol = await this.protocolsService.findById(run.protocolId);
    return this.toRunView(run, protocol);
  }

  async answerNode(physicianId: string, runId: string, answer: unknown) {
    const run = await this.findRunOrThrow(runId);
    await this.encounters.findById(physicianId, run.encounterId);

    if (run.status !== 'in_progress') {
      throw new ConflictException('Este protocolo não está mais em andamento');
    }

    const protocol = await this.protocolsService.findById(run.protocolId);
    const currentNode = protocol.nodes.find((n) => n.id === run.currentNodeId);
    if (!currentNode) {
      throw new NotFoundException('Nó atual do protocolo não encontrado');
    }
    if (currentNode.nodeType !== 'question') {
      throw new ConflictException('O nó atual do protocolo não espera uma resposta');
    }

    validateAnswer(currentNode, answer);

    const matchingEdge = findMatchingEdge(currentNode.outgoingEdges, answer);
    if (!matchingEdge) {
      throw new UnprocessableEntityException(
        `Nenhuma transição encontrada para a resposta fornecida no nó "${currentNode.id}"`,
      );
    }

    const nextNodeId = autoAdvance(protocol.nodes, matchingEdge.toNodeId);
    const nextNode = protocol.nodes.find((n) => n.id === nextNodeId);
    if (!nextNode) {
      throw new NotFoundException('Próximo nó do protocolo não encontrado');
    }

    const previousAnswers = (run.answers as unknown as RunAnswer[] | null) ?? [];
    const newAnswer: RunAnswer = {
      nodeId: currentNode.id,
      answerType: (currentNode.content as NodeContent).answerType,
      answer,
      answeredAt: new Date().toISOString(),
    };
    const answers = [...previousAnswers, newAnswer];

    const newStatus = nextNode.nodeType === 'outcome' ? 'completed' : 'in_progress';

    const updated = await this.prisma.protocolRun.update({
      where: { id: run.id },
      data: {
        currentNodeId: nextNodeId,
        answers: answers as unknown as Prisma.InputJsonValue,
        status: newStatus,
      },
    });

    const answerHash = createHash('sha256').update(JSON.stringify(answer)).digest('hex');
    await this.auditService
      .log({
        actorId: physicianId,
        action: 'PROTOCOL_STEP',
        entity: 'ProtocolRun',
        entityId: run.id,
        payload: { nodeId: currentNode.id, answerHash, nextNodeId },
      })
      .catch(() => undefined);

    if (newStatus === 'completed') {
      await this.auditService
        .log({
          actorId: physicianId,
          action: 'PROTOCOL_RUN_COMPLETED',
          entity: 'ProtocolRun',
          entityId: run.id,
          payload: { outcomeNodeId: nextNodeId },
        })
        .catch(() => undefined);
    }

    return this.toRunView(updated, protocol);
  }

  async abandonRun(physicianId: string, runId: string, reason: string) {
    const run = await this.findRunOrThrow(runId);
    await this.encounters.findById(physicianId, run.encounterId);

    if (run.status !== 'in_progress') {
      throw new ConflictException('Este protocolo não está mais em andamento');
    }

    const updated = await this.prisma.protocolRun.update({
      where: { id: run.id },
      data: { status: 'abandoned', abandonReason: reason },
    });

    await this.auditService
      .log({
        actorId: physicianId,
        action: 'PROTOCOL_RUN_ABANDONED',
        entity: 'ProtocolRun',
        entityId: run.id,
        payload: { reason, currentNodeId: run.currentNodeId },
      })
      .catch(() => undefined);

    const protocol = await this.protocolsService.findById(run.protocolId);
    return this.toRunView(updated, protocol);
  }

  private async findRunOrThrow(runId: string): Promise<ProtocolRun> {
    const run = await this.prisma.protocolRun.findUnique({ where: { id: runId } });
    if (!run) throw new NotFoundException('Protocol run not found');
    return run;
  }

  private toRunView(run: ProtocolRun, protocol: ProtocolWithGraph) {
    const currentNode = protocol.nodes.find((n) => n.id === run.currentNodeId) ?? null;

    return {
      id: run.id,
      encounterId: run.encounterId,
      protocolId: run.protocolId,
      protocolName: protocol.name,
      protocolVersion: run.protocolVersion,
      status: run.status,
      currentNode: currentNode
        ? {
            id: currentNode.id,
            nodeType: currentNode.nodeType,
            content: currentNode.content,
            order: currentNode.order,
          }
        : null,
      answers: (run.answers as unknown as RunAnswer[] | null) ?? [],
      abandonReason: run.abandonReason,
      createdAt: run.createdAt,
      updatedAt: run.updatedAt,
    };
  }
}
