import type { WebEvidenceItem } from '../../../shared/contracts/clinical';
import type { ResearchCitation } from '../../ai-gateway/providers/provider.interface';
import { isAllowedHost } from './web-research.settings';

/**
 * F1 — evidência da pesquisa web montada só das CITAÇÕES da resposta: o
 * trecho que a página de fato diz, nunca o resumo escrito pelo modelo. Uma
 * página vira um item citável (`web:1`, `web:2`…) com os trechos dela.
 */

export const WEB_EVIDENCE_ID_PREFIX = 'web:';
/** Teto de itens no prompt da decisão e de trechos por página. */
const MAX_WEB_EVIDENCE_ITEMS = 12;
const MAX_PASSAGES_PER_PAGE = 6;
const PASSAGE_SEPARATOR = '\n…\n';

export function isWebEvidenceId(citationChunkId: string): boolean {
  return citationChunkId.startsWith(WEB_EVIDENCE_ID_PREFIX);
}

interface PageDraft {
  url: string;
  domain: string;
  title: string | null;
  passages: string[];
}

function pageUrl(raw: string): URL | null {
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    url.hash = '';
    return url;
  } catch {
    return null;
  }
}

export interface WebEvidence {
  items: WebEvidenceItem[];
  /** URLs citadas fora da lista de domínios (a ferramenta já filtra; isto é defesa extra). */
  outsideAllowlist: string[];
}

export function buildWebEvidence(
  citations: readonly ResearchCitation[],
  allowedDomains: readonly string[],
): WebEvidence {
  const pages = new Map<string, PageDraft>();
  const outsideAllowlist: string[] = [];

  for (const citation of citations) {
    const url = pageUrl(citation.url);
    if (!url || !isAllowedHost(url.hostname, allowedDomains)) {
      outsideAllowlist.push(citation.url);
      continue;
    }
    const key = url.toString();
    const page = pages.get(key) ?? {
      url: key,
      domain: url.hostname.toLowerCase().replace(/^www\./, ''),
      title: null,
      passages: [],
    };
    page.title ??= citation.title?.trim() || null;
    const passage = citation.citedText.trim();
    if (
      passage &&
      !page.passages.includes(passage) &&
      page.passages.length < MAX_PASSAGES_PER_PAGE
    ) {
      page.passages.push(passage);
    }
    pages.set(key, page);
  }

  const items = [...pages.values()]
    .filter((page) => page.passages.length > 0)
    .slice(0, MAX_WEB_EVIDENCE_ITEMS)
    .map((page, index) => ({
      id: `${WEB_EVIDENCE_ID_PREFIX}${index + 1}`,
      url: page.url,
      title: page.title,
      domain: page.domain,
      citedText: page.passages.join(PASSAGE_SEPARATOR),
    }));

  return { items, outsideAllowlist };
}
