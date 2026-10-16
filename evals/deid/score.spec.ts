import { describe, expect, it } from 'vitest';
import { buildDeidCorpus } from './corpus';
import { leaked, scoreMasker } from './score';

describe('buildDeidCorpus', () => {
  it('is the same for the same seed, and every identifier and clinical term is in its note', () => {
    const corpus = buildDeidCorpus(30);

    expect(buildDeidCorpus(30)).toEqual(corpus);
    for (const note of corpus) {
      for (const { value } of note.identifiers) expect(note.text).toContain(value);
      for (const term of note.keep) expect(note.text).toContain(term);
    }
  });
});

describe('leaked', () => {
  it('counts a surname left behind as a leaked name', () => {
    expect(leaked('Paciente [NOME] da Silva, 54 anos', 'name', 'Maria da Silva')).toBe(true);
    expect(leaked('Paciente [NOME], 54 anos', 'name', 'Maria da Silva')).toBe(false);
  });

  it('does not confuse a name with a longer word', () => {
    expect(leaked('Ananias refere dor', 'name', 'Ana')).toBe(false);
  });

  it('checks short nicknames whole', () => {
    expect(leaked('Zé, 70 anos', 'nickname', 'Zé')).toBe(true);
    expect(leaked('[APELIDO], 70 anos', 'nickname', 'Zé')).toBe(false);
  });

  it('finds a number by its digits whatever the formatting', () => {
    expect(leaked('CPF 52998224725', 'cpf', '529.982.247-25')).toBe(true);
    expect(leaked('CPF [REDACTED_CPF]', 'cpf', '529.982.247-25')).toBe(false);
  });
});

describe('scoreMasker', () => {
  it('scores caught identifiers and kept clinical terms', () => {
    const notes = buildDeidCorpus(6);
    const masked = new Map(notes.map((note) => [note.id, note.keep.join(' ')]));

    const score = scoreMasker('tudo mascarado', notes, masked);
    const keepTotal = notes.reduce((total, note) => total + note.keep.length, 0);

    expect(score.fullyClean).toBe(notes.length);
    expect(score.clinicalKept).toEqual({ kept: keepTotal, total: keepTotal });
  });
});
