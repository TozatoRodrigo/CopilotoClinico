import type { PrismaService } from '../../../config/prisma.service';
import type { KnowledgeCardContent } from '../../../shared/contracts/knowledge-cards';
import type { KnowledgeCardSourceText } from '../../../shared/contracts/knowledge-card-review';
import { loadSourceChunks } from '../card-sources';
import { highlightQuotes, quotesBySource } from '../domain/citation-highlight';
import { chunkTextSha256 } from '../domain/draft-provenance';

/**
 * CC-404 — texto integral de cada fonte da versão, com os trechos que ela
 * cita marcados, e o aviso de quando o texto mudou depois da citação.
 */
export async function loadReviewSourceTexts(
  prisma: PrismaService,
  content: KnowledgeCardContent,
): Promise<KnowledgeCardSourceText[]> {
  const chunks = await loadSourceChunks(
    prisma,
    content.sources.map((source) => source.chunkId),
  );
  const quotes = quotesBySource(content);
  return content.sources.map((source) => {
    const text = chunks.get(source.chunkId)?.text ?? null;
    return {
      key: source.key,
      chunkId: source.chunkId,
      text,
      matchesCitedText: text !== null && chunkTextSha256(text) === source.chunkSha256,
      highlights: text === null ? [] : highlightQuotes(text, quotes.get(source.key) ?? []),
    };
  });
}
