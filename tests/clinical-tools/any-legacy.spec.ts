import { describe, expect, it } from 'vitest';
import {
  formatDecimal,
  formatQuantity,
  formatWeight,
} from '../../src/shared/clinical-tools/numbers';
import { WEIGHT_RANGES } from '../../src/shared/clinical-tools/ranges';
import { DOSE_STATUS_TONE, type DoseStatus } from '../../src/shared/clinical-tools/tone';

/**
 * CC-303 — testes do branch antigo do ANY (claude/update-test-database-M10pD,
 * revisão 649d2ae) que se aplicam ao que já foi portado, com os nomes novos.
 * Cada `describe` cita o arquivo de origem. Os que testam doses, VNERi,
 * Wells, HACOR, heparina e dengue entram com as ferramentas deles (CC-311,
 * CC-312, CC-317, CC-318, CC-325, CC-327).
 *
 * Duas adaptações deliberadas, pelo ADR-017:
 * - as cores hex do status de dose viraram tom (`DOSE_STATUS_TONE`);
 * - o rótulo "Pediatrico" ganhou acento.
 */

// Origem: v2/src/utils/calculations.test.ts › fmt
describe('fmt → formatDecimal (calculations.test.ts)', () => {
  it('formata numero com virgula (padrao BR)', () => {
    expect(formatDecimal(10.5)).toBe('10,5');
  });

  it('formata com decimais customizadas', () => {
    expect(formatDecimal(10.567, 2)).toBe('10,57');
  });

  it('retorna -- para null', () => {
    expect(formatDecimal(null)).toBe('--');
  });

  it('retorna -- para undefined', () => {
    expect(formatDecimal(undefined)).toBe('--');
  });

  it('retorna -- para NaN', () => {
    expect(formatDecimal(NaN)).toBe('--');
  });

  it('formata zero corretamente', () => {
    expect(formatDecimal(0)).toBe('0,0');
  });
});

// Origem: v2/src/utils/formatters.test.ts
describe('fmt → formatDecimal (formatters.test.ts)', () => {
  it('formata numero com virgula', () => {
    expect(formatDecimal(10.5)).toBe('10,5');
  });

  it('retorna -- para null', () => {
    expect(formatDecimal(null)).toBe('--');
  });

  it('retorna -- para undefined', () => {
    expect(formatDecimal(undefined)).toBe('--');
  });

  it('retorna -- para NaN', () => {
    expect(formatDecimal(NaN)).toBe('--');
  });

  it('respeita casas decimais', () => {
    expect(formatDecimal(3.14159, 3)).toBe('3,142');
  });

  it('formata zero', () => {
    expect(formatDecimal(0, 0)).toBe('0');
  });
});

describe('fmtWeight → formatWeight (formatters.test.ts)', () => {
  it('formata peso com unidade', () => {
    expect(formatWeight(70)).toBe('70,0 kg');
  });

  it('retorna -- kg para null', () => {
    expect(formatWeight(null)).toBe('-- kg');
  });

  it('retorna -- kg para zero', () => {
    expect(formatWeight(0)).toBe('-- kg');
  });
});

describe('fmtDose → formatQuantity (formatters.test.ts)', () => {
  it('formata dose com unidade', () => {
    expect(formatQuantity(0.1, 'mcg/kg/min')).toBe('0,1 mcg/kg/min');
  });

  it('formata com decimais customizadas', () => {
    expect(formatQuantity(5.678, 'mg/kg/h', 2)).toBe('5,68 mg/kg/h');
  });
});

describe('fmtMlh → formatQuantity (formatters.test.ts)', () => {
  it('formata mL/h', () => {
    expect(formatQuantity(6.5, 'mL/h')).toBe('6,5 mL/h');
  });

  it('formata com decimais customizadas', () => {
    expect(formatQuantity(6.5625, 'mL/h', 2)).toBe('6,56 mL/h');
  });
});

describe('statusColors → DOSE_STATUS_TONE (formatters.test.ts)', () => {
  // No ANY: therapeutic #4CAF50 (verde), caution #FFC107 (amarelo), critical #F44336 (vermelho).
  it('tem tom para therapeutic', () => {
    expect(DOSE_STATUS_TONE.therapeutic).toBe('neutral');
  });

  it('tem tom para caution', () => {
    expect(DOSE_STATUS_TONE.caution).toBe('attention');
  });

  it('tem tom para critical', () => {
    expect(DOSE_STATUS_TONE.critical).toBe('critical');
  });
});

describe('statusClasses → DOSE_STATUS_TONE (formatters.test.ts)', () => {
  it('tem tom para cada status', () => {
    expect(Object.keys(DOSE_STATUS_TONE).sort()).toEqual(['caution', 'critical', 'therapeutic']);
  });
});

// Origem: v2/src/types/clinical.test.ts
describe('constantes de peso (clinical.test.ts)', () => {
  it('range adulto: 40-200 kg', () => {
    expect(WEIGHT_RANGES.adulto.min).toBe(40);
    expect(WEIGHT_RANGES.adulto.max).toBe(200);
  });

  it('range pediatrico: 0.5-50 kg', () => {
    expect(WEIGHT_RANGES.pediatrico.min).toBe(0.5);
    expect(WEIGHT_RANGES.pediatrico.max).toBe(50);
  });
});

describe('tipos clinicos (clinical.test.ts)', () => {
  it('DoseStatus aceita os tres valores', () => {
    const statuses: DoseStatus[] = ['therapeutic', 'caution', 'critical'];
    expect(statuses).toHaveLength(3);
  });
});
