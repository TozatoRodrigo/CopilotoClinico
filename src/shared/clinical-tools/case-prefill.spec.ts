import { describe, expect, it } from 'vitest';
import type { CaseToolFacts } from '../contracts/clinical';
import { evaluateCalculator, type CalculatorDefinition } from './calculator';
import {
  CALCULATOR_CASE_BINDINGS,
  TOOL_CASE_INPUTS,
  calculatorCasePrefill,
  caseAgeText,
  caseCalculatorDefinition,
  caseFieldCount,
  caseWeightText,
  sameAsCase,
} from './case-prefill';
import { TOOLS } from './catalog';
import { getCalculator } from './registry';
import { WELLS_TEP } from './tep/wells';

const EMPTY: CaseToolFacts = {
  ageYears: null,
  sex: null,
  weightKg: null,
  systolicBp: null,
  diastolicBp: null,
  heartRate: null,
  respiratoryRate: null,
  spo2: null,
  temperature: null,
  glucose: null,
};

const facts = (overrides: Partial<CaseToolFacts>): CaseToolFacts => ({ ...EMPTY, ...overrides });

function definition(id: string): CalculatorDefinition {
  const found = id === WELLS_TEP.id ? WELLS_TEP : getCalculator(id);
  if (!found) throw new Error(`calculadora ${id} não existe`);
  return found;
}

const prefillOf = (id: string, overrides: Partial<CaseToolFacts>) =>
  calculatorCasePrefill(definition(id), facts(overrides));

describe('calculadora aberta já preenchida com o caso (CC-332)', () => {
  it('toda ligação aponta para item, opção e campo que existem', () => {
    // Uma grade de valores que passa pelos dois lados de cada limiar.
    const grid: Partial<CaseToolFacts>[] = [
      { ageYears: 20, heartRate: 60, respiratoryRate: 12, spo2: 99, temperature: 36.5 },
      { ageYears: 50, heartRate: 100, respiratoryRate: 30, spo2: 94, temperature: 37.3 },
      { ageYears: 80, heartRate: 140, respiratoryRate: 40, spo2: 80, temperature: 39 },
      { systolicBp: 85, diastolicBp: 50 },
      { systolicBp: 130, diastolicBp: 80 },
    ];
    for (const [id, binding] of Object.entries(CALCULATOR_CASE_BINDINGS)) {
      const calc = definition(id);
      for (const { item } of binding.items ?? []) {
        expect(
          calc.items?.some(({ id: itemId }) => itemId === item),
          `${id}.${item}`,
        ).toBe(true);
      }
      for (const { input } of binding.inputs ?? []) {
        expect(
          calc.kind === 'formula' && calc.inputs.some(({ id: inputId }) => inputId === input),
          `${id}.${input}`,
        ).toBe(true);
      }
      // Toda resposta derivada é uma opção do item (senão o prefill a descartaria em silêncio).
      for (const values of grid) {
        for (const { item, answer } of binding.items ?? []) {
          const optionId = answer(facts(values));
          if (optionId === null) continue;
          const options = calc.items?.find(({ id: itemId }) => itemId === item)?.options ?? [];
          expect(
            options.map(({ id: option }) => option),
            `${id}.${item}`,
          ).toContain(optionId);
        }
      }
    }
  });

  it('PERC: idade ≥ 50 e FC ≥ 100 dos dois lados; SpO₂ só preenche o Sim', () => {
    expect(prefillOf('perc-rule', { ageYears: 49, heartRate: 99, spo2: 95 }).items).toEqual({
      age: 'nao',
      hr: 'nao',
    });
    expect(prefillOf('perc-rule', { ageYears: 50, heartRate: 100, spo2: 94 }).items).toEqual({
      age: 'sim',
      hr: 'sim',
      spo2: 'sim',
    });
  });

  it('Wells: FC > 100 (100 ainda é Não)', () => {
    expect(prefillOf('wells-tep', { heartRate: 100 }).items).toEqual({ hr: 'nao' });
    expect(prefillOf('wells-tep', { heartRate: 101 }).items).toEqual({ hr: 'sim' });
  });

  it('CURB-65: FR ≥ 30, idade ≥ 65 e PA (PAS < 90 ou PAD ≤ 60)', () => {
    expect(
      prefillOf('curb65', { respiratoryRate: 29, ageYears: 64, systolicBp: 120, diastolicBp: 61 })
        .items,
    ).toEqual({ rr: 'nao', bp: 'nao', age: 'nao' });
    expect(
      prefillOf('curb65', { respiratoryRate: 30, ageYears: 65, systolicBp: 120, diastolicBp: 60 })
        .items,
    ).toEqual({ rr: 'sim', bp: 'sim', age: 'sim' });
    expect(prefillOf('curb65', { systolicBp: 89 }).items).toEqual({ bp: 'sim' });
    // PAS normal sem a PAD não decide o item.
    expect(prefillOf('curb65', { systolicBp: 130 }).items).toEqual({});
  });

  it('HEART, Ottawa HSA e Alvarado pelos limiares dos rótulos', () => {
    expect(prefillOf('heart-score', { ageYears: 44 }).items).toEqual({ age: 'lt45' });
    expect(prefillOf('heart-score', { ageYears: 45 }).items).toEqual({ age: '45-64' });
    expect(prefillOf('heart-score', { ageYears: 65 }).items).toEqual({ age: 'gte65' });
    expect(prefillOf('ottawa-hsa', { ageYears: 39 }).items).toEqual({ age40: 'nao' });
    expect(prefillOf('ottawa-hsa', { ageYears: 40 }).items).toEqual({ age40: 'sim' });
    expect(prefillOf('alvarado', { temperature: 37.2 }).items).toEqual({ temp: 'nao' });
    expect(prefillOf('alvarado', { temperature: 37.3 }).items).toEqual({ temp: 'sim' });
  });

  it('campo numérico com vírgula; fora da faixa do campo não entra', () => {
    expect(prefillOf('shock-index', { heartRate: 118, systolicBp: 92 }).inputs).toEqual({
      hr: '118',
      sbp: '92',
    });
    expect(prefillOf('shock-index', { heartRate: 290, systolicBp: 92 }).inputs).toEqual({
      sbp: '92',
    });
    const evaluation = evaluateCalculator(definition('shock-index'), {
      inputs: prefillOf('shock-index', { heartRate: 118, systolicBp: 92 }).inputs,
    });
    expect(evaluation.status).toBe('complete');
  });

  it('caso sem o dado, ou calculadora sem ligação, abre vazia', () => {
    expect(prefillOf('perc-rule', {})).toEqual({ items: {}, inputs: {} });
    expect(prefillOf('nihss', { ageYears: 70, heartRate: 120 })).toEqual({ items: {}, inputs: {} });
  });

  it('o prefill nunca fecha um escore sozinho: os itens que o caso não decide ficam abertos', () => {
    const perc = definition('perc-rule');
    const evaluation = evaluateCalculator(perc, {
      items: prefillOf('perc-rule', { ageYears: 30, heartRate: 80, spo2: 99 }).items,
    });
    expect(evaluation.status).toBe('pending');
  });
});

describe('peso, idade e a marca "vindo do caso"', () => {
  it('peso escrito como o campo mostra, dentro da faixa da população', () => {
    expect(caseWeightText(facts({ weightKg: 72.5 }), 'adulto')).toBe('72,5');
    expect(caseWeightText(facts({ weightKg: 18 }), 'adulto')).toBeNull();
    expect(caseWeightText(facts({ weightKg: 18 }), 'pediatrico')).toBe('18');
    expect(caseWeightText(facts({}), 'adulto')).toBeNull();
    expect(caseAgeText(facts({ ageYears: 0.5 }))).toBe('0,5');
    expect(caseAgeText(facts({}))).toBeNull();
  });

  it('o valor continua "vindo do caso" até o médico trocar', () => {
    expect(sameAsCase('72,5', '72,5')).toBe(true);
    expect(sameAsCase('72.5', '72,5')).toBe(true);
    expect(sameAsCase('70,0', '70')).toBe(true);
    expect(sameAsCase('73', '72,5')).toBe(false);
    expect(sameAsCase('', '72,5')).toBe(false);
    expect(sameAsCase(undefined, '72,5')).toBe(false);
    expect(sameAsCase('sim', 'sim')).toBe(true);
    expect(sameAsCase('nao', 'sim')).toBe(false);
    expect(sameAsCase('45-64', '45-64')).toBe(true);
  });
});

describe('o que cada roteiro recebe do caso', () => {
  it('aponta para roteiros do catálogo e calculadoras que existem', () => {
    for (const [toolId, inputs] of Object.entries(TOOL_CASE_INPUTS)) {
      expect(TOOLS.find(({ id }) => id === toolId)?.status, toolId).toBe('disponivel');
      for (const id of inputs.calculators ?? []) {
        expect(caseCalculatorDefinition(id), `${toolId} → ${id}`).toBeDefined();
      }
    }
  });

  it('conta os campos que a ferramenta abre preenchidos', () => {
    const sick = facts({ ageYears: 67, weightKg: 73, heartRate: 131, spo2: 89 });
    expect(caseFieldCount({ kind: 'tool', toolId: 'choque-septico' }, sick)).toBe(1);
    // Wells (FC) + PERC (idade, FC, SpO₂).
    expect(caseFieldCount({ kind: 'tool', toolId: 'tep' }, sick)).toBe(4);
    expect(caseFieldCount({ kind: 'tool', toolId: 'acls' }, sick)).toBe(0);
    expect(caseFieldCount({ kind: 'calculator', calculatorId: 'nihss' }, sick)).toBe(0);
    expect(
      caseFieldCount({ kind: 'tool', toolId: 'pediatria' }, facts({ ageYears: 4, weightKg: 16 })),
    ).toBe(2);
    expect(caseFieldCount({ kind: 'tool', toolId: 'choque-septico' }, facts({}))).toBe(0);
  });
});
