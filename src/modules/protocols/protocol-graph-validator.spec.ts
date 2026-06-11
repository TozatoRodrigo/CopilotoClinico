import { describe, it, expect } from 'vitest';
import { validateProtocolGraph, type ProtocolGraphNode, type ProtocolGraphEdge } from './protocol-graph-validator';

function questionNode(
  id: string,
  answerType: 'boolean' | 'choice' | 'number' | 'text',
  choices?: string[],
): ProtocolGraphNode {
  return {
    id,
    nodeType: 'question',
    content: { question: `Pergunta ${id}?`, answerType, choices },
  };
}

function actionNode(id: string): ProtocolGraphNode {
  return { id, nodeType: 'action', content: { action: `Ação ${id}` } };
}

function outcomeNode(id: string): ProtocolGraphNode {
  return { id, nodeType: 'outcome', content: { outcome: `Desfecho ${id}` } };
}

describe('validateProtocolGraph', () => {
  it('accepts a valid linear protocol (question -> action -> outcome)', () => {
    const nodes: ProtocolGraphNode[] = [
      questionNode('q1', 'boolean'),
      actionNode('a1'),
      outcomeNode('o1'),
    ];
    const edges: ProtocolGraphEdge[] = [
      { fromNodeId: 'q1', toNodeId: 'a1', condition: { answer: true } },
      { fromNodeId: 'q1', toNodeId: 'o1', condition: { answer: false } },
      { fromNodeId: 'a1', toNodeId: 'o1' },
    ];

    const result = validateProtocolGraph(nodes, edges);

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('accepts a valid protocol with a choice question covering all options', () => {
    const nodes: ProtocolGraphNode[] = [
      questionNode('q1', 'choice', ['<48h', '>=48h']),
      outcomeNode('o1'),
      outcomeNode('o2'),
    ];
    const edges: ProtocolGraphEdge[] = [
      { fromNodeId: 'q1', toNodeId: 'o1', condition: { answer: '<48h' } },
      { fromNodeId: 'q1', toNodeId: 'o2', condition: { answer: '>=48h' } },
    ];

    const result = validateProtocolGraph(nodes, edges);

    expect(result.valid).toBe(true);
  });

  it('rejects a graph with a cycle', () => {
    const nodes: ProtocolGraphNode[] = [
      questionNode('q1', 'boolean'),
      actionNode('a1'),
      outcomeNode('o1'),
    ];
    const edges: ProtocolGraphEdge[] = [
      { fromNodeId: 'q1', toNodeId: 'a1', condition: { answer: true } },
      { fromNodeId: 'q1', toNodeId: 'o1', condition: { answer: false } },
      { fromNodeId: 'a1', toNodeId: 'q1' }, // cycle back to q1
    ];

    const result = validateProtocolGraph(nodes, edges);

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('ciclo'))).toBe(true);
  });

  it('rejects a graph without a unique start node (zero start nodes)', () => {
    const nodes: ProtocolGraphNode[] = [actionNode('a1'), actionNode('a2'), outcomeNode('o1')];
    const edges: ProtocolGraphEdge[] = [
      { fromNodeId: 'a1', toNodeId: 'a2' },
      { fromNodeId: 'a2', toNodeId: 'a1' },
      { fromNodeId: 'a2', toNodeId: 'o1' },
    ];

    const result = validateProtocolGraph(nodes, edges);

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('nó inicial'))).toBe(true);
  });

  it('rejects a graph with multiple start nodes', () => {
    const nodes: ProtocolGraphNode[] = [
      questionNode('q1', 'boolean'),
      questionNode('q2', 'boolean'),
      outcomeNode('o1'),
      outcomeNode('o2'),
    ];
    const edges: ProtocolGraphEdge[] = [
      { fromNodeId: 'q1', toNodeId: 'o1', condition: { answer: true } },
      { fromNodeId: 'q1', toNodeId: 'o1', condition: { answer: false } },
      { fromNodeId: 'q2', toNodeId: 'o2', condition: { answer: true } },
      { fromNodeId: 'q2', toNodeId: 'o2', condition: { answer: false } },
    ];

    const result = validateProtocolGraph(nodes, edges);

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('nó inicial') && e.includes('2'))).toBe(true);
  });

  it('rejects a boolean question node missing coverage for one of the answers', () => {
    const nodes: ProtocolGraphNode[] = [questionNode('q1', 'boolean'), outcomeNode('o1')];
    const edges: ProtocolGraphEdge[] = [
      { fromNodeId: 'q1', toNodeId: 'o1', condition: { answer: true } },
      // missing answer: false
    ];

    const result = validateProtocolGraph(nodes, edges);

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('q1') && e.includes('boolean'))).toBe(true);
  });

  it('rejects a choice question node missing coverage for one of the choices', () => {
    const nodes: ProtocolGraphNode[] = [
      questionNode('q1', 'choice', ['<48h', '>=48h', 'desconhecido']),
      outcomeNode('o1'),
      outcomeNode('o2'),
    ];
    const edges: ProtocolGraphEdge[] = [
      { fromNodeId: 'q1', toNodeId: 'o1', condition: { answer: '<48h' } },
      { fromNodeId: 'q1', toNodeId: 'o2', condition: { answer: '>=48h' } },
      // missing 'desconhecido'
    ];

    const result = validateProtocolGraph(nodes, edges);

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('desconhecido'))).toBe(true);
  });

  it('rejects a question node with no outgoing edges', () => {
    const nodes: ProtocolGraphNode[] = [questionNode('q1', 'boolean'), outcomeNode('o1')];
    const edges: ProtocolGraphEdge[] = [];

    const result = validateProtocolGraph(nodes, edges);

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('q1') && e.includes('transição'))).toBe(true);
    // also no start node since edges is empty (both nodes have no incoming edges)
    expect(result.errors.some((e) => e.includes('nó inicial'))).toBe(true);
  });

  it('rejects a path that does not terminate in an outcome node', () => {
    const nodes: ProtocolGraphNode[] = [questionNode('q1', 'boolean'), actionNode('a1')];
    const edges: ProtocolGraphEdge[] = [
      { fromNodeId: 'q1', toNodeId: 'a1', condition: { answer: true } },
      { fromNodeId: 'q1', toNodeId: 'a1', condition: { answer: false } },
      // a1 has no outgoing edges and is not an outcome node
    ];

    const result = validateProtocolGraph(nodes, edges);

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('a1') && e.includes('outcome'))).toBe(true);
  });

  it('rejects edges referencing unknown node ids', () => {
    const nodes: ProtocolGraphNode[] = [outcomeNode('o1')];
    const edges: ProtocolGraphEdge[] = [{ fromNodeId: 'missing', toNodeId: 'o1' }];

    const result = validateProtocolGraph(nodes, edges);

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('missing'))).toBe(true);
  });
});
