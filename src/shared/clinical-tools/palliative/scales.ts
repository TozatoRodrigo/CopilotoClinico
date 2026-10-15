import type { BoundedBand, ResultBand, ScoreCalculator } from '../calculator';
import type { ResultTone } from '../tone';
import type { ClinicalNote } from './content';
import { PALLIATIVE_PROVENANCE } from './provenance';

/**
 * Escalas do PaliaPath (CC-329): ECOG, PPS e PPI, com os textos e cortes do
 * ANY. O ECOG e o PPS são tabelas de consulta (no ANY o ECOG só destacava o
 * nível tocado e o PPS era só a tabela); o PPI é escore e usa o motor das
 * calculadoras (`evaluateCalculator`).
 */

export const SCALE_TABS = [
  { id: 'ecog', label: 'ECOG' },
  { id: 'pps', label: 'PPS' },
  { id: 'ppi', label: 'PPI' },
  { id: 'opioides', label: 'Opioides' },
  { id: 'hipodermoclise', label: 'Hipodermóclise' },
] as const;

export type ScaleTab = (typeof SCALE_TABS)[number]['id'];

// ---------------------------------------------------------------------------
// ECOG
// ---------------------------------------------------------------------------

export const ECOG_NOTE: ClinicalNote = {
  kind: 'nota',
  title: 'ECOG Performance Status',
  text: 'Avalia capacidade funcional do paciente oncológico.',
};

export type EcogGrade = 0 | 1 | 2 | 3 | 4 | 5;

export const ECOG_COLUMNS = { grade: 'ECOG', description: 'Descrição' } as const;

export interface EcogLevel {
  grade: EcogGrade;
  label: string;
  /** Vazio no 5 (óbito), que no ANY fica fora da tabela de descrições. */
  description: string;
}

export const ECOG_LEVELS: readonly EcogLevel[] = [
  { grade: 0, label: 'Assintomático', description: 'Totalmente ativo, sem restrições' },
  {
    grade: 1,
    label: 'Sintomático ambulatorial',
    description: 'Restrição a atividades físicas extenuantes, capaz de trabalho leve',
  },
  {
    grade: 2,
    label: '<50% acamado',
    description:
      'Ambulatorial, capaz de autocuidado, incapaz de trabalho; <50% do tempo acordado no leito',
  },
  {
    grade: 3,
    label: '>50% acamado',
    description: 'Capacidade limitada de autocuidado; >50% do tempo acordado no leito ou cadeira',
  },
  {
    grade: 4,
    label: 'Acamado total',
    description: 'Completamente incapacitado; totalmente restrito ao leito ou cadeira',
  },
  { grade: 5, label: 'Óbito', description: '' },
];

export function ecogLevel(grade: EcogGrade): EcogLevel {
  const level = ECOG_LEVELS.find((candidate) => candidate.grade === grade);
  if (!level) throw new Error(`ECOG ${grade} fora da escala`);
  return level;
}

// ---------------------------------------------------------------------------
// PPS
// ---------------------------------------------------------------------------

export const PPS_NOTE: ClinicalNote = {
  kind: 'nota',
  title: 'Palliative Performance Scale',
  text: 'Avalia funcionalidade em pacientes paliativos. Escala de 0-100%.',
};

export type PpsPercent = 100 | 90 | 80 | 70 | 60 | 50 | 40 | 30 | 20 | 10 | 0;

export interface PpsLevel {
  percent: PpsPercent;
  ambulation: string;
  activity: string;
  selfCare: string;
  intake: string;
  consciousness: string;
}

/** Colunas da tabela do PPS, na ordem do ANY. */
export const PPS_COLUMNS = [
  { key: 'ambulation', label: 'Deambulação' },
  { key: 'activity', label: 'Atividade' },
  { key: 'selfCare', label: 'Autocuidado' },
  { key: 'intake', label: 'Ingesta' },
  { key: 'consciousness', label: 'Consciência' },
] as const satisfies readonly { key: keyof Omit<PpsLevel, 'percent'>; label: string }[];

export const PPS_LEVELS: readonly PpsLevel[] = [
  {
    percent: 100,
    ambulation: 'Completa',
    activity: 'Normal',
    selfCare: 'Completo',
    intake: 'Normal',
    consciousness: 'Completa',
  },
  {
    percent: 90,
    ambulation: 'Completa',
    activity: 'Normal',
    selfCare: 'Completo',
    intake: 'Normal',
    consciousness: 'Completa',
  },
  {
    percent: 80,
    ambulation: 'Completa',
    activity: 'Com esforço',
    selfCare: 'Completo',
    intake: 'Normal ou reduzida',
    consciousness: 'Completa',
  },
  {
    percent: 70,
    ambulation: 'Reduzida',
    activity: 'Incapaz trabalho',
    selfCare: 'Completo',
    intake: 'Normal ou reduzida',
    consciousness: 'Completa',
  },
  {
    percent: 60,
    ambulation: 'Reduzida',
    activity: 'Incapaz hobbies',
    selfCare: 'Assistência ocasional',
    intake: 'Normal ou reduzida',
    consciousness: 'Confusão ocasional',
  },
  {
    percent: 50,
    ambulation: 'Sentado/deitado',
    activity: 'Incapaz qualquer',
    selfCare: 'Assistência considerável',
    intake: 'Normal ou reduzida',
    consciousness: 'Confusão ocasional',
  },
  {
    percent: 40,
    ambulation: 'Acamado',
    activity: 'Incapaz',
    selfCare: 'Assistência principal',
    intake: 'Normal ou reduzida',
    consciousness: 'Confusão ou sonolência',
  },
  {
    percent: 30,
    ambulation: 'Acamado',
    activity: 'Incapaz',
    selfCare: 'Dependente total',
    intake: 'Reduzida',
    consciousness: 'Confusão ou sonolência',
  },
  {
    percent: 20,
    ambulation: 'Acamado',
    activity: 'Incapaz',
    selfCare: 'Dependente total',
    intake: 'Goles',
    consciousness: 'Confusão ou sonolência',
  },
  {
    percent: 10,
    ambulation: 'Acamado',
    activity: 'Incapaz',
    selfCare: 'Dependente total',
    intake: 'Cuidados boca',
    consciousness: 'Sonolento ou coma',
  },
  {
    percent: 0,
    ambulation: 'Óbito',
    activity: '',
    selfCare: '',
    intake: '',
    consciousness: '',
  },
];

export function ppsLevel(percent: PpsPercent): PpsLevel {
  const level = PPS_LEVELS.find((candidate) => candidate.percent === percent);
  if (!level) throw new Error(`PPS ${percent}% fora da escala`);
  return level;
}

// ---------------------------------------------------------------------------
// PPI
// ---------------------------------------------------------------------------

export const PPI_NOTE: ClinicalNote = {
  kind: 'informacao',
  title: 'Palliative Prognostic Index',
  text: 'Prediz sobrevida em pacientes oncológicos usando apenas critérios clínicos.',
};

/** Faixa do PPI como no `interpretPPI` do ANY: sobrevida mediana e, nas duas últimas, a acurácia. */
interface PpiBandContent {
  id: string;
  label: string;
  tone: ResultTone;
  medianSurvival: string;
  accuracy?: string;
}

/**
 * Cortes do ANY (`score <= 2`, `<= 4`, `<= 6`, acima). Cor do ANY → tom: verde
 * vira neutro, amarelo e laranja viram atenção, vermelho fica crítico.
 */
export const PPI_BANDS: readonly (PpiBandContent & { upTo?: number })[] = [
  {
    id: 'melhor',
    upTo: 2,
    label: 'Prognóstico melhor',
    tone: 'neutral',
    medianSurvival: '~155 dias',
  },
  {
    id: 'intermediario',
    upTo: 4,
    label: 'Prognóstico intermediário',
    tone: 'attention',
    medianSurvival: '~89 dias',
  },
  {
    id: 'reservado',
    upTo: 6,
    label: 'Prognóstico reservado',
    tone: 'attention',
    medianSurvival: '~18-21 dias',
    accuracy: 'sobrevida <6 semanas: sens 80%, esp 77%',
  },
  {
    id: 'muito-reservado',
    label: 'Prognóstico muito reservado',
    tone: 'critical',
    medianSurvival: '~5 dias',
    accuracy: 'sobrevida <3 semanas: sens 80%, esp 85%',
  },
];

function ppiAction(band: PpiBandContent): string {
  const accuracy = band.accuracy ? ` (${band.accuracy})` : '';
  return `Sobrevida mediana: ${band.medianSurvival}${accuracy}.`;
}

function toResultBand(band: PpiBandContent): ResultBand {
  return { id: band.id, label: band.label, tone: band.tone, action: ppiAction(band) };
}

function ppiInterpretation(): ScoreCalculator['interpretation'] {
  const bounded: BoundedBand[] = [];
  let otherwise: ResultBand | undefined;
  for (const band of PPI_BANDS) {
    if (band.upTo === undefined) otherwise = toResultBand(band);
    else bounded.push({ ...toResultBand(band), upTo: { value: band.upTo, inclusive: true } });
  }
  if (!otherwise) throw new Error('PPI sem faixa final');
  return { bands: bounded, otherwise };
}

/** O resumo dos cortes que o ANY mostra abaixo da conta. */
export const PPI_INTERPRETATION_SUMMARY =
  'PPI ≤2: ~155 dias | PPI >2 a ≤4: ~89 dias | PPI >4 a ≤6: ~18-21 dias | PPI >6: ~5 dias';

export const PPI_INTERPRETATION_NOTE: ClinicalNote = {
  kind: 'nota',
  title: 'Interpretação',
  text: PPI_INTERPRETATION_SUMMARY,
};

export const PPI_ITEM_IDS = ['pps', 'oral', 'edema', 'dispneia', 'delirium'] as const;
export type PpiItemId = (typeof PPI_ITEM_IDS)[number];

export function isPpiItemId(value: string): value is PpiItemId {
  return (PPI_ITEM_IDS as readonly string[]).includes(value);
}

const ABSENT_PRESENT = (points: number) => [
  { id: 'ausente', label: 'Ausente', points: 0 },
  { id: 'presente', label: 'Presente', points },
];

/**
 * PPI como definição de escore. No ANY a tela já abria com a primeira opção de
 * cada item marcada (escore 0, "~155 dias"); aqui começa sem resposta e só
 * mostra resultado com os cinco itens respondidos.
 */
export const PPI_CALCULATOR: ScoreCalculator = {
  kind: 'score',
  id: 'ppi',
  name: 'PPI (Palliative Prognostic Index)',
  aliases: ['ppi', 'palliative prognostic index', 'sobrevida', 'prognóstico'],
  category: 'Cuidados paliativos',
  description: PPI_NOTE.text,
  reference: {
    why: PPI_NOTE.text,
    whenToUse: 'Pacientes oncológicos em cuidados paliativos.',
    pearlsPitfalls: [`Interpretação: ${PPI_INTERPRETATION_SUMMARY}.`],
    citation:
      'Morita T, et al. The Palliative Prognostic Index. Support Care Cancer. 1999;7:128-133.',
  },
  provenance: PALLIATIVE_PROVENANCE,
  items: [
    {
      id: 'pps',
      label: 'PPS (Palliative Performance Scale)',
      options: [
        { id: 'ge60', label: '≥60%', points: 0 },
        { id: '30-50', label: '30-50%', points: 2.5 },
        { id: '10-20', label: '10-20%', points: 4 },
      ],
    },
    {
      id: 'oral',
      label: 'Ingesta Oral',
      options: [
        { id: 'normal', label: 'Normal', points: 0 },
        { id: 'moderada', label: 'Moderadamente reduzida', points: 1 },
        { id: 'muito-reduzida', label: 'Muito reduzida (apenas goles)', points: 2.5 },
      ],
    },
    { id: 'edema', label: 'Edema', options: ABSENT_PRESENT(1) },
    { id: 'dispneia', label: 'Dispneia em Repouso', options: ABSENT_PRESENT(3.5) },
    { id: 'delirium', label: 'Delirium', options: ABSENT_PRESENT(4) },
  ],
  interpretation: ppiInterpretation(),
};

// ---------------------------------------------------------------------------
// Texto para o prontuário
// ---------------------------------------------------------------------------

export const ECOG_CITATION = 'Oken MM, et al. ECOG Performance Status. Am J Clin Oncol. 1982.';
export const PPS_CITATION =
  'Anderson F, et al. Palliative Performance Scale (PPS). J Palliat Care. 1996.';

/** "ECOG 2 — <50% acamado: …". Sem dado do paciente. */
export function buildEcogChartNote(grade: EcogGrade): string {
  const level = ecogLevel(grade);
  const description = level.description ? `: ${level.description}` : '';
  return [
    `ECOG ${level.grade} — ${level.label}${description}.`,
    `Referência: ${ECOG_CITATION}`,
  ].join('\n');
}

/** "PPS 50%" com as cinco colunas da escala. Sem dado do paciente. */
export function buildPpsChartNote(percent: PpsPercent): string {
  const level = ppsLevel(percent);
  const columns = PPS_COLUMNS.filter(({ key }) => level[key] !== '').map(
    ({ key, label }) => `- ${label}: ${level[key]}`,
  );
  return [`PPS ${level.percent}%.`, ...columns, `Referência: ${PPS_CITATION}`].join('\n');
}
