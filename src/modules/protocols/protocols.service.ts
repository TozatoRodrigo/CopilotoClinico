import {
  Injectable,
  Inject,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { Prisma, ProtocolStatus } from '@prisma/client';
import { PrismaService } from '../../config/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateProtocolInput } from './schemas/protocol.schemas';
import { validateProtocolGraph, type ProtocolGraphNode } from './protocol-graph-validator';

const PROTOCOL_WITH_GRAPH_INCLUDE = {
  nodes: {
    include: {
      outgoingEdges: true,
    },
    orderBy: { order: 'asc' as const },
  },
} as const;

@Injectable()
export class ProtocolsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly auditService: AuditService,
  ) {}

  async create(physicianId: string, input: CreateProtocolInput) {
    const graphValidation = validateProtocolGraph(
      input.nodes.map((n) => ({ id: n.id, nodeType: n.nodeType, content: n.content })),
      input.edges,
    );
    if (!graphValidation.valid) {
      throw new BadRequestException(graphValidation.errors);
    }

    const latest = await this.prisma.protocol.findFirst({
      where: {
        name: input.name,
        specialty: input.specialty,
        institutionId: input.institutionId ?? null,
      },
      orderBy: { version: 'desc' },
      select: { version: true },
    });

    const protocol = await this.prisma.protocol.create({
      data: {
        name: input.name,
        specialty: input.specialty,
        institutionId: input.institutionId ?? null,
        sourceRef: input.sourceRef ?? null,
        version: (latest?.version ?? 0) + 1,
        status: 'draft',
        createdBy: physicianId,
      },
    });

    const idMap = new Map<string, string>();
    for (const node of input.nodes) {
      const created = await this.prisma.protocolNode.create({
        data: {
          protocolId: protocol.id,
          nodeType: node.nodeType,
          content: node.content,
          order: node.order,
        },
      });
      idMap.set(node.id, created.id);
    }

    for (const edge of input.edges) {
      const fromNodeId = idMap.get(edge.fromNodeId);
      const toNodeId = idMap.get(edge.toNodeId);
      if (!fromNodeId || !toNodeId) continue;

      await this.prisma.protocolEdge.create({
        data: {
          fromNodeId,
          toNodeId,
          condition: (edge.condition ?? undefined) as Prisma.InputJsonValue | undefined,
        },
      });
    }

    await this.auditService
      .log({
        actorId: physicianId,
        action: 'PROTOCOL_CREATED',
        entity: 'Protocol',
        entityId: protocol.id,
        payload: { name: protocol.name, specialty: protocol.specialty, version: protocol.version },
      })
      .catch(() => undefined);

    return this.findById(protocol.id);
  }

  async findAll(filters: { specialty?: string; status?: ProtocolStatus } = {}) {
    const where: Prisma.ProtocolWhereInput = {};
    if (filters.specialty) where.specialty = filters.specialty;
    if (filters.status) where.status = filters.status;

    return this.prisma.protocol.findMany({
      where,
      orderBy: [{ name: 'asc' }, { version: 'desc' }],
    });
  }

  async findById(id: string) {
    const protocol = await this.prisma.protocol.findUnique({
      where: { id },
      include: PROTOCOL_WITH_GRAPH_INCLUDE,
    });
    if (!protocol) throw new NotFoundException('Protocol not found');
    return protocol;
  }

  async publish(physicianId: string, id: string) {
    const protocol = await this.findById(id);

    if (protocol.status !== 'draft') {
      throw new ConflictException('Apenas protocolos em rascunho (draft) podem ser publicados');
    }

    const graphNodes: ProtocolGraphNode[] = protocol.nodes.map((node) => ({
      id: node.id,
      nodeType: node.nodeType,
      content: node.content as ProtocolGraphNode['content'],
    }));
    const graphEdges = protocol.nodes.flatMap((node) =>
      node.outgoingEdges.map((edge) => ({
        fromNodeId: edge.fromNodeId,
        toNodeId: edge.toNodeId,
        condition: edge.condition as { answer?: unknown } | null,
      })),
    );

    const graphValidation = validateProtocolGraph(graphNodes, graphEdges);
    if (!graphValidation.valid) {
      throw new BadRequestException(graphValidation.errors);
    }

    const published = await this.prisma.protocol.update({
      where: { id },
      data: { status: 'published', publishedAt: new Date() },
      include: PROTOCOL_WITH_GRAPH_INCLUDE,
    });

    await this.auditService
      .log({
        actorId: physicianId,
        action: 'PROTOCOL_PUBLISHED',
        entity: 'Protocol',
        entityId: protocol.id,
        payload: { name: protocol.name, specialty: protocol.specialty, version: protocol.version },
      })
      .catch(() => undefined);

    return published;
  }

  /**
   * Cria uma nova versão a partir de um protocolo publicado/retirado.
   * A versão anterior não é alterada e permanece consultável (imutabilidade
   * de versões publicadas, mesmo princípio do audit_log).
   */
  async reviseAsNewVersion(physicianId: string, id: string, input: CreateProtocolInput) {
    const previous = await this.findById(id);

    if (previous.status === 'draft') {
      throw new ConflictException(
        'Protocolos em rascunho podem ser editados diretamente; revise apenas versões publicadas/retiradas',
      );
    }

    const created = await this.create(physicianId, {
      ...input,
      name: previous.name,
      specialty: previous.specialty,
      institutionId: previous.institutionId ?? input.institutionId,
    });

    await this.auditService
      .log({
        actorId: physicianId,
        action: 'PROTOCOL_REVISED',
        entity: 'Protocol',
        entityId: created.id,
        payload: {
          previousProtocolId: previous.id,
          previousVersion: previous.version,
          newVersion: created.version,
        },
      })
      .catch(() => undefined);

    return created;
  }
}
