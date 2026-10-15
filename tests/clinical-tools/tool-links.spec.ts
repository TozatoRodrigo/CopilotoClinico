import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';
import { describe, expect, it } from 'vitest';
import { HS_CAUSES, TS_CAUSES } from '../../src/shared/clinical-tools/acls/reversible-causes';
import { TOOLS } from '../../src/shared/clinical-tools/catalog';
import { findInfusionItem } from '../../src/shared/clinical-tools/infusions/items';
import { CALCULATORS } from '../../src/shared/clinical-tools/registry';
import { SHOCK_INFUSION_DRUGS } from '../../src/shared/clinical-tools/shock/septic-shock';
import { UNDIFFERENTIATED_TABS } from '../../src/shared/clinical-tools/shock/undifferentiated';
import { TEP_INFUSION_DRUGS } from '../../src/shared/clinical-tools/tep/links';

/**
 * CC-331 — todo link de uma ferramenta para outra abre algo que existe. O
 * ANY v2 linkava `?drug=` para drogas que a tela nem lia; aqui um `?droga=`
 * para droga que não está nas Infusões, ou um `?de=` para ferramenta que não
 * existe, quebra o teste antes de chegar ao médico.
 */

const ROOT = process.cwd();
const SCANNED = ['src/shared/clinical-tools', 'web/src'];
const CODE_FILE = /\.(ts|tsx)$/;

function codeFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    if (entry === 'node_modules' || entry === '.next' || entry === '__tests__') return [];
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return codeFiles(path);
    return CODE_FILE.test(entry) && !/\.(spec|test)\.tsx?$/.test(entry) ? [path] : [];
  });
}

interface Found {
  file: string;
  id: string;
}

/** Ids que o código escreve à mão no endereço ou passa para o montador do link. */
function scan(pattern: RegExp): Found[] {
  return SCANNED.flatMap((dir) => codeFiles(join(ROOT, dir))).flatMap((path) => {
    const content = readFileSync(path, 'utf-8');
    return [...content.matchAll(pattern)].map((match) => ({
      file: relative(ROOT, path),
      id: match[1] ?? '',
    }));
  });
}

const TOOL_IDS = new Set(TOOLS.map(({ id }) => id));

describe('links entre ferramentas (CC-331)', () => {
  it('toda droga que outra ferramenta abre existe nas Infusões', () => {
    const declared = [...Object.keys(SHOCK_INFUSION_DRUGS), ...TEP_INFUSION_DRUGS];
    const written = scan(/droga=([a-z0-9-]+)/g)
      .concat(scan(/infusionHref\(\s*'([a-z0-9-]+)'/g))
      .concat(scan(/infusionsHref\(\s*'([a-z0-9-]+)'/g));
    expect(written.length).toBeGreaterThan(0);
    const missing = [
      ...declared.filter((id) => !findInfusionItem(id)).map((id) => ({ file: 'motor', id })),
      ...written.filter(({ id }) => !findInfusionItem(id)),
    ];
    expect(missing).toEqual([]);
  });

  it('toda ferramenta de destino ou de origem existe no catálogo', () => {
    const written = scan(/toolHref\(\s*'([a-z0-9-]+)'/g)
      .concat(scan(/\{\s*tool:\s*'([a-z0-9-]+)'\s*\}/g))
      .concat(scan(/toolId:\s*'([a-z0-9-]+)'/g));
    expect(written.length).toBeGreaterThan(0);
    expect(written.filter(({ id }) => !TOOL_IDS.has(id))).toEqual([]);
  });

  it('as causas reversíveis do ACLS apontam para ferramentas do catálogo', () => {
    const targets = [...HS_CAUSES, ...TS_CAUSES].flatMap(({ link }) => (link ? [link] : []));
    expect(targets).toEqual(expect.arrayContaining(['via-aerea', 'toxicologia']));
    expect(targets.filter((id) => !TOOL_IDS.has(id))).toEqual([]);
  });

  it('"Abrir no roteiro" das calculadoras abre roteiro e aba que existem', () => {
    const pathways = CALCULATORS.flatMap((definition) =>
      definition.pathway ? [{ calculator: definition.id, ...definition.pathway }] : [],
    );
    expect(pathways.map(({ calculator, toolId }) => [calculator, toolId])).toEqual(
      expect.arrayContaining([
        ['ciwa-ar', 'toxicologia'],
        ['vti-classificacao', 'choque-indiferenciado'],
      ]),
    );
    for (const pathway of pathways) {
      expect(TOOL_IDS.has(pathway.toolId)).toBe(true);
      if (pathway.toolId === 'choque-indiferenciado' && pathway.query?.aba) {
        expect(UNDIFFERENTIATED_TABS.map(({ id }) => id)).toContain(pathway.query.aba);
      }
    }
  });
});
