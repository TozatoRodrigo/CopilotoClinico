import { describe, expect, it } from 'vitest';
import {
  describeDoseStatus,
  doseInputRange,
  doseSettings,
  doseStatus,
  doseToMlh,
  evaluateInfusion,
  formatDose,
  formatPatientBolus,
  mlhToDose,
  patientBolus,
  rateInputRange,
  sliderValue,
  stepDose,
} from './dose';
import { getInfusionDrug, type InfusionDrug } from './drugs';

function drug(id: string): InfusionDrug {
  const found = getInfusionDrug(id);
  if (!found) throw new Error(`droga ${id} ausente`);
  return found;
}

describe('doseToMlh / mlhToDose', () => {
  it('noradrenalina 0,1 mcg/kg/min em 70 kg a 64 mcg/mL = 6,5625 mL/h, e volta', () => {
    expect(doseToMlh(0.1, 70, 64, 60, true)).toBeCloseTo(6.5625, 10);
    expect(mlhToDose(6.5625, 70, 64, 60, true)).toBeCloseTo(0.1, 10);
  });

  it('ignora o peso nas drogas sem peso (vasopressina 0,03 UI/min a 0,4 UI/mL = 4,5 mL/h)', () => {
    expect(doseToMlh(0.03, 70, 0.4, 60, false)).toBeCloseTo(4.5, 10);
    expect(doseToMlh(0.03, 120, 0.4, 60, false)).toBeCloseTo(4.5, 10);
    expect(mlhToDose(4.5, 999, 0.4, 60, false)).toBeCloseTo(0.03, 10);
  });
});

describe('doseSettings', () => {
  it('usa a faixa da droga quando ela não tem modos, com o número exato', () => {
    const settings = doseSettings(drug('vasopressina'));
    expect(settings).toMatchObject({
      mode: null,
      min: 0.01,
      max: 0.04,
      caution: 0.04,
      critical: 0.04,
    });
    expect(settings.rangeLabel).toBe('0,01 - 0,04 UI/min');
    expect(doseSettings(drug('milrinona')).rangeLabel).toBe('0,375 - 0,75 mcg/kg/min');
  });

  it('troca faixa, limiares e bolus pelo modo, e cai no primeiro modo com id desconhecido', () => {
    const status = doseSettings(drug('midazolam'), 'status');
    expect(status).toMatchObject({ min: 0.05, max: 2, step: 0.05, defaultDose: 0.5, caution: 1.5 });
    expect(status.rangeLabel).toBe('0,05 - 2,0 mg/kg/h');
    expect(status.bolus?.perKg).toBe(0.2);
    expect(doseSettings(drug('midazolam'), 'xyz').mode?.id).toBe('sedacao');
    expect(doseSettings(drug('midazolam')).bolus).toBeNull();
  });
});

describe('doseStatus / describeDoseStatus', () => {
  const nora = doseSettings(drug('noradrenalina'));

  it('segue as faixas do ANY: abaixo do mínimo e acima do crítico são críticas', () => {
    expect(doseStatus(0.005, nora)).toBe('critical');
    expect(doseStatus(0.01, nora)).toBe('therapeutic');
    expect(doseStatus(1, nora)).toBe('therapeutic');
    expect(doseStatus(1.01, nora)).toBe('caution');
    expect(doseStatus(2, nora)).toBe('caution');
    expect(doseStatus(2.01, nora)).toBe('critical');
  });

  it('dá rótulo a cada estado, separando "abaixo da faixa" de "dose crítica"', () => {
    expect(describeDoseStatus(0.005, nora)).toEqual({
      status: 'critical',
      tone: 'critical',
      label: 'Abaixo da faixa',
    });
    expect(describeDoseStatus(0.1, nora).label).toBe('Na faixa');
    expect(describeDoseStatus(1.5, nora)).toMatchObject({
      tone: 'attention',
      label: 'Acima do usual',
    });
    expect(describeDoseStatus(2.5, nora).label).toBe('Dose crítica');
  });

  it('sem limiar, o teto da faixa vale como crítico (nunca "atenção")', () => {
    const vaso = doseSettings(drug('vasopressina'));
    expect(doseStatus(0.04, vaso)).toBe('therapeutic');
    expect(doseStatus(0.045, vaso)).toBe('critical');
  });
});

describe('stepDose / sliderValue', () => {
  const nora = doseSettings(drug('noradrenalina'));

  it('anda um passo sem erro de ponto flutuante e para nos limites do modo', () => {
    expect(stepDose(0.1, nora, 1)).toBe(0.11);
    expect(stepDose(0.1, nora, -1)).toBe(0.09);
    expect(stepDose(0.01, nora, -1)).toBe(0.01);
    expect(stepDose(3, nora, 1)).toBe(3);
  });

  it('prende o controle deslizante à faixa, mas não a dose', () => {
    expect(sliderValue(5, nora)).toBe(3);
    expect(sliderValue(0, nora)).toBe(0.01);
  });
});

describe('formatDose', () => {
  it('usa as casas do passo quando ele tem mais de duas', () => {
    expect(formatDose(0.375, doseSettings(drug('milrinona')))).toBe('0,375');
    expect(formatDose(0.03, doseSettings(drug('vasopressina')))).toBe('0,030');
    expect(formatDose(0.1, doseSettings(drug('noradrenalina')))).toBe('0,10');
  });
});

describe('faixas dos campos', () => {
  it('aceita dose de 0 a 3× o maior entre o teto e o limiar crítico', () => {
    const nitro = drug('nitroglicerina');
    expect(doseInputRange(nitro, doseSettings(nitro, 'padrao'))).toEqual({
      min: 0,
      max: 15,
      unit: 'mcg/kg/min',
    });
    expect(doseInputRange(nitro, doseSettings(nitro, 'scape')).max).toBe(30);
  });

  it('converte o teto da dose em mL/h, arredondado para cima em uma casa', () => {
    const nora = drug('noradrenalina');
    // 9 mcg/kg/min × 70 kg × 60 ÷ 64 = 590,625 mL/h
    expect(rateInputRange(nora, doseSettings(nora), 70, 64)).toEqual({
      min: 0,
      max: 590.7,
      unit: 'mL/h',
    });
  });
});

describe('patientBolus', () => {
  const midazolam = doseSettings(drug('midazolam'), 'status').bolus;
  const propofol = doseSettings(drug('propofol'), 'status').bolus;
  const scape = doseSettings(drug('nitroglicerina'), 'scape').bolus;

  it('calcula por kg e respeita o teto por bolus', () => {
    if (!midazolam) throw new Error('sem bolus');
    expect(patientBolus(midazolam, 70)).toEqual({ kind: 'dose', amount: 14, unit: 'mg' });
    expect(patientBolus(midazolam, 120)).toEqual({ kind: 'dose', amount: 20, unit: 'mg' });
  });

  it('calcula faixa por kg e escreve sem casa decimal', () => {
    if (!propofol) throw new Error('sem bolus');
    const bolus = patientBolus(propofol, 70);
    expect(bolus).toEqual({ kind: 'faixa', low: 35, high: 175, unit: 'mg' });
    expect(bolus && formatPatientBolus(bolus)).toBe('35 - 175 mg');
  });

  it('não calcula quando o bolus é só texto (SCAPE)', () => {
    if (!scape) throw new Error('sem bolus');
    expect(patientBolus(scape, 70)).toBeNull();
  });
});

describe('evaluateInfusion', () => {
  it('pede o peso para droga por peso', () => {
    const nora = drug('noradrenalina');
    expect(
      evaluateInfusion(nora, doseSettings(nora), { dose: 0.1, concentration: 64, weightKg: null }),
    ).toEqual({ status: 'needs-weight' });
  });

  it('calcula sem peso a droga que não usa peso', () => {
    const morfina = drug('morfina');
    const result = evaluateInfusion(morfina, doseSettings(morfina), {
      dose: 6,
      concentration: 1,
      weightKg: null,
    });
    expect(result).toMatchObject({ status: 'ready', mlh: 6, detail: { status: 'caution' } });
  });
});
