import {
  Injectable,
  Inject,
  Logger,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { Prisma, ProtocolStatus } from '@prisma/client';
import { PrismaService } from '../../config/prisma.service';
import { AuditService } from '../audit/audit.service';
import { isVisibleToInstitutions } from '../institutions/institution-visibility';
import { CreateProtocolInput } from './schemas/protocol.schemas';
import { validateProtocolGraph, type ProtocolGraphNode } from './protocol-graph-validator';
import { protocolAuthority, type ProtocolAuthority } from './protocol-authoring';

const PROTOCOL_WITH_GRAPH_INCLUDE = {
  nodes: {
    include: {
      outgoingEdges: true,
    },
    orderBy: { order: 'asc' as const },
  },
} as const;

type ProtocolWriteAction = 'create' | 'publish' | 'revise';

@Injectable()
export class ProtocolsService {
  private readonly logger = new Logger(ProtocolsService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly auditService: AuditService,
  ) {}

  /**
   * CC-020 — antes, qualquer médico autenticado criava, publicava ou criava
   * versão nova de protocolo global. Só curador ou ADMIN escreve (ver
   * protocol-authoring.ts); no institucional, o vínculo ativo do CC-019 é
   * checado à parte.
   */
  async create(physicianId: string, input: CreateProtocolInput) {
    const authority = await this.requireAuthority(physicianId, 'create');
    return this.createVersion(physicianId, input, authority);
  }

  private async createVersion(
    physicianId: string,
    input: CreateProtocolInput,
    authority: ProtocolAuthority,
  ) {
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
        payload: {
          name: protocol.name,
          specialty: protocol.specialty,
          version: protocol.version,
          authorizedAs: authority,
        },
      })
      .catch(() => undefined);

    return this.findById(protocol.id);
  }

  /**
   * PROT-004: isolamento de protocolos por instituição. Sem `institutionId`,
   * retorna apenas protocolos globais (institutionId IS NULL). Com
   * `institutionId`, retorna globais + os da própria instituição — protocolos
   * de outras instituições nunca aparecem na listagem.
   */
  async findAll(
    filters: { specialty?: string; status?: ProtocolStatus; institutionId?: string | null } = {},
  ) {
    const where: Prisma.ProtocolWhereInput = {};
    if (filters.specialty) where.specialty = filters.specialty;
    if (filters.status) where.status = filters.status;

    if (filters.institutionId) {
      where.OR = [{ institutionId: null }, { institutionId: filters.institutionId }];
    } else {
      where.institutionId = null;
    }

    return this.prisma.protocol.findMany({
      where,
      orderBy: [{ name: 'asc' }, { version: 'desc' }],
    });
  }

  /**
   * PROT-004: quando `institutionId` é informado, protocolos de outras
   * instituições são tratados como inexistentes (NotFoundException), sem
   * vazar sua existência. Chamadas internas (publish, reviseAsNewVersion,
   * create) não informam `institutionId` e não sofrem essa checagem.
   */
  async findById(id: string, institutionId?: string | null) {
    const protocol = await this.prisma.protocol.findUnique({
      where: { id },
      include: PROTOCOL_WITH_GRAPH_INCLUDE,
    });
    if (!protocol) throw new NotFoundException('Protocol not found');

    if (
      institutionId !== undefined &&
      protocol.institutionId !== null &&
      protocol.institutionId !== institutionId
    ) {
      throw new NotFoundException('Protocol not found');
    }

    return protocol;
  }

  /**
   * CC-019 — protocolo pedido por um médico: global, ou de instituição com a
   * qual ele tem vínculo ativo (`institutionIds`). O de outra instituição é
   * tratado como inexistente, como em `findById`.
   */
  async findVisibleById(id: string, institutionIds: readonly string[]) {
    const protocol = await this.findById(id);
    if (!isVisibleToInstitutions(protocol.institutionId, institutionIds)) {
      throw new NotFoundException('Protocol not found');
    }
    return protocol;
  }

  /**
   * CC-019 — antes, qualquer médico publicava o rascunho de outra instituição
   * e recebia o protocolo inteiro na resposta. CC-020 — o papel vem antes da
   * visibilidade: quem não escreve recebe 403 para qualquer id, sem saber se
   * o protocolo existe.
   */
  async publish(physicianId: string, id: string, institutionIds: readonly string[]) {
    const authority = await this.requireAuthority(physicianId, 'publish');
    const protocol = await this.findVisibleById(id, institutionIds);

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
        payload: {
          name: protocol.name,
          specialty: protocol.specialty,
          version: protocol.version,
          authorizedAs: authority,
        },
      })
      .catch(() => undefined);

    return published;
  }

  /**
   * Cria uma nova versão a partir de um protocolo publicado/retirado.
   * A versão anterior não é alterada e permanece consultável (imutabilidade
   * de versões publicadas, mesmo princípio do audit_log).
   */
  async reviseAsNewVersion(
    physicianId: string,
    id: string,
    input: CreateProtocolInput,
    institutionIds: readonly string[],
  ) {
    const authority = await this.requireAuthority(physicianId, 'revise');
    const previous = await this.findVisibleById(id, institutionIds);

    if (previous.status === 'draft') {
      throw new ConflictException(
        'Protocolos em rascunho podem ser editados diretamente; revise apenas versões publicadas/retiradas',
      );
    }

    const created = await this.createVersion(
      physicianId,
      {
        ...input,
        name: previous.name,
        specialty: previous.specialty,
        institutionId: previous.institutionId ?? input.institutionId,
      },
      authority,
    );

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
          authorizedAs: authority,
        },
      })
      .catch(() => undefined);

    return created;
  }

  /**
   * Papel e flag lidos do banco a cada pedido (o token pode estar velho). A
   * recusa vai para o log sem identificar o médico; rota e IP já estão no log
   * de acesso HTTP.
   */
  private async requireAuthority(
    physicianId: string,
    action: ProtocolWriteAction,
  ): Promise<ProtocolAuthority> {
    const physician = await this.prisma.physician.findUnique({
      where: { id: physicianId },
      select: { role: true, isCurator: true },
    });
    const authority = protocolAuthority(physician);
    if (authority) return authority;

    this.logger.warn(`PROTOCOL_WRITE_DENIED action=${action}: sem papel de curador nem ADMIN`);
    throw new ForbiddenException(
      'Apenas curadores clínicos ou administradores escrevem protocolos',
    );
  }
}
