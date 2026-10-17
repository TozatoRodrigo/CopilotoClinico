import { describe, expect, it } from 'vitest';
import {
  DIAGNOSIS_TEXT,
  TREATMENT_TEXT,
  validCardInput,
} from '../../../../tests/fixtures/knowledge-cards';
import { normalizeForCitation } from './citation-check';
import { highlightQuotes, normalizeWithOffsets, quotesBySource } from './citation-highlight';

function highlighted(text: string, quotes: string[]): string[] {
  return highlightQuotes(text, quotes).map((range) => text.slice(range.start, range.end));
}

describe('normalizeWithOffsets', () => {
  it.each([
    ['fixture de tratamento', TREATMENT_TEXT],
    ['fixture de diagnóstico', DIAGNOSIS_TEXT],
    ['espaços nas pontas e em sequência', '  Dose   de\n\tataque  '],
    ['acento decomposto', 'Cefaleía e vênulas'],
    ['ligadura e tipografia do PDF', 'ﬁbrinólise “imediata” — até 4,5 h'],
    ['espaço não separável', 'ceftriaxona 2 g'],
  ])('reproduz normalizeForCitation: %s', (_label, text) => {
    expect(normalizeWithOffsets(text)?.normalized).toBe(normalizeForCitation(text));
  });
});

describe('highlightQuotes', () => {
  it('destaca o trecho literal no texto original', () => {
    expect(
      highlighted(TREATMENT_TEXT, ['Ceftriaxona 2 g por via intravenosa a cada 12 horas']),
    ).toEqual(['Ceftriaxona 2 g por via intravenosa a cada 12 horas']);
  });

  it('acha o trecho mesmo com acento, caixa e espaço diferentes, e destaca o original', () => {
    expect(
      highlighted(TREATMENT_TEXT, ['INICIAR  antibioticoterapia empirica imediatamente']),
    ).toEqual(['iniciar antibioticoterapia empírica imediatamente']);
  });

  it('atravessa a quebra de linha do texto da fonte', () => {
    const text = 'antes da coleta.\nNo adulto com suspeita de meningite';
    expect(highlighted(text, ['coleta. No adulto com suspeita'])).toEqual([
      'coleta.\nNo adulto com suspeita',
    ]);
  });

  it('destaca a ligadura do PDF inteira', () => {
    const text = 'Considerar ﬁbrinólise em até 4,5 horas do início dos sintomas.';
    expect(highlighted(text, ['fibrinolise em ate 4,5 horas'])).toEqual([
      'ﬁbrinólise em até 4,5 horas',
    ]);
  });

  it('junta trechos sobrepostos e ordena as faixas', () => {
    const ranges = highlightQuotes(TREATMENT_TEXT, [
      'dose máxima de 4 g/dia. Associar dexametasona',
      'Ceftriaxona 2 g por via intravenosa a cada 12 horas, dose máxima de 4 g/dia',
    ]);

    expect(ranges).toHaveLength(1);
    expect(TREATMENT_TEXT.slice(ranges[0]!.start, ranges[0]!.end)).toBe(
      'Ceftriaxona 2 g por via intravenosa a cada 12 horas, dose máxima de 4 g/dia. Associar dexametasona',
    );
  });

  it('destaca toda ocorrência do trecho', () => {
    const text = 'Repetir a dose em 5 minutos. Se não melhorar, repetir a dose em 5 minutos.';
    expect(highlightQuotes(text, ['repetir a dose em 5 minutos'])).toHaveLength(2);
  });

  it('não destaca trecho que não está no texto', () => {
    expect(highlightQuotes(TREATMENT_TEXT, ['dexametasona 4 mg 6/6h por 4 dias'])).toEqual([]);
  });
});

describe('quotesBySource', () => {
  it('junta as citações da resposta, das afirmações e das doses por fonte', () => {
    const quotes = quotesBySource(validCardInput());

    expect(quotes.get('S1')).toEqual([
      'Ceftriaxona 2 g por via intravenosa a cada 12 horas',
      'iniciar antibioticoterapia empírica imediatamente após a coleta do líquor',
      'Ceftriaxona 2 g por via intravenosa a cada 12 horas, dose máxima de 4 g/dia',
    ]);
    expect(quotes.get('S2')).toEqual([
      'A doença meningocócica é de notificação compulsória imediata',
    ]);
  });
});
