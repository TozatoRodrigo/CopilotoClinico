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

  it('PROT-004: parses an optional institutionId from front-matter', () => {
    const raw = [
      '---',
      'source: Protocolo HC-X',
      'sourceVersion: 1.0',
      'specialty: clinica',
      'institutionId: 880e8400-e29b-41d4-a716-446655440003',
      '---',
      'Corpo',
    ].join('\n');

    const result = parseGuidelineDocument(raw);

    expect(result.meta.institutionId).toBe('880e8400-e29b-41d4-a716-446655440003');
  });

  it('KB-001: parses cenario and red_flags for draft curation packs', () => {
    const raw = [
      '---',
      'source: Manejo da síndrome gripal no PS',
      'sourceVersion: MS 2023',
      'specialty: emergencia',
      'cenario: sindrome_gripal',
      'red_flags: dispneia | SpO2 < 95% | hipotensao',
      '---',
      'Corpo',
    ].join('\n');

    const result = parseGuidelineDocument(raw);

    expect(result.meta.cenario).toBe('sindrome_gripal');
    expect(result.meta.redFlags).toEqual(['dispneia', 'SpO2 < 95%', 'hipotensao']);
  });

  it('S21-CLIN-01: parses subtipo for cannot-miss mutually-exclusive scenarios', () => {
    const raw = [
      '---',
      'source: IBCC — AVC agudo',
      'sourceVersion: Farkas J., EMCrit',
      'specialty: neurologia',
      'cenario: avc_agudo',
      'subtipo: hemorragico',
      '---',
      'Corpo',
    ].join('\n');

    const result = parseGuidelineDocument(raw);

    expect(result.meta.subtipo).toBe('hemorragico');
  });

  it('S21-CLIN-01: subtipo is undefined when absent (most cenarios have no dichotomy)', () => {
    const raw = ['---', 'source: Diretriz X', 'sourceVersion: 1.0', 'specialty: clinica', '---', 'Corpo'].join(
      '\n',
    );

    const result = parseGuidelineDocument(raw);

    expect(result.meta.subtipo).toBeUndefined();
  });
});
