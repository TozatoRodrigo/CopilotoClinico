import { describe, expect, it } from 'vitest';
import { formatDecimal } from '../numbers';
import {
  AIRWAY_DRUGS,
  airwayDose,
  formatDose,
  formatRate,
  getAirwayDrug,
  receivesDoseReduction,
  reducedDoseRange,
  snapRate,
  type AirwayDrugId,
} from './drugs';

/**
 * Casos-chave de dose para a revisão do Dr. Gustavo (CC-310): paciente de
 * 70 kg com a régua no valor inicial do ANY. São os números que o ANY v1
 * mostrava ao abrir a tela (ex.: "21 mg = 10.5 mL" no etomidato).
 */
const KEY_CASES_70_KG: Record<AirwayDrugId, { dose: string; volume: string }> = {
  fentanil: { dose: '210 mcg', volume: '4,2 mL' },
  cetamina: { dose: '105 mg', volume: '2,1 mL' },
  etomidato: { dose: '21 mg', volume: '10,5 mL' },
  propofol: { dose: '105 mg', volume: '10,5 mL' },
  rocuronio: { dose: '105 mg', volume: '10,5 mL' },
  succinilcolina: { dose: '105 mg', volume: '10,5 mL' },
};

describe('doses da intubação', () => {
  it.each(AIRWAY_DRUGS.map((drug) => [drug.id, drug] as const))(
    '%s: caso-chave de 70 kg com a régua inicial',
    (id, drug) => {
      const { dose, volumeMl } = airwayDose(drug, 70, drug.rate.initial);
      expect({ dose: formatDose(drug, dose), volume: `${formatDecimal(volumeMl, 1)} mL` }).toEqual(
        KEY_CASES_70_KG[id],
      );
    },
  );

  it('arredonda como o ANY: inteiro, e o etomidato em décimos', () => {
    expect(airwayDose(getAirwayDrug('rocuronio'), 72.5, 1.5).dose).toBe(109); // 108,75
    expect(airwayDose(getAirwayDrug('etomidato'), 72.5, 0.3).dose).toBe(21.8); // 21,75
    expect(airwayDose(getAirwayDrug('fentanil'), 72.5, 3).volumeMl).toBeCloseTo(4.36);
  });

  it('formata dose e régua com vírgula e unidade', () => {
    const etomidate = getAirwayDrug('etomidato');
    expect(formatDose(etomidate, 21.8)).toBe('21,8 mg');
    expect(formatRate(etomidate, 0.3)).toBe('0,3 mg/kg');
    expect(formatRate(getAirwayDrug('fentanil'), 3)).toBe('3 mcg/kg');
  });

  it('leva a régua para a faixa e o passo da droga', () => {
    const etomidate = getAirwayDrug('etomidato');
    expect(snapRate(etomidate, 0.287)).toBe(0.29);
    expect(snapRate(etomidate, 1)).toBe(0.4);
    expect(snapRate(etomidate, 0)).toBe(0.2);
    expect(snapRate(getAirwayDrug('propofol'), 1.7)).toBe(1.5);
    expect(snapRate(getAirwayDrug('rocuronio'), 1.66)).toBe(1.7);
    expect(snapRate(etomidate, Number.NaN)).toBe(0.3);
  });

  it('a redução de 30–50% vale só para os indutores', () => {
    expect(AIRWAY_DRUGS.filter(receivesDoseReduction).map(({ id }) => id)).toEqual([
      'cetamina',
      'etomidato',
      'propofol',
    ]);
  });

  it('faixa reduzida: 50% a 70% da dose, com o arredondamento da droga', () => {
    expect(reducedDoseRange(getAirwayDrug('cetamina'), 70, 1.5)).toEqual({
      from: { dose: 53, volumeMl: 1.06 }, // 52,5
      to: { dose: 74, volumeMl: 1.48 }, // 73,5 (sem virar 73,4999…)
    });
    const etomidate = reducedDoseRange(getAirwayDrug('etomidato'), 72.5, 0.3);
    expect([etomidate.from.dose, etomidate.to.dose]).toEqual([10.9, 15.2]); // 10,875 e 15,225
  });
});
