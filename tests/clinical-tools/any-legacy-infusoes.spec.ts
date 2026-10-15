import { describe, expect, it } from 'vitest';
import {
  doseStatus,
  doseToMlh,
  mlhToDose,
  type DoseSettings,
} from '../../src/shared/clinical-tools/infusions/dose';
import {
  INFUSION_CATEGORIES,
  INFUSION_DRUGS,
} from '../../src/shared/clinical-tools/infusions/drugs';

/**
 * CC-311 — testes do branch antigo do ANY (claude/update-test-database-M10pD,
 * revisão 649d2ae) que cobrem as infusões, com os nomes novos. Cada
 * `describe` cita o arquivo de origem. Os de heparina entram no CC-312.
 *
 * Duas adaptações deliberadas:
 * - `getDoseStatus(dose, min, max, critical)` do branch antigo virou
 *   `doseStatus(dose, faixa)`. A semântica antiga ("acima do máximo até o
 *   crítico = atenção") é a do v4 com o limiar de atenção no teto da faixa,
 *   que é o que `faixa()` monta;
 * - `calculateDose` virou `doseToMlh` + `doseStatus` (o motor não junta os dois).
 */

/** Faixa só com os números, como os argumentos do `getDoseStatus` antigo. */
function faixa(min: number, max: number, critical?: number): DoseSettings {
  return {
    mode: null,
    min,
    max,
    step: 0.01,
    defaultDose: min,
    caution: max,
    critical: critical ?? max,
    rangeLabel: '',
    bolus: null,
  };
}

// Origem: v2/src/data/drugConfigs.test.ts
describe('drugConfigs → INFUSION_DRUGS (drugConfigs.test.ts)', () => {
  it('tem pelo menos 10 drogas configuradas', () => {
    expect(INFUSION_DRUGS.length).toBeGreaterThanOrEqual(10);
  });

  it('todas as drogas tem campos obrigatorios', () => {
    for (const drug of INFUSION_DRUGS) {
      expect(drug.id, `${drug.name}: id`).toBeTruthy();
      expect(drug.name, `${drug.id}: name`).toBeTruthy();
      expect(drug.concentration, `${drug.id}: concentration`).toBeGreaterThan(0);
      expect(drug.doseMin, `${drug.id}: doseMin`).toBeGreaterThanOrEqual(0);
      expect(drug.doseMax, `${drug.id}: doseMax`).toBeGreaterThan(drug.doseMin);
      expect(drug.doseStep, `${drug.id}: doseStep`).toBeGreaterThan(0);
      expect(drug.factor, `${drug.id}: factor`).toBeGreaterThan(0);
    }
  });

  it('ids sao unicos', () => {
    const ids = INFUSION_DRUGS.map((drug) => drug.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('doseDefault esta dentro do range', () => {
    for (const drug of INFUSION_DRUGS) {
      expect(drug.doseDefault, `${drug.id}: doseDefault >= doseMin`).toBeGreaterThanOrEqual(
        drug.doseMin,
      );
      expect(drug.doseDefault, `${drug.id}: doseDefault <= doseMax`).toBeLessThanOrEqual(
        drug.doseMax,
      );
    }
  });

  it('noradrenalina tem configuracao correta', () => {
    const nora = INFUSION_DRUGS.find((drug) => drug.id === 'noradrenalina');
    expect(nora).toBeDefined();
    expect(nora?.concentration).toBe(64);
    expect(nora?.doseUnit).toBe('mcg/kg/min');
    expect(nora?.usesWeight).toBe(true);
    expect(nora?.factor).toBe(60);
  });

  it('aliases incluem nomes comerciais comuns', () => {
    const nora = INFUSION_DRUGS.find((drug) => drug.id === 'noradrenalina');
    expect(nora?.aliases).toContain('nora');
    expect(nora?.aliases).toContain('norepinefrina');
  });

  it('categorias sao validas', () => {
    const validCategories: string[] = INFUSION_CATEGORIES.map(({ id }) => id);
    for (const drug of INFUSION_DRUGS) {
      expect(validCategories, `${drug.id}: categoria invalida ${drug.category}`).toContain(
        drug.category,
      );
    }
  });

  it('diluicoes tem concentracoes positivas', () => {
    for (const drug of INFUSION_DRUGS) {
      for (const dilution of drug.dilutions ?? []) {
        expect(dilution.concentration, `${drug.id} diluicao ${dilution.label}`).toBeGreaterThan(0);
        expect(dilution.label).toBeTruthy();
      }
    }
  });

  it('cautionThreshold < criticalThreshold quando ambos existem', () => {
    for (const drug of INFUSION_DRUGS) {
      if (drug.cautionThreshold && drug.criticalThreshold) {
        expect(
          drug.cautionThreshold,
          `${drug.id}: cautionThreshold deve ser < criticalThreshold`,
        ).toBeLessThan(drug.criticalThreshold);
      }
    }
  });
});

// Origem: v2/src/utils/calculations.test.ts
describe('doseToMlh (calculations.test.ts)', () => {
  it('calcula mL/h com peso (mcg/kg/min)', () => {
    // Noradrenalina: 0.1 mcg/kg/min, 70kg, 64 mcg/mL, fator 60
    expect(doseToMlh(0.1, 70, 64, 60, true)).toBeCloseTo(6.5625, 2);
  });

  it('calcula mL/h sem peso (dose fixa)', () => {
    // Droga sem peso: dose 10, concentracao 5, fator 1
    expect(doseToMlh(10, 70, 5, 1, false)).toBe(2);
  });

  it('retorna 0 quando dose e 0', () => {
    expect(doseToMlh(0, 70, 64, 60, true)).toBe(0);
  });
});

describe('mlhToDose (calculations.test.ts)', () => {
  it('calcula dose a partir de mL/h (inverso de doseToMlh)', () => {
    expect(mlhToDose(6.5625, 70, 64, 60, true)).toBeCloseTo(0.1, 4);
  });

  it('calcula dose sem peso', () => {
    expect(mlhToDose(2, 70, 5, 1, false)).toBe(10);
  });

  it('e inversao exata de doseToMlh', () => {
    const mlh = doseToMlh(0.25, 80, 64, 60, true);
    expect(mlhToDose(mlh, 80, 64, 60, true)).toBeCloseTo(0.25, 6);
  });
});

describe('getDoseStatus → doseStatus (calculations.test.ts)', () => {
  it('retorna therapeutic dentro do range', () => {
    expect(doseStatus(0.1, faixa(0.01, 3.0))).toBe('therapeutic');
  });

  it('retorna critical abaixo do minimo', () => {
    expect(doseStatus(0.005, faixa(0.01, 3.0))).toBe('critical');
  });

  it('retorna critical acima do maximo sem threshold', () => {
    expect(doseStatus(3.5, faixa(0.01, 3.0))).toBe('critical');
  });

  it('retorna caution entre max e criticalThreshold', () => {
    // max=1, criticalThreshold=2, dose=1.5 -> caution
    expect(doseStatus(1.5, faixa(0.01, 1, 2))).toBe('caution');
  });

  it('retorna critical acima do criticalThreshold', () => {
    expect(doseStatus(2.5, faixa(0.01, 1, 2))).toBe('critical');
  });

  it('retorna therapeutic no limite minimo exato', () => {
    expect(doseStatus(0.01, faixa(0.01, 3.0))).toBe('therapeutic');
  });

  it('retorna therapeutic no limite maximo exato', () => {
    expect(doseStatus(3.0, faixa(0.01, 3.0))).toBe('therapeutic');
  });
});

describe('calculateDose → doseToMlh + doseStatus (calculations.test.ts)', () => {
  it('retorna dose, mlh e status corretos', () => {
    expect(doseToMlh(0.1, 70, 64, 60, true)).toBeCloseTo(6.5625, 2);
    expect(doseStatus(0.1, faixa(0.01, 3.0))).toBe('therapeutic');
  });

  it('marca critical para dose acima do range', () => {
    expect(doseStatus(5, faixa(0.01, 3.0))).toBe('critical');
  });
});
