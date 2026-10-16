import { physicianSpecialtyValues } from '@/lib/clinical-contract';
import type { PhysicianSpecialty } from '@/lib/types';

/**
 * CC-014 — rótulo de cada especialidade do médico. O banco guarda o slug do
 * contrato (validado no PATCH /auth/me); a tela mostra o rótulo. O `Record`
 * obriga a ter rótulo para toda especialidade nova do contrato.
 */
const PHYSICIAN_SPECIALTY_LABELS: Record<PhysicianSpecialty, string> = {
  medicina_de_emergencia: 'Emergência',
  clinica_medica: 'Clínica Médica',
  cardiologia: 'Cardiologia',
  pneumologia: 'Pneumologia',
  pediatria: 'Pediatria',
  neurologia: 'Neurologia',
  cirurgia_geral: 'Cirurgia Geral',
  ortopedia: 'Ortopedia',
  ginecologia_obstetricia: 'Ginecologia/Obstetrícia',
  psiquiatria: 'Psiquiatria',
  anestesiologia: 'Anestesiologia',
  outra: 'Outra',
};

/** Opções na ordem do contrato (a do onboarding): emergência primeiro, "Outra" por último. */
export const PHYSICIAN_SPECIALTY_OPTIONS: readonly { value: PhysicianSpecialty; label: string }[] =
  physicianSpecialtyValues.map((value) => ({ value, label: PHYSICIAN_SPECIALTY_LABELS[value] }));

export function isPhysicianSpecialty(value: unknown): value is PhysicianSpecialty {
  return (physicianSpecialtyValues as readonly unknown[]).includes(value);
}
