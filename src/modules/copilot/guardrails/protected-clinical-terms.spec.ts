import { describe, expect, it } from 'vitest';
import {
  ALWAYS_PROTECTED,
  FIRST_NAME_LIKE_TERMS,
  PROTECTED_CLINICAL_TERMS_REVIEW,
  PROTECTED_CLINICAL_TERMS_VERSION,
  SURNAME_LIKE_TERMS,
} from './protected-clinical-terms.list';
import {
  findProtectedClinicalTerms,
  isProtectedClinicalTerm,
  protectClinicalTerms,
  type TextSpan,
} from './protected-clinical-terms';

const ALL_TERMS: string[] = [
  ...Object.values(ALWAYS_PROTECTED).flat(),
  ...SURNAME_LIKE_TERMS,
  ...FIRST_NAME_LIKE_TERMS,
];

function spanOf(text: string, fragment: string, from = 0): TextSpan {
  const start = text.indexOf(fragment, from);
  if (start < 0) throw new Error(`"${fragment}" não está em "${text}"`);
  return { start, end: start + fragment.length };
}

function found(text: string): string[] {
  return findProtectedClinicalTerms(text).map(({ start, end }) => text.slice(start, end));
}

describe('protected clinical term list (CC-202)', () => {
  it('has at least 150 eponyms, scores and signs, each listed once', () => {
    const folded = ALL_TERMS.map((term) =>
      term
        .normalize('NFD')
        .replace(/\p{M}+/gu, '')
        .toLowerCase()
        .replace(/[\s-]+/g, ' '),
    );
    expect(ALL_TERMS.length).toBeGreaterThanOrEqual(150);
    expect(folded.filter((term, index) => folded.indexOf(term) !== index)).toEqual([]);
  });

  it('is versioned and still awaits the physician review', () => {
    expect(PROTECTED_CLINICAL_TERMS_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(PROTECTED_CLINICAL_TERMS_REVIEW).toEqual({ status: 'pending', reviewer: null });
  });

  // Os termos pedidos na história e no relato do OpenMed (#172).
  it.each([
    'Murphy',
    'Glasgow',
    'Blumberg',
    'Giordano',
    'Cushing',
    'Kernig',
    'Brudzinski',
    'Lasègue',
    'Romberg',
    'Babinski',
    'Trendelenburg',
    'Parkland',
    'Wells',
    'Child-Pugh',
    'Apgar',
    'Broselow',
    'Holliday-Segar',
    'Valsalva',
    'Chagas',
    'Crohn',
    'Addison',
    'Graves',
    'Hashimoto',
    'Guillain-Barré',
    'Wernicke',
    'Korsakoff',
    'Stevens-Johnson',
    'Reynolds',
    'Beck',
    'Kussmaul',
    'Cheyne-Stokes',
  ])('protects %s in a clinical sentence', (term) => {
    const text = `Ao exame: ${term} descrito pelo plantonista.`;
    expect(isProtectedClinicalTerm(text, spanOf(text, term))).toBe(true);
  });

  it('ignores case, accents and hyphen-or-space in the text', () => {
    expect(
      found('lasegue +, GUILLAIN BARRE, Child Pugh B, Cheyne–Stokes, babinski, Sjogren'),
    ).toEqual(['lasegue', 'GUILLAIN BARRE', 'Child Pugh', 'Cheyne–Stokes', 'babinski', 'Sjogren']);
  });

  it('matches whole words only', () => {
    expect(found('Grama, Graminha, Westfalia, Downtown')).toEqual([]);
  });

  it('prefers the longest term ("Ramsay Hunt" over "Ramsay")', () => {
    expect(found('síndrome de Ramsay Hunt; Ramsay 3')).toEqual(['Ramsay Hunt', 'Ramsay']);
  });
});

// Critério 1: trecho marcado pelo modelo que coincide com a lista não é mascarado.
describe('protectClinicalTerms — spans flagged by a name model (CC-202)', () => {
  const text =
    'Kernig e Brudzinski negativos, sinal de Babinski à direita, síndrome de Guillain-Barré.';

  it('drops a flagged span that is a protected term', () => {
    const spans = [spanOf(text, 'Babinski'), spanOf(text, 'Kernig e Brudzinski')];
    expect(protectClinicalTerms(text, spans)).toEqual([]);
  });

  it('drops a span that covers only part of a compound eponym', () => {
    expect(protectClinicalTerms(text, [spanOf(text, 'Barré')])).toEqual([]);
  });

  it('keeps the rest of a span that also covers a real name', () => {
    const note = 'Paciente Maria Glasgow 15';
    const kept = protectClinicalTerms(note, [{ ...spanOf(note, 'Maria Glasgow'), label: 'NAME' }]);
    expect(kept).toEqual([{ ...spanOf(note, 'Maria'), label: 'NAME' }]);
  });

  it('keeps spans that touch no protected term, with their own fields', () => {
    const note = 'Paciente Maria Souza, Glasgow 15';
    const spans = [{ ...spanOf(note, 'Maria Souza'), entity_group: 'FIRSTNAME', score: 0.97 }];
    expect(protectClinicalTerms(note, spans)).toEqual(spans);
  });
});

// Sobrenome comum (Chagas, Weber...): protegido, salvo quando o texto mostra uma pessoa.
describe('surname-like eponyms', () => {
  it.each([
    ['portador de doença de Chagas', 'Chagas'],
    ['Chagas crônico em seguimento', 'Chagas'],
    ['Pesquisa Chagas reagente', 'Chagas'],
    ['tireoidite de Hashimoto', 'Hashimoto'],
    ['Hoffmann positivo à esquerda', 'Hoffmann'],
    ['Weber lateralizado para a direita', 'Weber'],
    ['bacilo de Koch', 'Koch'],
    ['paralisia de Bell', 'Bell'],
  ])('protects the eponym in %j', (text, term) => {
    expect(isProtectedClinicalTerm(text, spanOf(text, term))).toBe(true);
  });

  it.each([
    ['Sr. Weber, 58 anos', 'Weber'],
    ['Francisco das Chagas, 70 anos', 'Chagas'],
    ['Maria Hoffmann refere', 'Hoffmann'],
    ['Weber da Silva, 40 anos', 'Weber'],
    ['a filha Becker acompanha', 'Becker'],
    ['paciente Koch, 33 anos', 'Koch'],
    ['Sr. Wilson Hoffmann', 'Hoffmann'],
  ])('lets the name be masked in %j', (text, term) => {
    expect(isProtectedClinicalTerm(text, spanOf(text, term))).toBe(false);
  });
});

// Prenome comum (Wilson, Douglas...): protegido só com contexto clínico.
describe('first-name-like eponyms', () => {
  it.each([
    ['dor no fundo de saco de Douglas', 'Douglas'],
    ['Douglas livre ao ultrassom', 'Douglas'],
    ['doença de Wilson', 'Wilson'],
    ['teste de Allen positivo', 'Allen'],
    ['Patrick positivo à direita', 'Patrick'],
    ['manobras de Leopold', 'Leopold'],
    ['doença de Jorge Lobo', 'Jorge Lobo'],
  ])('protects the eponym in %j', (text, term) => {
    expect(isProtectedClinicalTerm(text, spanOf(text, term))).toBe(true);
  });

  it.each([
    ['Douglas, 30 anos, trauma de punho', 'Douglas'],
    ['Wilson refere dor torácica', 'Wilson'],
    ['Sr. Nelson, 66 anos', 'Nelson'],
  ])('lets the name be masked in %j', (text, term) => {
    expect(isProtectedClinicalTerm(text, spanOf(text, term))).toBe(false);
  });
});
