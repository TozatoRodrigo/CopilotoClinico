import type {
  KnowledgeCardCitation,
  KnowledgeCardClaim,
  KnowledgeCardContent,
  KnowledgeCardDose,
} from '@contracts/knowledge-cards';
import { CLAIM_KIND_LABEL } from './card-labels';

/**
 * CC-404, critério 2 — "salva nova versão com o diff visível". O revisor (ou
 * o próximo, se ele pular) vê o que a correção mudou em relação à versão
 * anterior: campo a campo, com as palavras removidas e incluídas.
 */

export type DiffSegment = { kind: 'same' | 'removed' | 'added'; text: string };

/** Palavras e os espaços entre elas, para o diff devolver o texto como estava. */
function tokenize(text: string): string[] {
  return text.split(/(\s+)/).filter((token) => token.length > 0);
}

function pushSegment(segments: DiffSegment[], kind: DiffSegment['kind'], text: string): void {
  const last = segments[segments.length - 1];
  if (last && last.kind === kind) last.text += text;
  else segments.push({ kind, text });
}

/** Diff por palavra (maior subsequência comum). Textos do cartão têm no máximo 600 letras. */
export function diffWords(before: string, after: string): DiffSegment[] {
  const a = tokenize(before);
  const b = tokenize(after);
  // lcs[i][j] = tamanho da maior subsequência comum de a[i..] e b[j..].
  const lcs: number[][] = Array.from({ length: a.length + 1 }, () =>
    new Array<number>(b.length + 1).fill(0),
  );
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }

  const segments: DiffSegment[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      pushSegment(segments, 'same', a[i]);
      i += 1;
      j += 1;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      pushSegment(segments, 'removed', a[i]);
      i += 1;
    } else {
      pushSegment(segments, 'added', b[j]);
      j += 1;
    }
  }
  for (; i < a.length; i += 1) pushSegment(segments, 'removed', a[i]);
  for (; j < b.length; j += 1) pushSegment(segments, 'added', b[j]);
  return segments;
}

export interface FieldChange {
  /** Onde mudou, como o revisor lê ("Resposta", "O que fazer agora 1 · dose"). */
  label: string;
  before: string;
  after: string;
}

function citationLines(citations: readonly KnowledgeCardCitation[]): string {
  return citations.map((citation) => `${citation.sourceKey}: “${citation.quote}”`).join('\n');
}

function doseText(dose: KnowledgeCardDose | null): string {
  if (!dose) return '';
  return [
    dose.drug,
    dose.amount,
    dose.route,
    dose.frequency,
    dose.maxDose ? `máx. ${dose.maxDose}` : null,
  ]
    .filter((part): part is string => Boolean(part))
    .join(' · ');
}

function claimKey(claim: KnowledgeCardClaim): string {
  const first = claim.citations[0];
  return `${claim.kind}|${first ? `${first.sourceKey}|${first.quote}` : ''}`;
}

/**
 * Pares (anterior, nova) de afirmações. A correção pode reescrever e remover
 * afirmações, então o índice não basta: casa primeiro pela primeira citação
 * (raramente muda numa reescrita), depois pelo texto; o que sobra foi
 * removido ou incluído.
 */
function pairClaims(
  before: readonly KnowledgeCardClaim[],
  after: readonly KnowledgeCardClaim[],
): Array<[KnowledgeCardClaim | null, KnowledgeCardClaim | null]> {
  const unmatched = new Set(before.map((_, index) => index));
  const take = (match: (claim: KnowledgeCardClaim) => boolean): KnowledgeCardClaim | null => {
    for (const index of unmatched) {
      const claim = before[index];
      if (match(claim)) {
        unmatched.delete(index);
        return claim;
      }
    }
    return null;
  };

  const pairs: Array<[KnowledgeCardClaim | null, KnowledgeCardClaim | null]> = after.map(
    (claim) => {
      const previous =
        take((candidate) => claimKey(candidate) === claimKey(claim)) ??
        take((candidate) => candidate.kind === claim.kind && candidate.text === claim.text);
      return [previous, claim];
    },
  );
  for (const index of unmatched) pairs.push([before[index], null]);
  return pairs;
}

/** O que mudou entre duas versões do conteúdo, na ordem em que o cartão é lido. */
export function diffCardContent(
  before: KnowledgeCardContent,
  after: KnowledgeCardContent,
): FieldChange[] {
  const changes: FieldChange[] = [];
  const compare = (label: string, previous: string, next: string) => {
    if (previous !== next) changes.push({ label, before: previous, after: next });
  };

  compare('Pergunta', before.question, after.question);
  compare('População', before.population ?? '', after.population ?? '');
  compare('Resposta', before.answer, after.answer);
  compare(
    'Citações da resposta',
    citationLines(before.answerCitations),
    citationLines(after.answerCitations),
  );

  const counter = new Map<string, number>();
  for (const [previous, next] of pairClaims(before.claims, after.claims)) {
    const claim = next ?? previous;
    if (!claim) continue;
    const position = (counter.get(claim.kind) ?? 0) + 1;
    counter.set(claim.kind, position);
    const name = `${CLAIM_KIND_LABEL[claim.kind]} ${position}`;
    if (!previous || !next) {
      changes.push({
        label: `${name} (${next ? 'incluída' : 'removida'})`,
        before: previous?.text ?? '',
        after: next?.text ?? '',
      });
      continue;
    }
    compare(name, previous.text, next.text);
    compare(`${name} · dose`, doseText(previous.dose), doseText(next.dose));
    compare(
      `${name} · trecho da dose`,
      previous.dose ? citationLines([previous.dose.citation]) : '',
      next.dose ? citationLines([next.dose.citation]) : '',
    );
    compare(`${name} · citações`, citationLines(previous.citations), citationLines(next.citations));
  }

  const sourceLines = (content: KnowledgeCardContent) =>
    content.sources
      .map((source) => `${source.key}: ${source.title} (${source.sourceVersion})`)
      .join('\n');
  compare('Fontes', sourceLines(before), sourceLines(after));
  return changes;
}
