import { existsSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import {
  COPILOTO_CALCULATORS,
  COPILOTO_TOOL_IDS,
  COPILOTO_TOOL_SUBPAGES,
  copilotoToolPaths,
} from './copiloto-tools-snapshot';

const ROOT = join(__dirname, '..', '..', '..');
const CATALOG = join(ROOT, 'src', 'shared', 'clinical-tools', 'catalog.ts');
const CALCULATOR_CATALOG = join(ROOT, 'src', 'shared', 'clinical-tools', 'calculator-catalog.ts');
const PAGES = join(ROOT, 'web', 'src', 'app', '(app)', 'ferramentas');
/** As Ferramentas (feat/ferramentas-any-integrado) já estão nesta base? */
const toolsMerged = existsSync(CATALOG) && existsSync(PAGES);

function stripAccents(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

describe('CC-335/CC-336 — instantâneo das Ferramentas', () => {
  it('ids únicos e prontos para URL', () => {
    const ids = [...COPILOTO_TOOL_IDS, ...COPILOTO_CALCULATORS.map(({ id }) => id)];
    expect(new Set(COPILOTO_TOOL_IDS).size).toBe(15);
    expect(new Set(COPILOTO_CALCULATORS.map(({ id }) => id)).size).toBe(75);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9-]+$/);
  });

  it('o id da calculadora é o do ANY sem acento', () => {
    for (const { id, anyId } of COPILOTO_CALCULATORS) expect(stripAccents(anyId)).toBe(id);
  });

  it('lista hub, roteiros, subpáginas e calculadoras como destinos', () => {
    const subpages = Object.values(COPILOTO_TOOL_SUBPAGES).flat().length;
    expect(copilotoToolPaths().size).toBe(1 + 15 + subpages + 75);
    expect(copilotoToolPaths().has('/ferramentas/acls/ovace')).toBe(true);
    expect(copilotoToolPaths().has('/ferramentas/calculadoras/formula-winters')).toBe(true);
  });

  // Passa a valer sozinho quando as Ferramentas entrarem na base: o
  // instantâneo não pode apontar para tela que não existe.
  it.skipIf(!toolsMerged)('bate com o catálogo e as páginas de verdade', async () => {
    const catalog = (await import(CATALOG)) as { TOOLS: readonly { id: string }[] };
    const calculators = (await import(CALCULATOR_CATALOG)) as {
      CALCULATOR_CATALOG: readonly { id: string; anyId: string }[];
    };
    expect(new Set(catalog.TOOLS.map(({ id }) => id))).toEqual(new Set(COPILOTO_TOOL_IDS));
    expect(calculators.CALCULATOR_CATALOG.map(({ id, anyId }) => ({ id, anyId }))).toEqual(
      COPILOTO_CALCULATORS.map(({ id, anyId }) => ({ id, anyId })),
    );
    for (const tool of COPILOTO_TOOL_IDS) {
      const own = existsSync(join(PAGES, tool, 'page.tsx'));
      expect(own || existsSync(join(PAGES, '[ferramenta]', 'page.tsx')), tool).toBe(true);
    }
    for (const [tool, subpages] of Object.entries(COPILOTO_TOOL_SUBPAGES)) {
      for (const subpage of subpages) {
        expect(existsSync(join(PAGES, tool, subpage, 'page.tsx')), `${tool}/${subpage}`).toBe(true);
      }
    }
    expect(existsSync(join(PAGES, 'calculadoras', '[id]', 'page.tsx'))).toBe(true);
  });
});
