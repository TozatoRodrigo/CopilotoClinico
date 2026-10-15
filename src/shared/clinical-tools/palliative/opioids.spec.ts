import { describe, expect, it } from 'vitest';
import { formatCompact } from '../numbers';
import {
  buildOpioidChartNote,
  convertOpioid,
  formatOpioidDose,
  isOpioidId,
  OPIOID_EQUIVALENCE_TABLE,
  OPIOID_IDS,
  OPIOIDS,
  opioid,
  type OpioidConversion,
  type OpioidId,
} from './opioids';

function complete(conversion: OpioidConversion) {
  if (conversion.status !== 'complete')
    throw new Error(`esperava conta, veio ${conversion.status}`);
  return conversion;
}

function convert(from: OpioidId, to: OpioidId, dose: string): string {
  return formatOpioidDose(complete(convertOpioid({ from, to, dose })).value);
}

/**
 * Casos-âncora da própria tabela de equivalência do ANY (30 mg de morfina VO
 * e os equivalentes), já com os 75% do ANY. São referência até os casos do
 * Dr. Gustavo Moreira (CC-329, "casos de referência") entrarem aqui.
 */
describe('convertOpioid — casos-âncora da tabela do ANY', () => {
  it.each([
    ['morfina-vo', 'morfina-ev', '30', '7,5'],
    ['morfina-ev', 'morfina-vo', '10', '22,5'],
    ['tramadol', 'morfina-vo', '300', '22,5'],
    ['codeina', 'morfina-vo', '200', '22,5'],
    ['fentanil-ev', 'morfina-vo', '25', '45,0'],
    ['morfina-vo', 'fentanil-ev', '60', '18,8'],
    ['morfina-vo', 'tramadol', '30', '225,0'],
  ] as const)('%s → %s, %s: %s', (from, to, dose, expected) => {
    expect(convert(from, to, dose)).toBe(expected);
  });

  it('aplica os 75% também quando origem e destino são o mesmo opioide (como o ANY)', () => {
    expect(convert('morfina-vo', 'morfina-vo', '60')).toBe('45,0');
  });

  it('devolve o equivalente de morfina VO e a dose antes da redução', () => {
    expect(convertOpioid({ from: 'fentanil-ev', to: 'morfina-ev', dose: '50' })).toEqual({
      status: 'complete',
      dose: 50,
      morphineEquivalent: 120,
      calculated: 40,
      value: 30,
    });
  });

  it('aceita vírgula decimal', () => {
    expect(convert('morfina-ev', 'morfina-vo', '2,5')).toBe('5,6');
  });
});

describe('convertOpioid — metadona e validação', () => {
  it.each(OPIOID_IDS)('metadona com %s não converte, com ou sem dose', (other) => {
    expect(convertOpioid({ from: 'metadona', to: other, dose: '' })).toEqual({
      status: 'nao-linear',
    });
    expect(convertOpioid({ from: other, to: 'metadona', dose: '30' })).toEqual({
      status: 'nao-linear',
    });
  });

  it('sem dose fica pendente sem erro', () => {
    expect(convertOpioid({ from: 'morfina-vo', to: 'tramadol', dose: '  ' })).toEqual({
      status: 'pending',
      error: null,
    });
  });

  it('recusa zero, negativo, texto e milhar ambíguo', () => {
    for (const dose of ['0', '-10', 'abc', '1.500']) {
      const result = convertOpioid({ from: 'morfina-vo', to: 'tramadol', dose });
      expect(result.status, dose).toBe('pending');
      expect(result.status === 'pending' && result.error, dose).not.toBeNull();
    }
  });

  it('recusa fora da faixa do opioide de origem, com a unidade dele', () => {
    const result = convertOpioid({ from: 'fentanil-ev', to: 'morfina-vo', dose: '1001' });
    expect(result).toMatchObject({
      status: 'pending',
      error: { kind: 'out-of-range', message: 'Fora da faixa aceita: 1 a 1000 mcg/h.' },
    });
  });

  it.each(OPIOIDS.map((definition) => [definition.id, definition] as const))(
    '%s aceita os limites da faixa',
    (_id, definition) => {
      if (definition.rule.kind !== 'linear') return;
      for (const limit of [definition.range.min, definition.range.max]) {
        expect(
          convertOpioid({ from: definition.id, to: 'morfina-vo', dose: formatCompact(limit) })
            .status,
        ).toBe('complete');
      }
    },
  );
});

describe('opioides — dado', () => {
  it('a tabela de equivalência mostra o mesmo fator usado na conta', () => {
    for (const row of OPIOID_EQUIVALENCE_TABLE) {
      const { rule } = opioid(row.opioid);
      expect(row.factor, row.opioid).toBe(
        rule.kind === 'linear' ? formatCompact(rule.factor) : '-',
      );
    }
  });

  it('fentanil em mcg/h e os demais em mg/24 h', () => {
    expect(OPIOIDS.map(({ id, unit }) => [id, unit])).toEqual([
      ['morfina-vo', 'mg/24 h'],
      ['morfina-ev', 'mg/24 h'],
      ['tramadol', 'mg/24 h'],
      ['codeina', 'mg/24 h'],
      ['fentanil-ev', 'mcg/h'],
      ['metadona', 'mg/24 h'],
    ]);
  });

  it('reconhece só ids de opioide', () => {
    expect(isOpioidId('codeina')).toBe(true);
    expect(isOpioidId('oxicodona')).toBe(false);
  });
});

describe('buildOpioidChartNote', () => {
  it('traz a conversão, o equivalente de morfina, a sugestão e a referência', () => {
    const result = complete(convertOpioid({ from: 'tramadol', to: 'morfina-ev', dose: '400' }));
    expect(buildOpioidChartNote({ from: 'tramadol', to: 'morfina-ev' }, result)).toBe(
      [
        'Conversão de opioides: Tramadol VO 400 mg/24 h → Morfina EV/SC 10,0 mg/24 h (75% da dose calculada).',
        '- Equivalente de morfina VO: 40,0 mg/24 h',
        '- Dose calculada (100%): 13,3 mg/24 h',
        'Sugestão: Ao trocar, considere iniciar com 75% da dose calculada.',
        'Referência: tabela de equianalgesia do PaliaPath (ANY App v4).',
      ].join('\n'),
    );
  });
});
