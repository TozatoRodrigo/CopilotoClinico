import {
  ALWAYS_PROTECTED,
  CLINICAL_LEAD_WORDS,
  FINDING_WORDS,
  FIRST_NAME_LIKE_TERMS,
  PERSON_CONTEXT_WORDS,
  SURNAME_LIKE_TERMS,
} from './protected-clinical-terms.list';

export {
  PROTECTED_CLINICAL_TERMS_REVIEW,
  PROTECTED_CLINICAL_TERMS_VERSION,
} from './protected-clinical-terms.list';

/** Trecho de texto, `end` exclusivo (como `String.slice`). */
export interface TextSpan {
  start: number;
  end: number;
}

type TermKind = 'always' | 'surname' | 'first_name';

interface TermEntry {
  tokens: string[];
  kind: TermKind;
}

/** Sem acento e sem caixa: "Lasègue" e "lasegue" são o mesmo termo. */
function fold(word: string): string {
  return word
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase();
}

function tokensOf(term: string): string[] {
  return (term.match(/[\p{L}\p{N}]+/gu) ?? []).map(fold);
}

/** Termos por primeira palavra, do mais longo ao mais curto ("Ramsay Hunt" antes de "Ramsay"). */
const TERMS_BY_FIRST_TOKEN: ReadonlyMap<string, readonly TermEntry[]> = (() => {
  const entries: TermEntry[] = [
    ...Object.values(ALWAYS_PROTECTED)
      .flat()
      .map((term) => ({ tokens: tokensOf(term), kind: 'always' as const })),
    ...SURNAME_LIKE_TERMS.map((term) => ({ tokens: tokensOf(term), kind: 'surname' as const })),
    ...FIRST_NAME_LIKE_TERMS.map((term) => ({
      tokens: tokensOf(term),
      kind: 'first_name' as const,
    })),
  ];
  const index = new Map<string, TermEntry[]>();
  for (const entry of entries) {
    const first = entry.tokens[0];
    if (!first) continue;
    index.set(first, [...(index.get(first) ?? []), entry]);
  }
  for (const list of index.values()) list.sort((a, b) => b.tokens.length - a.tokens.length);
  return index;
})();

/** Primeira palavra de termo que nunca é gente: ao lado do epônimo, não conta como nome. */
const ALWAYS_FIRST_TOKENS: ReadonlySet<string> = new Set(
  [...TERMS_BY_FIRST_TOKEN].flatMap(([token, entries]) =>
    entries.some(({ kind }) => kind === 'always') ? [token] : [],
  ),
);

const CLINICAL_LEADS: ReadonlySet<string> = new Set(CLINICAL_LEAD_WORDS.map(fold));
const PERSON_CONTEXT: ReadonlySet<string> = new Set(PERSON_CONTEXT_WORDS.map(fold));
const FINDING_AFTER = new RegExp(
  String.raw`^\s*(?:${FINDING_WORDS.map(fold).join('|')}|\+)(?![\p{L}\p{N}])`,
  'u',
);
const NAME_PARTICLES: ReadonlySet<string> = new Set(['da', 'do', 'das', 'dos']);
const LEAD_PARTICLES: ReadonlySet<string> = new Set(['de', 'do', 'da', 'dos', 'das', 'para']);
/** Entre as palavras de um termo composto só cabe espaço ou hífen ("Guillain-Barré", "Child Pugh"). */
const TERM_GAP = /^[\s\-‐–]+$/u;

interface Token {
  word: string;
  folded: string;
  start: number;
  end: number;
}

function tokenize(text: string): Token[] {
  return [...text.matchAll(/[\p{L}\p{N}]+/gu)].map((match) => ({
    word: match[0],
    folded: fold(match[0]),
    start: match.index,
    end: match.index + match[0].length,
  }));
}

function isNameShaped(word: string): boolean {
  return /^\p{Lu}\p{Ll}/u.test(word);
}

function onlySpaceBetween(text: string, left: Token, right: Token): boolean {
  return /^\s+$/.test(text.slice(left.end, right.start));
}

/** Termo clínico + de/do/da/para logo antes: "doença de Chagas", "fundo de saco de Douglas". */
function hasClinicalLead(text: string, tokens: Token[], first: number): boolean {
  const particle = tokens[first - 1];
  const lead = tokens[first - 2];
  const term = tokens[first];
  if (!particle || !lead || !term) return false;
  return (
    LEAD_PARTICLES.has(particle.folded) &&
    CLINICAL_LEADS.has(lead.folded) &&
    onlySpaceBetween(text, lead, particle) &&
    onlySpaceBetween(text, particle, term)
  );
}

/** Algum nome (não clínico) colado ao termo, com ou sem "da/das/do/dos" no meio. */
function nameAt(text: string, tokens: Token[], index: number, step: -1 | 1): boolean {
  const term = tokens[index];
  let neighbor = tokens[index + step];
  if (!term || !neighbor) return false;
  const [left, right] = step === -1 ? [neighbor, term] : [term, neighbor];
  if (!onlySpaceBetween(text, left, right)) return false;
  if (NAME_PARTICLES.has(neighbor.folded)) {
    const beyond = tokens[index + 2 * step];
    if (!beyond) return false;
    const [l, r] = step === -1 ? [beyond, neighbor] : [neighbor, beyond];
    if (!onlySpaceBetween(text, l, r)) return false;
    neighbor = beyond;
  }
  // "Wilson Hoffmann" é gente: prenome que também é epônimo ainda conta como nome.
  return (
    isNameShaped(neighbor.word) &&
    !CLINICAL_LEADS.has(neighbor.folded) &&
    !ALWAYS_FIRST_TOKENS.has(neighbor.folded)
  );
}

/** "Sr. Weber", "paciente Koch", "Francisco das Chagas", "Weber da Silva". */
function hasPersonContext(text: string, tokens: Token[], first: number, last: number): boolean {
  const previous = tokens[first - 1];
  const term = tokens[first];
  if (previous && term && PERSON_CONTEXT.has(previous.folded)) {
    if (/^\.?\s+$/.test(text.slice(previous.end, term.start))) return true;
  }
  return nameAt(text, tokens, first, -1) || nameAt(text, tokens, last, 1);
}

function isProtectedHere(
  kind: TermKind,
  text: string,
  tokens: Token[],
  first: number,
  last: number,
): boolean {
  if (kind === 'always') return true;
  const end = tokens[last]?.end ?? 0;
  const clinical =
    hasClinicalLead(text, tokens, first) || FINDING_AFTER.test(fold(text.slice(end, end + 24)));
  if (clinical) return true;
  if (kind === 'first_name') return false;
  return !hasPersonContext(text, tokens, first, last);
}

/**
 * Onde há termo clínico protegido no texto (CC-202). Termo da lista
 * ALWAYS_PROTECTED vale sempre; os que também são nome de gente dependem do
 * contexto (ver protected-clinical-terms.list.ts).
 */
export function findProtectedClinicalTerms(text: string): TextSpan[] {
  const tokens = tokenize(text);
  const spans: TextSpan[] = [];
  let index = 0;
  while (index < tokens.length) {
    const candidates = TERMS_BY_FIRST_TOKEN.get(tokens[index]!.folded) ?? [];
    const matched = candidates.find(({ tokens: termTokens, kind }) => {
      const last = index + termTokens.length - 1;
      for (let offset = 1; offset < termTokens.length; offset += 1) {
        const previous = tokens[index + offset - 1];
        const current = tokens[index + offset];
        if (!previous || !current || current.folded !== termTokens[offset]) return false;
        if (!TERM_GAP.test(text.slice(previous.end, current.start))) return false;
      }
      return isProtectedHere(kind, text, tokens, index, last);
    });
    if (matched) {
      const last = index + matched.tokens.length - 1;
      spans.push({ start: tokens[index]!.start, end: tokens[last]!.end });
      index = last + 1;
    } else {
      index += 1;
    }
  }
  return spans;
}

/** Sobra de trecho que não identifica ninguém: espaço, pontuação, "e", "de", "da"... */
function isEmptyRemainder(piece: string): boolean {
  const words = piece.match(/[\p{L}\p{N}]+/gu) ?? [];
  return words.every((word) => ['e', 'de', 'da', 'do', 'das', 'dos'].includes(fold(word)));
}

function trimSpan(text: string, span: TextSpan): TextSpan {
  let { start, end } = span;
  while (start < end && /[^\p{L}\p{N}]/u.test(text[start]!)) start += 1;
  while (end > start && /[^\p{L}\p{N}]/u.test(text[end - 1]!)) end -= 1;
  return { start, end };
}

/**
 * Tira dos trechos marcados como nome (pela regex ou pelo modelo) a parte que
 * é termo clínico protegido (CC-202). O trecho todo sobre "Kernig e
 * Brudzinski" some; "Maria Glasgow" vira só "Maria". Os demais campos de cada
 * trecho (rótulo, score do modelo) são mantidos.
 */
export function protectClinicalTerms<T extends TextSpan>(text: string, spans: readonly T[]): T[] {
  if (spans.length === 0) return [];
  const protectedSpans = findProtectedClinicalTerms(text);
  return spans.flatMap((span) => {
    let pieces: TextSpan[] = [{ start: span.start, end: span.end }];
    for (const guard of protectedSpans) {
      pieces = pieces.flatMap((piece) =>
        guard.end <= piece.start || guard.start >= piece.end
          ? [piece]
          : [
              { start: piece.start, end: guard.start },
              { start: guard.end, end: piece.end },
            ].filter(({ start, end }) => end > start),
      );
    }
    return pieces
      .map((piece) => trimSpan(text, piece))
      .filter(({ start, end }) => end > start && !isEmptyRemainder(text.slice(start, end)))
      .map(({ start, end }) => ({ ...span, start, end }));
  });
}

/** O trecho inteiro é termo clínico protegido? (nada sobra para mascarar) */
export function isProtectedClinicalTerm(text: string, span: TextSpan): boolean {
  return protectClinicalTerms(text, [span]).length === 0;
}
