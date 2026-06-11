import { describe, it, expect } from 'vitest';
import { validateProtocolGraph, type ProtocolGraphNode } from './protocol-graph-validator';
import { PILOT_PROTOCOLS, type PilotProtocol } from '../../../prisma/seeds/data/pilot-protocols';

/**
 * Replica a navegação determinística do ProtocolEngineService
 * (findStartNode + autoAdvance + edges) para validar, sem banco de dados,
 * que toda combinação de respostas leva a um nó "outcome".
 */
function findStartNodeId(protocol: PilotProtocol): string {
  const hasIncoming = new Set(protocol.edges.map((e) => e.toNodeId));
  const start = protocol.nodes.filter((n) => !hasIncoming.has(n.id));
  if (start.length !== 1) {
    throw new Error(`Esperado exatamente um nó inicial em "${protocol.name}", encontrado ${start.length}`);
  }
  return start[0]!.id;
}

function autoAdvance(protocol: PilotProtocol, nodeId: string): string {
  const byId = new Map(protocol.nodes.map((n) => [n.id, n]));
  let current = byId.get(nodeId);
  if (!current) throw new Error(`Nó "${nodeId}" não encontrado em "${protocol.name}"`);

  const visited = new Set<string>();
  while (current.nodeType === 'action' && !visited.has(current.id)) {
    visited.add(current.id);
    const outgoing = protocol.edges.filter((e) => e.fromNodeId === current!.id);
    if (outgoing.length !== 1) break;
    const next = byId.get(outgoing[0]!.toNodeId);
    if (!next) break;
    current = next;
  }
  return current.id;
}

function reachableOutcomes(protocol: PilotProtocol): Set<string> {
  const byId = new Map(protocol.nodes.map((n) => [n.id, n]));
  const outcomes = new Set<string>();

  const visit = (nodeId: string): void => {
    const node = byId.get(nodeId);
    if (!node) throw new Error(`Nó "${nodeId}" não encontrado em "${protocol.name}"`);

    if (node.nodeType === 'outcome') {
      outcomes.add(nodeId);
      return;
    }

    const outgoing = protocol.edges.filter((e) => e.fromNodeId === nodeId);
    for (const edge of outgoing) {
      visit(autoAdvance(protocol, edge.toNodeId));
    }
  };

  visit(autoAdvance(protocol, findStartNodeId(protocol)));
  return outcomes;
}

describe('PROT-003: protocolos piloto', () => {
  for (const protocol of PILOT_PROTOCOLS) {
    describe(protocol.name, () => {
      it('passa na validação de grafo (PROT-001)', () => {
        const graphNodes: ProtocolGraphNode[] = protocol.nodes.map((n) => ({
          id: n.id,
          nodeType: n.nodeType,
          content: n.content,
        }));

        const result = validateProtocolGraph(graphNodes, protocol.edges);

        expect(result.errors).toEqual([]);
        expect(result.valid).toBe(true);
      });

      it('todo nó action/outcome possui citação de fonte', () => {
        for (const node of protocol.nodes) {
          if (node.nodeType === 'question') continue;

          expect(node.content.citation, `nó "${node.id}" sem citation`).toBeDefined();
          expect(node.content.citation?.source, `nó "${node.id}" sem citation.source`).toBeTruthy();
          expect(node.content.citation?.sourceVersion, `nó "${node.id}" sem citation.sourceVersion`).toBeTruthy();
        }
      });

      it('toda combinação de respostas termina em um nó outcome', () => {
        const outcomes = reachableOutcomes(protocol);
        const outcomeNodeIds = new Set(
          protocol.nodes.filter((n) => n.nodeType === 'outcome').map((n) => n.id),
        );

        expect(outcomes.size).toBeGreaterThan(0);
        for (const outcomeId of outcomes) {
          expect(outcomeNodeIds.has(outcomeId)).toBe(true);
        }
      });
    });
  }
});
