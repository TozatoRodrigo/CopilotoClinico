import { describe, expect, it } from 'vitest';
import {
  protectClinicalTerms,
  type TextSpan,
} from '../../src/modules/copilot/guardrails/protected-clinical-terms';
import { BLIND_CASES_DIR, CASES_DIR, loadCaseSet } from '../clinical/cases';
import { buildDeidCorpus } from './corpus';

/**
 * O pior modelo de nomes possível: marca toda palavra com inicial maiúscula.
 * Se a lista de termos protegidos (CC-202) segura os epônimos mesmo assim, ela
 * segura o OpenMed (CC-203), que marca bem menos.
 */
function maskEveryCapitalizedWord(text: string): string {
  const spans: TextSpan[] = [...text.matchAll(/\p{Lu}\p{Ll}+(?:-\p{Lu}\p{Ll}+)*/gu)].map(
    (match) => ({ start: match.index, end: match.index + match[0].length }),
  );
  return protectClinicalTerms(text, spans)
    .sort((a, b) => b.start - a.start)
    .reduce(
      (masked, { start, end }) => masked.slice(0, start) + '[NOME]' + masked.slice(end),
      text,
    );
}

function countWord(text: string, word: string): number {
  return text.match(new RegExp(`(?<![\\p{L}])${word}(?![\\p{L}])`, 'gu'))?.length ?? 0;
}

describe('protected clinical terms against a worst-case name model (CC-202)', () => {
  // Critério 2: 100% dos termos clínicos do corpus intactos. Os relatos dos
  // templates guardam só epônimos e escores; os escritos à mão guardam também
  // "Leito 12" e "Seu médico", que o pior modelo apagaria por serem maiúsculos.
  it('keeps every clinical term of the template notes in the de-identification corpus', () => {
    const notes = buildDeidCorpus(200).filter(({ id }) => !id.startsWith('deid-m'));
    const lost = notes.flatMap((note) => {
      const masked = maskEveryCapitalizedWord(note.text);
      return note.keep
        .filter((term) => !masked.includes(term))
        .map((term) => `${note.id}: ${term}`);
    });

    expect(notes.length).toBe(200);
    expect(lost).toEqual([]);
  });

  // Os epônimos que aparecem nos casos do gabarito clínico, no contexto real.
  it('keeps every eponym found in the clinical eval cases', () => {
    const eponyms = [
      'Glasgow',
      'Doppler',
      'Apgar',
      'Blumberg',
      'Rovsing',
      'Giordano',
      'Romberg',
      'Coombs',
      'Kernig',
      'Brudzinski',
      'Jobert',
      'Framingham',
      'Douglas',
      'Murphy',
      'Garden',
      'Ringer',
    ];
    const texts = [...loadCaseSet(CASES_DIR).cases, ...loadCaseSet(BLIND_CASES_DIR).cases].flatMap(
      ({ input }) => [
        input.caseText,
        ...(input.funnel
          ? [input.funnel.opening, ...input.funnel.script.map(({ text }) => text)]
          : []),
      ],
    );
    let occurrences = 0;
    const lost: string[] = [];
    for (const text of texts) {
      const masked = maskEveryCapitalizedWord(text);
      for (const eponym of eponyms) {
        const before = countWord(text, eponym);
        occurrences += before;
        if (countWord(masked, eponym) !== before) lost.push(`${eponym} em "${text.slice(0, 60)}…"`);
      }
    }

    expect(occurrences).toBeGreaterThan(30);
    expect(lost).toEqual([]);
  });
});
