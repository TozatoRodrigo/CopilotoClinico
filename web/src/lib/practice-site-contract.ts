/**
 * CC-602 — espelho dos VALORES de src/shared/contracts/practice-site.ts que o
 * web usa em runtime (listas fechadas, rótulos e tetos do formulário).
 *
 * A imagem do web (docker/Dockerfile.web) copia só `web/`: de `@contracts/*`
 * o web importa só tipos. Mudou lá, muda aqui — tests/web-mirrors/practice-site.spec.ts
 * (raiz) falha se as duas cópias divergirem.
 */

export const FACILITY_TYPES = [
  'upa_porte_1',
  'upa_porte_2',
  'upa_porte_3',
  'ps_hospital',
  'hospital_com_uti',
  'hospital_referencia',
  'outro',
] as const;

export const FACILITY_TYPE_LABELS = {
  upa_porte_1: 'UPA 24h porte I',
  upa_porte_2: 'UPA 24h porte II',
  upa_porte_3: 'UPA 24h porte III',
  ps_hospital: 'PS de hospital de pequeno porte',
  hospital_com_uti: 'Hospital com UTI',
  hospital_referencia: 'Hospital de referência (alta complexidade)',
  outro: 'Outro serviço de urgência',
} as const;

export const SITE_SPECIALISTS = [
  'cirurgia_geral',
  'ortopedia',
  'pediatria',
  'obstetricia',
  'cardiologia',
  'hemodinamica',
  'neurologia',
  'neurocirurgia',
  'cirurgia_vascular',
  'anestesiologia',
  'psiquiatria',
] as const;

export const SITE_SPECIALIST_LABELS = {
  cirurgia_geral: 'Cirurgia geral',
  ortopedia: 'Ortopedia',
  pediatria: 'Pediatria',
  obstetricia: 'Ginecologia e obstetrícia',
  cardiologia: 'Cardiologia',
  hemodinamica: 'Hemodinâmica',
  neurologia: 'Neurologia',
  neurocirurgia: 'Neurocirurgia',
  cirurgia_vascular: 'Cirurgia vascular',
  anestesiologia: 'Anestesiologia',
  psiquiatria: 'Psiquiatria',
} as const;

export const PRACTICE_SITE_LIMITS = {
  nameMaxChars: 80,
  sitesPerPhysician: 10,
  referenceTravelMinutesMax: 1440,
  referenceDistanceKmMax: 3000,
} as const;
