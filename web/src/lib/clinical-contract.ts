/**
 * Espelho dos VALORES de src/shared/contracts/clinical.ts que o web usa em
 * runtime.
 *
 * A imagem do web (docker/Dockerfile.web) copia só `web/`: de `@contracts/*`
 * o web importa só tipos. Mudou lá, muda aqui — tests/web-mirrors/clinical.spec.ts
 * (raiz) falha se as duas cópias divergirem.
 */

/** CC-014 — slugs da especialidade do médico, na ordem do onboarding. */
export const physicianSpecialtyValues = [
  'medicina_de_emergencia',
  'clinica_medica',
  'cardiologia',
  'pneumologia',
  'pediatria',
  'neurologia',
  'cirurgia_geral',
  'ortopedia',
  'ginecologia_obstetricia',
  'psiquiatria',
  'anestesiologia',
  'outra',
] as const;
