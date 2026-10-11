import type { ForbiddenAction } from '../case.schema';

/**
 * F0-A — Checagem determinística de conduta proibida num texto de recomendação.
 *
 * A regra cabe em quatro linhas (também em docs/evals/gabarito-clinico.md):
 *
 * 1. Texto sem acento e sem caixa. Padrões e exceções casam PALAVRAS INTEIRAS:
 *    "tep" não casa dentro de "alteplase", "se" não casa dentro de "trombólise".
 *    Radical se escreve com `\w*` ("trombol\w*").
 * 2. O texto se divide em orações: `; . ! ?`, quebra de linha, travessão e
 *    conjunções adversativas (mas, porém, contudo...). Dois-pontos fecha a
 *    oração só para trás: o rótulo em "Elegível: alteplase agora" não alcança o
 *    termo, mas em "Trombólise: contraindicada" o qualificador alcança. Rótulo
 *    condicional ("Se gestante: hidralazina IV") alcança, mas só pela exceção
 *    do caso. Parêntese explica a palavra anterior: em "não usar antitrombótico
 *    (AAS, heparina)" a negação vale para o que está dentro.
 * 3. Um termo proibido é ignorado quando, NA MESMA ORAÇÃO:
 *    a. uma negação o governa: até 3 palavras de ligação entre ela e o termo
 *       ("não fazer trombólise", "evitar o uso de AINE", "sem indicação de AAS",
 *       "antes da trombólise"). Palavra de adiamento no meio desfaz a negação
 *       ("não aguardar a trombólise", "sem demora", "sem contraindicação para");
 *    b. um qualificador negativo vem logo depois, até 5 palavras
 *       ("trombólise contraindicada", "AAS não está indicado"), ou o termo é
 *       rótulo de uma ordem negativa ("Loperamida: não usar");
 *    c. um `exceptWhen` do caso começa a até 6 palavras do termo
 *       ("alteplase somente após TC sem sangramento").
 * 4. Termos proibidos do caso (de qualquer item) e "e/ou" são transparentes:
 *    "não usar AAS, heparina ou trombolítico" nega os três.
 *
 * Antes, `exceptWhen` valia para o texto inteiro: qualquer "não" em qualquer
 * ponto anulava a detecção ("Alteplase agora; não aguardar exames" passava).
 */

/** Sem acento e sem caixa — o médico escreve "trombólise", o modelo "TROMBOLISE". */
export function normalizeForMatching(text: string): string {
  return stripAccents(text).toLowerCase();
}

function stripAccents(text: string): string {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/** A fonte não passa por `toLowerCase`: `\S`, `\W` e `\B` mudariam de sentido. */
function compileWholeWord(source: string): RegExp {
  return new RegExp(`\\b(?:${stripAccents(source)})\\b`, 'gi');
}

const SENTENCE_BREAK =
  /[;!?\n]|\.(?=\s|$)|\s[-–—]\s|\b(?:mas|porem|contudo|todavia|entretanto|no entanto)\b/g;

const LABEL_COLON = ':';
const CONDITIONAL_LABEL = /^(?:se|caso|quando|havendo|somente|apenas|so|apos|depois)$/;

const MAX_LINK_WORDS = 3;
const POST_QUALIFIER_WINDOW = 5;
const EXCEPTION_WINDOW = 6;

const NEGATOR =
  /^(?:nao|nunca|jamais|nem|sem|evit(?:ar|e|em|ando)|suspend(?:er|a|am)|suspensao|interromp(?:er|a)|descontinu(?:ar|e)|contra-?indica(?:r)?|contra-?indicad[oa]s?|proscrit[oa]s?|antes)$/;

/** Entre a negação e o termo, desfaz a negação: "não aguardar", "sem demora", "sem contraindicação". */
const DEFERRAL =
  /^(?:aguard|esper|atras|retard|adi(?:ar|e|em)$|posterg|protel|demor|perd|esquec|deix|contra-?indicac|impediment)/;

/** Palavras que podem ficar entre a negação e o termo sem quebrar o vínculo. */
const LINK_WORDS = new Set([
  ...['o', 'a', 'os', 'as', 'um', 'uma', 'ao', 'aos', 'de', 'do', 'da', 'dos', 'das'],
  ...['em', 'no', 'na', 'nos', 'nas', 'para', 'por', 'com', 'se', 'mais', 'novo', 'nova'],
  ...['qualquer', 'nenhum', 'nenhuma', 'uso', 'indicacao', 'necessidade', 'dose', 'doses'],
  ...['ha', 'e', 'esta', 'estao', 'sao', 'ser', 'deve', 'devem', 'deve-se', 'recomenda-se'],
  ...['indicado', 'indicada', 'indicados', 'indicadas', 'recomendado', 'recomendada'],
  ...['necessario', 'necessaria', 'seguro', 'segura', 'prudente', 'possivel'],
  ...['fazer', 'faca', 'realizar', 'iniciar', 'inicie', 'administrar', 'administre'],
  ...['usar', 'use', 'utilizar', 'dar', 'prescrever', 'prescreva', 'receitar', 'indicar'],
  ...['manter', 'mantenha', 'repetir', 'repita', 'reiniciar', 'reintroduzir', 'retomar'],
  ...['aplicar', 'aplique', 'infundir', 'oferecer', 'considerar', 'tentar', 'recomendar'],
  ...['associar', 'introduzir', 'liberar', 'tomar', 'empregar', 'optar', 'partir'],
]);

const LIST_CONNECTORS = new Set(['e', 'ou', 'e/ou']);

const POST_QUALIFIER =
  /\b(?:contra-?indicad|proscrit|desaconselhad|evitad|vetad|proibid)\w*|\bsuspens[oa]s?\b|\bnao\s+(?:(?:e|esta|estao|sao|fica|ficam|foi|deve|devem)\s+)?(?:ser\s+)?(?:indicad|recomendad|necessari|segur|permitid|realizad|feit|usad|utilizad|administrad)\w*/;

/** Rótulo seguido de ordem negativa: "Loperamida: não usar", "Insulina IV: não iniciar antes do K". */
const LABEL_NEGATION =
  /^(?:evit(?:ar|e)|nunca|jamais|nao\s+(?:fazer|realizar|iniciar|administrar|usar|utilizar|dar|prescrever|repetir|manter|reiniciar|aplicar|infundir))\b/;
const MAX_TOKENS_BEFORE_LABEL_COLON = 2;

interface Span {
  start: number;
  end: number;
}

interface Token extends Span {
  word: string;
  /** Vírgula logo depois da palavra: fecha a janela do qualificador posposto. */
  endsWithComma: boolean;
  opensParenthesis: boolean;
}

function sentences(text: string): string[] {
  return text.split(SENTENCE_BREAK).filter((sentence) => sentence.trim().length > 0);
}

/** Palavra sem a pontuação das bordas ("aine," → "aine"); ":" vira um token próprio. */
function tokenize(sentence: string): Token[] {
  return [...sentence.matchAll(/:|[^\s:]+/g)].map((match) => ({
    start: match.index,
    end: match.index + match[0].length,
    word: match[0] === LABEL_COLON ? LABEL_COLON : match[0].replace(/^[^\w/]+|[^\w/]+$/g, ''),
    endsWithComma: match[0].endsWith(','),
    opensParenthesis: match[0].startsWith('('),
  }));
}

/** Todas as ocorrências dos padrões, em ordem, sem sobreposição. */
function findTerms(sentence: string, patterns: RegExp[]): Span[] {
  const spans = patterns
    .flatMap((pattern) => [...sentence.matchAll(pattern)])
    .map((match) => ({ start: match.index, end: match.index + match[0].length }))
    .filter((span) => span.end > span.start)
    .sort((a, b) => a.start - b.start || b.end - a.end);

  const terms: Span[] = [];
  for (const span of spans) {
    const previous = terms.at(-1);
    if (!previous || span.start >= previous.end) terms.push(span);
  }
  return terms;
}

function overlaps(token: Span, spans: Span[]): boolean {
  return spans.some((span) => token.start < span.end && span.start < token.end);
}

/**
 * `insideParenthesis`: o termo abre um parêntese. A palavra antes do parêntese
 * é o que ele explica ("antitrombótico (AAS, heparina)") e não quebra o
 * vínculo com a negação.
 */
function isNegatedBefore(before: Token[], terms: Span[], insideParenthesis: boolean): boolean {
  let linkWords = 0;
  let skipExplainedWord = insideParenthesis;
  for (const token of [...before].reverse()) {
    if (token.word === LABEL_COLON) return false;
    if (overlaps(token, terms) || LIST_CONNECTORS.has(token.word) || token.word === '') {
      skipExplainedWord ||= token.opensParenthesis;
      continue;
    }
    if (DEFERRAL.test(token.word)) return false;
    if (NEGATOR.test(token.word)) return true;
    if (skipExplainedWord) {
      skipExplainedWord = false;
      continue;
    }
    if (!LINK_WORDS.has(token.word)) return false;
    linkWords += 1;
    if (linkWords > MAX_LINK_WORDS) return false;
  }
  return false;
}

function isLabelNegated(after: Token[]): boolean {
  const colonIndex = after.findIndex((token) => token.word === LABEL_COLON);
  if (colonIndex < 0 || colonIndex > MAX_TOKENS_BEFORE_LABEL_COLON) return false;
  if (after.slice(0, colonIndex).some((token) => token.endsWithComma)) return false;
  const words = after.slice(colonIndex + 1, colonIndex + 3).map((token) => token.word);
  return LABEL_NEGATION.test(words.join(' '));
}

/** "AAS 300 mg agora, heparina contraindicada": o qualificador depois da vírgula não volta ao AAS. */
function isQualifiedAfter(after: Token[], terms: Span[]): boolean {
  if (isLabelNegated(after)) return true;
  const words: string[] = [];
  for (const token of after) {
    if (words.length >= POST_QUALIFIER_WINDOW) break;
    if (token.word === LABEL_COLON) continue;
    if (overlaps(token, terms)) continue;
    words.push(token.word);
    if (token.endsWithComma) break;
  }
  return POST_QUALIFIER.test(words.join(' '));
}

function isExcepted(
  sentence: string,
  before: Token[],
  after: Token[],
  term: Span,
  exceptions: RegExp[],
): boolean {
  const colonIndexes = before.flatMap((token, index) =>
    token.word === LABEL_COLON ? [index] : [],
  );
  const labelStart = (colonIndexes.at(-2) ?? -1) + 1;
  const isConditionalLabel = CONDITIONAL_LABEL.test(before[labelStart]?.word ?? '');
  const reachableStart = isConditionalLabel ? labelStart : (colonIndexes.at(-1) ?? -1) + 1;
  const reachableBefore = before.slice(reachableStart);
  const windowStart = reachableBefore.slice(-EXCEPTION_WINDOW)[0]?.start ?? term.start;
  const windowEnd = after.at(EXCEPTION_WINDOW - 1)?.end ?? sentence.length;
  const region = sentence.slice(windowStart);

  return exceptions.some((exception) =>
    [...region.matchAll(exception)].some((match) => windowStart + match.index <= windowEnd),
  );
}

/**
 * Primeira ocorrência de conduta proibida que nenhuma negação ou exceção
 * alcança, ou `null`. O texto pode ter várias orações. `caseActions` são
 * todas as condutas proibidas do caso: os termos delas formam as listas que
 * uma negação atravessa ("não usar AAS, heparina ou trombolítico").
 */
export function findForbiddenTerm(
  text: string,
  action: ForbiddenAction,
  caseActions: ForbiddenAction[] = [action],
): string | null {
  const patterns = action.patterns.map(compileWholeWord);
  const listPatterns = caseActions.flatMap((caseAction) =>
    caseAction.patterns.map(compileWholeWord),
  );
  const exceptions = (action.exceptWhen ?? []).map(compileWholeWord);

  for (const sentence of sentences(normalizeForMatching(text))) {
    const terms = findTerms(sentence, patterns);
    if (terms.length === 0) continue;
    const tokens = tokenize(sentence);
    const listTerms = findTerms(sentence, [...patterns, ...listPatterns]);

    for (const term of terms) {
      const before = tokens.filter((token) => token.end <= term.start);
      const after = tokens.filter((token) => token.start >= term.end);
      const otherTerms = listTerms.filter((other) => !overlaps(other, [term]));

      const insideParenthesis = sentence[term.start - 1] === '(';
      if (isNegatedBefore(before, otherTerms, insideParenthesis)) continue;
      if (isQualifiedAfter(after, otherTerms)) continue;
      if (isExcepted(sentence, before, after, term, exceptions)) continue;
      return sentence.slice(term.start, term.end);
    }
  }
  return null;
}
