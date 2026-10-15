import { describe, expect, it } from 'vitest';
import { evaluateCalculator } from '../calculator';
import { CORRECAO_NA } from '../calculators/correcao-na';
import { DEFICIT_AGUA } from '../calculators/deficit-agua';
import { DELTA_GAP } from '../calculators/delta-gap';
import {
  anionGap,
  correctedSodium,
  deltaDelta,
  dkaResolution,
  dkaSeverity,
  effectiveOsmolality,
  freeWaterDeficit,
  glucoseFall,
  hhsVolumeDeficit,
  insulinGate,
  insulinRate,
  kclMEqPerMl,
  kclPreparation,
  minutesSince,
  potassiumBand,
  subcutaneousTransition,
  totalBodyWater,
} from './calc';
import { KCL_PRESENTATIONS, KCL_ROUTES } from './content';

/**
 * CC-326 — doses e limiares-chave do roteiro de CAD e EHH. Os casos de teste
 * da spec v1.0.0 do KetoPath (citados no `ketoCalc.ts` do ANY) não estão no
 * repositório do ANY; estes casos saem das faixas do próprio ANY e ficam para
 * o Gustavo conferir (pendência nos achados). A paridade com o ANY em
 * entradas aleatórias está em tests/clinical-tools/cad-ehh-differential.spec.ts.
 */

describe('potássio e a trava da insulina', () => {
  it('sem potássio, a insulina fica travada (critério de aceite)', () => {
    expect(insulinGate(null)).toBe('sem-potassio');
  });

  it('com potássio abaixo de 3,5, a insulina abre bloqueada', () => {
    expect(insulinGate(3.4)).toBe('bloqueada');
    expect(insulinGate(1)).toBe('bloqueada');
  });

  it('a partir de 3,5 a insulina é liberada', () => {
    expect(insulinGate(3.5)).toBe('liberada');
    expect(insulinGate(6.2)).toBe('liberada');
  });

  it('faixas: < 3,5 baixo; 3,5 a 5,0 alvo; > 5,0 alto', () => {
    expect(potassiumBand(3.4)).toBe('baixo');
    expect(potassiumBand(3.5)).toBe('alvo');
    expect(potassiumBand(5.0)).toBe('alvo');
    expect(potassiumBand(5.1)).toBe('alto');
  });
});

describe('sódio corrigido (fator 2,0)', () => {
  it('soma 2,0 a cada 100 mg/dL acima de 100', () => {
    expect(correctedSodium(130, 600)).toBe(140);
    expect(correctedSodium(132, 450)).toBe(139);
    expect(correctedSodium(128, 333)).toBe(132.7);
  });

  it('com glicemia até 100 devolve o sódio medido', () => {
    expect(correctedSodium(138, 100)).toBe(138);
    expect(correctedSodium(138, 60)).toBe(138);
  });

  it('é a mesma conta da calculadora de Katz com fator 2,0', () => {
    for (const [na, glucose] of [
      [130, 600],
      [125, 1200],
      [141, 101],
    ] as const) {
      const evaluation = evaluateCalculator(CORRECAO_NA, {
        inputs: { na_measured: String(na), glucose: String(glucose), factor: '2' },
      });
      expect(evaluation.status).toBe('complete');
      if (evaluation.status === 'complete') {
        expect(correctedSodium(na, glucose)).toBe(evaluation.value);
      }
    }
  });
});

describe('ânion-gap, osmolalidade e água', () => {
  it('ânion-gap inteiro, sem albumina', () => {
    expect(anionGap(135, 100, 10)).toBe(25);
    expect(anionGap(140, 104, 13.6)).toBe(22);
  });

  it('osmolalidade efetiva usa o sódio medido e não soma ureia', () => {
    expect(effectiveOsmolality(140, 900)).toBe(330);
    expect(effectiveOsmolality(130, 540)).toBe(290);
  });

  it('água corporal: 0,6 homem, 0,5 mulher, 0,5 e 0,45 no idoso', () => {
    expect(totalBodyWater(70, 'M', false)).toBeCloseTo(42);
    expect(totalBodyWater(70, 'M', true)).toBeCloseTo(35);
    expect(totalBodyWater(70, 'F', false)).toBeCloseTo(35);
    expect(totalBodyWater(70, 'F', true)).toBeCloseTo(31.5);
  });

  it('déficit de água livre com o sódio corrigido, uma casa', () => {
    expect(freeWaterDeficit(70, 'M', false, 160)).toBe(6);
    // Sódio corrigido abaixo de 140 dá déficit negativo, como no ANY (achado).
    expect(freeWaterDeficit(70, 'M', false, 130)).toBe(-3);
  });

  it('o déficit sem arredondar é a mesma conta da calculadora de déficit de água', () => {
    const evaluation = evaluateCalculator(DEFICIT_AGUA, {
      inputs: { na: '160', weight: '70', act_factor: '0,6' },
    });
    expect(evaluation.status === 'complete' && evaluation.value).toBe(6);
    expect(freeWaterDeficit(70, 'M', false, 160)).toBe(6);
  });

  it('déficit de volume no EHH: 100 a 220 mL/kg em litros', () => {
    expect(hhsVolumeDeficit(70)).toEqual({ min: 7, max: 15.4 });
    expect(hhsVolumeDeficit(82.5)).toEqual({ min: 8.3, max: 18.2 });
  });
});

describe('gravidade da CAD', () => {
  it('o eixo mais grave manda', () => {
    expect(dkaSeverity(7.28, 17, 'alerta')).toBe('leve');
    expect(dkaSeverity(7.28, 12, 'alerta')).toBe('moderada');
    expect(dkaSeverity(7.1, 16, 'estupor-coma')).toBe('grave');
    expect(dkaSeverity(6.95, null, null)).toBe('grave');
  });

  it('limites do pH: < 7,0 grave; até 7,25 moderada; < 7,30 leve', () => {
    expect(dkaSeverity(6.99, null, null)).toBe('grave');
    expect(dkaSeverity(7.0, null, null)).toBe('moderada');
    expect(dkaSeverity(7.25, null, null)).toBe('moderada');
    expect(dkaSeverity(7.26, null, null)).toBe('leve');
    expect(dkaSeverity(7.3, null, null)).toBeNull();
  });

  it('limites do bicarbonato: < 10 grave; < 15 moderada; até 18 leve', () => {
    expect(dkaSeverity(null, 9.9, null)).toBe('grave');
    expect(dkaSeverity(null, 10, null)).toBe('moderada');
    expect(dkaSeverity(null, 15, null)).toBe('leve');
    expect(dkaSeverity(null, 18, null)).toBe('leve');
    expect(dkaSeverity(null, 18.1, null)).toBeNull();
  });

  it('a consciência só escala: sem acidose não classifica', () => {
    expect(dkaSeverity(7.35, 22, 'estupor-coma')).toBeNull();
    expect(dkaSeverity(null, null, 'sonolento')).toBeNull();
  });
});

describe('preparo de KCl', () => {
  const [kcl10, kcl191] = KCL_PRESENTATIONS;
  const [peripheral, central] = KCL_ROUTES;
  if (!kcl10 || !kcl191 || !peripheral || !central) throw new Error('conteúdo incompleto');

  it('20 mEq de KCl 10% em veia periférica: 14,9 mL em pelo menos 400 mL', () => {
    const result = kclPreparation(
      20,
      kcl10.mEqPerAmpoule,
      kcl10.mlPerAmpoule,
      peripheral.maxMEqPerLiter,
      10,
    );
    expect(result).toEqual({
      kclVolumeMl: 14.9,
      minimumVolumeMl: 400,
      rateMlPerHour: 200,
      exceedsLimit: false,
      resultingConcentration: 50,
    });
  });

  it('40 mEq de KCl 19,1% em 500 mL passa do limite periférico, não do central', () => {
    const args = [40, kcl191.mEqPerAmpoule, kcl191.mlPerAmpoule] as const;
    expect(kclPreparation(...args, peripheral.maxMEqPerLiter, 20, 500).exceedsLimit).toBe(true);
    expect(kclPreparation(...args, central.maxMEqPerLiter, 20, 500)).toEqual({
      kclVolumeMl: 15.6,
      minimumVolumeMl: 400,
      rateMlPerHour: 250,
      exceedsLimit: false,
      resultingConcentration: 80,
    });
  });

  it('mEq por mL: 1,34 (10%) e 2,56 (19,1%)', () => {
    expect(kclMEqPerMl(kcl10)).toBeCloseTo(1.34);
    expect(kclMEqPerMl(kcl191)).toBeCloseTo(2.56);
  });
});

describe('insulina e transição', () => {
  it('1 U/mL: 70 kg a 0,1 U/kg/h dá 7,0 U/h = 7,0 mL/h', () => {
    expect(insulinRate(70, 0.1)).toBe(7);
    expect(insulinRate(83, 0.05)).toBe(4.2);
  });

  it('dose diária 0,5–0,6 U/kg; 0,3 com risco de hipoglicemia; basal 0,15–0,3', () => {
    expect(subcutaneousTransition(70, false)).toEqual({
      totalDailyMin: 35,
      totalDailyMax: 42,
      basalMin: 10.5,
      basalMax: 21,
    });
    expect(subcutaneousTransition(70, true)).toMatchObject({
      totalDailyMin: 21,
      totalDailyMax: 21,
    });
  });
});

describe('ciclo de reavaliação', () => {
  it('queda abaixo de 50 mg/dL/h é insuficiente; acima de 90, rápida', () => {
    expect(glucoseFall(410, 450, 60)?.reading).toBe('insuficiente');
    expect(glucoseFall(400, 450, 60)?.reading).toBe('adequada');
    expect(glucoseFall(360, 450, 60)?.reading).toBe('adequada');
    expect(glucoseFall(359, 450, 60)?.reading).toBe('rapida');
  });

  it('normaliza por hora e arredonda', () => {
    expect(glucoseFall(400, 450, 30)).toMatchObject({ perHour: 100, absolute: 50, hours: 0.5 });
  });

  it('com menos de 15 minutos não extrapola por hora', () => {
    expect(glucoseFall(370, 450, 14)).toMatchObject({ extrapolable: false, reading: 'adequada' });
    expect(glucoseFall(370, 450, 15)).toMatchObject({ extrapolable: true, reading: 'rapida' });
  });

  it('sem intervalo não há queda', () => {
    expect(glucoseFall(400, 450, 0)).toBeNull();
  });

  it('minutos entre as rodadas: ao menos 1, arredondado', () => {
    expect(minutesSince(0, 10_000)).toBe(1);
    expect(minutesSince(0, 90 * 60_000 + 20_000)).toBe(90);
  });

  it('resolução: pH ≥ 7,3 ou HCO₃ ≥ 18 é obrigatório; glicemia < 200, desejável', () => {
    expect(dkaResolution(7.3, null, null)).toEqual({
      required: true,
      desirable: false,
      resolved: true,
    });
    expect(dkaResolution(7.29, 18, 199)).toEqual({
      required: true,
      desirable: true,
      resolved: true,
    });
    expect(dkaResolution(7.29, 17.9, 150).resolved).toBe(false);
  });
});

describe('delta/delta', () => {
  it('reaproveita a conta e as faixas da calculadora Delta Gap', () => {
    const evaluation = evaluateCalculator(DELTA_GAP, { inputs: { ag: '20', hco3: '18' } });
    expect(evaluation.status === 'complete' && evaluation.value).toBe(1.33);
    expect(deltaDelta(20, 18)).toEqual({ deltaGap: 2, ratio: 1.33, reading: 'ag-puro' });
  });

  it('razão < 1 é hiperclorêmica; > 2, alcalose', () => {
    expect(deltaDelta(14, 14)?.reading).toBe('hipercloremica');
    expect(deltaDelta(30, 18)?.reading).toBe('alcalose');
  });

  it('não se aplica com bicarbonato normal ou alto', () => {
    expect(deltaDelta(20, 24)).toBeNull();
    expect(deltaDelta(20, 30)).toBeNull();
  });
});
