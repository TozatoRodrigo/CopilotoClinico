import { describe, expect, it } from 'vitest';
import {
  CALCULATOR_CATEGORIES,
  calculatorName,
  calculatorPathway,
  calculatorStatus,
  normalizeSearchText,
  searchTools,
  TOOL_GROUPS,
  TOOLS,
  type ToolEntry,
  type ToolSearchResult,
} from './catalog';
import { CALCULATOR_CATALOG } from './calculator-catalog';
import { CURB65 } from './calculators/curb65';
import { CALCULATORS } from './registry';

function names(results: ToolSearchResult[]): string[] {
  return results.map((result) =>
    result.kind === 'tool' ? result.tool.name : calculatorName(result.calculator),
  );
}

describe('grupos e ferramentas', () => {
  it('tem os onze grupos do hub, na ordem da história CC-304', () => {
    expect(TOOL_GROUPS.map(({ label }) => label)).toEqual([
      'Calculadoras',
      'Ressuscitação',
      'Via aérea',
      'Choque e sepse',
      'Pediatria',
      'Toxicologia',
      'Metabólico',
      'Ventilação',
      'Sedação e dor',
      'Paliativos',
      'Infecciosas',
    ]);
  });

  it('todo grupo tem ao menos uma ferramenta e nenhum id se repete', () => {
    for (const group of TOOL_GROUPS) {
      expect(
        TOOLS.some((tool) => tool.group === group.id),
        group.id,
      ).toBe(true);
    }
    const ids = TOOLS.map(({ id }) => id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('marca como disponível só a calculadora já portada', () => {
    const available = CALCULATOR_CATALOG.filter(
      (entry) => calculatorStatus(entry) === 'disponivel',
    );
    expect(available.map(({ id }) => id).sort()).toEqual(CALCULATORS.map(({ id }) => id).sort());
  });

  it('lista as 16 categorias de calculadora do ANY', () => {
    expect(CALCULATOR_CATEGORIES).toHaveLength(16);
    expect(CALCULATOR_CATEGORIES[0]).toBe('Cardiologia / SCA');
  });
});

describe('searchTools', () => {
  it('não devolve nada para busca vazia', () => {
    expect(searchTools('   ')).toEqual([]);
  });

  it('acha pelo nome, sem acento e sem diferença de caixa', () => {
    expect(names(searchTools('cha2ds2'))).toEqual(['CHA2DS2-VASc']);
    expect(names(searchTools('INDICE DE CHOQUE'))[0]).toBe('Índice de choque');
  });

  it('acha pelo sinônimo', () => {
    expect(names(searchTools('pcr'))).toContain('Parada cardiorrespiratória (ACLS)');
    expect(names(searchTools('fibrilação atrial'))).toContain('CHA2DS2-VASc');
    expect(names(searchTools('intubacao'))).toContain('Intubação e via aérea difícil');
  });

  it('acha pelo grupo do hub', () => {
    expect(names(searchTools('ressuscitação parada'))).toEqual([
      'Parada cardiorrespiratória (ACLS)',
    ]);
  });

  it('exige todas as palavras da busca', () => {
    const results = names(searchTools('sepse triagem'));
    expect(results).toContain('qSOFA');
    expect(results).not.toContain('Choque séptico');
  });

  it('põe o que já abre antes do "em breve" quando o encaixe é igual', () => {
    // "sepse" só aparece em sinônimos: todos os resultados têm o mesmo encaixe.
    const statuses = searchTools('sepse').map((result) => result.status);
    expect(statuses).toContain('disponivel');
    expect(statuses).toContain('em-breve');
    expect(statuses.lastIndexOf('disponivel')).toBeLessThan(statuses.indexOf('em-breve'));
  });

  it('traz ferramenta ainda não portada como "em breve"', () => {
    const [acls] = searchTools('acls');
    expect(acls).toMatchObject({ kind: 'tool', status: 'em-breve' });
  });
});

describe('normalizeSearchText', () => {
  it('tira acento e caixa', () => {
    expect(normalizeSearchText('  Ressuscitação ')).toBe('ressuscitacao');
  });
});

describe('calculatorPathway (CC-306)', () => {
  const withPathway = { ...CURB65, pathway: { toolId: 'toxicologia' } };
  const tox = (status: ToolEntry['status']): ToolEntry => ({
    id: 'toxicologia',
    name: 'Intoxicações e antídotos',
    description: '',
    group: 'toxicologia',
    synonyms: [],
    status,
  });

  it('não aponta roteiro enquanto ele estiver "em breve"', () => {
    expect(calculatorPathway(withPathway, [tox('em-breve')])).toBeNull();
  });

  it('com o catálogo atual, aponta Toxicologia, que já abre (CC-323)', () => {
    expect(calculatorPathway(withPathway)?.id).toBe('toxicologia');
  });

  it('aponta o roteiro quando ele já abre', () => {
    expect(calculatorPathway(withPathway, [tox('disponivel')])?.id).toBe('toxicologia');
  });

  it('não aponta nada para calculadora sem roteiro', () => {
    expect(calculatorPathway(CURB65, [tox('disponivel')])).toBeNull();
  });
});
