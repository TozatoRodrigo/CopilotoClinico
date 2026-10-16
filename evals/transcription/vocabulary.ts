/**
 * CC-205 — vocabulário clínico que a transcrição não pode errar. Médico pode
 * editar: acrescente o que aparece nos ditados e o modelo costuma trocar.
 *
 * - `droga` e `termo`: palavra inteira, sem caixa e sem acento. `aliases` só
 *   para grafias da mesma coisa ("ceftriaxone"), nunca para sinônimos: se o
 *   médico disse "noradrenalina" e saiu "norepinefrina", a transcrição errou.
 * - `unidade`: a forma canônica de clinical.ts (`readUnit`). Conta toda vez
 *   que vem depois de um número, escrita de qualquer jeito: "mcg/kg/min" e
 *   "microgramas por quilo por minuto" são a mesma unidade.
 */

export const VOCABULARY_KINDS = ['droga', 'unidade', 'termo'] as const;
export type VocabularyKind = (typeof VOCABULARY_KINDS)[number];

export const VOCABULARY_KIND_LABELS: Record<VocabularyKind, string> = {
  droga: 'drogas',
  unidade: 'unidades',
  termo: 'siglas e termos',
};

export type VocabularyEntry =
  | { kind: 'droga' | 'termo'; term: string; aliases?: readonly string[] }
  | { kind: 'unidade'; term: string };

const DRUGS: readonly string[] = [
  'adrenalina',
  'noradrenalina',
  'dobutamina',
  'dopamina',
  'vasopressina',
  'amiodarona',
  'adenosina',
  'atropina',
  'lidocaína',
  'midazolam',
  'diazepam',
  'fentanil',
  'cetamina',
  'propofol',
  'etomidato',
  'succinilcolina',
  'rocurônio',
  'morfina',
  'tramadol',
  'dipirona',
  'paracetamol',
  'ibuprofeno',
  'cetoprofeno',
  'ondansetrona',
  'metoclopramida',
  'bromoprida',
  'omeprazol',
  'ceftriaxona',
  'cefepime',
  'piperacilina',
  'tazobactam',
  'meropenem',
  'vancomicina',
  'azitromicina',
  'amoxicilina',
  'clavulanato',
  'clindamicina',
  'metronidazol',
  'oseltamivir',
  'aciclovir',
  'heparina',
  'enoxaparina',
  'alteplase',
  'tenecteplase',
  'AAS',
  'clopidogrel',
  'ticagrelor',
  'nitroglicerina',
  'nitroprussiato',
  'captopril',
  'hidralazina',
  'labetalol',
  'metoprolol',
  'furosemida',
  'insulina',
  'glicose',
  'bicarbonato de sódio',
  'cloreto de potássio',
  'sulfato de magnésio',
  'gluconato de cálcio',
  'hidrocortisona',
  'metilprednisolona',
  'dexametasona',
  'prednisona',
  'salbutamol',
  'fenoterol',
  'ipratrópio',
  'fenitoína',
  'levetiracetam',
  'haloperidol',
  'naloxona',
  'flumazenil',
  'manitol',
  'soro fisiológico',
  'ringer lactato',
];

/** Acento e caixa já não contam; aqui só grafias diferentes da mesma droga. */
const DRUG_SPELLINGS: Readonly<Record<string, readonly string[]>> = {
  ceftriaxona: ['ceftriaxone'],
  cefepime: ['cefepima'],
};

const UNITS: readonly string[] = [
  'mg',
  'mcg',
  'g',
  'mL',
  'UI',
  'mEq',
  'mg/kg',
  'mcg/kg',
  'mcg/kg/min',
  'mg/kg/h',
  'mL/kg',
  'mL/h',
  'UI/kg',
  'mmHg',
  '°C',
  '%',
];

const TERMS: readonly string[] = [
  'PA',
  'FC',
  'FR',
  'SpO2',
  'HGT',
  'Glasgow',
  'ECG',
  'IOT',
  'VNI',
  'SNG',
  'SVD',
  'AVC',
  'IAM',
  'TEP',
  'TVP',
  'DPOC',
  'BEG',
  'REG',
  'EV',
  'IM',
  'VO',
  'SC',
  'dispneia',
  'taquicardia',
  'bradicardia',
  'hipotensão',
  'dessaturação',
  'sibilos',
  'estertores',
  'crepitações',
  'rebaixamento',
  'sepse',
  'choque',
  'oligúria',
  'hemiparesia',
  'afasia',
  'disartria',
  'anisocoria',
  'petéquias',
  'icterícia',
  'cianose',
  'melena',
  'hematêmese',
];

export const CLINICAL_VOCABULARY: readonly VocabularyEntry[] = [
  ...DRUGS.map((term): VocabularyEntry => ({ kind: 'droga', term, aliases: DRUG_SPELLINGS[term] })),
  ...UNITS.map((term): VocabularyEntry => ({ kind: 'unidade', term })),
  ...TERMS.map((term): VocabularyEntry => ({ kind: 'termo', term })),
];
