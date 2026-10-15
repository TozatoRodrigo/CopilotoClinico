import { describe, expect, it } from 'vitest';
import {
  dengueHydration,
  fillVolumeText,
  formatFigureDetail,
  formatMilliliters,
  hydrationForWeight,
} from './hydration';

/**
 * Casos de referência com contas feitas à mão (doses e limiares-chave do MS
 * no ANY). Os casos do Dr. Gustavo Moreira entram aqui quando chegarem (CC-310).
 */
describe('dengueHydration — casos de referência', () => {
  it.each([
    // peso, VO/dia, SRO, líquidos, IV mL/h, IV 2 h, manutenção, bolus, albumina 0,5 e 1 g/kg
    [40, 2400, 800, 1600, 400, 800, 1000, 800, 100, 200],
    [70, 4200, 1400, 2800, 700, 1400, 1750, 1400, 175, 350],
    [72.5, 4350, 1450, 2900, 725, 1450, 1812.5, 1450, 181.25, 362.5],
    [200, 12000, 4000, 8000, 2000, 4000, 5000, 4000, 500, 1000],
  ])(
    '%s kg',
    (weight, oral, sro, liquids, hourly, twoHours, maintenance, bolus, albLow, albHigh) => {
      const h = dengueHydration(weight);
      expect(h.oralTotal).toBeCloseTo(oral, 9);
      expect(h.oralSro).toBeCloseTo(sro, 9);
      expect(h.oralLiquids).toBeCloseTo(liquids, 9);
      expect(h.ivHourly).toBeCloseTo(hourly, 9);
      expect(h.iv2h).toBeCloseTo(twoHours, 9);
      expect(h.maintenance6h).toBeCloseTo(maintenance, 9);
      expect(h.maintenance8h).toBeCloseTo(maintenance, 9);
      expect(h.bolus).toBeCloseTo(bolus, 9);
      expect(h.albuminLow).toBeCloseTo(albLow, 9);
      expect(h.albuminHigh).toBeCloseTo(albHigh, 9);
    },
  );
});

describe('hydrationForWeight', () => {
  it('aceita vírgula e calcula dentro de 40–200 kg', () => {
    const result = hydrationForWeight('72,5');
    expect(result.ok && result.hydration.ivHourly).toBe(725);
  });

  it('não calcula fora da faixa adulta nem com texto ambíguo', () => {
    expect(hydrationForWeight('39,9')).toMatchObject({
      ok: false,
      error: { kind: 'out-of-range' },
    });
    expect(hydrationForWeight('200,1')).toMatchObject({ ok: false });
    expect(hydrationForWeight('')).toMatchObject({ ok: false, error: { kind: 'empty' } });
    expect(hydrationForWeight('1.500')).toMatchObject({
      ok: false,
      error: { kind: 'ambiguous-separator' },
    });
  });
});

describe('formatMilliliters', () => {
  it('arredonda e põe ponto de milhar', () => {
    expect(formatMilliliters(4200)).toBe('4.200');
    expect(formatMilliliters(12000)).toBe('12.000');
    expect(formatMilliliters(291.6666)).toBe('292');
    expect(formatMilliliters(181.25)).toBe('181');
    expect(formatMilliliters(999.5)).toBe('1.000');
  });

  it('mostra "--" sem valor', () => {
    expect(formatMilliliters(null)).toBe('--');
    expect(formatMilliliters(undefined)).toBe('--');
    expect(formatMilliliters(Number.NaN)).toBe('--');
  });
});

describe('fillVolumeText e formatFigureDetail', () => {
  const h = dengueHydration(70);

  it('preenche volume e vazão', () => {
    expect(fillVolumeText('({maintenance6h} mL → {maintenance6h/6} mL/h)', h)).toBe(
      '(1.750 mL → 292 mL/h)',
    );
    expect(fillVolumeText('({maintenance6h} mL → {maintenance6h/6} mL/h)', null)).toBe(
      '(-- mL → -- mL/h)',
    );
  });

  it('falha alto com marcador desconhecido', () => {
    expect(() => fillVolumeText('{dose}', h)).toThrow('Marcador de volume desconhecido');
  });

  it('formata vazão e frascos de albumina', () => {
    expect(formatFigureDetail({ kind: 'rate', volume: 'maintenance8h', hours: 8 }, h)).toBe(
      '219 mL/h',
    );
    expect(formatFigureDetail({ kind: 'vials', volume: 'albuminLow' }, h)).toBe('4 frascos');
    expect(formatFigureDetail({ kind: 'vials', volume: 'albuminLow' }, null)).toBe('--');
  });
});
