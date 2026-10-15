import { describe, expect, it } from 'vitest';
import {
  buildInsulinNote,
  describeInsulinStatus,
  formatInsulinBolus,
  formatInsulinInfusion,
  insulinAdjustment,
  insulinRow,
  insulinStart,
  insulinStatus,
  insulinTrend,
} from './insulin';

describe('insulinRow / insulinStatus', () => {
  it('usa os limites do ANY', () => {
    const ids = [69, 70, 140, 141, 180, 181, 200, 201, 250, 251, 300, 301, 350, 351].map(
      (glucose) => insulinRow(glucose).id,
    );
    expect(ids).toEqual([
      'hipo',
      'baixa',
      'baixa',
      'alvo',
      'alvo',
      '181-200',
      '181-200',
      '201-250',
      '201-250',
      '251-300',
      '251-300',
      '301-350',
      '301-350',
      'sup350',
    ]);
  });

  it('pinta pela glicemia, com rótulo', () => {
    expect([60, 120, 140, 160, 250, 320].map(insulinStatus)).toEqual([
      'critical',
      'caution',
      'therapeutic',
      'therapeutic',
      'caution',
      'critical',
    ]);
    expect(describeInsulinStatus(60).label).toBe('Hipoglicemia');
    expect(describeInsulinStatus(320)).toMatchObject({
      tone: 'critical',
      label: 'Glicemia muito alta',
    });
  });
});

describe('insulinStart', () => {
  it('segue a tabela: hipo, não iniciar, infusão e bolus', () => {
    expect(insulinStart(60)).toMatchObject({
      bolus: { kind: 'nenhum' },
      infusion: { kind: 'corrigir-hipo' },
    });
    expect(insulinStart(120).infusion).toEqual({ kind: 'nao-iniciar' });
    expect(insulinStart(260)).toMatchObject({
      bolus: { kind: 'ui', units: 6 },
      infusion: { kind: 'ui-h', unitsPerHour: 3, reduction: null },
    });
  });

  it('a partir de 140 o bolus é o da tabela, mesmo 0 (como no ANY)', () => {
    expect(insulinStart(140).bolus).toEqual({ kind: 'ui', units: 0 });
    expect(insulinStart(140).infusion).toEqual({ kind: 'nao-iniciar' });
  });
});

describe('insulinAdjustment', () => {
  it('< 70: parar e glicose 50%', () => {
    expect(insulinAdjustment(60, 120, 3)).toMatchObject({
      bolus: { kind: 'parar' },
      infusion: { kind: 'glicose-50' },
    });
  });

  it('70–140: parar ou cortar pela metade, ou não iniciar sem infusão', () => {
    expect(insulinAdjustment(120, null, 5).infusion).toEqual({
      kind: 'parar-ou-metade',
      halved: 2,
    });
    expect(insulinAdjustment(120, null, 0).infusion).toEqual({ kind: 'nao-iniciar' });
  });

  it('141–180 mantém a infusão atual; acima, a da tabela', () => {
    expect(insulinAdjustment(160, null, 2.5).infusion).toEqual({
      kind: 'ui-h',
      unitsPerHour: 2.5,
      reduction: null,
    });
    expect(insulinAdjustment(260, null, 1)).toMatchObject({
      bolus: { kind: 'ui', units: 6 },
      infusion: { kind: 'ui-h', unitsPerHour: 3 },
    });
  });

  it('corta pela queda da última hora: > 100 pela metade, > 50 menos 1', () => {
    expect(insulinAdjustment(190, 300, 4).infusion).toEqual({
      kind: 'ui-h',
      unitsPerHour: 2,
      reduction: 'metade',
    });
    expect(insulinAdjustment(190, 250, 4).infusion).toEqual({
      kind: 'ui-h',
      unitsPerHour: 3,
      reduction: 'menos-1',
    });
    expect(insulinAdjustment(190, 230, 4).infusion).toMatchObject({
      unitsPerHour: 2,
      reduction: null,
    });
  });
});

describe('insulinTrend', () => {
  it('lê a variação como o ANY', () => {
    expect(insulinTrend(190, 300)).toEqual({
      drop: 110,
      reading: 'queda-rapida',
      dropText: '↓ 110 mg/dL/h',
      readingText: 'Queda rápida → ↓ 50%',
    });
    expect(insulinTrend(250, 230)).toMatchObject({
      dropText: '↑ 20 mg/dL/h',
      readingText: 'Subindo → seguir tabela',
    });
    expect(insulinTrend(200, 200).reading).toBe('queda-leve');
  });
});

describe('textos', () => {
  it('escreve bolus e infusão por extenso', () => {
    expect(formatInsulinBolus({ kind: 'nenhum' })).toBe('—');
    expect(formatInsulinBolus({ kind: 'ui', units: 6 })).toBe('6 UI');
    expect(formatInsulinInfusion({ kind: 'ui-h', unitsPerHour: 2.5, reduction: 'menos-1' })).toBe(
      '2,5 UI/h (↓ 1)',
    );
    expect(formatInsulinInfusion({ kind: 'parar-ou-metade', halved: 2 })).toBe(
      'Parar ou reduzir 50% (2 UI/h)',
    );
  });

  it('monta o texto do prontuário do ajuste', () => {
    expect(
      buildInsulinNote({
        phase: 'ajuste',
        glucose: 190,
        previous: 250,
        currentInfusion: 4,
        suggestion: insulinAdjustment(190, 250, 4),
      }),
    ).toBe(
      [
        'Insulina regular em infusão (ajuste): glicemia 190 mg/dL (faixa 181 - 200).',
        '- Bolus: —',
        '- Infusão: 3 UI/h (↓ 1)',
        '- Infusão atual: 4 UI/h',
        '- Glicemia 1 h antes: 250 mg/dL (↓ 60 mg/dL/h)',
        '- Diluição: 100 UI (1 frasco 10mL — 100UI/mL) + SF 0,9% 100 mL (1 UI/mL; UI/h = mL/h)',
      ].join('\n'),
    );
  });
});
