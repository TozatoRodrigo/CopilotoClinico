import { createHash } from 'node:crypto';
import type { KnowledgeCardContent } from '../../../shared/contracts/knowledge-cards';

/**
 * CC-406 — o texto de um cartão que vira vetor no índice semântico.
 *
 * Entra o que diz DE QUE SITUAÇÃO o cartão trata e o que ele manda fazer:
 * tema, pergunta, população, resposta e o texto das afirmações (com o nome
 * dos fármacos). Ficam de fora as fontes e os trechos citados: o título de um
 * PCDT ("Meningite bacteriana") puxaria o cartão para qualquer busca do mesmo
 * documento, mesmo de outra situação, e os trechos repetem a resposta.
 *
 * Mudar este formato muda o `textSha256` de todo cartão: o próximo
 * `pnpm cards:reindex` reembute tudo, e o acerto top-3 do gabarito de busca
 * (`pnpm eval:card-retrieval`) precisa ser medido de novo.
 */
export function cardEmbeddingText(topic: string, content: KnowledgeCardContent): string {
  const lines = [
    `Tema: ${topic}`,
    `Pergunta: ${content.question}`,
    ...(content.population ? [`População: ${content.population}`] : []),
    `Resposta: ${content.answer}`,
    ...content.claims.map((claim) => `- ${claim.text}`),
  ];
  return lines.map((line) => line.replace(/\s+/g, ' ').trim()).join('\n');
}

/** SHA-256 do texto embutido: igual ao gravado no índice, o vetor ainda vale. */
export function embeddingTextSha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}
