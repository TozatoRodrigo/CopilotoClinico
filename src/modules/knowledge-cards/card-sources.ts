import type { GuidelineChunkStatus, Prisma } from '@prisma/client';
import type { PrismaService } from '../../config/prisma.service';
import type {
  KnowledgeCardContent,
  KnowledgeCardContentIssue,
  KnowledgeCardSource,
} from '../../shared/contracts/knowledge-cards';
import {
  hashCardContent,
  KnowledgeCardContentInputSchema,
  KnowledgeCardContentSchema,
  zodIssuesToContentIssues,
} from './domain/card-content';
import { checkCardCitations } from './domain/citation-check';
import { chunkTextSha256 } from './domain/draft-provenance';

/**
 * Fontes de um cartão: trechos de diretriz já ingeridos (`guideline_chunks`).
 * Valem a base curada (`approved`) e a base oficial do MS
 * (`official_unreviewed`, ADR-010) vigentes — nunca trecho pendente,
 * rejeitado ou substituído como fonte nova.
 */
export const CARD_SOURCE_STATUSES: ReadonlySet<GuidelineChunkStatus> = new Set([
  'approved',
  'official_unreviewed',
]);

const SOURCE_CHUNK_SELECT = {
  id: true,
  source: true,
  sourceVersion: true,
  text: true,
  status: true,
  institutionId: true,
  documentId: true,
  metadata: true,
  validTo: true,
} as const satisfies Prisma.GuidelineChunkSelect;

export type SourceChunk = Prisma.GuidelineChunkGetPayload<{ select: typeof SOURCE_CHUNK_SELECT }>;

export async function loadSourceChunks(
  prisma: PrismaService,
  chunkIds: readonly string[],
): Promise<Map<string, SourceChunk>> {
  if (chunkIds.length === 0) return new Map();
  const chunks = await prisma.guidelineChunk.findMany({
    where: { id: { in: [...new Set(chunkIds)] } },
    select: SOURCE_CHUNK_SELECT,
  });
  return new Map(chunks.map((chunk) => [chunk.id, chunk]));
}

/**
 * Por que o trecho não pode ser fonte de um cartão desta instituição; `null`
 * quando pode. Trecho de outra instituição responde como inexistente, para
 * não confirmar que ele existe (ADR-009). `alreadyCited`: o trecho já era
 * fonte da versão anterior — a correção pode mantê-lo mesmo depois de
 * substituído, mas não pode trazer trecho substituído novo.
 */
export function sourceChunkProblem(
  chunk: SourceChunk | undefined,
  options: { institutionId: string | null; alreadyCited: boolean },
): string | null {
  if (!chunk) return 'trecho de diretriz não encontrado';
  if (chunk.institutionId !== null && chunk.institutionId !== options.institutionId) {
    return 'trecho de diretriz não encontrado';
  }
  if (options.alreadyCited) return null;
  if (!CARD_SOURCE_STATUSES.has(chunk.status) || chunk.validTo !== null) {
    return `trecho de diretriz ${chunk.status}${chunk.validTo ? ' e desativado' : ''} não pode ser fonte nova`;
  }
  return null;
}

function metadataString(metadata: Prisma.JsonValue, key: string): string | null {
  if (typeof metadata !== 'object' || metadata === null || Array.isArray(metadata)) return null;
  const value = (metadata as Prisma.JsonObject)[key];
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

function validUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    return new URL(value).toString();
  } catch {
    return null;
  }
}

/** Metadados da fonte resolvidos do chunk — o cliente nunca os envia. */
export function toCardSource(key: string, chunk: SourceChunk): KnowledgeCardSource {
  return {
    key,
    chunkId: chunk.id,
    documentId: chunk.documentId,
    title: chunk.source,
    sourceVersion: chunk.sourceVersion,
    section: metadataString(chunk.metadata, 'section'),
    // `url` na base oficial (ADR-010); `fonte_url` no seed da base curada.
    url: validUrl(
      metadataString(chunk.metadata, 'url') ?? metadataString(chunk.metadata, 'fonte_url'),
    ),
    chunkSha256: chunkTextSha256(chunk.text),
  };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Ids de chunk do conteúdo enviado, antes de validar o formato (o zod valida em seguida). */
export function requestedChunkIds(content: unknown): string[] {
  if (typeof content !== 'object' || content === null) return [];
  const sources = (content as { sources?: unknown }).sources;
  if (!Array.isArray(sources)) return [];
  return sources.flatMap((source: unknown) => {
    const chunkId = (source as { chunkId?: unknown } | null)?.chunkId;
    return typeof chunkId === 'string' && UUID.test(chunkId) ? [chunkId] : [];
  });
}

export type PreparedContent =
  | { ok: true; content: KnowledgeCardContent; contentSha256: string }
  | { ok: false; issues: KnowledgeCardContentIssue[] };

/**
 * Do conteúdo enviado (rascunho da IA ou correção do médico) ao conteúdo que
 * pode ser gravado: formato (zod), fontes elegíveis e checagem de citação
 * contra o texto integral de cada chunk. Qualquer problema impede a versão.
 */
export function prepareCardContent(
  input: unknown,
  chunks: ReadonlyMap<string, SourceChunk>,
  options: { institutionId: string | null; alreadyCitedChunkIds?: ReadonlySet<string> },
): PreparedContent {
  const parsed = KnowledgeCardContentInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, issues: zodIssuesToContentIssues(parsed.error.issues) };
  }

  const issues: KnowledgeCardContentIssue[] = [];
  const sources: KnowledgeCardSource[] = [];
  const sourceTexts = new Map<string, string>();
  parsed.data.sources.forEach((ref, index) => {
    const chunk = chunks.get(ref.chunkId);
    const problem = sourceChunkProblem(chunk, {
      institutionId: options.institutionId,
      alreadyCited: options.alreadyCitedChunkIds?.has(ref.chunkId) ?? false,
    });
    if (problem || !chunk) {
      issues.push({ path: `sources[${index}].chunkId`, message: problem ?? 'trecho inválido' });
      return;
    }
    sources.push(toCardSource(ref.key, chunk));
    sourceTexts.set(ref.key, chunk.text);
  });
  if (issues.length > 0) return { ok: false, issues };

  const citationIssues = checkCardCitations(parsed.data, sourceTexts);
  if (citationIssues.length > 0) return { ok: false, issues: citationIssues };

  const stored = KnowledgeCardContentSchema.safeParse({ ...parsed.data, sources });
  if (!stored.success) {
    return { ok: false, issues: zodIssuesToContentIssues(stored.error.issues) };
  }
  return { ok: true, content: stored.data, contentSha256: hashCardContent(stored.data) };
}
