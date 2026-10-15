import { z } from 'zod';
import type { KnowledgeCardDraft, Prisma } from '@prisma/client';
import { PS_SYNDROMES, type PsSyndrome } from '../../shared/contracts/clinical';
import type {
  KnowledgeCardDetail,
  KnowledgeCardDraftRejection,
  KnowledgeCardDraftRun,
  KnowledgeCardPhysicianRef,
  KnowledgeCardReviewFlag,
  KnowledgeCardSummary,
  KnowledgeCardVersionView,
} from '../../shared/contracts/knowledge-cards';
import { KnowledgeCardContentSchema } from './domain/card-content';
import { displayStatus } from './domain/card-lifecycle';

/** Prisma → contrato. Seleções e conversões num lugar só, para lista e detalhe não divergirem. */

const PHYSICIAN_REF_SELECT = {
  id: true,
  name: true,
  crmUf: true,
  crmNumber: true,
  crmVerified: true,
} as const satisfies Prisma.PhysicianSelect;

const PUBLISHED_VERSION_SELECT = {
  select: {
    version: true,
    reviewedAt: true,
    validUntil: true,
    reviewer: { select: PHYSICIAN_REF_SELECT },
  },
} as const;

export const CARD_SUMMARY_SELECT = {
  id: true,
  institutionId: true,
  topic: true,
  syndrome: true,
  status: true,
  currentVersion: true,
  sourceKey: true,
  createdAt: true,
  updatedAt: true,
  assignedReviewer: { select: PHYSICIAN_REF_SELECT },
  publishedVersion: PUBLISHED_VERSION_SELECT,
  versions: { orderBy: { version: 'desc' }, take: 1, select: { content: true } },
} as const satisfies Prisma.KnowledgeCardSelect;

const VERSION_SELECT = {
  id: true,
  version: true,
  content: true,
  contentSha256: true,
  authorKind: true,
  reviewDecision: true,
  reviewedAt: true,
  reviewComment: true,
  reviewDurationMs: true,
  validUntil: true,
  createdAt: true,
  authorPhysician: { select: PHYSICIAN_REF_SELECT },
  reviewer: { select: PHYSICIAN_REF_SELECT },
  draft: {
    select: {
      id: true,
      requestedModel: true,
      servedModel: true,
      promptSha256: true,
      sourceContentSha256: true,
      createdAt: true,
    },
  },
  reviewFlags: true,
  import: { select: { id: true, toolId: true, createdAt: true } },
} as const satisfies Prisma.KnowledgeCardVersionSelect;

export const CARD_DETAIL_SELECT = {
  id: true,
  institutionId: true,
  topic: true,
  syndrome: true,
  status: true,
  currentVersion: true,
  sourceKey: true,
  archivedAt: true,
  createdAt: true,
  updatedAt: true,
  assignedReviewer: { select: PHYSICIAN_REF_SELECT },
  publishedVersion: PUBLISHED_VERSION_SELECT,
  versions: { orderBy: { version: 'desc' }, select: VERSION_SELECT },
} as const satisfies Prisma.KnowledgeCardSelect;

type SummaryRow = Prisma.KnowledgeCardGetPayload<{ select: typeof CARD_SUMMARY_SELECT }>;
type DetailRow = Prisma.KnowledgeCardGetPayload<{ select: typeof CARD_DETAIL_SELECT }>;
type VersionRow = Prisma.KnowledgeCardVersionGetPayload<{ select: typeof VERSION_SELECT }>;
type PhysicianRow = Prisma.PhysicianGetPayload<{ select: typeof PHYSICIAN_REF_SELECT }>;
type PublishedRow = SummaryRow['publishedVersion'];

const SyndromeSchema = z.enum(PS_SYNDROMES);

function toSyndrome(value: string | null): PsSyndrome | null {
  const parsed = SyndromeSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function toPhysicianRef(row: PhysicianRow): KnowledgeCardPhysicianRef {
  return { ...row };
}

/**
 * O conteúdo gravado foi validado na escrita e o trigger impede a troca; se
 * mesmo assim não validar, é falha de integridade — erro alto, não cartão
 * pela metade na tela do revisor.
 */
function parseStoredContent(content: Prisma.JsonValue, versionId: string) {
  const parsed = KnowledgeCardContentSchema.safeParse(content);
  if (!parsed.success) {
    throw new Error(`KNOWLEDGE_CARD_CONTENT_INVALID version=${versionId}`);
  }
  return parsed.data;
}

const ReviewFlagsSchema = z
  .array(z.object({ ref: z.string(), title: z.string(), detail: z.string() }))
  .catch([]) satisfies z.ZodType<KnowledgeCardReviewFlag[], z.ZodTypeDef, unknown>;

function questionOf(content: Prisma.JsonValue | undefined): string {
  const parsed = z.object({ question: z.string() }).safeParse(content);
  return parsed.success ? parsed.data.question : '';
}

function toPublication(row: PublishedRow): KnowledgeCardSummary['published'] {
  // CHECK da migration: versão aprovada sempre tem revisor, data e validade.
  if (!row?.reviewer || !row.reviewedAt || !row.validUntil) return null;
  return {
    version: row.version,
    reviewer: toPhysicianRef(row.reviewer),
    reviewedAt: row.reviewedAt.toISOString(),
    validUntil: row.validUntil.toISOString(),
  };
}

function summaryFields(
  row: Omit<SummaryRow, 'versions'>,
  question: string,
  now: Date,
): KnowledgeCardSummary {
  return {
    id: row.id,
    institutionId: row.institutionId,
    topic: row.topic,
    syndrome: toSyndrome(row.syndrome),
    status: row.status,
    displayStatus: displayStatus(
      { status: row.status, publishedValidUntil: row.publishedVersion?.validUntil ?? null },
      now,
    ),
    currentVersion: row.currentVersion,
    question,
    sourceKey: row.sourceKey,
    assignedReviewer: row.assignedReviewer ? toPhysicianRef(row.assignedReviewer) : null,
    published: toPublication(row.publishedVersion),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toCardSummary(row: SummaryRow, now: Date): KnowledgeCardSummary {
  return summaryFields(row, questionOf(row.versions[0]?.content), now);
}

function toVersionView(row: VersionRow): KnowledgeCardVersionView {
  const review =
    row.reviewDecision && row.reviewer && row.reviewedAt
      ? {
          decision: row.reviewDecision,
          reviewer: toPhysicianRef(row.reviewer),
          reviewedAt: row.reviewedAt.toISOString(),
          comment: row.reviewComment,
          durationMs: row.reviewDurationMs,
          validUntil: row.validUntil?.toISOString() ?? null,
        }
      : null;
  return {
    id: row.id,
    version: row.version,
    content: parseStoredContent(row.content, row.id),
    contentSha256: row.contentSha256,
    authorKind: row.authorKind,
    authorPhysician: row.authorPhysician ? toPhysicianRef(row.authorPhysician) : null,
    draft: row.draft
      ? {
          draftId: row.draft.id,
          requestedModel: row.draft.requestedModel,
          servedModel: row.draft.servedModel,
          promptSha256: row.draft.promptSha256,
          sourceContentSha256: row.draft.sourceContentSha256,
          createdAt: row.draft.createdAt.toISOString(),
        }
      : null,
    importOrigin: row.import
      ? {
          importId: row.import.id,
          toolId: row.import.toolId,
          createdAt: row.import.createdAt.toISOString(),
        }
      : null,
    reviewFlags: ReviewFlagsSchema.parse(row.reviewFlags),
    review,
    createdAt: row.createdAt.toISOString(),
  };
}

export function toCardDetail(row: DetailRow, now: Date): KnowledgeCardDetail {
  const versions = row.versions.map(toVersionView);
  return {
    ...summaryFields(row, versions[0]?.content.question ?? '', now),
    archivedAt: row.archivedAt?.toISOString() ?? null,
    versions,
  };
}

const RejectionsSchema = z
  .array(
    z.object({
      index: z.number(),
      question: z.string(),
      issues: z.array(z.object({ path: z.string(), message: z.string() })),
    }),
  )
  .catch([]);

export function toDraftRun(row: KnowledgeCardDraft): KnowledgeCardDraftRun {
  const rejections: KnowledgeCardDraftRejection[] = RejectionsSchema.parse(row.rejections);
  return {
    id: row.id,
    topic: row.topic,
    syndrome: toSyndrome(row.syndrome),
    institutionId: row.institutionId,
    status: row.status,
    requestedModel: row.requestedModel,
    servedModel: row.servedModel,
    promptSha256: row.promptSha256,
    sourceContentSha256: row.sourceContentSha256,
    sourceChunkIds: row.sourceChunkIds,
    cardsAccepted: row.cardsAccepted,
    cardsRejected: row.cardsRejected,
    rejections,
    failureReason: row.failureReason,
    costUsd: row.costUsd,
    latencyMs: row.latencyMs,
    createdAt: row.createdAt.toISOString(),
  };
}
