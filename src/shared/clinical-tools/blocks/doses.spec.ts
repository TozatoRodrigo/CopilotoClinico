import { describe, expect, it } from 'vitest';
import {
  buildLipidEmulsionNote,
  buildMaxDoseNote,
  evaluateLipidEmulsion,
  evaluateMaxDoses,
  formatDoseMg,
  formatDoseMl,
  LOCAL_ANESTHETICS,
  maxDose,
  type LocalAnestheticId,
} from './doses';

function anesthetic(id: LocalAnestheticId) {
  const found = LOCAL_ANESTHETICS.find((entry) => entry.id === id);
  if (!found) throw new Error(id);
  return found;
}

/**
 * Casos-chave: 70 kg, o peso com que o BlockPath do ANY abre, e o que a tela
 * dele mostra (conferido no teste diferencial). Doses máximas em mg/kg:
 * lidocaína 4,5/7, bupivacaína 2,5/3, ropivacaína 3/3,5 (sem/com epinefrina).
 */
const AT_70_KG: Record<LocalAnestheticId, { sem: string[]; com: string[] }> = {
  lidocaina: { sem: ['315 mg', '31,5 mL', '15,8 mL'], com: ['490 mg', '49,0 mL', '24,5 mL'] },
  bupivacaina: { sem: ['175 mg', '70,0 mL', '35,0 mL'], com: ['210 mg', '84,0 mL', '42,0 mL'] },
  ropivacaina: { sem: ['210 mg', '105,0 mL', '42,0 mL'], com: ['245 mg', '122,5 mL', '49,0 mL'] },
};

describe('dose máxima de anestésico local (CC-330)', () => {
  it.each(Object.entries(AT_70_KG))('%s em 70 kg', (id, expected) => {
    for (const epinephrine of ['sem', 'com'] as const) {
      const dose = maxDose(70, anesthetic(id as LocalAnestheticId), epinephrine);
      expect([formatDoseMg(dose.mg), ...dose.volumes.map(({ ml }) => formatDoseMl(ml))]).toEqual(
        expected[epinephrine],
      );
    }
  });

  it('usa os mg/kg do ANY', () => {
    expect(LOCAL_ANESTHETICS.map(({ name, maxMgPerKg }) => [name, maxMgPerKg])).toEqual([
      ['Lidocaína', { sem: 4.5, com: 7 }],
      ['Bupivacaína', { sem: 2.5, com: 3 }],
      ['Ropivacaína', { sem: 3, com: 3.5 }],
    ]);
  });

  it('calcula com o peso adulto nas bordas e recusa fora de 40–200 kg', () => {
    expect(evaluateMaxDoses('40')).toMatchObject({ status: 'complete', weightKg: 40 });
    expect(evaluateMaxDoses('200')).toMatchObject({ status: 'complete', weightKg: 200 });
    expect(evaluateMaxDoses('72,5')).toMatchObject({ status: 'complete', weightKg: 72.5 });
    for (const raw of ['39,9', '200,1', '1.500', 'abc']) {
      const evaluation = evaluateMaxDoses(raw);
      expect(evaluation.status, raw).toBe('pending');
      expect(evaluation.status === 'pending' && evaluation.error, raw).toBeTruthy();
    }
  });

  it('peso vazio fica pendente sem erro', () => {
    expect(evaluateMaxDoses('')).toEqual({ status: 'pending', error: null });
    expect(evaluateLipidEmulsion('  ')).toEqual({ status: 'pending', error: null });
  });

  it('monta o texto do prontuário com peso, mg e mL', () => {
    expect(buildMaxDoseNote(70)).toBe(
      [
        'Dose máxima de anestésico local (peso 70 kg):',
        '- Lidocaína sem epinefrina (4,5 mg/kg): 315 mg — 1%: 31,5 mL; 2%: 15,8 mL',
        '- Lidocaína com epinefrina (7 mg/kg): 490 mg — 1%: 49,0 mL; 2%: 24,5 mL',
        '- Bupivacaína sem epinefrina (2,5 mg/kg): 175 mg — 0,25%: 70,0 mL; 0,5%: 35,0 mL',
        '- Bupivacaína com epinefrina (3 mg/kg): 210 mg — 0,25%: 84,0 mL; 0,5%: 42,0 mL',
        '- Ropivacaína sem epinefrina (3 mg/kg): 210 mg — 0,2%: 105,0 mL; 0,5%: 42,0 mL',
        '- Ropivacaína com epinefrina (3,5 mg/kg): 245 mg — 0,2%: 122,5 mL; 0,5%: 49,0 mL',
        'Sugestão: Considere reduzir 20-30% em idosos, hepatopatas, cardiopatas. Em bloqueios múltiplos, considere dose total.',
      ].join('\n'),
    );
  });
});

describe('emulsão lipídica 20% no LAST (CC-330)', () => {
  it('70 kg: bolus 105 mL, infusão 17,5 mL/min, máximo 840 mL', () => {
    const evaluation = evaluateLipidEmulsion('70');
    expect(evaluation.status).toBe('complete');
    if (evaluation.status !== 'complete') return;
    expect(evaluation.result.map(({ label, text }) => [label, text])).toEqual([
      ['Bolus (1,5 mL/kg)', '105 mL'],
      ['Infusão (0,25 mL/kg/min)', '17,5 mL/min'],
      ['Dose máxima (12 mL/kg)', '840 mL'],
    ]);
  });

  it('monta o texto do prontuário', () => {
    expect(buildLipidEmulsionNote(72.5)).toBe(
      [
        'LAST — emulsão lipídica 20% (peso 72,5 kg):',
        '- Bolus (1,5 mL/kg): 109 mL',
        '- Infusão (0,25 mL/kg/min): 18,1 mL/min',
        '- Dose máxima (12 mL/kg): 870 mL',
      ].join('\n'),
    );
  });
});
