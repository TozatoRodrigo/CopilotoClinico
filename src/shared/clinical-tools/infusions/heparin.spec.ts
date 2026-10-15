import { describe, expect, it } from 'vitest';
import {
  buildHeparinNote,
  describeHeparinStatus,
  heparinAdjustment,
  heparinNomogramRow,
  heparinStart,
  heparinStatus,
  HEPARIN_PROTOCOL,
} from './heparin';

describe('heparinStart', () => {
  it('SCA: 60 UI/kg com teto de 4.000 e 12 UI/kg/h com teto de 1.000', () => {
    expect(heparinStart(60, 'sca')).toEqual({
      bolusUnits: 3600,
      bolusVolumeMl: 36,
      unitsPerHour: 720,
      mlh: 7.2,
    });
    expect(heparinStart(100, 'sca')).toMatchObject({
      bolusUnits: 4000,
      unitsPerHour: 1000,
      mlh: 10,
    });
  });

  it('TEP/TEV: 80 UI/kg e 18 UI/kg/h, sem teto', () => {
    expect(heparinStart(100, 'tep')).toMatchObject({
      bolusUnits: 8000,
      unitsPerHour: 1800,
      mlh: 18,
    });
  });
});

describe('heparinNomogramRow / heparinStatus', () => {
  it('usa os limites do ANY: < 1,2; < 1,5; ≤ 2,5; ≤ 3,0', () => {
    const ids = [1.19, 1.2, 1.49, 1.5, 2.5, 2.51, 3.0, 3.01].map(
      (ratio) => heparinNomogramRow(ratio).id,
    );
    expect(ids).toEqual(['sub12', '12-15', '12-15', 'alvo', 'alvo', '25-30', '25-30', 'sup30']);
  });

  it('pinta pelo TTPa: alvo neutro, perto do alvo atenção, longe crítico', () => {
    expect([1.1, 1.3, 2, 2.8, 3.5].map(heparinStatus)).toEqual([
      'critical',
      'caution',
      'therapeutic',
      'caution',
      'critical',
    ]);
    expect(describeHeparinStatus(1.1)).toEqual({
      status: 'critical',
      tone: 'critical',
      label: 'TTPa muito baixo',
    });
    expect(describeHeparinStatus(2.8).label).toBe('TTPa acima do alvo');
  });
});

describe('heparinAdjustment', () => {
  it('TTPa < 1,2: bolus de 80 UI/kg e +4 UI/kg/h sobre a dose atual', () => {
    expect(heparinAdjustment(70, 'tep', 1.1, 18)).toEqual({
      row: HEPARIN_PROTOCOL.nomogram[0],
      extraBolusUnits: 5600,
      extraBolusMl: 56,
      newDosePerKg: 22,
      unitsPerHour: 1540,
      mlh: 15.4,
      pauseOneHour: false,
    });
  });

  it('sem dose atual, parte da dose inicial da indicação', () => {
    expect(heparinAdjustment(70, 'sca', 1.3, null).newDosePerKg).toBe(14);
  });

  it('TTPa > 3,0: parar 1 hora e −3 UI/kg/h, sem passar de zero', () => {
    const result = heparinAdjustment(70, 'sca', 3.5, 2);
    expect(result).toMatchObject({ pauseOneHour: true, newDosePerKg: 0, extraBolusUnits: 0 });
  });
});

describe('buildHeparinNote', () => {
  it('descreve o início e o ajuste para o prontuário', () => {
    expect(
      buildHeparinNote({ indication: 'sca', weightKg: 70, start: heparinStart(70, 'sca') }),
    ).toBe(
      [
        'Heparina (SCA), início: bolus 4000 UI; infusão 840 UI/h = 8,4 mL/h.',
        '- Regra: bolus 60 UI/kg (máx 4.000 UI); infusão 12 UI/kg/h (máx 1.000 UI/h)',
        '- Peso: 70 kg',
        '- Diluição: 25.000 UI (1 frasco 5mL — 5.000UI/mL) + SF 0,9% qsp 250 mL (100 UI/mL)',
      ].join('\n'),
    );
    const note = buildHeparinNote({
      indication: 'tep',
      weightKg: 70,
      adjustment: { ratio: 3.2, result: heparinAdjustment(70, 'tep', 3.2, null) },
    });
    expect(note).toContain('ajuste por TTPa/R 3,2 (faixa > 3,0): nova dose 15,0 UI/kg/h');
    expect(note).toContain('- Nomograma: parar a infusão por 1 hora');
  });
});
