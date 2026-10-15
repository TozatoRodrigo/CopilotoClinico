import { describe, expect, it } from 'vitest';
import { KETAMINE_CALCULATOR, KETOFOL_SCREEN } from './content';
import {
  formatAmount,
  formatRegimen,
  KETAMINE_IM,
  ketamineImDose,
  ketamineImTexts,
  KETOFOL,
  ketofolConcentrationText,
  ketofolDoses,
  ketofolEachText,
  ketofolVolumeText,
  medicationDoseLine,
  mixtureAmount,
  regimenTitle,
  REGIMENS,
} from './doses';

/**
 * CC-328 — doses-chave da história (casos de referência até chegarem os do
 * Dr. Gustavo): midazolam VO 7,5–15 mg ou clonazepam; cetamina IM 5 mg/kg;
 * midazolam IM 7,5 mg; midazolam + haloperidol + prometazina IM; cetofol 1:1
 * com 0,5 e 0,25 mg/kg, metade se sedado nas últimas 4 h.
 */

describe('regimes', () => {
  it('trazem as doses da história, com a via', () => {
    expect(formatRegimen(REGIMENS['midazolam-vo'], { names: true })).toBe('Midazolam 7,5–15 mg VO');
    expect(formatRegimen(REGIMENS['clonazepam-vo'], { names: true })).toBe(
      'Clonazepam 0,5–1 mg VO',
    );
    expect(formatRegimen(REGIMENS['cetamina-im'], { names: true })).toBe('Cetamina 5 mg/kg IM');
    expect(formatRegimen(REGIMENS['midazolam-im'], { names: true })).toBe('Midazolam 7,5 mg IM');
    expect(formatRegimen(REGIMENS['haloperidol-prometazina-im'], { names: true })).toBe(
      'Haloperidol 5 mg + Prometazina 50 mg IM',
    );
    expect(formatRegimen(REGIMENS['midazolam-haloperidol-prometazina-im'], { names: true })).toBe(
      'Midazolam 7,5 mg + Haloperidol 5 mg + Prometazina 50 mg IM',
    );
  });

  it('na opção de medicação, a dose sem o nome quando ele já está no título', () => {
    expect(regimenTitle(REGIMENS['cetamina-im'])).toBe('Cetamina IM');
    expect(medicationDoseLine(REGIMENS['cetamina-im'])).toBe('5 mg/kg IM');
    expect(medicationDoseLine(REGIMENS['midazolam-im'])).toBe('7,5 mg IM');
    expect(regimenTitle(REGIMENS['midazolam-haloperidol-prometazina-im'])).toBe(
      'Midazolam + Haloperidol + Prometazina IM',
    );
    expect(medicationDoseLine(REGIMENS['midazolam-haloperidol-prometazina-im'])).toBe(
      'Midazolam 7,5 mg + Haloperidol 5 mg + Prometazina 50 mg IM',
    );
  });

  it('formata as três formas de dose', () => {
    expect(formatAmount({ kind: 'fixa', mg: 7.5 })).toBe('7,5 mg');
    expect(formatAmount({ kind: 'faixa', minMg: 0.5, maxMg: 1 })).toBe('0,5–1 mg');
    expect(formatAmount({ kind: 'por-kg', mgPerKg: 5 })).toBe('5 mg/kg');
  });

  it('cada regime está guardado com o próprio id', () => {
    for (const [id, regimen] of Object.entries(REGIMENS)) expect(regimen.id).toBe(id);
  });
});

describe('cetamina IM', () => {
  it('usa a mesma dose por kg do regime e o volume da apresentação de 50 mg/mL', () => {
    const [component] = REGIMENS['cetamina-im'].components;
    expect(component?.amount).toEqual({ kind: 'por-kg', mgPerKg: KETAMINE_IM.mgPerKg });
    expect(KETAMINE_CALCULATOR.volumeLabel).toBe(
      `Volume (${KETAMINE_IM.concentrationMgPerMl} mg/mL)`,
    );
  });

  it.each([
    [70, '350 mg', '7,0 mL'],
    [40, '200 mg', '4,0 mL'],
    [200, '1000 mg', '20,0 mL'],
    [72.5, '363 mg', '7,3 mL'],
  ])('%s kg → %s em %s', (weight, dose, volume) => {
    expect(ketamineImTexts(ketamineImDose(weight))).toEqual({ dose, volume });
  });
});

describe('cetofol 1:1', () => {
  it('reduzido é a metade da dose padrão, na indução e na manutenção', () => {
    const { induction, maintenance, reductionPercent } = KETOFOL;
    const kept = 1 - reductionPercent / 100;
    expect(induction.reducedMgPerKg).toBe(induction.standardMgPerKg * kept);
    expect(maintenance.reducedMgPerKg).toBe(maintenance.standardMgPerKg * kept);
    expect(KETOFOL_SCREEN.reduced.title).toContain(`(${reductionPercent}%)`);
    expect([induction.standardMgPerKg, maintenance.standardMgPerKg]).toEqual([0.5, 0.25]);
  });

  it('a mistura fecha: 2 mL de cetamina + 10 mL de propofol + 8 mL de água = 20 mL a 5 mg/mL', () => {
    const volume = KETOFOL.mixture.reduce((sum, { volumeMl }) => sum + volumeMl, 0);
    expect(volume).toBe(KETOFOL.totalVolumeMl);
    for (const { mg } of KETOFOL.mixture.filter(({ mg }) => mg !== undefined)) {
      expect((mg ?? 0) / KETOFOL.totalVolumeMl).toBe(KETOFOL.concentrationMgPerMl);
    }
    // A concentração escrita no rótulo bate com mg ÷ mL de cada ampola.
    const [ketamine, propofol] = KETOFOL.mixture;
    expect(ketamine?.label).toBe(
      `Cetamina ${(ketamine?.mg ?? 0) / (ketamine?.volumeMl ?? 1)} mg/mL`,
    );
    expect((propofol?.mg ?? 0) / (propofol?.volumeMl ?? 1)).toBe(10); // propofol 1% = 10 mg/mL
    expect(KETOFOL.mixture.map(mixtureAmount)).toEqual(['2 mL (100 mg)', '10 mL (100 mg)', '8 mL']);
    expect(ketofolConcentrationText()).toBe('5 mg/mL de cada componente');
  });

  it('70 kg sem sedação prévia: indução 35 mg de cada (7,0 mL), manutenção 18 mg (3,5 mL)', () => {
    const { reduced, induction, maintenance } = ketofolDoses(70, false);
    expect(reduced).toBe(false);
    expect([ketofolEachText(induction), ketofolVolumeText(induction)]).toEqual([
      '35 mg de cada',
      '7,0 mL',
    ]);
    expect([ketofolEachText(maintenance), ketofolVolumeText(maintenance)]).toEqual([
      '18 mg de cada',
      '3,5 mL',
    ]);
  });

  it('70 kg sedado nas últimas 4 h: metade (18 mg / 3,5 mL e 9 mg / 1,8 mL)', () => {
    const { induction, maintenance } = ketofolDoses(70, true);
    expect(induction.mgPerKg).toBe(0.25);
    expect(maintenance.mgPerKg).toBe(0.125);
    expect([ketofolEachText(induction), ketofolVolumeText(induction)]).toEqual([
      '18 mg de cada',
      '3,5 mL',
    ]);
    expect([ketofolEachText(maintenance), ketofolVolumeText(maintenance)]).toEqual([
      '9 mg de cada',
      '1,8 mL',
    ]);
  });
});
