import { describe, expect, it } from 'vitest';
import { SHOCK_INDEX } from '../calculators/shock-index';
import {
  AIRWAY_RANGES,
  airwayShockIndex,
  formatShockIndex,
  heartRateAlert,
  systolicAlert,
} from './vitals';

describe('índice de choque do CRASH', () => {
  it('acima de 1,0 marca o H, com o tom crítico e o rótulo junto', () => {
    const shockIndex = airwayShockIndex(130, 100);
    expect(shockIndex).toMatchObject({ value: 1.3, tone: 'critical', marksH: true });
    expect(shockIndex.label).toBe('Acima de 1,0 (marca o H)');
    expect(formatShockIndex(shockIndex)).toBe('1,30');
  });

  it('1,0 exato não marca; 1,005 marca pela razão, mas aparece como 1,00 (como no ANY)', () => {
    expect(airwayShockIndex(100, 100)).toMatchObject({
      value: 1,
      marksH: false,
      tone: 'attention',
    });
    expect(airwayShockIndex(201, 200)).toMatchObject({ value: 1, marksH: true, tone: 'critical' });
  });

  it('0,7 é neutro e acima de 0,7 é atenção', () => {
    expect(airwayShockIndex(70, 100).tone).toBe('neutral');
    expect(airwayShockIndex(71, 100).tone).toBe('attention');
  });

  it('FC e PAS aceitam as faixas da calculadora de índice de choque', () => {
    const [hr, sbp] = SHOCK_INDEX.inputs;
    expect(AIRWAY_RANGES.heartRate).toEqual({ min: hr?.min, max: hr?.max, unit: hr?.unit });
    expect(AIRWAY_RANGES.systolic).toEqual({ min: sbp?.min, max: sbp?.max, unit: sbp?.unit });
  });
});

describe('avisos de FC e PAS', () => {
  it('FC: taquicardia e bradicardia, importante em vermelho', () => {
    expect(heartRateAlert(121)).toEqual({ tone: 'critical', label: 'Taquicardia importante' });
    expect(heartRateAlert(120)).toEqual({ tone: 'attention', label: 'Taquicardia' });
    expect(heartRateAlert(100)).toBeNull();
    expect(heartRateAlert(60)).toBeNull();
    expect(heartRateAlert(59)).toEqual({ tone: 'attention', label: 'Bradicardia' });
    expect(heartRateAlert(49)).toEqual({ tone: 'critical', label: 'Bradicardia importante' });
  });

  it('PAS: hipotensão, limítrofe e hipertensão', () => {
    expect(systolicAlert(89)).toEqual({ tone: 'critical', label: 'Hipotensão' });
    expect(systolicAlert(99)).toEqual({ tone: 'attention', label: 'PAS limítrofe' });
    expect(systolicAlert(100)).toBeNull();
    expect(systolicAlert(180)).toBeNull();
    expect(systolicAlert(181)).toEqual({ tone: 'attention', label: 'Hipertensão' });
  });
});
