/**
 * ADR-010 — Vocabulário fechado para classificar documentos oficiais.
 *
 * `cenario` hoje só existe como texto livre no front-matter dos pacotes
 * curados (`docs/guidelines/drafts/`) e no seed. Esta lista é a fonte única
 * para a classificação automática: a LLM só pode escolher daqui, e
 * `clinical-vocabulary.spec.ts` falha se um pacote novo usar um cenário que
 * não está aqui.
 */
export const PILOT_CENARIOS = [
  'anafilaxia_urticaria',
  'ansiedade_agitacao_ps',
  'avc_agudo',
  'cefaleia',
  'celulite_erisipela',
  'choque',
  'choque_indiferenciado',
  'colica_renal',
  'crise_asmatica',
  'crise_convulsiva',
  'crise_hipertensiva',
  'dengue_arbovirose',
  'dispneia_dpoc_exacerbado',
  'dissecao_aortica',
  'dor_abdominal_aguda',
  'dor_toracica',
  'febre_aguda_indiferenciada',
  'febre_sem_foco_adulto',
  'gastroenterite_desidratacao',
  'hemorragia_subaracnoidea',
  'hipoglicemia_hiperglicemia',
  'intoxicacao_exogena',
  'itu_pielonefrite',
  'lombalgia',
  'pneumonia_comunitaria',
  'sepse',
  'sindrome_gripal_ivas',
  'trauma',
  'tvp_tep_suspeito',
  'vertigem',
] as const;

export type PilotCenario = (typeof PILOT_CENARIOS)[number];

/** Especialidades já usadas na base curada, mais as que a base oficial exige. */
export const SPECIALTIES = [
  'alergia_imunologia',
  'cardiologia',
  'cirurgia_geral',
  'cirurgia_trauma',
  'clinica_medica',
  'dermatologia',
  'endocrinologia',
  'gastroenterologia',
  'genetica_medica',
  'geriatria',
  'ginecologia_obstetricia',
  'hematologia',
  'infectologia',
  'medicina_de_emergencia',
  'medicina_intensiva',
  'nefrologia',
  'neurologia',
  'oftalmologia',
  'oncologia',
  'ortopedia',
  'pediatria',
  'pneumologia',
  'psiquiatria',
  'reumatologia',
  'toxicologia',
  'urologia',
] as const;

export type Specialty = (typeof SPECIALTIES)[number];
