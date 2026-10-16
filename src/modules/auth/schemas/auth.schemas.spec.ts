import { describe, expect, it } from 'vitest';
import { physicianSpecialtyValues } from '../../../shared/contracts/clinical';
import { updateProfileSchema } from './auth.schemas';

// CC-014 — o z.object descartava `specialty` sem erro: o onboarding achava que
// tinha salvo e a especialidade nunca chegava ao banco.
describe('updateProfileSchema — specialty', () => {
  it('keeps every specialty the onboarding offers', () => {
    for (const specialty of physicianSpecialtyValues) {
      expect(updateProfileSchema.parse({ specialty })).toEqual({ specialty });
    }
  });

  it('keeps the specialty next to the name, as the onboarding sends them', () => {
    expect(updateProfileSchema.parse({ name: 'Dra. Ana', specialty: 'pediatria' })).toEqual({
      name: 'Dra. Ana',
      specialty: 'pediatria',
    });
  });

  it('rejects a value outside the list instead of dropping it', () => {
    // O rótulo da tela não é o valor gravado: o web manda o slug.
    expect(updateProfileSchema.safeParse({ specialty: 'Emergência' }).success).toBe(false);
    expect(updateProfileSchema.safeParse({ specialty: '' }).success).toBe(false);
  });

  it('leaves the specialty untouched when the field is absent', () => {
    expect(updateProfileSchema.parse({ name: 'Dra. Ana' })).toEqual({ name: 'Dra. Ana' });
  });
});
