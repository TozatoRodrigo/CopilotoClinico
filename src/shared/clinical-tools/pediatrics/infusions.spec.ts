import { describe, expect, it } from 'vitest';
import {
  doseDecimals,
  evaluateInfusionDose,
  evaluateInfusionRate,
  formatConcentration,
  formatRate,
  getPediatricInfusion,
  INFUSION_CATEGORIES,
  PEDIATRIC_INFUSIONS,
  weightBand,
  WEIGHT_BANDS,
} from './infusions';

function infusion(id: string) {
  const found = getPediatricInfusion(id);
  if (!found) throw new Error(`infusão ${id} não existe`);
  return found;
}

describe('infusões contínuas pediátricas (CC-319)', () => {
  it('são as 16 do PedGuide v4, sem id repetido, nos três grupos', () => {
    expect(PEDIATRIC_INFUSIONS).toHaveLength(16);
    expect(new Set(PEDIATRIC_INFUSIONS.map(({ id }) => id)).size).toBe(16);
    expect(new Set(PEDIATRIC_INFUSIONS.map(({ category }) => category))).toEqual(
      new Set(INFUSION_CATEGORIES.map(({ id }) => id)),
    );
  });

  it('cada faixa de peso tem diluição com volume final coerente e dose inicial dentro da faixa', () => {
    for (const item of PEDIATRIC_INFUSIONS) {
      expect(item.defaultDose).toBeGreaterThanOrEqual(item.range.min);
      expect(item.defaultDose).toBeLessThanOrEqual(item.range.max);
      for (const band of WEIGHT_BANDS) {
        const dilution = item.dilutions[band];
        expect(dilution.drugMl + dilution.diluentMl, `${item.id} ${band}`).toBe(
          dilution.finalVolumeMl,
        );
        expect(dilution.concentration).toBeGreaterThan(0);
      }
    }
  });

  it('separa as faixas em 15 e 40 kg (40 kg ainda é a faixa do meio)', () => {
    expect(weightBand(14.9)).toBe('ate-15');
    expect(weightBand(15)).toBe('15-a-40');
    expect(weightBand(40)).toBe('15-a-40');
    expect(weightBand(40.1)).toBe('acima-40');
  });

  it('converte dose em mL/h na diluição da faixa do peso', () => {
    // Dobutamina 5 mcg/kg/min, 10 kg, 1785 mcg/mL: 5 × 10 × 60 ÷ 1785 = 1,68 mL/h.
    const result = evaluateInfusionDose(infusion('dobutamina'), 10, '5');
    expect(result).toMatchObject({ status: 'pronto', band: 'ate-15' });
    expect(result.status === 'pronto' && formatRate(result.rate)).toBe('1,7');
    // Fentanil é por hora: 1 mcg/kg/h × 20 kg ÷ 10 mcg/mL = 2 mL/h.
    const fentanyl = evaluateInfusionDose(infusion('fentanil_inf'), 20, '1');
    expect(fentanyl.status === 'pronto' && fentanyl.rate).toBe(2);
  });

  it('recusa dose fora da faixa da droga e não calcula vazão', () => {
    const result = evaluateInfusionDose(infusion('epinefrina_inf'), 10, '1,5');
    expect(result.status).toBe('invalido');
    expect(evaluateInfusionDose(infusion('epinefrina_inf'), 10, '')).toEqual({ status: 'vazio' });
  });

  it('faz a conta inversa e avisa quando a vazão dá dose fora da faixa usual', () => {
    const inside = evaluateInfusionRate(infusion('norepinefrina'), 10, '0,96');
    expect(inside).toMatchObject({ status: 'pronto', outsideRange: false });
    expect(inside.status === 'pronto' && inside.dose).toBeCloseTo(0.1, 10);
    const outside = evaluateInfusionRate(infusion('norepinefrina'), 10, '30');
    expect(outside).toMatchObject({ status: 'pronto', outsideRange: true });
  });

  it('mostra vazão pequena com duas casas e concentração com a unidade certa', () => {
    expect(formatRate(0.06)).toBe('0,06');
    expect(formatRate(1.24)).toBe('1,2');
    expect(formatConcentration(1785, 'mcg/kg/min')).toBe('1,8 mg/mL');
    expect(formatConcentration(32.3, 'mcg/kg/min')).toBe('32,3 mcg/mL');
    expect(formatConcentration(400, 'mU/kg/min')).toBe('400 mU/mL');
    expect(formatConcentration(10, 'mg/kg/h')).toBe('10 mg/mL');
    expect(doseDecimals(infusion('epinefrina_inf'))).toBe(2);
    expect(doseDecimals(infusion('dobutamina'))).toBe(1);
    expect(doseDecimals(infusion('dopamina'))).toBe(0);
  });
});
