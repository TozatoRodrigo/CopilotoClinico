import { IDENTIFIER_TYPES, type DeidNote, type IdentifierType } from './corpus';

const NAME_TYPES: ReadonlySet<IdentifierType> = new Set([
  'name',
  'nickname',
  'relative',
  'physician',
]);
const NAME_PARTICLES = new Set(['da', 'de', 'do', 'das', 'dos', 'e', 'seu', 'dona']);

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Palavra inteira, sem confundir "Ana" com "Ananias". */
function containsWord(text: string, word: string): boolean {
  return new RegExp(`(^|[^\\p{L}])${escapeRegExp(word)}($|[^\\p{L}])`, 'iu').test(text);
}

/**
 * Sobrou identificador? Nome conta como vazado se qualquer parte dele ficou
 * (sobrenome sozinho ainda identifica); número, se os dígitos ficaram em
 * sequência; o resto, se o trecho ficou inteiro.
 */
export function leaked(redacted: string, type: IdentifierType, value: string): boolean {
  if (NAME_TYPES.has(type)) {
    const parts = value
      .split(/\s+/)
      .filter((part) => part.length >= 3 && !NAME_PARTICLES.has(part.toLowerCase()));
    // Apelido curto ("Zé") não tem parte longa: vale o apelido inteiro.
    return (parts.length > 0 ? parts : [value]).some((part) => containsWord(redacted, part));
  }
  const valueDigits = value.replace(/\D/g, '');
  if (valueDigits.length >= 6 && valueDigits.length === value.replace(/[\s().\-/]/g, '').length) {
    return redacted
      .replace(/\D/g, ' ')
      .split(/\s+/)
      .some((run) => run.includes(valueDigits));
  }
  return redacted.toLowerCase().includes(value.toLowerCase());
}

export interface DeidScore {
  masker: string;
  notes: number;
  /** Por tipo: identificadores que sumiram / total. */
  caught: Record<IdentifierType, { caught: number; total: number }>;
  /** Termos clínicos que sobreviveram / total. */
  clinicalKept: { kept: number; total: number };
  /** Notas sem nenhum identificador sobrando. */
  fullyClean: number;
  leakExamples: Array<{ id: string; type: IdentifierType; value: string }>;
  clinicalLostExamples: Array<{ id: string; term: string }>;
}

export function scoreMasker(
  masker: string,
  notes: DeidNote[],
  redactedById: ReadonlyMap<string, string>,
): DeidScore {
  const caught = Object.fromEntries(
    IDENTIFIER_TYPES.map((type) => [type, { caught: 0, total: 0 }]),
  ) as DeidScore['caught'];
  const clinicalKept = { kept: 0, total: 0 };
  const leakExamples: DeidScore['leakExamples'] = [];
  const clinicalLostExamples: DeidScore['clinicalLostExamples'] = [];
  let fullyClean = 0;

  for (const note of notes) {
    const redacted = redactedById.get(note.id);
    if (redacted === undefined) throw new Error(`Sem texto mascarado para ${note.id} (${masker}).`);
    let clean = true;
    for (const { type, value } of note.identifiers) {
      caught[type].total += 1;
      if (leaked(redacted, type, value)) {
        clean = false;
        if (leakExamples.length < 12) leakExamples.push({ id: note.id, type, value });
      } else {
        caught[type].caught += 1;
      }
    }
    for (const term of note.keep) {
      clinicalKept.total += 1;
      if (redacted.includes(term)) clinicalKept.kept += 1;
      else if (clinicalLostExamples.length < 12) clinicalLostExamples.push({ id: note.id, term });
    }
    if (clean) fullyClean += 1;
  }

  return {
    masker,
    notes: notes.length,
    caught,
    clinicalKept,
    fullyClean,
    leakExamples,
    clinicalLostExamples,
  };
}

function percent(part: number, total: number): string {
  return total === 0 ? '—' : `${Math.round((part / total) * 100)}% (${part}/${total})`;
}

export function renderScores(scores: DeidScore[]): string {
  const header = ['Tipo', ...scores.map(({ masker }) => masker)];
  const rows = IDENTIFIER_TYPES.filter((type) => scores.some((s) => s.caught[type].total > 0)).map(
    (type) => [type, ...scores.map((s) => percent(s.caught[type].caught, s.caught[type].total))],
  );
  rows.push(['notas sem identificador', ...scores.map((s) => percent(s.fullyClean, s.notes))]);
  rows.push([
    'termos clínicos intactos',
    ...scores.map((s) => percent(s.clinicalKept.kept, s.clinicalKept.total)),
  ]);
  const table = [header, header.map(() => '---'), ...rows]
    .map((cells) => `| ${cells.join(' | ')} |`)
    .join('\n');
  const examples = scores
    .map(
      (s) =>
        `\n### ${s.masker}\n\nVazou (até 12): ${
          s.leakExamples.map((e) => `${e.id} ${e.type} "${e.value}"`).join('; ') || 'nada'
        }\n\nTermo clínico perdido (até 12): ${
          s.clinicalLostExamples.map((e) => `${e.id} "${e.term}"`).join('; ') || 'nenhum'
        }`,
    )
    .join('\n');
  return `## De-identificação: identificadores que sumiram\n\n${table}\n${examples}\n`;
}
