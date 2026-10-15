import type { ContentProvenance } from '../provenance';

/**
 * Infusões contínuas do ANY App como dado tipado (ADR-017, CC-311): as 16
 * drogas do `drugConfigs.ts` do v4, com diluição padrão, faixa por modo de
 * indicação, limiares de cor, bolus e ampola para a "minha diluição".
 *
 * Doses, faixas, limiares e textos são os do ANY, sem mudança clínica (o teste
 * diferencial compara campo a campo com a referência congelada). O que pareceu
 * inconsistente foi para docs/ferramentas/revisao-clinica/infusoes.md.
 */

export const ANY_V4_INFUSION_SOURCE = 'ANY App v4 · drugConfigs.ts e DoseCalculator.tsx (95c8fba)';

const PROVENANCE: ContentProvenance = {
  source: ANY_V4_INFUSION_SOURCE,
  version: '1.0.0',
  updatedAt: '2026-10-14',
  review: { status: 'pendente' },
};

/** Grupos da lista, na ordem do ANY. */
export const INFUSION_CATEGORIES = [
  { id: 'vasopressors', label: 'Vasopressores e inotrópicos' },
  { id: 'sedation', label: 'Sedação e analgesia' },
  { id: 'neuromuscular', label: 'Bloqueadores neuromusculares' },
  { id: 'vasodilators', label: 'Vasodilatadores' },
] as const;

export type InfusionCategory = (typeof INFUSION_CATEGORIES)[number]['id'];

export type ConcentrationUnit = 'mcg/mL' | 'mg/mL' | 'UI/mL';
export type DoseUnit = 'mcg/kg/min' | 'mcg/kg/h' | 'mg/kg/h' | 'mg/h' | 'UI/min';

/**
 * Caixa de bolus/ataque de um modo. As linhas são texto do ANY; `perKg` ou
 * `perKgRange` geram a linha "Este paciente".
 */
export interface DrugBolus {
  title: string;
  rows: readonly { label: string; value: string }[];
  perKg?: number;
  /** Ataque em faixa (ex.: propofol 0,5 a 2,5 mg/kg). */
  perKgRange?: readonly [number, number];
  /** Teto por bolus (não é a dose cumulativa, que fica no texto "Repetir"). */
  capPerBolus?: number;
  /** Unidade do cálculo por kg; sem ela, mg. */
  unit?: string;
}

/** Modo por indicação: troca a faixa do controle e os limiares de cor. */
export interface DrugMode {
  id: string;
  label: string;
  doseMin: number;
  doseMax: number;
  doseStep: number;
  doseDefault: number;
  cautionThreshold?: number;
  criticalThreshold?: number;
  /** Faixa por extenso, como o ANY mostra. */
  rangeLabel: string;
  bolus?: DrugBolus;
}

export interface DrugDilution {
  label: string;
  concentration: number;
  isDefault?: boolean;
}

/**
 * Ampola de referência da "minha diluição". `mass` na mesma unidade de massa
 * da concentração (concentração = ampolas × mass ÷ volume). Sem `volume`
 * (pó), a trava de volume mínimo não se aplica. Droga sem ampola não oferece
 * diluição própria (propofol: puro, não diluir).
 */
export interface DrugAmpoule {
  mass: number;
  volume?: number;
  label: string;
}

export interface InfusionDrug {
  id: string;
  name: string;
  aliases: readonly string[];
  category: InfusionCategory;
  /** Preparo da diluição padrão, por extenso. */
  presentation: string;
  concentration: number;
  concentrationUnit: ConcentrationUnit;
  doseUnit: DoseUnit;
  doseMin: number;
  doseMax: number;
  doseStep: number;
  doseDefault: number;
  /** Acima: atenção (amarelo no ANY). */
  cautionThreshold?: number;
  /** Acima: dose crítica (vermelho). */
  criticalThreshold?: number;
  /** 60 para dose por minuto (mL/h é por hora); 1 para dose por hora. */
  factor: 1 | 60;
  usesWeight: boolean;
  dilutions?: readonly DrugDilution[];
  /** Sem modos, a droga tem faixa única. */
  modes?: readonly DrugMode[];
  ampoule?: DrugAmpoule;
  provenance: ContentProvenance;
}

export const INFUSION_DRUGS: readonly InfusionDrug[] = [
  // === Vasopressores e inotrópicos ===
  {
    id: 'noradrenalina',
    name: 'Noradrenalina',
    aliases: ['norepinefrina', 'nora', 'ne', 'levophed'],
    category: 'vasopressors',
    presentation: '16 mg (4 amp 4mL — 4mg/4mL) + SF 0,9% 234 mL = 250 mL',
    concentration: 64,
    concentrationUnit: 'mcg/mL',
    doseUnit: 'mcg/kg/min',
    doseMin: 0.01,
    doseMax: 3.0,
    doseStep: 0.01,
    doseDefault: 0.1,
    cautionThreshold: 1,
    criticalThreshold: 2,
    factor: 60,
    usesWeight: true,
    ampoule: { mass: 4000, volume: 4, label: '4 mg / 4 mL' },
    dilutions: [
      { label: 'Padrão (64 mcg/mL)', concentration: 64, isDefault: true },
      { label: 'Dobrada (128 mcg/mL)', concentration: 128 },
    ],
    provenance: PROVENANCE,
  },
  {
    id: 'adrenalina',
    name: 'Adrenalina',
    aliases: ['epinefrina', 'epi'],
    category: 'vasopressors',
    presentation: '16 mg (16 amp 1mL — 1mg/mL) + SF 0,9% 234 mL = 250 mL',
    concentration: 64,
    concentrationUnit: 'mcg/mL',
    doseUnit: 'mcg/kg/min',
    doseMin: 0.05,
    doseMax: 2.0,
    doseStep: 0.01,
    doseDefault: 0.1,
    cautionThreshold: 0.5,
    criticalThreshold: 1,
    factor: 60,
    usesWeight: true,
    ampoule: { mass: 1000, volume: 1, label: '1 mg / 1 mL' },
    provenance: PROVENANCE,
  },
  {
    id: 'dobutamina',
    name: 'Dobutamina',
    aliases: ['dobuta', 'dobutrex'],
    category: 'vasopressors',
    presentation: '250 mg (1 amp 20mL — 12,5mg/mL) + SF 0,9% 230 mL = 250 mL',
    concentration: 1000,
    concentrationUnit: 'mcg/mL',
    doseUnit: 'mcg/kg/min',
    doseMin: 2,
    doseMax: 40,
    doseStep: 1,
    doseDefault: 5,
    cautionThreshold: 20,
    criticalThreshold: 30,
    factor: 60,
    usesWeight: true,
    ampoule: { mass: 250000, volume: 20, label: '250 mg / 20 mL' },
    dilutions: [
      { label: 'Padrão (1000 mcg/mL)', concentration: 1000, isDefault: true },
      { label: 'Dobrada (2000 mcg/mL)', concentration: 2000 },
      { label: 'Quádrupla (4000 mcg/mL)', concentration: 4000 },
    ],
    provenance: PROVENANCE,
  },
  {
    id: 'dopamina',
    name: 'Dopamina',
    aliases: ['dopa'],
    category: 'vasopressors',
    presentation: '250 mg (1 amp 50mL — 5mg/mL) + SF 0,9% 200 mL = 250 mL',
    concentration: 1000,
    concentrationUnit: 'mcg/mL',
    doseUnit: 'mcg/kg/min',
    doseMin: 2,
    doseMax: 50,
    doseStep: 1,
    doseDefault: 5,
    cautionThreshold: 20,
    criticalThreshold: 40,
    factor: 60,
    usesWeight: true,
    ampoule: { mass: 250000, volume: 50, label: '250 mg / 50 mL' },
    provenance: PROVENANCE,
  },
  {
    id: 'vasopressina',
    name: 'Vasopressina',
    aliases: ['vaso', 'avp', 'pitressin'],
    category: 'vasopressors',
    presentation: '40 UI (2 amp 1mL — 20UI/mL) + SF 0,9% 98 mL = 100 mL',
    concentration: 0.4,
    concentrationUnit: 'UI/mL',
    doseUnit: 'UI/min',
    doseMin: 0.01,
    doseMax: 0.04,
    doseStep: 0.005,
    doseDefault: 0.03,
    factor: 60,
    usesWeight: false,
    ampoule: { mass: 20, volume: 1, label: '20 UI / 1 mL' },
    provenance: PROVENANCE,
  },
  {
    id: 'milrinona',
    name: 'Milrinona',
    aliases: ['milri', 'primacor'],
    category: 'vasopressors',
    presentation: '20 mg (1 amp 20mL — 1mg/mL) + SF 0,9% 80 mL = 100 mL',
    concentration: 200,
    concentrationUnit: 'mcg/mL',
    doseUnit: 'mcg/kg/min',
    doseMin: 0.375,
    doseMax: 0.75,
    doseStep: 0.025,
    doseDefault: 0.5,
    factor: 60,
    usesWeight: true,
    ampoule: { mass: 20000, volume: 20, label: '20 mg / 20 mL' },
    provenance: PROVENANCE,
  },

  // === Sedação e analgesia ===
  {
    id: 'midazolam',
    name: 'Midazolam',
    aliases: ['mida', 'dormonid', 'dormicum'],
    category: 'sedation',
    presentation: '250 mg (5 amp 10mL — 5mg/mL) + SF 0,9% 200 mL = 250 mL',
    concentration: 1,
    concentrationUnit: 'mg/mL',
    doseUnit: 'mg/kg/h',
    doseMin: 0.04,
    doseMax: 0.2,
    doseStep: 0.01,
    doseDefault: 0.1,
    cautionThreshold: 0.15,
    criticalThreshold: 0.2,
    factor: 1,
    usesWeight: true,
    ampoule: { mass: 50, volume: 10, label: '50 mg / 10 mL' },
    modes: [
      {
        id: 'sedacao',
        label: 'Sedação',
        doseMin: 0.04,
        doseMax: 0.2,
        doseStep: 0.01,
        doseDefault: 0.1,
        cautionThreshold: 0.15,
        criticalThreshold: 0.2,
        rangeLabel: '0,04 - 0,2 mg/kg/h',
      },
      {
        id: 'status',
        label: 'Status epilepticus',
        doseMin: 0.05,
        doseMax: 2,
        doseStep: 0.05,
        doseDefault: 0.5,
        cautionThreshold: 1.5,
        criticalThreshold: 2,
        rangeLabel: '0,05 - 2,0 mg/kg/h',
        bolus: {
          title: 'Bolus (Status epilepticus)',
          rows: [
            { label: 'Dose', value: '0,2 mg/kg IV' },
            { label: 'Repetir', value: '5/5 min até máx 20 mg' },
          ],
          perKg: 0.2,
          capPerBolus: 20,
        },
      },
    ],
    provenance: PROVENANCE,
  },
  {
    id: 'fentanil',
    name: 'Fentanil',
    aliases: ['fenta', 'fentanyl'],
    category: 'sedation',
    presentation: 'Puro — 50 mcg/mL (ampola 10 mL)',
    concentration: 50,
    concentrationUnit: 'mcg/mL',
    doseUnit: 'mcg/kg/h',
    doseMin: 0.3,
    doseMax: 2.0,
    doseStep: 0.1,
    doseDefault: 1.0,
    factor: 1,
    usesWeight: true,
    ampoule: { mass: 500, volume: 10, label: '500 mcg / 10 mL' },
    provenance: PROVENANCE,
  },
  {
    id: 'propofol',
    name: 'Propofol',
    aliases: ['diprivan'],
    category: 'sedation',
    presentation: 'Puro — 10 mg/mL (NÃO diluir)',
    concentration: 10,
    concentrationUnit: 'mg/mL',
    doseUnit: 'mg/kg/h',
    doseMin: 1,
    doseMax: 4,
    doseStep: 0.1,
    doseDefault: 2,
    cautionThreshold: 3,
    criticalThreshold: 4,
    factor: 1,
    usesWeight: true,
    modes: [
      {
        id: 'sedacao',
        label: 'Sedação',
        doseMin: 1,
        doseMax: 4,
        doseStep: 0.1,
        doseDefault: 2,
        cautionThreshold: 3,
        criticalThreshold: 4,
        rangeLabel: '1,0 - 4,0 mg/kg/h',
      },
      {
        id: 'status',
        label: 'Status epilepticus',
        doseMin: 0.3,
        doseMax: 4.8,
        doseStep: 0.1,
        doseDefault: 2,
        cautionThreshold: 3,
        criticalThreshold: 4.8,
        rangeLabel: '0,3 - 4,8 mg/kg/h',
        bolus: {
          title: 'Bolus (Status epilepticus)',
          rows: [
            { label: 'Dose', value: '0,5 - 2,5 mg/kg IV' },
            { label: 'Repetir', value: '5/5 min até máx 10 mg/kg' },
          ],
          perKgRange: [0.5, 2.5],
        },
      },
    ],
    provenance: PROVENANCE,
  },
  {
    id: 'dexmedetomidina',
    name: 'Dexmedetomidina',
    aliases: ['dex', 'precedex'],
    category: 'sedation',
    presentation: '400 mcg (2 amp 2mL — 100mcg/mL) + SF 0,9% 96 mL = 100 mL',
    concentration: 4,
    concentrationUnit: 'mcg/mL',
    doseUnit: 'mcg/kg/h',
    doseMin: 0.2,
    doseMax: 1.4,
    doseStep: 0.1,
    doseDefault: 0.7,
    cautionThreshold: 0.7,
    criticalThreshold: 1.4,
    factor: 1,
    usesWeight: true,
    ampoule: { mass: 200, volume: 2, label: '200 mcg / 2 mL' },
    provenance: PROVENANCE,
  },
  {
    id: 'cetamina',
    name: 'Cetamina',
    aliases: ['ceta', 'ketamina', 'ketalar'],
    category: 'sedation',
    presentation: '500 mg (1 amp 10mL — 50mg/mL) + SF 0,9% 90 mL = 100 mL',
    concentration: 5,
    concentrationUnit: 'mg/mL',
    doseUnit: 'mg/kg/h',
    doseMin: 0.5,
    doseMax: 2.0,
    doseStep: 0.1,
    doseDefault: 1.0,
    cautionThreshold: 1.5,
    criticalThreshold: 2,
    factor: 1,
    usesWeight: true,
    ampoule: { mass: 500, volume: 10, label: '500 mg / 10 mL' },
    modes: [
      {
        id: 'sedacao',
        label: 'Sedação',
        doseMin: 0.5,
        doseMax: 2,
        doseStep: 0.1,
        doseDefault: 1,
        cautionThreshold: 1.5,
        criticalThreshold: 2,
        rangeLabel: '0,5 - 2,0 mg/kg/h',
      },
      {
        id: 'status',
        label: 'Status epilepticus',
        doseMin: 1.2,
        doseMax: 7.5,
        doseStep: 0.1,
        doseDefault: 3,
        cautionThreshold: 5,
        criticalThreshold: 7.5,
        rangeLabel: '1,2 - 7,5 mg/kg/h',
        bolus: {
          title: 'Bolus (Status epilepticus)',
          rows: [
            { label: 'Dose', value: '1,5 mg/kg IV' },
            { label: 'Repetir', value: '5/5 min até máx 4,5 mg/kg' },
          ],
          perKg: 1.5,
        },
      },
    ],
    provenance: PROVENANCE,
  },
  {
    // Dose em mg/h, sem peso (como no v1 do ANY).
    id: 'morfina',
    name: 'Morfina',
    aliases: ['morphine', 'dimorf'],
    category: 'sedation',
    presentation: '100 mg (10 amp 1mL — 10mg/mL) + SF 0,9% 90 mL = 100 mL',
    concentration: 1,
    concentrationUnit: 'mg/mL',
    doseUnit: 'mg/h',
    doseMin: 1,
    doseMax: 10,
    doseStep: 0.5,
    doseDefault: 2,
    cautionThreshold: 5,
    criticalThreshold: 8,
    factor: 1,
    usesWeight: false,
    ampoule: { mass: 10, volume: 1, label: '10 mg / 1 mL' },
    provenance: PROVENANCE,
  },

  // === Bloqueadores neuromusculares ===
  {
    id: 'cisatracurio',
    name: 'Cisatracúrio',
    aliases: ['cisa', 'nimbex'],
    category: 'neuromuscular',
    presentation: '100 mg (5 amp 10mL — 2mg/mL) + SF 0,9% qsp 100 mL',
    concentration: 1000,
    concentrationUnit: 'mcg/mL',
    doseUnit: 'mcg/kg/min',
    doseMin: 1,
    doseMax: 3,
    doseStep: 0.5,
    doseDefault: 2,
    cautionThreshold: 2.5,
    criticalThreshold: 3,
    factor: 60,
    usesWeight: true,
    ampoule: { mass: 20000, volume: 10, label: '20 mg / 10 mL' },
    provenance: PROVENANCE,
  },
  {
    id: 'rocuronio',
    name: 'Rocurônio',
    aliases: ['rocu', 'esmeron'],
    category: 'neuromuscular',
    presentation: '500 mg (5 amp 10mL — 10mg/mL) + SF 0,9% qsp 100 mL',
    concentration: 5000,
    concentrationUnit: 'mcg/mL',
    doseUnit: 'mcg/kg/min',
    doseMin: 5,
    doseMax: 12,
    doseStep: 1,
    doseDefault: 10,
    factor: 60,
    usesWeight: true,
    ampoule: { mass: 100000, volume: 10, label: '100 mg / 10 mL' },
    provenance: PROVENANCE,
  },

  // === Vasodilatadores ===
  {
    id: 'nitroglicerina',
    name: 'Nitroglicerina',
    aliases: ['nitro', 'tridil'],
    category: 'vasodilators',
    presentation: '50 mg (1 amp 10mL — 5mg/mL) + SF 0,9% 240 mL = 250 mL',
    concentration: 200,
    concentrationUnit: 'mcg/mL',
    doseUnit: 'mcg/kg/min',
    doseMin: 0.25,
    doseMax: 2,
    doseStep: 0.05,
    doseDefault: 0.5,
    cautionThreshold: 2,
    criticalThreshold: 5,
    factor: 60,
    usesWeight: true,
    ampoule: { mass: 50000, volume: 10, label: '50 mg / 10 mL' },
    modes: [
      {
        id: 'padrao',
        label: 'Padrão',
        doseMin: 0.25,
        doseMax: 2,
        doseStep: 0.05,
        doseDefault: 0.5,
        cautionThreshold: 2,
        criticalThreshold: 5,
        rangeLabel: '0,25 - 2,0 mcg/kg/min',
      },
      {
        id: 'scape',
        label: 'SCAPE',
        doseMin: 1,
        doseMax: 10,
        doseStep: 0.5,
        doseDefault: 3,
        cautionThreshold: 2,
        criticalThreshold: 5,
        rangeLabel: '1 - 10 mcg/kg/min (alta dose)',
        bolus: {
          title: 'SCAPE (EAP hipertensivo)',
          rows: [
            { label: 'Bolus', value: '400-800 mcg IV (2-4 mL)' },
            { label: 'Repetir bolus', value: '3-5 min até resposta' },
            { label: 'Alvo', value: 'Reduzir PAS 20-30%' },
          ],
        },
      },
    ],
    provenance: PROVENANCE,
  },
  {
    id: 'nitroprussiato',
    name: 'Nitroprussiato',
    aliases: ['nipride', 'nps'],
    category: 'vasodilators',
    presentation: '50 mg (1 amp) + SG 5% 250 mL',
    concentration: 200,
    concentrationUnit: 'mcg/mL',
    doseUnit: 'mcg/kg/min',
    doseMin: 0.25,
    doseMax: 8,
    doseStep: 0.25,
    doseDefault: 1,
    cautionThreshold: 5,
    criticalThreshold: 8,
    factor: 60,
    usesWeight: true,
    ampoule: { mass: 50000, label: '50 mg / ampola' },
    provenance: PROVENANCE,
  },
];

const BY_ID = new Map(INFUSION_DRUGS.map((drug) => [drug.id, drug]));

export function getInfusionDrug(id: string): InfusionDrug | undefined {
  return BY_ID.get(id);
}
