import { describe, expect, it } from 'vitest';
import { searchTools, TOOLS } from '../catalog';
import { BLOCK_SECTIONS, blockPageTitle } from './sections';
import {
  BLOCK_LIST,
  BLOCKS_PROVENANCE,
  getRegionalBlock,
  isRegionalBlockId,
  LAST_STEPS,
  LAST_WARNING_SIGNS,
  MAX_DOSE_NOTICE,
  REGIONAL_BLOCK_IDS,
  REGIONAL_BLOCKS,
  TOPOGRAPHY,
} from './content';

/** Mesma regra de linguagem das calculadoras (registry.spec.ts, ADR-017). */
const IMPERATIVE_START =
  /(^|[.:;]\s+)(Faça|Inicie|Administre|Realize|Aplique|Intube|Transfunda|Prescreva)\b/;

function allTexts(): string[] {
  return [
    ...REGIONAL_BLOCKS.flatMap((block) => [
      block.name,
      ...block.indications,
      ...block.contraindications,
      ...block.material,
      ...block.technique,
      block.tip?.title ?? '',
      block.tip?.text ?? '',
    ]),
    ...TOPOGRAPHY.flatMap(({ title, mappings }) => [title, ...mappings.map((m) => m.lesion)]),
    ...LAST_WARNING_SIGNS.flatMap(({ title, text }) => [title, text]),
    ...LAST_STEPS.flatMap(({ title, detail }) => [title, detail]),
    MAX_DOSE_NOTICE.text,
  ].filter((text) => text !== '');
}

describe('conteúdo dos bloqueios regionais (CC-330)', () => {
  it('tem os 14 bloqueios, um por id, na ordem dos ids', () => {
    expect(REGIONAL_BLOCKS.map(({ id }) => id)).toEqual([...REGIONAL_BLOCK_IDS]);
    for (const id of REGIONAL_BLOCK_IDS) expect(getRegionalBlock(id).id).toBe(id);
  });

  it('escolhe pela topografia em 14 caminhos, todos para um bloqueio com ficha', () => {
    const mappings = TOPOGRAPHY.flatMap(({ mappings }) => mappings);
    expect(mappings).toHaveLength(14);
    for (const { blockId } of mappings) expect(isRegionalBlockId(blockId)).toBe(true);
    // Cada bloqueio tem um caminho: nenhum fica só na lista.
    expect(new Set(mappings.map(({ blockId }) => blockId))).toEqual(new Set(REGIONAL_BLOCK_IDS));
  });

  it('lista cada bloqueio uma vez, por região', () => {
    const listed = BLOCK_LIST.flatMap(({ blockIds }) => blockIds);
    expect([...listed].sort()).toEqual([...REGIONAL_BLOCK_IDS].sort());
  });

  it('toda ficha tem indicação, contraindicação, material, técnica e anestésico', () => {
    for (const block of REGIONAL_BLOCKS) {
      expect(block.indications.length, block.id).toBeGreaterThan(0);
      expect(block.contraindications.length, block.id).toBeGreaterThan(0);
      expect(block.material.length, block.id).toBeGreaterThan(0);
      expect(block.technique.length, block.id).toBeGreaterThan(0);
      expect(block.anesthetics.length, block.id).toBeGreaterThan(0);
    }
  });

  it('reconhece só os ids dos bloqueios', () => {
    expect(isRegionalBlockId('peng')).toBe(true);
    expect(isRegionalBlockId('lista')).toBe(false);
    expect(isRegionalBlockId('')).toBe(false);
  });

  it('traz procedência com versão e revisão pendente', () => {
    expect(BLOCKS_PROVENANCE.source).toContain('BlockPath');
    expect(BLOCKS_PROVENANCE.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(BLOCKS_PROVENANCE.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(BLOCKS_PROVENANCE.review.status).toBe('pendente');
  });

  it('sugere em vez de mandar', () => {
    for (const text of allTexts()) {
      expect(text, text).not.toMatch(IMPERATIVE_START);
      expect(text, text).not.toMatch(/imediatamente/i);
    }
  });

  it('o aviso de dose recomenda redução como sugestão', () => {
    expect(MAX_DOSE_NOTICE.text).toMatch(/^Considere reduzir/);
  });

  it('LAST tem os cinco passos e os sinais em ordem de gravidade', () => {
    expect(LAST_STEPS).toHaveLength(5);
    expect(LAST_WARNING_SIGNS.map(({ tone }) => tone)).toEqual(['attention', 'critical']);
  });
});

describe('bloqueios no catálogo das Ferramentas', () => {
  it('estão disponíveis e são achados pela técnica, pelo anestésico e pelo LAST', () => {
    expect(TOOLS.find(({ id }) => id === 'bloqueios')?.status).toBe('disponivel');
    for (const query of ['peng', 'fascia iliaca', 'lidocaina', 'LAST', 'emulsao lipidica']) {
      const tools = searchTools(query).flatMap((result) =>
        result.kind === 'tool' ? [result.tool.id] : [],
      );
      expect(tools, query).toContain('bloqueios');
    }
  });
});

describe('rotas dos bloqueios', () => {
  it('seção e ficha não disputam o mesmo endereço', () => {
    const sections = BLOCK_SECTIONS.map(({ id }) => id as string);
    for (const id of REGIONAL_BLOCK_IDS) expect(sections).not.toContain(id);
  });

  it('dá título à seção e à ficha pelo segmento da rota', () => {
    expect(blockPageTitle('dose-maxima')).toBe('Dose máxima');
    expect(blockPageTitle('peng')).toBe('Bloqueio PENG');
    expect(blockPageTitle('xyz')).toBeUndefined();
  });
});
