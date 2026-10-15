import { describe, expect, it } from 'vitest';
import * as content from './content';
import * as hypodermoclysis from './hypodermoclysis';
import * as opioids from './opioids';
import { PALLIATIVE_PROVENANCE } from './provenance';
import * as scales from './scales';

function strings(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) value.forEach((item) => strings(item, out));
  else if (value && typeof value === 'object') {
    Object.values(value).forEach((item) => strings(item, out));
  }
  return out;
}

/** Mesma regra do registro de calculadoras (ADR-017): sugere, não manda. */
const IMPERATIVE_START =
  /(^|[.:;]\s+)(Faça|Inicie|Administre|Realize|Aplique|Intube|Transfunda|Prescreva)\b/;

describe('conteúdo dos cuidados paliativos', () => {
  const texts = strings([content, hypodermoclysis, opioids, scales]);

  it('sugere em vez de mandar', () => {
    for (const text of texts) {
      expect(text, text).not.toMatch(IMPERATIVE_START);
      expect(text, text).not.toMatch(/imediatamente/i);
    }
  });

  it('não traz entidade HTML nem espaço sobrando', () => {
    for (const text of texts) {
      expect(text, text).not.toMatch(/&[a-z]+;/);
      expect(text, text).toBe(text.trim());
    }
  });

  it('tem os módulos da tela inicial do ANY, sem id repetido', () => {
    const ids = content.PALLIATIVE_MODULES.map(({ id }) => id);
    expect(ids).toEqual([
      'identificar',
      'decidir',
      'comunicar',
      'manejar',
      'ferramentas',
      'mitos',
      'referencias',
    ]);
  });

  it('tem 7 categorias do SPICT-BR, 5 passos do SAVED, 6 do REDMAP e 5 do NURSE', () => {
    expect(content.SPICT_CATEGORIES).toHaveLength(7);
    expect(content.SAVED_STEPS.map(({ letter }) => letter).join('')).toBe('SAVED');
    expect(content.REDMAP_STEPS.map(({ title }) => title[0]).join('')).toBe('REDMAP');
    expect(content.NURSE_STEPS.map(({ title }) => title[0]).join('')).toBe('NURSE');
  });

  it('tem uma página por aba de sintomas', () => {
    for (const { id } of content.SYMPTOM_TABS) {
      expect(content.SYMPTOM_PAGES[id].length, id).toBeGreaterThan(0);
    }
  });

  it('tem 24 mitos, ids de 1 a 24, e só um é verdade', () => {
    expect(content.MYTHS.map(({ id }) => id)).toEqual(
      Array.from({ length: 24 }, (_, index) => index + 1),
    );
    expect(content.MYTHS.filter(({ isMyth }) => !isMyth).map(({ id }) => id)).toEqual([22]);
    for (const { id } of content.MYTH_CATEGORIES) {
      expect(
        content.MYTHS.some(({ category }) => category === id),
        id,
      ).toBe(true);
    }
  });

  it('traz procedência com versão e revisão', () => {
    expect(PALLIATIVE_PROVENANCE.source).toContain('PaliaPath');
    expect(PALLIATIVE_PROVENANCE.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(PALLIATIVE_PROVENANCE.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(PALLIATIVE_PROVENANCE.review.status).toBe('pendente');
  });
});
