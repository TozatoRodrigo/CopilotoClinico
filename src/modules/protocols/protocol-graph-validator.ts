export type ProtocolNodeType = 'question' | 'action' | 'outcome';

export interface ProtocolGraphNode {
  id: string;
  nodeType: ProtocolNodeType;
  content: {
    answerType?: 'boolean' | 'choice' | 'number' | 'text';
    choices?: string[];
    [key: string]: unknown;
  };
}

export interface ProtocolGraphEdge {
  fromNodeId: string;
  toNodeId: string;
  condition?: { answer?: unknown; [key: string]: unknown } | null;
}

export interface ProtocolGraphValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Valida a integridade de um grafo de protocolo (árvore de decisão):
 * - exatamente um nó inicial (sem edges de entrada)
 * - grafo acíclico
 * - todo nó "question" tem edges cobrindo todas as respostas possíveis
 * - todo caminho termina em um nó "outcome" (sem dead ends)
 */
export function validateProtocolGraph(
  nodes: ProtocolGraphNode[],
  edges: ProtocolGraphEdge[],
): ProtocolGraphValidationResult {
  const errors: string[] = [];
  const nodeIds = new Set(nodes.map((n) => n.id));

  for (const edge of edges) {
    if (!nodeIds.has(edge.fromNodeId)) {
      errors.push(`A edge referencia um fromNodeId inexistente: "${edge.fromNodeId}"`);
    }
    if (!nodeIds.has(edge.toNodeId)) {
      errors.push(`A edge referencia um toNodeId inexistente: "${edge.toNodeId}"`);
    }
  }
  if (errors.length > 0) {
    return { valid: false, errors };
  }

  const adjacency = new Map<string, string[]>();
  for (const node of nodes) adjacency.set(node.id, []);
  for (const edge of edges) adjacency.get(edge.fromNodeId)?.push(edge.toNodeId);

  // 1. Nó inicial único: nenhum nó deve ter edges de entrada, exceto o(s) raiz(es).
  const hasIncoming = new Set(edges.map((e) => e.toNodeId));
  const startNodes = nodes.filter((n) => !hasIncoming.has(n.id));
  if (startNodes.length !== 1) {
    errors.push(
      `O protocolo deve ter exatamente um nó inicial (sem transições de entrada); encontrados: ${startNodes.length}`,
    );
  }

  // 2. Grafo acíclico (DFS com detecção de ciclo).
  const VISITING = 1;
  const VISITED = 2;
  const state = new Map<string, number>();
  let cycleNodeId: string | null = null;

  const visit = (nodeId: string): void => {
    if (cycleNodeId) return;
    state.set(nodeId, VISITING);
    for (const nextId of adjacency.get(nodeId) ?? []) {
      const nextState = state.get(nextId);
      if (nextState === VISITING) {
        cycleNodeId = nextId;
        return;
      }
      if (nextState !== VISITED) visit(nextId);
      if (cycleNodeId) return;
    }
    state.set(nodeId, VISITED);
  };

  for (const node of nodes) {
    if (!state.has(node.id)) visit(node.id);
    if (cycleNodeId) break;
  }
  if (cycleNodeId) {
    errors.push(`O grafo do protocolo contém um ciclo envolvendo o nó "${cycleNodeId}"`);
  }

  // 3. Todo nó "question" tem edges cobrindo todas as respostas possíveis.
  for (const node of nodes) {
    if (node.nodeType !== 'question') continue;
    const outgoing = edges.filter((e) => e.fromNodeId === node.id);

    if (outgoing.length === 0) {
      errors.push(`O nó de pergunta "${node.id}" não possui nenhuma transição de saída`);
      continue;
    }

    if (node.content.answerType === 'boolean') {
      const answers = new Set(outgoing.map((e) => e.condition?.answer));
      if (!answers.has(true) || !answers.has(false)) {
        errors.push(
          `O nó de pergunta "${node.id}" (boolean) deve ter transições cobrindo answer: true e answer: false`,
        );
      }
    } else if (node.content.answerType === 'choice') {
      const choices = node.content.choices ?? [];
      const covered = new Set(outgoing.map((e) => e.condition?.answer));
      const missing = choices.filter((choice) => !covered.has(choice));
      if (missing.length > 0) {
        errors.push(
          `O nó de pergunta "${node.id}" (choice) não cobre as opções: ${missing.join(', ')}`,
        );
      }
    }
  }

  // 4. Todo caminho termina em um nó "outcome" (sem dead ends não terminais).
  for (const node of nodes) {
    const outgoing = adjacency.get(node.id) ?? [];
    if (outgoing.length === 0 && node.nodeType !== 'outcome') {
      errors.push(
        `O nó "${node.id}" (${node.nodeType}) não tem transições de saída e não é um nó "outcome"`,
      );
    }
  }

  return { valid: errors.length === 0, errors };
}
