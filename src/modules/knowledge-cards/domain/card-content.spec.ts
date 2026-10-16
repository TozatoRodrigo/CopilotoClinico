import { describe, expect, it } from 'vitest';
import { sourceChunks, validCardInput } from '../../../../tests/fixtures/knowledge-cards';
import type { KnowledgeCardContent } from '../../../shared/contracts/knowledge-cards';
import { prepareCardContent } from '../card-sources';
import {
  formatIssuePath,
  hashCardContent,
  KnowledgeCardContentInputSchema,
  KnowledgeCardContentSchema,
} from './card-content';

function preparedContent(): KnowledgeCardContent {
  const prepared = prepareCardContent(validCardInput(), sourceChunks(), { institutionId: null });
  if (!prepared.ok) throw new Error('fixture inválida');
  return prepared.content;
}

/** Mesmo objeto com as chaves em ordem inversa, em todos os níveis — como o jsonb pode devolver. */
function reverseKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(reverseKeys);
  if (typeof value !== 'object' || value === null) return value;
  return Object.fromEntries(
    Object.entries(value)
      .reverse()
      .map(([key, entry]) => [key, reverseKeys(entry)]),
  );
}

describe('hashCardContent', () => {
  it('não depende da ordem das chaves (o jsonb não guarda a ordem)', () => {
    const content = preparedContent();
    const reordered = KnowledgeCardContentSchema.parse(reverseKeys(content));

    expect(hashCardContent(reordered)).toBe(hashCardContent(content));
  });

  it('muda com qualquer mudança de conteúdo, inclusive a dose', () => {
    const content = preparedContent();
    const changed = structuredClone(content);
    changed.claims[0]!.dose!.amount = '1 g';

    expect(hashCardContent(changed)).not.toBe(hashCardContent(content));
  });
});

describe('KnowledgeCardContentInputSchema', () => {
  it('aceita o cartão do fixture e apara espaços', () => {
    const input = validCardInput();
    input.question = `  ${input.question}  `;

    expect(KnowledgeCardContentInputSchema.parse(input).question).toBe(input.question.trim());
  });

  it('recusa campo desconhecido, chave de fonte fora do formato e afirmação sem citação', () => {
    const input = validCardInput();
    const result = KnowledgeCardContentInputSchema.safeParse({
      ...input,
      extra: true,
      sources: [{ key: 'fonte-1', chunkId: input.sources[0]!.chunkId }],
      claims: [{ ...input.claims[1]!, citations: [] }],
    });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues.map((issue) => formatIssuePath(issue.path))).toEqual(
      expect.arrayContaining(['', 'sources[0].key', 'claims[0].citations']),
    );
  });
});

describe('formatIssuePath', () => {
  it('escreve índices entre colchetes', () => {
    expect(formatIssuePath(['claims', 2, 'dose', 'amount'])).toBe('claims[2].dose.amount');
    expect(formatIssuePath([])).toBe('');
  });
});
