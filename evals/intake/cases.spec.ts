import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { screenClinicalText } from '../../src/modules/copilot/guardrails/clinical-text-screening';
import { CASES_DIR, loadCaseSet } from '../clinical/cases';
import {
  loadIntakeCaseSet,
  SEED_CASES_DIR,
  selectIntakeCases,
  type ExpectedNumber,
} from './case.schema';

const seed = loadIntakeCaseSet(SEED_CASES_DIR);
const clinicalById = new Map(loadCaseSet(CASES_DIR).cases.map((c) => [c.id, c]));

function numbersOf(expected: ExpectedNumber): number[] {
  if (expected === null) return [];
  return Array.isArray(expected) ? expected : [expected];
}

/** "39,4" ou "39.4"; inteiro sozinho, sem casar dentro de outro número. */
function appearsIn(text: string, value: number): boolean {
  const [integer, decimals] = String(value).split('.');
  const pattern = decimals ? `${integer}[,.]${decimals}` : `${integer}(?![,.]?\\d)`;
  return new RegExp(`(?<![\\d,.])${pattern}`).test(text);
}

describe('gabarito da leitura do caso (seed)', () => {
  it('carrega os casos semeados do gabarito clínico', () => {
    expect(seed.cases.length).toBeGreaterThanOrEqual(30);
    expect(seed.version).toMatch(/^[0-9a-f]{12}$/);
  });

  it('nunca guarda caso real no git: o seed só tem casos do gabarito clínico', () => {
    expect(seed.cases.filter((c) => c.source.kind !== 'clinical_case')).toEqual([]);
  });

  it.each(seed.cases.map((c) => [c.id, c] as const))(
    '%s: mesmo texto e red flags do caso do gabarito clínico',
    (_id, intakeCase) => {
      if (intakeCase.source.kind !== 'clinical_case') return;
      const clinical = clinicalById.get(intakeCase.source.caseId);
      expect(clinical, `caso clínico ${intakeCase.source.caseId}`).toBeDefined();
      expect(intakeCase.id).toBe(intakeCase.source.caseId);
      expect(intakeCase.input.caseText).toBe(clinical?.input.caseText);
      expect(intakeCase.input.redFlags).toEqual(clinical?.input.redFlags);
    },
  );

  it.each(seed.cases.map((c) => [c.id, c] as const))(
    '%s: cada número do gabarito está no texto que o modelo recebe (depois da máscara de PII)',
    (_id, intakeCase) => {
      const { redacted } = screenClinicalText(intakeCase.input.caseText, null);
      const { age, vitals } = intakeCase.expected;
      const expectedNumbers = [...numbersOf(age), ...Object.values(vitals).flatMap(numbersOf)];
      const missing = expectedNumbers.filter((value) => !appearsIn(redacted, value));
      expect(missing).toEqual([]);
    },
  );

  it('selects by id and glob, as a union', () => {
    const ids = selectIntakeCases(seed.cases, 'kb004-anafilaxia-alimentar,cm-*').map((c) => c.id);
    expect(ids).toContain('kb004-anafilaxia-alimentar');
    expect(ids.filter((id) => id.startsWith('cm-')).length).toBeGreaterThan(1);
    expect(() => selectIntakeCases(seed.cases, 'nao-existe')).toThrow(/nenhum caso/);
  });

  it('explains where the real anonymized cases go when the folder is missing', () => {
    expect(() => loadIntakeCaseSet(join(__dirname, 'pasta-que-nao-existe'))).toThrow(/fora do git/);
  });
});
