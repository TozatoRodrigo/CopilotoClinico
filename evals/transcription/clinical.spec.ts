import { describe, expect, it } from 'vitest';
import {
  compareQuantities,
  compareTerms,
  countTerms,
  extractQuantities,
  formatQuantity,
  readNumber,
  clinicalTokens,
  type Quantity,
} from './clinical';
import { CLINICAL_VOCABULARY, type VocabularyEntry } from './vocabulary';

function readAll(text: string): string[] {
  return extractQuantities(text).map(formatQuantity);
}

function spelled(text: string): number | undefined {
  return readNumber(clinicalTokens(text), 0)?.value;
}

describe('readNumber', () => {
  it.each([
    ['cento e vinte', 120],
    ['cento e vinte e cinco', 125],
    ['trinta e oito vírgula cinco', 38.5],
    ['zero vírgula cinco', 0.5],
    ['zero vírgula zero cinco', 0.05],
    ['dois vírgula vinte e cinco', 2.25],
    ['dois mil e quinhentos', 2500],
    ['mil', 1000],
    ['duzentos cinquenta', 250],
    ['dois e meio', 2.5],
    ['0,5', 0.5],
    ['0.5', 0.5],
    ['1.000', 1000],
    ['1.000,5', 1000.5],
    ['5 mil', 5000],
  ])('reads "%s" as %d', (text, value) => {
    expect(spelled(text)).toBe(value);
  });

  it('keeps separate numbers apart', () => {
    expect(readAll('PA três quatro')).toEqual(['3', '4']);
    expect(readAll('vinte e quinze')).toEqual(['20', '15']);
    expect(readAll('zero cinco e zero e dois')).toEqual(['0', '5', '0', '2']);
  });
});

describe('extractQuantities', () => {
  it('reads digits and spelled numbers the same way', () => {
    const written = extractQuantities('54 anos, PA 120 por 80, FC 110 bpm, Sat 92%, Tax 38,5°C');
    const spoken = extractQuantities(
      'cinquenta e quatro anos, pressão arterial cento e vinte por oitenta, ' +
        'frequência cardíaca cento e dez batimentos por minuto, saturação noventa e dois por cento, ' +
        'temperatura trinta e oito vírgula cinco graus',
    );

    expect(spoken).toEqual(written);
    expect(written.map((q) => `${formatQuantity(q)} ${q.kind}`)).toEqual([
      '54 anos time',
      '120 vital',
      '80 vital',
      '110 bpm vital',
      '92% vital',
      '38,5°C vital',
    ]);
  });

  it('normalizes units however they are written', () => {
    expect(readAll('noradrenalina 0,1 mcg/kg/min')).toEqual(['0,1 mcg/kg/min']);
    expect(readAll('noradrenalina zero vírgula um micrograma por quilo por minuto')).toEqual([
      '0,1 mcg/kg/min',
    ]);
    expect(readAll('0,1 µg/kg/min')).toEqual(['0,1 mcg/kg/min']);
    expect(readAll('cetamina 1 miligrama por quilo')).toEqual(['1 mg/kg']);
    expect(readAll('heparina cinco mil unidades')).toEqual(['5000 UI']);
    expect(readAll('SF 0,9% 500 ml')).toEqual(['0,9%', '500 mL']);
  });

  it('classifies doses, vital signs, age/time and plain numbers', () => {
    const kinds = (text: string) => extractQuantities(text).map((q) => q.kind);

    expect(kinds('dipirona 1 g, SF 0,9%')).toEqual(['dose', 'dose']);
    expect(kinds('glicemia 250 mg/dL, peso 70 kg, Glasgow 13')).toEqual([
      'vital',
      'vital',
      'vital',
    ]);
    expect(kinds('há 3 dias, idade 7 meses')).toEqual(['time', 'time']);
    expect(kinds('leito 12')).toEqual(['other']);
  });

  it('only reads "um", "uma" and "meia" as numbers before a unit', () => {
    expect(readAll('um paciente com uma queixa')).toEqual([]);
    expect(readAll('uma ampola de dipirona e meia hora depois')).toEqual(['1 ampola', '0,5 h']);
    expect(readAll('vinte e um anos')).toEqual(['21 anos']);
  });

  it('does not take an ordinal for degrees', () => {
    expect(readAll('1º episódio, 38ºC')).toEqual(['1', '38°C']);
  });
});

describe('compareQuantities', () => {
  const quantity = (value: number, unit: string | null, kind: Quantity['kind']): Quantity => ({
    value,
    unit,
    kind,
  });

  it('matches value and unit with multiplicity', () => {
    const reference = extractQuantities('FC 80, PA 120 por 80, adrenalina 1 mg');
    const hypothesis = extractQuantities('FC 80, PA 120 por 80, adrenalina um miligrama');

    const comparison = compareQuantities(reference, hypothesis);

    expect(comparison.missed).toEqual([]);
    expect(comparison.extra).toEqual([]);
    expect(comparison.byKind.vital).toEqual({ reference: 3, matched: 3 });
    expect(comparison.byKind.dose).toEqual({ reference: 1, matched: 1 });
  });

  it('counts a wrong unit or a lost unit as a missed dose', () => {
    const reference = extractQuantities('adrenalina 0,5 mg, morfina 2 mg');
    const hypothesis = extractQuantities('adrenalina 0,5 mcg, morfina 2');

    const comparison = compareQuantities(reference, hypothesis);

    expect(comparison.byKind.dose).toEqual({ reference: 2, matched: 0 });
    expect(comparison.missed).toEqual([quantity(0.5, 'mg', 'dose'), quantity(2, 'mg', 'dose')]);
    expect(comparison.extra.map(formatQuantity)).toEqual(['0,5 mcg', '2']);
  });

  it('flags a misheard number as missed and extra', () => {
    const comparison = compareQuantities(extractQuantities('FC 115'), extractQuantities('FC 150'));

    expect(comparison.missed.map(formatQuantity)).toEqual(['115']);
    expect(comparison.extra.map(formatQuantity)).toEqual(['150']);
  });
});

describe('countTerms', () => {
  const vocabulary: VocabularyEntry[] = [
    { kind: 'droga', term: 'adrenalina' },
    { kind: 'droga', term: 'noradrenalina' },
    { kind: 'droga', term: 'bicarbonato de sódio' },
    { kind: 'droga', term: 'bicarbonato' },
    { kind: 'droga', term: 'ceftriaxona', aliases: ['ceftriaxone'] },
    { kind: 'unidade', term: 'mcg/kg/min' },
    { kind: 'unidade', term: 'mg' },
  ];

  it('matches whole words, without case or accents, longest phrase first', () => {
    const counts = countTerms(
      'Noradrenalina e ADRENALINA; bicarbonato de sodio e depois bicarbonato. Ceftriaxone.',
      vocabulary,
    );

    expect(Object.fromEntries(counts)).toEqual({
      noradrenalina: 1,
      adrenalina: 1,
      'bicarbonato de sódio': 1,
      bicarbonato: 1,
      ceftriaxona: 1,
    });
  });

  it('counts units through the quantities, whatever the spelling', () => {
    const counts = countTerms(
      '0,1 mcg/kg/min e depois zero vírgula dois microgramas por quilo por minuto; 1 mg',
      vocabulary,
    );

    expect(counts.get('mcg/kg/min')).toBe(2);
    expect(counts.get('mg')).toBe(1);
  });

  it('only lists units the quantity reader can produce', () => {
    for (const entry of CLINICAL_VOCABULARY.filter((e) => e.kind === 'unidade')) {
      expect(extractQuantities(`1 ${entry.term}`)[0]?.unit).toBe(entry.term);
    }
  });
});

describe('compareTerms', () => {
  it('reports a swapped drug as missed in one term and extra in the other', () => {
    const terms = compareTerms(
      'dobutamina 5 mcg/kg/min',
      'dopamina 5 mcg/kg/min',
      CLINICAL_VOCABULARY,
    );

    expect(terms).toEqual([
      { term: 'dobutamina', kind: 'droga', reference: 1, matched: 0, extra: 0 },
      { term: 'dopamina', kind: 'droga', reference: 0, matched: 0, extra: 1 },
      { term: 'mcg/kg/min', kind: 'unidade', reference: 1, matched: 1, extra: 0 },
    ]);
  });
});
