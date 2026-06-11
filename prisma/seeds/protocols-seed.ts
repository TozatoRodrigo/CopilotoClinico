/**
 * PROT-003: seed dos protocolos piloto (síndrome gripal, sepse — bundle 1ª
 * hora, dor torácica) como grafos ProtocolNode/ProtocolEdge publicados.
 * Os grafos ficam em prisma/seeds/data/pilot-protocols.ts — ver o cabeçalho
 * daquele arquivo para o status de curadoria clínica pendente.
 */
import { PrismaClient, ProtocolStatus, type Prisma } from '@prisma/client';
import { validateProtocolGraph, type ProtocolGraphNode } from '../../src/modules/protocols/protocol-graph-validator';
import { PILOT_PROTOCOLS, type PilotNodeContent } from './data/pilot-protocols';

const prisma = new PrismaClient();

async function findCreatedBy(): Promise<string> {
  const curator = await prisma.physician.findFirst({
    where: { isCurator: true },
    select: { id: true },
    orderBy: { createdAt: 'asc' },
  });
  if (curator) return curator.id;

  const any = await prisma.physician.findFirst({ select: { id: true }, orderBy: { createdAt: 'asc' } });
  return any?.id ?? '00000000-0000-0000-0000-000000000000';
}

async function resolveCitationChunkId(content: PilotNodeContent): Promise<PilotNodeContent> {
  if (!content.citation || content.citationChunkId) return content;

  const chunk = await prisma.guidelineChunk.findFirst({
    where: { source: content.citation.source },
    select: { id: true },
  });
  if (!chunk) return content;

  return { ...content, citationChunkId: chunk.id };
}

async function main() {
  const createdBy = await findCreatedBy();

  for (const protocol of PILOT_PROTOCOLS) {
    const graphNodes: ProtocolGraphNode[] = protocol.nodes.map((n) => ({
      id: n.id,
      nodeType: n.nodeType,
      content: n.content,
    }));
    const validation = validateProtocolGraph(graphNodes, protocol.edges);
    if (!validation.valid) {
      throw new Error(`Grafo inválido para "${protocol.name}": ${validation.errors.join('; ')}`);
    }

    const existing = await prisma.protocol.findFirst({
      where: { name: protocol.name, specialty: protocol.specialty, institutionId: null },
      orderBy: { version: 'desc' },
      select: { id: true, version: true },
    });
    if (existing) {
      console.log(`Protocolo "${protocol.name}" já existe (v${existing.version}) — pulando.`);
      continue;
    }

    const created = await prisma.protocol.create({
      data: {
        name: protocol.name,
        specialty: protocol.specialty,
        sourceRef: protocol.sourceRef,
        version: 1,
        status: ProtocolStatus.published,
        publishedAt: new Date(),
        createdBy,
      },
    });

    const idMap = new Map<string, string>();
    for (const node of protocol.nodes) {
      const content = await resolveCitationChunkId(node.content);
      const dbNode = await prisma.protocolNode.create({
        data: {
          protocolId: created.id,
          nodeType: node.nodeType,
          content: content as unknown as Prisma.InputJsonValue,
          order: node.order,
        },
      });
      idMap.set(node.id, dbNode.id);
    }

    for (const edge of protocol.edges) {
      const fromNodeId = idMap.get(edge.fromNodeId);
      const toNodeId = idMap.get(edge.toNodeId);
      if (!fromNodeId || !toNodeId) {
        throw new Error(`Edge referencia nó inexistente em "${protocol.name}": ${edge.fromNodeId} -> ${edge.toNodeId}`);
      }
      await prisma.protocolEdge.create({
        data: {
          fromNodeId,
          toNodeId,
          condition: (edge.condition ?? undefined) as Prisma.InputJsonValue | undefined,
        },
      });
    }

    console.log(
      `Protocolo "${protocol.name}" (v1, published) criado com ${protocol.nodes.length} nós e ${protocol.edges.length} edges.`,
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
