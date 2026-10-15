import type {
  KnowledgeCardContent,
  KnowledgeCardContentInput,
  KnowledgeCardContentIssue,
} from '@contracts/knowledge-cards';

/**
 * CC-404 — "Corrigir". A correção manda o conteúdo inteiro da versão nova; as
 * fontes vão só como chave e trecho (o servidor resolve título, versão e
 * hash). A API devolve 422 com `issues` (`claims[0].dose.amount`, …) e a tela
 * mostra cada problema no campo dele.
 */

/** Conteúdo gravado → o que o editor manipula e a API recebe. */
export function toContentInput(content: KnowledgeCardContent): KnowledgeCardContentInput {
  return {
    question: content.question,
    population: content.population,
    answer: content.answer,
    answerCitations: content.answerCitations.map((citation) => ({ ...citation })),
    claims: content.claims.map((claim) => ({
      kind: claim.kind,
      text: claim.text,
      dose: claim.dose ? { ...claim.dose, citation: { ...claim.dose.citation } } : null,
      citations: claim.citations.map((citation) => ({ ...citation })),
    })),
    sources: content.sources.map((source) => ({ key: source.key, chunkId: source.chunkId })),
  };
}

/** Campo opcional vazio é `null` no contrato, não texto vazio. */
export function optionalText(value: string): string | null {
  return value.trim() === '' ? null : value;
}

/** Os `issues` do corpo de um 422 da correção, ou `null` se o corpo não for esse. */
export function parseContentIssues(body: unknown): KnowledgeCardContentIssue[] | null {
  if (typeof body !== 'object' || body === null) return null;
  const issues = (body as { issues?: unknown }).issues;
  if (!Array.isArray(issues)) return null;
  const parsed = issues.filter(
    (issue): issue is KnowledgeCardContentIssue =>
      typeof issue === 'object' &&
      issue !== null &&
      typeof (issue as KnowledgeCardContentIssue).path === 'string' &&
      typeof (issue as KnowledgeCardContentIssue).message === 'string',
  );
  return parsed.length > 0 ? parsed : null;
}

/** Problemas de um campo: o caminho dele ou um caminho dentro dele. */
export function issuesAt(
  issues: readonly KnowledgeCardContentIssue[],
  path: string,
): KnowledgeCardContentIssue[] {
  return issues.filter(
    (issue) =>
      issue.path === path || issue.path.startsWith(`${path}.`) || issue.path.startsWith(`${path}[`),
  );
}

/** Id de elemento estável para um caminho do conteúdo (`claims[0].text` → `card-field-claims-0-text`). */
export function fieldId(path: string): string {
  return `card-field-${path.replace(/[^a-zA-Z0-9]+/g, '-').replace(/-$/, '')}`;
}

/** "claims[1].dose.amount" → "O que fazer agora 2 · dose · quantidade", para o resumo dos problemas. */
const FIELD_LABEL: Record<string, string> = {
  question: 'Pergunta',
  population: 'População',
  answer: 'Resposta',
  text: 'texto',
  dose: 'dose',
  drug: 'droga',
  amount: 'quantidade',
  route: 'via',
  frequency: 'frequência',
  maxDose: 'dose máxima',
  citation: 'trecho da dose',
  quote: 'trecho citado',
  sourceKey: 'fonte',
  sources: 'Fontes',
  chunkId: 'trecho',
};

export function issueLabel(path: string): string {
  const parts = path.match(/[A-Za-z]+|\d+/g) ?? [];
  const words: string[] = [];
  for (let index = 0; index < parts.length; index += 1) {
    const part = parts[index];
    const next = parts[index + 1];
    const position = next !== undefined && /^\d+$/.test(next) ? ` ${Number(next) + 1}` : '';
    if (/^\d+$/.test(part)) continue;
    if (part === 'claims') words.push(`Afirmação${position}`);
    else if (part === 'answerCitations') words.push(`Citação da resposta${position}`);
    else if (part === 'citations') words.push(`citação${position}`);
    else words.push(`${FIELD_LABEL[part] ?? part}${position}`);
  }
  return words.join(' · ') || 'Cartão';
}
