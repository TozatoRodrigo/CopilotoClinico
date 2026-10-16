import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { z } from 'zod';
import {
  createKnowledgeCardDraftSchema,
  type CreateKnowledgeCardDraftInput,
} from '../schemas/knowledge-cards.schemas';

/**
 * CC-403 — argumentos de `pnpm cards:draft` (scripts/cards/draft.ts). Um
 * tema pela linha de comando ou a lista priorizada num arquivo JSON, cada
 * item no mesmo formato do POST /admin/knowledge-cards/drafts.
 */
export const DRAFT_CLI_USAGE = `Uso:
  pnpm cards:draft --topic "<tema>" [--syndrome <síndrome>] [--chunks <id,id>] [--institution <id>] [--draft-only]
  pnpm cards:draft --topics-file <temas.json> [--draft-only]

  --topic         tema do cartão (ex.: "Meningite bacteriana: antibiótico empírico no adulto")
  --syndrome      síndrome de PS (PS_SYNDROMES), ex.: febre
  --chunks        ids de guideline_chunks separados por vírgula; sem eles, a consulta de diretrizes escolhe pelo tema
  --institution   cartão institucional (ADR-009); sem ele, global
  --topics-file   JSON: [{ "topic": "...", "syndrome": "...", "chunkIds": ["..."] }]
  --draft-only    deixa os cartões em rascunho, fora da fila de revisão

Exige KNOWLEDGE_CARDS_DRAFT_ENABLED=true. Cada tema é uma chamada ao modelo (custo).`;

export type DraftCliResult =
  | { kind: 'help' }
  | { kind: 'error'; message: string }
  | { kind: 'run'; requests: CreateKnowledgeCardDraftInput[] };

function formatZodError(error: z.ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.join('.') || '(raiz)'}: ${issue.message}`)
    .join('; ');
}

export function parseDraftCli(
  argv: readonly string[],
  readFile: (path: string) => string = (path) => readFileSync(path, 'utf-8'),
): DraftCliResult {
  let values: Record<string, string | boolean | undefined>;
  try {
    ({ values } = parseArgs({
      args: [...argv],
      options: {
        topic: { type: 'string' },
        syndrome: { type: 'string' },
        chunks: { type: 'string' },
        institution: { type: 'string' },
        'topics-file': { type: 'string' },
        'draft-only': { type: 'boolean', default: false },
        help: { type: 'boolean', default: false },
      },
      strict: true,
    }));
  } catch (error) {
    return { kind: 'error', message: error instanceof Error ? error.message : String(error) };
  }

  if (values.help) return { kind: 'help' };
  const submitForReview = values['draft-only'] !== true;
  const topicsFile = values['topics-file'];

  let raw: unknown[];
  if (typeof topicsFile === 'string') {
    if (values.topic !== undefined) {
      return { kind: 'error', message: 'use --topic ou --topics-file, não os dois' };
    }
    try {
      const parsed: unknown = JSON.parse(readFile(topicsFile));
      if (!Array.isArray(parsed))
        return { kind: 'error', message: `${topicsFile}: esperava uma lista` };
      raw = parsed;
    } catch (error) {
      return {
        kind: 'error',
        message: `${topicsFile}: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  } else if (typeof values.topic === 'string') {
    raw = [
      {
        topic: values.topic,
        syndrome: values.syndrome,
        institutionId: values.institution,
        chunkIds:
          typeof values.chunks === 'string'
            ? values.chunks
                .split(',')
                .map((id) => id.trim())
                .filter(Boolean)
            : undefined,
      },
    ];
  } else {
    return { kind: 'error', message: 'informe --topic ou --topics-file' };
  }

  const requests: CreateKnowledgeCardDraftInput[] = [];
  for (const [index, item] of raw.entries()) {
    const parsed = createKnowledgeCardDraftSchema.safeParse({
      ...(typeof item === 'object' && item !== null ? item : {}),
      submitForReview,
    });
    if (!parsed.success) {
      return { kind: 'error', message: `tema ${index + 1}: ${formatZodError(parsed.error)}` };
    }
    requests.push(parsed.data);
  }
  if (requests.length === 0) return { kind: 'error', message: 'nenhum tema' };
  return { kind: 'run', requests };
}
