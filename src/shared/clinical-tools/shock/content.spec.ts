import { describe, expect, it } from 'vitest';
import { RESULT_TONES } from '../tone';
import { describeLactate, LACTATE_RANGES, lactateMmolToMgDl, lactateToMmol } from './lactate';
import { classifyPerfusion, evaluatePerfusion, PERFUSION_QUADRANTS } from './perfusion-quadrant';
import * as septic from './septic-shock';
import { SEPTIC_SHOCK_PROVENANCE, SEPTIC_SHOCK_REFERENCES } from './sources';
import {
  evaluateVneri,
  VNERI_CONDUCTS,
  VNERI_ZONES,
  vneriBarPosition,
  vneriBarSegments,
  vneriZone,
} from './vneri';

/**
 * Regra de linguagem do ADR-017 (a mesma de registry.spec.ts): a ferramenta
 * sugere, não manda. Vale para todo texto de conduta do choque.
 */
const IMPERATIVE_START =
  /(^|[.:;]\s+)(Faça|Inicie|Administre|Realize|Aplique|Intube|Transfunda|Prescreva|Titule|Mantenha|Iniciar|Titular|Manter|Administrar)\b/;

/** Todos os textos em string de um objeto de conteúdo. */
function strings(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(strings);
  if (typeof value === 'object' && value !== null) return Object.values(value).flatMap(strings);
  return [];
}

/** Textos de conduta (o "não recomendado" são proibições, fora da regra). */
const CONDUCT_TEXTS = [
  ...strings(septic.CAPILLARY_REFILL.normal),
  ...strings(septic.CAPILLARY_REFILL.abnormal),
  ...strings(septic.PULSE_PRESSURE.low),
  ...strings(septic.PULSE_PRESSURE.adequate),
  ...strings(septic.FLUID_RESPONSIVENESS_METHODS),
  ...strings(septic.FLUIDS.bolus),
  ...strings(septic.FLUIDS.notResponsive),
  ...strings(septic.VASOPRESSOR.vasoplegia),
  ...strings(septic.PERFUSION_STEP),
  ...strings(septic.PROFILE_STEP.goal),
  ...Object.values(septic.PROFILE_SUGGESTIONS),
  ...VNERI_CONDUCTS.map(({ text }) => text),
  ...PERFUSION_QUADRANTS.flatMap(({ conduct, cell }) => [conduct, cell.hint]),
];

describe('linguagem (ADR-017)', () => {
  it.each(CONDUCT_TEXTS)('sugere em vez de mandar: %s', (text) => {
    expect(text).not.toMatch(IMPERATIVE_START);
    expect(text).not.toMatch(/imediatamente/i);
  });
});

describe('conteúdo do choque séptico', () => {
  it('traz procedência e referências', () => {
    expect(SEPTIC_SHOCK_PROVENANCE.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(SEPTIC_SHOCK_PROVENANCE.review).toEqual({ status: 'pendente' });
    expect(SEPTIC_SHOCK_REFERENCES.map(({ id }) => id)).toContain('andromeda-shock-2');
  });

  it('não repete id', () => {
    for (const list of [
      septic.RECOGNITION_CRITERIA,
      septic.FLUID_RESPONSIVENESS_METHODS,
      septic.ECHO_FINDINGS,
      PERFUSION_QUADRANTS,
      VNERI_ZONES,
    ]) {
      const ids = list.map(({ id }) => id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('todo tom é um tom do motor', () => {
    const tones = [
      ...VNERI_ZONES.map(({ tone }) => tone),
      ...PERFUSION_QUADRANTS.map(({ tone }) => tone),
      ...septic.TEC_REEVALUATION_TONES.map(({ tone }) => tone),
    ];
    for (const tone of tones) expect(RESULT_TONES).toContain(tone);
  });
});

/**
 * Casos de referência dos limiares-chave do roteiro (os números que o médico
 * confere à beira do leito). Os casos do Dr. Gustavo Moreira entram aqui na
 * revisão clínica (CC-310).
 */
describe('limiares-chave', () => {
  it('TEC: até 3 s é normal; acima, hipoperfusão', () => {
    expect(septic.capillaryRefillResult(3).title).toBe('TEC normal');
    expect(septic.capillaryRefillResult(3.1).title).toBe('Hipoperfusão presente');
  });

  it('reavaliação do TEC: ≤ 3 s neutro, ≤ 4,5 s atenção, acima crítico', () => {
    expect([3, 3.1, 4.5, 4.6].map(septic.tecReevaluationTone)).toEqual([
      'neutral',
      'attention',
      'attention',
      'critical',
    ]);
  });

  it('PP < 40 mmHg sugere volume sistólico baixo', () => {
    expect(septic.pulsePressureResult(39).tone).toBe('attention');
    expect(septic.pulsePressureResult(40).tone).toBe('neutral');
  });

  it('bolus de 500 mL até 1000 mL no passo', () => {
    expect([septic.FLUIDS.bolusStepMl, septic.FLUIDS.bolusMaxMl]).toEqual([500, 1000]);
  });

  it('PAD < 50 mmHg sugere vasoplegia', () => {
    expect(septic.VASOPRESSOR.padLowerThan).toBe(50);
  });

  it('VNERi: PAD 60, NE 0,3, FC 100 dá 2,0 (hiporresponsividade grave)', () => {
    const result = evaluateVneri({ pad: '60', doseNE: '0,3', fc: '100' });
    expect(result).toMatchObject({ status: 'complete', value: 2 });
    if (result.status === 'complete') expect(result.zone.id).toBe('hiporresponsividade-grave');
  });

  it('VNERi: cortes 2,6, 6,7 e 10,8', () => {
    expect([2.59, 2.6, 6.7, 10.79, 10.8].map((value) => vneriZone(value).id)).toEqual([
      'hiporresponsividade-grave',
      'resposta-parcial',
      'resposta-adequada',
      'resposta-adequada',
      'tonus-preservado',
    ]);
  });

  it('quadrante: SvcO2 70% e gap 6 mmHg', () => {
    expect(classifyPerfusion(69.9, 6.1).id).toBe('baixo-debito');
    expect(classifyPerfusion(69.9, 6).id).toBe('disoxia-anemica');
    expect(classifyPerfusion(70, 6.1).id).toBe('microcirculacao-inadequada');
    expect(classifyPerfusion(70, 6).id).toBe('hipoxia-citopatica');
  });

  it('lactato: 2 mmol/L = 18 mg/dL; 4 mmol/L = 36 mg/dL', () => {
    expect(lactateMmolToMgDl(2)).toBe(18);
    expect(lactateToMmol(36, 'mg/dL')).toBe(4);
    expect(describeLactate(4, 'mg/dL')).toBe('36,0 mg/dL = 4,0 mmol/L');
    expect(describeLactate(4, 'mmol/L')).toBe('4,0 mmol/L = 36,0 mg/dL');
    expect(LACTATE_RANGES['mg/dL'].max).toBe(LACTATE_RANGES['mmol/L'].max * 9);
  });
});

describe('VNERi e quadrante ao vivo', () => {
  it('não calcula com campo vazio ou fora da faixa', () => {
    expect(evaluateVneri({ pad: '60', doseNE: '', fc: '100' })).toMatchObject({
      status: 'pending',
      missing: ['Dose de noradrenalina'],
    });
    expect(evaluateVneri({ pad: '60', doseNE: '0', fc: '100' })).toMatchObject({
      status: 'pending',
      errors: { doseNE: { kind: 'out-of-range' } },
    });
    expect(evaluatePerfusion({ svco2: '65', gapCO2: '' })).toMatchObject({ status: 'pending' });
    expect(evaluatePerfusion({ svco2: '65', gapCO2: '8,5' })).toMatchObject({
      status: 'complete',
      quadrant: { id: 'baixo-debito' },
    });
  });

  it('a barra do VNERi vai de 0 a 15 com as zonas nos cortes', () => {
    expect(vneriBarPosition(7.5)).toBe(50);
    expect(vneriBarPosition(40)).toBe(100);
    const segments = vneriBarSegments();
    expect(segments.map(({ width }) => Math.round(width * 10) / 10)).toEqual([
      17.3, 27.3, 27.3, 28,
    ]);
    expect(segments.reduce((sum, { width }) => sum + width, 0)).toBeCloseTo(100);
  });
});
