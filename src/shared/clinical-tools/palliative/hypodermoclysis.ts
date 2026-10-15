import { normalizeSearchText } from '../catalog';
import type { ClinicalNote, TitledText } from './content';

/**
 * Hipodermóclise do PaliaPath (CC-329): indicações, técnica, as 19 drogas por
 * via subcutânea, soluções, a matriz de compatibilidade e as complicações.
 * Textos e números do ANY; ver a revisão clínica para o que falta conferir.
 */

export const HYPODERMOCLYSIS_TABS = [
  { id: 'indicacoes', label: 'Indicações' },
  { id: 'tecnica', label: 'Técnica' },
  { id: 'medicacoes', label: 'Medicações' },
  { id: 'solucoes', label: 'Soluções' },
  { id: 'compatibilidade', label: 'Compatibilidade' },
  { id: 'complicacoes', label: 'Complicações' },
] as const;

export type HypodermoclysisTab = (typeof HYPODERMOCLYSIS_TABS)[number]['id'];

/** Títulos das seções e colunas, como no ANY. */
export const HYPODERMOCLYSIS_HEADINGS = {
  indications: 'Indicações',
  contraindications: 'Contraindicações',
  sites: 'Volume por Local de Punção (24h)',
  devices: 'Dispositivos',
  procedure: 'Procedimento',
  medications: 'Medicações por Via Subcutânea',
  solutions: 'Soluções por Via Subcutânea',
  compatibility: 'Compatibilidade de Medicamentos em Mesma Infusão',
  complications: 'Complicações',
} as const;

export const DEVICE_COLUMNS = {
  device: 'Dispositivo',
  gauge: 'Calibre',
  dwell: 'Permanência',
} as const;

export const SOLUTION_COLUMNS = {
  solution: 'Solução',
  maxDose: 'Dose máx.',
  guidance: 'Orientações',
} as const;

export const MEDICATION_FIELDS = { dose: 'Dose', dilution: 'Diluição' } as const;

export const NO_MEDICATION_FOUND = 'Nenhum medicamento encontrado';

export const HYPODERMOCLYSIS_NOTE: ClinicalNote = {
  kind: 'nota',
  title: 'Hipodermóclise',
  text: 'Infusão de fluidos no tecido subcutâneo. Alternativa simples, segura, de baixo custo, com reações adversas raras e geralmente reversíveis. Pode ser realizada em domicílio, ILPI, enfermaria e pronto atendimento.',
};

// ---------------------------------------------------------------------------
// Indicações
// ---------------------------------------------------------------------------

export const HYPODERMOCLYSIS_INDICATIONS: readonly string[] = [
  'Demência avançada com disfagia',
  'Náuseas e/ou vômitos por períodos prolongados',
  'Intolerância gástrica',
  'Obstrução intestinal',
  'Diarreia',
  'Confusão mental',
  'Dispneia intensa',
  'Fase final de vida',
  'Desidratação que não exija reposição rápida de volume',
  'Antibioticoterapia em idosos (desde que o fármaco seja tolerado por via SC)',
  'Perfil de absorção mais lento desejado (opioides para analgesia contínua, furosemida para ICC)',
];

export const HYPODERMOCLYSIS_CONTRAINDICATIONS: readonly string[] = [
  'Emergências que necessitam de reposição rápida de volume',
  'Desidratação severa',
  'Distúrbio de coagulação',
  'Anasarca',
  'Soluções hipertônicas (concentrações máx: SG 5%, NaCl 20% até 20mL e KCl 19,1% até 15mL por litro)',
];

export const HYPODERMOCLYSIS_SITE_WARNING: ClinicalNote = {
  kind: 'atencao',
  title: 'Locais a evitar',
  text: 'Evitar regiões irradiadas (radioterapia) e membros com esvaziamento ganglionar ou mastectomia.',
};

// ---------------------------------------------------------------------------
// Técnica
// ---------------------------------------------------------------------------

export interface PunctureSite {
  region: string;
  volume: string;
}

/** "Volume por Local de Punção (24h)". */
export const PUNCTURE_SITES: readonly PunctureSite[] = [
  { region: 'Subclavicular', volume: 'até 250 mL' },
  { region: 'Deltoidea', volume: 'até 250 mL' },
  { region: 'Abdominal', volume: 'até 1.000 mL' },
  { region: 'Interescapular', volume: 'até 1.000 mL' },
  {
    region: 'Anterolateral da Coxa',
    volume: 'até 1.500 mL (preferencial para volumes maiores)',
  },
];

export interface PunctureDevice {
  device: string;
  gauge: string;
  dwell: string;
}

export const PUNCTURE_DEVICES: readonly PunctureDevice[] = [
  { device: 'Escalpe (butterfly)', gauge: '21G a 25G', dwell: '3-5 dias' },
  { device: 'Cateter não agulhado (Vialon)', gauge: '20G a 24G', dwell: '7-11 dias' },
  { device: 'Cateter não agulhado (poliuretano)', gauge: '20G a 24G', dwell: '7-11 dias' },
];

export const DEVICE_NOTE =
  'Cateter não agulhado: menor risco de acidente perfurocortante e reações alérgicas vs. escalpe (níquel).';

export const HYPODERMOCLYSIS_PROCEDURE: readonly TitledText[] = [
  {
    title: 'Checar prescrição',
    description: 'Nome do paciente, medicamento/soro, dosagem, via SC, horário',
  },
  {
    title: 'Verificar compatibilidade',
    description: 'Conferir se a medicação está na lista de HDC e aprazamento compatível',
  },
  {
    title: 'Escolher local',
    description: 'Coxa, abdome, região escapular ou infraclavicular — conforme volume necessário',
  },
  {
    title: 'Posicionar e antissepsia',
    description: 'Expor apenas a área de aplicação. Swab de álcool até o local estar limpo',
  },
  {
    title: 'Puncionar',
    description:
      'Fazer prega cutânea, inserir cateter 22-24G em ângulo de 30-45 graus abaixo da pele levantada',
  },
  {
    title: 'Confirmar posicionamento',
    description:
      'Aspirar com seringa — sem retorno de sangue. Se houver retorno venoso, retirar e reiniciar',
  },
  {
    title: 'Fixar',
    description: 'Película transparente, identificar com data e nome de quem puncionou',
  },
  { title: 'Flush', description: 'SF 0,9% 2 a 5 mL' },
  {
    title: 'Conectar medicação',
    description: 'Se infusão contínua: BIC até 62,5 mL/h (noturno em coxa: 70-100 mL/h)',
  },
  {
    title: 'Orientar paciente',
    description: 'Comunicar se sentir dor, queimação ou ardência durante a infusão',
  },
];

// ---------------------------------------------------------------------------
// Medicações por via subcutânea
// ---------------------------------------------------------------------------

export interface SubcutaneousMedication {
  name: string;
  dose: string;
  dilution: string;
  note?: string;
}

export const SUBCUTANEOUS_MEDICATIONS: readonly SubcutaneousMedication[] = [
  {
    name: 'Ampicilina',
    dose: '1 g/dia',
    dilution: 'SF 0,9% 50 mL',
    note: 'Tempo de infusão: 20 minutos',
  },
  {
    name: 'Cefepime',
    dose: '1 g 12/12h ou 8/8h',
    dilution: 'Reconstituir 1g em 10 mL AD + SF 0,9% 100 mL',
    note: 'Tempo de infusão: 40 min. Sem estudos para doses maiores',
  },
  {
    name: 'Ceftriaxona',
    dose: '1 g 12/12h',
    dilution: 'Reconstituir 1g em 10 mL AD + SF 0,9% 100 mL',
    note: 'Tempo de infusão: 40 minutos',
  },
  {
    name: 'Dexametasona',
    dose: '2-16 mg a cada 24h',
    dilution: '1 amp (1 mL) em SF 0,9% 1 mL ou 1 amp (2,5 mL) em SF 0,9% 2,5 mL',
    note: 'Aplicação lenta, 1-2x/dia pela manhã. Sítio exclusivo — incompatível com outros medicamentos, risco de irritação local',
  },
  { name: 'Dimenidrinato', dose: '50-100 mg em 24h', dilution: 'SF 0,9% 1 mL' },
  {
    name: 'Dipirona',
    dose: '1-2 g até 6/6h',
    dilution: 'SF 0,9% 2 mL',
    note: 'Aplicação lenta em bolus',
  },
  {
    name: 'Ertapenem',
    dose: '1 g 24/24h',
    dilution: 'Reconstituir em 10 mL AD + 50 mL SF 0,9%',
    note: 'Tempo de infusão: 30 min. Alternativa: bolus com 1g em 3,2 mL lidocaína 1% (sem epinefrina)',
  },
  {
    name: 'Escopolamina',
    dose: '20 mg 8/8h até 60 mg 6/6h',
    dilution: 'SF 0,9% 1 mL (bolus)',
    note: 'Infusão em bolus ou contínua. Não confundir com a apresentação combinada com dipirona',
  },
  {
    name: 'Fentanil',
    dose: 'A critério médico',
    dilution: '4 amp (50 mcg/mL) em SF 0,9% 210 mL',
    note: 'Infusão contínua a critério médico',
  },
  {
    name: 'Furosemida',
    dose: '20-140 mg/24h',
    dilution: 'SF 0,9% 2 mL (bolus) ou volumes maiores (infusão contínua)',
  },
  {
    name: 'Haloperidol',
    dose: '0,5-30 mg/24h',
    dilution: 'SF 0,9% 5 mL',
    note: 'Idosos frágeis: menor dose possível. Se concentração >= 1 mg/mL, usar AD como diluente (risco de precipitação com SF)',
  },
  {
    name: 'Metadona',
    dose: '50% da dose oral habitual',
    dilution: 'SF 0,9% 10 mL',
    note: 'Velocidade: 60 mL/h. Mudar local de punção a cada 24h (alto potencial de irritação cutânea)',
  },
  {
    name: 'Metoclopramida',
    dose: '30-120 mg/dia',
    dilution: 'SF 0,9% 2 mL (bolus)',
    note: 'Pode causar irritação local',
  },
  {
    name: 'Midazolam',
    dose: '1-5 mg (bolus) / 10-120 mg/dia (BIC)',
    dilution: 'SF 0,9% 5 mL (bolus); SF 0,9% 100 mL (BIC)',
    note: 'Pode causar irritação local',
  },
  {
    name: 'Morfina',
    dose: '2-3 mg 4/4h (bolus) ou 10-20 mg/24h (BIC)',
    dilution: 'Não requer diluição (bolus); SF 0,9% 100 mL (BIC)',
    note: 'Sem dose máxima. Menor dose possível em idosos frágeis, DRC ou hepatopatas. Intervalo pode ser aumentado em insuficiência renal/hepática',
  },
  {
    name: 'Octreotide',
    dose: '300-900 mcg/24h',
    dilution: 'SF 0,9% 5 mL (bolus); SF 0,9% 100 mL (BIC)',
    note: 'Armazenar refrigerado — atingir temperatura ambiente antes da administração. Sítio exclusivo',
  },
  {
    name: 'Omeprazol',
    dose: '40 mg 24/24h',
    dilution: 'SF 0,9% 100 mL',
    note: 'Tempo de infusão: 4 horas. Dose única diária. Não mesclar com outros medicamentos',
  },
  {
    name: 'Ondansetrona',
    dose: '8-32 mg/24h',
    dilution: 'SF 0,9% 30 mL',
    note: 'Tempo de infusão: 30 min (risco de prolongamento do intervalo QT)',
  },
  {
    name: 'Tramadol',
    dose: '100-600 mg/24h',
    dilution: 'SF 0,9% 20 mL (bolus); SF 0,9% 100 mL (BIC)',
  },
];

export const SUBCUTANEOUS_MEDICATIONS_SOURCE =
  'Fonte: Azevedo et al. / Manual de Cuidados Paliativos na Emergência, USP 2021';

/**
 * Busca da aba de medicações: pelo nome, sem acento e sem caixa. Busca vazia
 * devolve a lista inteira, na ordem do ANY.
 */
export function searchSubcutaneousMedications(query: string): readonly SubcutaneousMedication[] {
  const normalized = normalizeSearchText(query);
  if (normalized === '') return SUBCUTANEOUS_MEDICATIONS;
  return SUBCUTANEOUS_MEDICATIONS.filter(({ name }) =>
    normalizeSearchText(name).includes(normalized),
  );
}

// ---------------------------------------------------------------------------
// Soluções
// ---------------------------------------------------------------------------

export interface SubcutaneousSolution {
  solution: string;
  maxDose: string;
  guidance: string;
}

export const SUBCUTANEOUS_SOLUTIONS: readonly SubcutaneousSolution[] = [
  {
    solution: 'SF 0,9%',
    maxDose: '1.500 mL/24h por sítio',
    guidance:
      'SF 0,45% segue as mesmas recomendações. Máx. 62,5 mL/h. Coxa preferencial para volumes maiores',
  },
  {
    solution: 'Soro glicofisiológico (2/3 SG 5% + 1/3 SF 0,9%)',
    maxDose: '1.500 mL/24h por sítio',
    guidance: 'Máx. 62,5 mL/h. Coxa preferencial para volumes maiores',
  },
  {
    solution: 'SG 5%',
    maxDose: '1.000 mL/24h por sítio',
    guidance: 'Máx. 62,5 mL/h. Coxa preferencial para volumes maiores',
  },
];

// ---------------------------------------------------------------------------
// Matriz de compatibilidade (mesma infusão)
// ---------------------------------------------------------------------------

export const COMPATIBILITY_DRUGS = [
  { id: 'cefepime', abbreviation: 'CEF', name: 'Cefepime' },
  { id: 'ceftriaxona', abbreviation: 'CRO', name: 'Ceftriaxona' },
  { id: 'dipirona', abbreviation: 'DIP', name: 'Dipirona' },
  { id: 'escopolamina', abbreviation: 'ESC', name: 'Escopolamina' },
  { id: 'furosemida', abbreviation: 'FUR', name: 'Furosemida' },
  { id: 'haloperidol', abbreviation: 'HAL', name: 'Haloperidol' },
  // "Levomeprom." no ANY.
  { id: 'levomepromazina', abbreviation: 'LEV', name: 'Levomepromazina' },
  { id: 'metoclopramida', abbreviation: 'MTC', name: 'Metoclopramida' },
  { id: 'midazolam', abbreviation: 'MDZ', name: 'Midazolam' },
  { id: 'morfina', abbreviation: 'MOR', name: 'Morfina' },
  { id: 'octreotide', abbreviation: 'OCT', name: 'Octreotide' },
  { id: 'ondansetrona', abbreviation: 'OND', name: 'Ondansetrona' },
  { id: 'ranitidina', abbreviation: 'RAN', name: 'Ranitidina' },
  { id: 'tramadol', abbreviation: 'TRA', name: 'Tramadol' },
  { id: 'dexametasona', abbreviation: 'DEX', name: 'Dexametasona' },
] as const;

export type CompatibilityDrugId = (typeof COMPATIBILITY_DRUGS)[number]['id'];

/**
 * `C` compatível, `I` incompatível e `sem-dado` onde o ANY não tem valor: a
 * célula fica marcada até a revisão clínica completar e assinar a matriz.
 */
export type CompatibilityCell = 'C' | 'I' | 'sem-dado';

type Tuple<T, N extends number, Acc extends readonly T[] = []> = Acc['length'] extends N
  ? Acc
  : Tuple<T, N, readonly [...Acc, T]>;

/** Uma linha por droga, uma coluna por droga: 15 × 15, conferido pelo tipo. */
export type CompatibilityRow = Tuple<CompatibilityCell, 15>;

const C = 'C';
const I = 'I';
/** Sem dado no ANY — aguarda revisão (CC-329, revisão clínica 4.1). */
const X = 'sem-dado';

/**
 * Linha × coluna na ordem de `COMPATIBILITY_DRUGS`. Cada linha do ANY tem 14
 * valores para 15 colunas; a tela do ANY os põe da 1ª à 14ª coluna e deixa a
 * 15ª (DEX) vazia. O porte reproduz exatamente isso: os 14 valores onde o ANY
 * os mostra e a coluna DEX "sem dado". Nenhum valor foi inventado.
 */
export const COMPATIBILITY_MATRIX: Readonly<Record<CompatibilityDrugId, CompatibilityRow>> = {
  cefepime: [C, C, C, C, C, C, C, C, C, I, C, I, C, I, X],
  ceftriaxona: [C, C, C, C, C, C, C, C, C, I, C, I, C, I, X],
  dipirona: [C, C, C, C, C, C, C, C, C, I, C, I, C, I, X],
  escopolamina: [C, C, C, C, C, C, C, C, C, I, C, I, C, I, X],
  furosemida: [C, C, C, C, C, C, I, I, I, I, C, I, C, I, X],
  haloperidol: [C, C, C, C, C, C, C, C, C, I, C, I, C, I, X],
  levomepromazina: [C, C, C, C, C, C, C, C, C, I, C, I, C, I, X],
  metoclopramida: [C, C, C, C, I, C, C, C, C, I, C, I, C, I, X],
  midazolam: [C, C, C, C, I, C, C, C, C, I, C, C, C, I, X],
  morfina: [C, C, C, C, I, C, C, C, C, I, C, C, C, I, X],
  octreotide: [C, C, C, C, C, C, C, C, C, C, C, I, I, I, X],
  ondansetrona: [C, C, C, C, C, C, C, C, C, C, I, I, C, I, X],
  ranitidina: [I, I, I, I, I, I, I, I, C, C, I, I, C, I, X],
  tramadol: [C, C, C, C, C, C, C, C, C, I, I, C, C, I, X],
  dexametasona: [I, I, I, I, I, I, I, I, I, I, I, I, I, I, X],
};

export const COMPATIBILITY_LEGEND = 'C = compatível | I = incompatível. Fonte: Azevedo e Barbosa.';

export const DEXAMETHASONE_NOTE: ClinicalNote = {
  kind: 'risco',
  title: 'Dexametasona',
  text: 'incompatível com TODOS os medicamentos — sempre usar sítio exclusivo.',
};

export interface CompatibilityGap {
  row: CompatibilityDrugId;
  column: CompatibilityDrugId;
}

/** Células "sem dado", linha a linha: o que a revisão clínica precisa preencher. */
export function compatibilityGaps(): readonly CompatibilityGap[] {
  return COMPATIBILITY_DRUGS.flatMap(({ id: row }) =>
    COMPATIBILITY_MATRIX[row].flatMap((cell, index) => {
      const column = COMPATIBILITY_DRUGS[index]?.id;
      return cell === 'sem-dado' && column ? [{ row, column }] : [];
    }),
  );
}

export interface CompatibilityDisagreement {
  a: CompatibilityDrugId;
  b: CompatibilityDrugId;
  /** Linha A × coluna B. */
  aWithB: 'C' | 'I';
  /** Linha B × coluna A. */
  bWithA: 'C' | 'I';
}

/**
 * Pares em que a linha A × coluna B diz uma coisa e a linha B × coluna A diz
 * outra. Compatibilidade é simétrica, então cada par destes é um erro de
 * dado (ou de alinhamento) para a revisão clínica.
 */
export function compatibilityDisagreements(): readonly CompatibilityDisagreement[] {
  const result: CompatibilityDisagreement[] = [];
  COMPATIBILITY_DRUGS.forEach(({ id: a }, i) => {
    COMPATIBILITY_DRUGS.forEach(({ id: b }, j) => {
      if (j <= i) return;
      const aWithB = COMPATIBILITY_MATRIX[a][j];
      const bWithA = COMPATIBILITY_MATRIX[b][i];
      if (aWithB === undefined || bWithA === undefined) return;
      if (aWithB === 'sem-dado' || bWithA === 'sem-dado' || aWithB === bWithA) return;
      result.push({ a, b, aWithB, bWithA });
    });
  });
  return result;
}

// ---------------------------------------------------------------------------
// Complicações
// ---------------------------------------------------------------------------

export const HYPODERMOCLYSIS_COMPLICATIONS: readonly TitledText[] = [
  {
    title: 'Relacionadas à técnica e materiais',
    description:
      'Punções > 72h favorecem reações locais (rubor, calor). Escalpe causa mais reações que cateter não agulhado.',
  },
  {
    title: 'Relacionadas às medicações',
    description:
      'Extremos de pH (ácido < 2, alcalino > 11) aumentam risco de reações, podendo causar necrose tecidual.',
  },
  {
    title: 'Relacionadas às soluções',
    description:
      'Soluções hipo/hipertônicas podem causar dor e rubor pela diferença com tonicidade fisiológica. Preferir soluções isotônicas.',
  },
];
