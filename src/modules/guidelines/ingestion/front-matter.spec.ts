import { describe, it, expect } from 'vitest';
import { parseGuidelineDocument } from './front-matter';

describe('parseGuidelineDocument', () => {
  it('parses front-matter and body from a well-formed document', () => {
    const raw = [
      '---',
      'source: Diretriz SBC Sepse',
      'version: 2.0',
      'specialty: emergencia',
      'evidenceLevel: I-A',
      '---',
      '',
      'Texto da diretriz com a conduta recomendada.',
    ].join('\n');

    const result = parseGuidelineDocument(raw);

    expect(result.meta).toEqual({
      source: 'Diretriz SBC Sepse',
      sourceVersion: '2.0',
      specialty: 'emergencia',
      evidenceLevel: 'I-A',
    });
    expect(result.body).toBe('Texto da diretriz com a conduta recomendada.');
  });

  it('accepts sourceVersion as an alternative key to version', () => {
    const raw = ['---', 'source: Diretriz X', 'sourceVersion: 1.0', 'specialty: clinica', '---', 'Corpo'].join(
      '\n',
    );

    const result = parseGuidelineDocument(raw);

    expect(result.meta.sourceVersion).toBe('1.0');
    expect(result.meta.evidenceLevel).toBeUndefined();
  });

  it('strips surrounding quotes from values', () => {
    const raw = [
      '---',
      'source: "Diretriz com vírgula, e tudo"',
      "version: '1.0'",
      'specialty: clinica',
      '---',
      'Corpo',
    ].join('\n');

    const result = parseGuidelineDocument(raw);

    expect(result.meta.source).toBe('Diretriz com vírgula, e tudo');
    expect(result.meta.sourceVersion).toBe('1.0');
  });

  it('throws when front-matter delimiters are missing', () => {
    expect(() => parseGuidelineDocument('Apenas texto sem front-matter')).toThrow(
      /Front-matter ausente/,
    );
  });

  it('throws when a required field is missing', () => {
    const raw = ['---', 'source: Diretriz X', 'specialty: clinica', '---', 'Corpo'].join('\n');

    expect(() => parseGuidelineDocument(raw)).toThrow(/sourceVersion/);
  });
});
