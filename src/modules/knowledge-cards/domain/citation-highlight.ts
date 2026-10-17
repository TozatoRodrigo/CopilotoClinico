import type { KnowledgeCardContent } from '../../../shared/contracts/knowledge-cards';
import type { KnowledgeCardTextRange } from '../../../shared/contracts/knowledge-card-review';
import { normalizeForCitation } from './citation-check';

/**
 * CC-404 — onde, no texto integral da fonte, está cada trecho citado pelo
 * cartão. A checagem de citação compara textos normalizados (acento, caixa,
 * espaço e tipografia não contam); para destacar o trecho na tela do revisor
 * é preciso voltar do texto normalizado para as posições do texto original.
 */

const COMBINING_MARKS = /[̀-ͯ]/g;
const WHITESPACE = /\s/;

/** O que `normalizeForCitation` faz com um caractere, sem o colapso de espaço. */
function normalizeChar(char: string): string {
  return char
    .normalize('NFKC')
    .normalize('NFD')
    .replace(COMBINING_MARKS, '')
    .toLowerCase()
    .replace(/[‐-―−]/g, '-')
    .replace(/[‘’‚′]/g, "'")
    .replace(/[“”„«»″]/g, '"');
}

interface NormalizedText {
  normalized: string;
  /** Para cada unidade de `normalized`, onde começa e termina o caractere original. */
  starts: number[];
  ends: number[];
}

/**
 * Normaliza caractere a caractere, guardando a origem de cada unidade. `null`
 * quando o resultado não bate com `normalizeForCitation` (composição entre
 * caracteres que a normalização caractere a caractere não reproduz): melhor
 * não destacar do que destacar o lugar errado.
 */
export function normalizeWithOffsets(text: string): NormalizedText | null {
  let normalized = '';
  const starts: number[] = [];
  const ends: number[] = [];
  let pendingSpace: { start: number; end: number } | null = null;

  let index = 0;
  for (const char of text) {
    const start = index;
    const end = index + char.length;
    index = end;
    for (const unit of normalizeChar(char)) {
      if (WHITESPACE.test(unit)) {
        // Espaço no começo some (trim); vários viram um só.
        if (normalized.length > 0 && pendingSpace === null) pendingSpace = { start, end };
        continue;
      }
      if (pendingSpace) {
        normalized += ' ';
        starts.push(pendingSpace.start);
        ends.push(pendingSpace.end);
        pendingSpace = null;
      }
      for (let i = 0; i < unit.length; i += 1) {
        starts.push(start);
        ends.push(end);
      }
      normalized += unit;
    }
  }

  return normalized === normalizeForCitation(text) ? { normalized, starts, ends } : null;
}

/** Junta faixas que se tocam ou se sobrepõem, em ordem. */
function mergeRanges(ranges: KnowledgeCardTextRange[]): KnowledgeCardTextRange[] {
  const sorted = [...ranges].sort((a, b) => a.start - b.start || a.end - b.end);
  const merged: KnowledgeCardTextRange[] = [];
  for (const range of sorted) {
    const last = merged[merged.length - 1];
    if (last && range.start <= last.end) {
      last.end = Math.max(last.end, range.end);
    } else {
      merged.push({ ...range });
    }
  }
  return merged;
}

/**
 * Faixas do texto original (offsets UTF-16, sem sobreposição) onde aparecem
 * os trechos citados. Trecho que não está no texto não gera faixa — a
 * checagem de citação já o teria recusado na escrita.
 */
export function highlightQuotes(
  sourceText: string,
  quotes: readonly string[],
): KnowledgeCardTextRange[] {
  const mapped = normalizeWithOffsets(sourceText);
  if (!mapped) return [];

  const ranges: KnowledgeCardTextRange[] = [];
  for (const quote of new Set(quotes.map(normalizeForCitation))) {
    if (quote.length === 0) continue;
    let from = mapped.normalized.indexOf(quote);
    while (from !== -1) {
      const to = from + quote.length - 1;
      ranges.push({ start: mapped.starts[from]!, end: mapped.ends[to]! });
      from = mapped.normalized.indexOf(quote, from + 1);
    }
  }
  return mergeRanges(ranges);
}

/** Trechos citados pelo conteúdo, por chave de fonte ("S1"): resposta, afirmações e doses. */
export function quotesBySource(
  content: Pick<KnowledgeCardContent, 'answerCitations' | 'claims'>,
): Map<string, string[]> {
  const bySource = new Map<string, string[]>();
  const add = (citation: { sourceKey: string; quote: string }) => {
    const quotes = bySource.get(citation.sourceKey) ?? [];
    quotes.push(citation.quote);
    bySource.set(citation.sourceKey, quotes);
  };
  content.answerCitations.forEach(add);
  for (const claim of content.claims) {
    claim.citations.forEach(add);
    if (claim.dose) add(claim.dose.citation);
  }
  return bySource;
}
