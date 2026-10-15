/**
 * CC-602 — local de plantão do médico: o que o serviço tem, o porte, os
 * especialistas e a distância até a referência. Salvo nas configurações e
 * aplicado ao caso como contexto. Nunca carrega dado de paciente.
 *
 * Listas fechadas de propósito: o que vai para o prompt sai daqui, nunca de
 * texto livre (o nome do local só aparece na tela).
 */

/** Porte do serviço (UPA 24h: Portaria GM/MS nº 10/2017). */
export const FACILITY_TYPES = [
  'upa_porte_1',
  'upa_porte_2',
  'upa_porte_3',
  'ps_hospital',
  'hospital_com_uti',
  'hospital_referencia',
  'outro',
] as const;

export type FacilityType = (typeof FACILITY_TYPES)[number];

export const FACILITY_TYPE_LABELS: Readonly<Record<FacilityType, string>> = {
  upa_porte_1: 'UPA 24h porte I',
  upa_porte_2: 'UPA 24h porte II',
  upa_porte_3: 'UPA 24h porte III',
  ps_hospital: 'PS de hospital de pequeno porte',
  hospital_com_uti: 'Hospital com UTI',
  hospital_referencia: 'Hospital de referência (alta complexidade)',
  outro: 'Outro serviço de urgência',
};

/** Especialistas presentes ou de sobreaviso no plantão, além do emergencista. */
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

export type SiteSpecialist = (typeof SITE_SPECIALISTS)[number];

export const SITE_SPECIALIST_LABELS: Readonly<Record<SiteSpecialist, string>> = {
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
};

/** Tetos validados no servidor e repetidos no formulário. */
export const PRACTICE_SITE_LIMITS = {
  nameMaxChars: 80,
  sitesPerPhysician: 10,
  /** 24 h: além disso o número é erro de digitação, não distância de regulação. */
  referenceTravelMinutesMax: 1440,
  referenceDistanceKmMax: 3000,
} as const;

/**
 * O local como ele entra no contexto do caso: uma cópia do perfil no momento
 * em que o médico o escolheu. Editar o perfil depois não muda o caso.
 */
export interface EncounterSite {
  /** Perfil de onde veio; `null` quando o perfil foi apagado depois. */
  siteId: string | null;
  /** Só para a tela: o nome nunca vai para o prompt. */
  name: string;
  facilityType: FacilityType;
  specialists: SiteSpecialist[];
  /** Minutos até o hospital de referência; `null` = não informado. */
  referenceTravelMinutes: number | null;
  referenceDistanceKm: number | null;
}

/** Corpo de POST e PUT `/physicians/me/practice-sites`. */
export interface PracticeSiteInput {
  name: string;
  facilityType: FacilityType;
  hasCT: boolean;
  hasLab: boolean;
  hasICU: boolean;
  isSus: boolean;
  specialists: SiteSpecialist[];
  referenceTravelMinutes: number | null;
  referenceDistanceKm: number | null;
  /** O local que preenche o caso novo. O primeiro local salvo vira o padrão. */
  isDefault: boolean;
}

export interface PracticeSite extends PracticeSiteInput {
  id: string;
  createdAt: string;
  updatedAt: string;
}
