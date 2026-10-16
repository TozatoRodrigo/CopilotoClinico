import { describe, expect, it } from 'vitest';
import { physicianSpecialtyValues } from '@contracts/clinical';
import { isPhysicianSpecialty, PHYSICIAN_SPECIALTY_OPTIONS } from '../physician-specialty';

// CC-014 — o onboarding e o perfil oferecem as especialidades do contrato e
// mandam o slug; o PATCH /auth/me recusa o que estiver fora da lista.
describe('physician specialty options', () => {
  it('offers every specialty of the contract, in its order, each with a label', () => {
    expect(PHYSICIAN_SPECIALTY_OPTIONS.map((option) => option.value)).toEqual([
      ...physicianSpecialtyValues,
    ]);
    for (const option of PHYSICIAN_SPECIALTY_OPTIONS) {
      expect(option.label.trim()).not.toBe('');
    }
    const labels = PHYSICIAN_SPECIALTY_OPTIONS.map((option) => option.label);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it('keeps the labels the onboarding already showed', () => {
    expect(PHYSICIAN_SPECIALTY_OPTIONS[0]).toEqual({
      value: 'medicina_de_emergencia',
      label: 'Emergência',
    });
    expect(PHYSICIAN_SPECIALTY_OPTIONS.at(-1)).toEqual({ value: 'outra', label: 'Outra' });
  });

  it('accepts slugs only, not the screen labels', () => {
    expect(isPhysicianSpecialty('pediatria')).toBe(true);
    expect(isPhysicianSpecialty('Emergência')).toBe(false);
    expect(isPhysicianSpecialty(undefined)).toBe(false);
  });
});
