import { z } from 'zod';
import {
  KNOWLEDGE_CARD_CLAIM_KINDS,
  type KnowledgeCardContent,
  type KnowledgeCardContentInput,
  type KnowledgeCardContentIssue,
} from '../../../shared/contracts/knowledge-cards';
import { canonicalJson, sha256Hex, toJsonValue } from '../../audit/audit-hash';

/**
 * CC-402 — formato do conteúdo de uma versão de cartão. O zod guarda os
 * limites e a forma; a checagem de citação (citation-check.ts) guarda o que o
 * zod não vê: o trecho citado existe no texto da fonte, e a dose está nele.
 */

/**
 * Trecho citado mais curto que isto casa com quase qualquer texto ("dose de
 * 2 g") e não prova de onde a afirmação veio.
 */
export const MIN_QUOTE_CHARS = 20;
export const MAX_QUOTE_CHARS = 600;
export const MAX_CLAIMS = 12;
export const MAX_SOURCES = 12;
const MAX_CITATIONS_PER_ITEM = 4;

/** "S1", "S2"… — a chave com que o prompt numera os trechos. */
const SOURCE_KEY = /^S\d{1,2}$/;
const SHA256_HEX = /^[0-9a-f]{64}$/;

const text = (min: number, max: number) => z.string().trim().min(min).max(max);
const optionalText = (max: number) => z.string().trim().min(1).max(max).nullable();

const CitationSchema = z
  .object({
    sourceKey: z.string().regex(SOURCE_KEY, 'chave de fonte no formato "S1"'),
    quote: text(MIN_QUOTE_CHARS, MAX_QUOTE_CHARS),
  })
  .strict();

const DoseSchema = z
  .object({
    drug: text(2, 120),
    amount: text(1, 80),
    route: optionalText(80),
    frequency: optionalText(120),
    maxDose: optionalText(80),
    citation: CitationSchema,
  })
  .strict();

const ClaimSchema = z
  .object({
    kind: z.enum(KNOWLEDGE_CARD_CLAIM_KINDS),
    text: text(5, 500),
    dose: DoseSchema.nullable(),
    citations: z.array(CitationSchema).min(1).max(MAX_CITATIONS_PER_ITEM),
  })
  .strict();

const SourceKeySchema = z.string().regex(SOURCE_KEY, 'chave de fonte no formato "S1"');

/** "infusoes/noradrenalina" — ferramenta e item do motor (CC-405). */
const TOOL_ITEM_ID = /^[a-z0-9-]+\/[a-z0-9-]+(?:\/[a-z0-9-]+)*$/;
const ToolItemIdSchema = z.string().max(160).regex(TOOL_ITEM_ID, 'item do motor inválido');

const GuidelineSourceRefSchema = z
  .object({ key: SourceKeySchema, chunkId: z.string().uuid() })
  .strict();

/** CC-405 — item do motor clínico das Ferramentas como fonte. */
const ToolSourceRefSchema = z
  .object({ key: SourceKeySchema, kind: z.literal('clinical_tool'), toolItemId: ToolItemIdSchema })
  .strict();

const SourceRefSchema = z.union([GuidelineSourceRefSchema, ToolSourceRefSchema]);

const GuidelineSourceSchema = GuidelineSourceRefSchema.extend({
  documentId: z.string().uuid().nullable(),
  title: text(1, 500),
  sourceVersion: text(1, 100),
  section: optionalText(300),
  url: z.string().url().nullable(),
  chunkSha256: z.string().regex(SHA256_HEX),
}).strict();

const ToolSourceSchema = ToolSourceRefSchema.extend({
  title: text(1, 500),
  section: optionalText(300),
  sourceVersion: text(1, 100),
  url: z.string().url().nullable(),
  reference: optionalText(1000),
  origin: text(1, 300),
  contentVersion: text(1, 40),
  contentUpdatedAt: text(1, 40),
  anyVersion: optionalText(20),
  anyCommit: optionalText(40),
  textSha256: z.string().regex(SHA256_HEX),
}).strict();

const SourceSchema = z.union([GuidelineSourceSchema, ToolSourceSchema]);

const contentFields = {
  question: text(10, 300),
  population: optionalText(300),
  answer: text(10, 600),
  answerCitations: z.array(CitationSchema).min(1).max(MAX_CITATIONS_PER_ITEM),
  claims: z.array(ClaimSchema).max(MAX_CLAIMS),
};

/** O que identifica a fonte: o trecho de diretriz ou o item do motor. */
export function sourceIdentity(source: { chunkId: string } | { toolItemId: string }): string {
  return 'chunkId' in source ? `chunk:${source.chunkId}` : `tool:${source.toolItemId}`;
}

function uniqueSources(
  sources: ReadonlyArray<{ key: string } & ({ chunkId: string } | { toolItemId: string })>,
  ctx: z.RefinementCtx,
): void {
  if (new Set(sources.map((source) => source.key)).size !== sources.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['sources'], message: 'chave repetida' });
  }
  if (new Set(sources.map(sourceIdentity)).size !== sources.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['sources'], message: 'trecho repetido' });
  }
}

/** O que chega na escrita (rascunho da IA ou correção do médico): fonte é só chave e chunk. */
export const KnowledgeCardContentInputSchema = z
  .object({ ...contentFields, sources: z.array(SourceRefSchema).min(1).max(MAX_SOURCES) })
  .strict()
  .superRefine((content, ctx) => uniqueSources(content.sources, ctx)) satisfies z.ZodType<
  KnowledgeCardContentInput,
  z.ZodTypeDef,
  unknown
>;

/** O que é gravado: as fontes já resolvidas pelo servidor a partir dos chunks. */
export const KnowledgeCardContentSchema = z
  .object({ ...contentFields, sources: z.array(SourceSchema).min(1).max(MAX_SOURCES) })
  .strict()
  .superRefine((content, ctx) => uniqueSources(content.sources, ctx)) satisfies z.ZodType<
  KnowledgeCardContent,
  z.ZodTypeDef,
  unknown
>;

/**
 * SHA-256 do JSON canônico do conteúdo (chaves ordenadas, como na trilha de
 * auditoria — ADR-015): o que o revisor assina. Não depende da ordem das
 * chaves no jsonb nem de como o Prisma serializa.
 */
export function hashCardContent(content: KnowledgeCardContent): string {
  return sha256Hex(canonicalJson(toJsonValue({ ...content })));
}

/** `['claims', 2, 'dose', 'amount']` → `claims[2].dose.amount`. */
export function formatIssuePath(path: ReadonlyArray<string | number>): string {
  return path.reduce<string>((acc, part) => {
    if (typeof part === 'number') return `${acc}[${part}]`;
    return acc ? `${acc}.${part}` : part;
  }, '');
}

/** `zod` → problemas no mesmo formato da checagem de citação. */
export function zodIssuesToContentIssues(
  issues: readonly z.ZodIssue[],
): KnowledgeCardContentIssue[] {
  return issues.map((issue) => ({ path: formatIssuePath(issue.path), message: issue.message }));
}
