import type {
  AnyCardToolId,
  KnowledgeCardContent,
  KnowledgeCardContentIssue,
  KnowledgeCardReviewFlag,
} from '../../../shared/contracts/knowledge-cards';
import { prepareCardContent, type ToolSourceResolver } from '../card-sources';
import { anyCardDrafts } from './any-card-catalog';
import {
  anyCardContentInput,
  anySourceKey,
  parseAnyProvenance,
  type AnyCardDraft,
} from './any-card-draft';
import { reviewFlagsFor, type ReviewFindingsIndex } from './review-findings';

/**
 * CC-405 — a parte da importação que não toca o banco: do motor ao conteúdo
 * que pode ser gravado. Cada rascunho passa pela mesma preparação da correção
 * do médico e do rascunho da IA (formato, fonte resolvida pelo servidor,
 * checagem de citação). O `--dry-run` para aqui.
 */

export interface PreparedAnyCard {
  draft: AnyCardDraft;
  /** "any:infusoes/noradrenalina" — a chave que torna a importação idempotente. */
  sourceKey: string;
  content: KnowledgeCardContent;
  contentSha256: string;
  reviewFlags: KnowledgeCardReviewFlag[];
}

export interface AnyCardRejection {
  itemId: string;
  issues: KnowledgeCardContentIssue[];
}

export interface PreparedAnyImport {
  cards: PreparedAnyCard[];
  rejections: AnyCardRejection[];
  /** Commits do ANY de onde o conteúdo veio ("95c8fba"). */
  anyCommits: string[];
}

export function prepareAnyCards(
  toolId: AnyCardToolId | null,
  findings: ReviewFindingsIndex,
  resolveTool?: ToolSourceResolver,
): PreparedAnyImport {
  const cards: PreparedAnyCard[] = [];
  const rejections: AnyCardRejection[] = [];
  const commits = new Set<string>();
  for (const draft of anyCardDrafts(toolId)) {
    const commit = parseAnyProvenance(draft.provenance.source).anyCommit;
    if (commit) commits.add(commit);
    // Fonte global (sem instituição): o conteúdo do ANY vale para todo o serviço.
    const prepared = prepareCardContent(anyCardContentInput(draft), new Map(), {
      institutionId: null,
      resolveTool,
    });
    if (!prepared.ok) {
      rejections.push({ itemId: draft.itemId, issues: prepared.issues });
      continue;
    }
    cards.push({
      draft,
      sourceKey: anySourceKey(draft.itemId),
      content: prepared.content,
      contentSha256: prepared.contentSha256,
      reviewFlags: reviewFlagsFor(draft, findings),
    });
  }
  return { cards, rejections, anyCommits: [...commits].sort() };
}
