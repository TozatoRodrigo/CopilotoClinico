import type { ResultTone } from '../tone';

/**
 * Tabelas de consulta do ToxPath (CC-323): toxíndromes lado a lado, ECG,
 * odores, pupilas, "bombas-relógio" e exames. Cada aba é uma lista de blocos
 * (tabela, cartões de comparação ou nota), para a tela só desenhar. A tabela
 * de doses tóxicas, que no ANY era mais uma aba, tem tela própria (CC-324).
 */

/**
 * Destaque da linha. No ANY: `danger` → crítico, `warning` → atenção e
 * `success`/`accent` → só ênfase (o verde e o vermelho-marca do ANY
 * marcavam a linha importante, não risco).
 */
export type TableRowHighlight = 'critical' | 'attention' | 'emphasis';

export interface ToxTableRow {
  label: string;
  value: string;
  highlight?: TableRowHighlight;
}

export interface ComparisonCard {
  title: string;
  rows: readonly { label: string; value: string }[];
}

/** Nota da aba: dica (neutra) ou alerta (crítico), como os AlertCard do ANY. */
export interface TableNote {
  kind: 'note';
  tone: Extract<ResultTone, 'neutral' | 'critical'>;
  /** "Dica", "Atenção", "Alerta", "Macete", "Regra". */
  lead: string;
  text: string;
}

export type TableBlock =
  | {
      kind: 'table';
      title?: string;
      headers: readonly [string, string];
      rows: readonly ToxTableRow[];
    }
  | { kind: 'comparison'; cards: readonly ComparisonCard[] }
  | TableNote;

export const TABLE_TAB_IDS = ['toxindromes', 'ecg', 'odores', 'pupilas', 'bombas'] as const;
export type TableTabId = (typeof TABLE_TAB_IDS)[number];

export interface TableTab {
  id: TableTabId;
  label: string;
  blocks: readonly TableBlock[];
}

export const TOXIDROME_COMPARISON: readonly ComparisonCard[] = [
  {
    title: 'Simpaticomiméticos',
    rows: [
      { label: 'Consciência', value: 'Agitação, delirium' },
      { label: 'Pupilas', value: 'Midríase' },
      { label: 'FC / PA', value: 'Taquicardia, Hipertensão' },
      { label: 'Temperatura', value: 'Hipertermia' },
      { label: 'Pele', value: 'Úmida, diaforética' },
      { label: 'Agentes', value: 'Cocaína, anfetaminas, MDMA, catinonas' },
    ],
  },
  {
    title: 'Anticolinérgicos',
    rows: [
      { label: 'Consciência', value: 'Agitação, delirium, alucinações' },
      { label: 'Pupilas', value: 'Midríase' },
      { label: 'FC / PA', value: 'Taquicardia, PA normal ou aumentada' },
      { label: 'Temperatura', value: 'Hipertermia' },
      { label: 'Pele', value: 'SECA, quente, ruborizada' },
      { label: 'Outros', value: 'Diminuição de RHA, retenção urinária, mucosas secas' },
      { label: 'Agentes', value: 'Difenidramina, ADT, atropina, escopolamina, Datura' },
    ],
  },
  {
    title: 'Opioide',
    rows: [
      { label: 'Consciência', value: 'Sedação, coma' },
      { label: 'Pupilas', value: 'Miose puntiforme' },
      { label: 'FC / PA', value: 'Diminuída ou normal' },
      { label: 'FR', value: 'Depressão respiratória' },
      { label: 'Temperatura', value: 'Diminuída ou normal' },
      { label: 'Agentes', value: 'Fentanil, heroína, morfina, metadona, oxicodona' },
    ],
  },
  {
    title: 'Colinérgico',
    rows: [
      { label: 'Consciência', value: 'Confusão, coma' },
      { label: 'Pupilas', value: 'Miose' },
      { label: 'FC / PA', value: 'Bradicardia' },
      {
        label: 'Secreções',
        value: 'SLUDGE: Sialorreia, Lacrimejamento, Urinar, Defecar, GI (cólicas), Emese',
      },
      { label: 'Outros', value: 'Broncorreia, fasciculações musculares' },
      { label: 'Agentes', value: 'Organofosforados, carbamatos, fisostigmina' },
    ],
  },
  {
    title: 'Serotoninérgico',
    rows: [
      { label: 'Consciência', value: 'Agitação, confusão' },
      { label: 'Pupilas', value: 'Midríase' },
      { label: 'FC / PA', value: 'Taquicardia, Hipertensão' },
      { label: 'Temperatura', value: 'Hipertermia grave' },
      { label: 'Neuro', value: 'Clonus, hiperreflexia, tremor, rigidez (MMII > MMSS)' },
      { label: 'Agentes', value: 'ISRS + IMAO, ISRS + tramadol, linezolida + ISRS' },
    ],
  },
];

export const ECG_FINDINGS: readonly ToxTableRow[] = [
  {
    label: 'QRS > 100 ms',
    value: 'ADT, antiarrítmicos classe I, cocaína, difenidramina, carbamazepina',
    highlight: 'emphasis',
  },
  {
    label: 'QTc > 500 ms',
    value: 'Antipsicóticos, metadona, anti-histamínicos, antiarrítmicos classe III, ISRS',
    highlight: 'emphasis',
  },
  {
    label: 'Bradicardia',
    value: 'Betabloqueadores, BCC, digoxina, clonidina, organofosforados, opioides',
    highlight: 'critical',
  },
  {
    label: 'Taquicardia sinusal',
    value: 'Simpaticomiméticos, anticolinérgicos, teofilina, cafeína',
    highlight: 'critical',
  },
  {
    label: 'TV / FV',
    value: 'ADT, antiarrítmicos, cocaína, digitálicos, teofilina',
    highlight: 'critical',
  },
  {
    label: 'BAV',
    value: 'Betabloqueadores, BCC (verapamil/diltiazem), digoxina, clonidina',
    highlight: 'attention',
  },
  { label: 'Onda R em aVR', value: 'ADT (sinal de gravidade)' },
  { label: 'Onda U proeminente', value: 'Hipocalemia (diuréticos, teofilina)' },
];

export const ECG_TREATMENT: readonly ToxTableRow[] = [
  { label: 'QRS alargado', value: 'Bicarbonato de sódio 1-2 mEq/kg IV', highlight: 'emphasis' },
  { label: 'QT prolongado', value: 'Corrigir K+/Mg++, evitar drogas que prolongam QT' },
  {
    label: 'Bradicardia por BCC',
    value: 'Cálcio + vasopressores + insulina alta dose',
    highlight: 'emphasis',
  },
  {
    label: 'Bradicardia por BB',
    value: 'Glucagon (se disponível) + insulina alta dose',
    highlight: 'emphasis',
  },
  { label: 'Bradicardia por digoxina', value: 'Atropina, evitar cardioversão, Fab se disponível' },
  {
    label: 'TV por ADT',
    value: 'Bicarbonato de sódio (NÃO antiarrítmicos!)',
    highlight: 'emphasis',
  },
];

export const ODORS: readonly ToxTableRow[] = [
  { label: 'Amêndoas amargas', value: 'Cianeto (40% não sentem)', highlight: 'emphasis' },
  {
    label: 'Alho',
    value: 'Organofosforados, arsênico, fósforo, tálio, selênio',
    highlight: 'emphasis',
  },
  { label: 'Acetona / Frutas', value: 'Cetoacidose, isopropanol, acetona', highlight: 'emphasis' },
  { label: 'Etílico', value: 'Etanol', highlight: 'emphasis' },
  { label: 'Ovo podre', value: 'Sulfeto de hidrogênio, mercaptanos' },
  { label: 'Naftalina', value: 'Naftaleno, cânfora' },
  { label: 'Graxa de sapato', value: 'Nitrobenzeno' },
  { label: 'Peras', value: 'Hidrato de cloral, paraldeído' },
  { label: 'Peixe / Amônia', value: 'Uremia, zinco, fósforo' },
  { label: 'Cenoura', value: 'Cicuta (water hemlock)' },
];

export const MYDRIASIS: readonly ToxTableRow[] = [
  {
    label: 'Simpaticomiméticos',
    value: 'Cocaína, anfetaminas, MDMA, efedrina',
    highlight: 'emphasis',
  },
  {
    label: 'Anticolinérgicos',
    value: 'Atropina, escopolamina, ADT, difenidramina, antipsicóticos',
    highlight: 'emphasis',
  },
  {
    label: 'Serotoninérgicos',
    value: 'ISRS (em síndrome serotoninérgica)',
    highlight: 'emphasis',
  },
  { label: 'Alucinógenos', value: 'LSD, psilocibina, mescalina' },
  { label: 'Abstinência', value: 'Abstinência de opioides, etanol' },
];

export const MIOSIS: readonly ToxTableRow[] = [
  {
    label: 'Opioides',
    value: 'Heroína, morfina, fentanil, metadona, oxicodona, tramadol',
    highlight: 'emphasis',
  },
  {
    label: 'Colinérgicos',
    value: 'Organofosforados, carbamatos, fisostigmina, pilocarpina',
    highlight: 'emphasis',
  },
  { label: 'Sedativos', value: 'Clonidina, fenotiazinas (miose pode ser variável)' },
  { label: 'Outros', value: 'Nicotina, agentes nervosos (sarin, VX)' },
];

/** "Bombas-relógio": substâncias com toxicidade tardia. */
export const DELAYED_TOXICITY: readonly ToxTableRow[] = [
  {
    label: 'Paracetamol',
    value: 'Hepatotoxicidade em 24-72h (inicialmente assintomático!)',
    highlight: 'critical',
  },
  { label: 'Metanol', value: 'Acidose e cegueira em 12-24h', highlight: 'critical' },
  { label: 'Etilenoglicol', value: 'IRA, acidose em 12-24h', highlight: 'critical' },
  { label: 'Paraquat', value: 'Fibrose pulmonar em dias-semanas', highlight: 'critical' },
  { label: 'Colchicina', value: 'Falência multiorgânica em 24-72h', highlight: 'critical' },
  { label: 'Cogumelos Amanita', value: 'Hepatotoxicidade em 24-48h', highlight: 'critical' },
  {
    label: 'IMAO + tiramina',
    value: 'Crise hipertensiva horas após ingestão',
    highlight: 'attention',
  },
  { label: 'Sulfonilureias', value: 'Hipoglicemia recorrente por 24-72h', highlight: 'attention' },
  {
    label: 'Liberação prolongada',
    value: 'Pico tardio (BB, BCC, lítio, ferro)',
    highlight: 'attention',
  },
  {
    label: 'Metais pesados',
    value: 'Toxicidade em dias (chumbo, arsênico, mercúrio)',
    highlight: 'attention',
  },
];

export const INTENTIONAL_INGESTION_EXAMS: readonly ToxTableRow[] = [
  {
    label: 'Nível de Paracetamol',
    value: 'Hepatotoxicidade evitável se tratado precocemente',
    highlight: 'emphasis',
  },
  {
    label: 'Nível de Salicilato',
    value: 'Toxicidade grave pode ser sutil inicialmente',
    highlight: 'emphasis',
  },
  { label: 'ECG', value: 'Detectar cardiotoxicidade oculta' },
  { label: 'Glicemia', value: 'Hipoglicemia tratável, causa rebaixamento' },
];

export const TABLE_TABS: readonly TableTab[] = [
  {
    id: 'toxindromes',
    label: 'Toxíndromes',
    blocks: [
      { kind: 'comparison', cards: TOXIDROME_COMPARISON },
      {
        kind: 'note',
        tone: 'neutral',
        lead: 'Dica',
        text: 'Simpaticomiméticos vs. anticolinérgicos — checar pele! Úmida = simpaticomiméticos, Seca = anticolinérgicos',
      },
    ],
  },
  {
    id: 'ecg',
    label: 'ECG',
    blocks: [
      {
        kind: 'table',
        title: 'Alterações de ECG por agente',
        headers: ['Achado ECG', 'Agentes'],
        rows: ECG_FINDINGS,
      },
      {
        kind: 'note',
        tone: 'critical',
        lead: 'Atenção',
        text: 'QRS > 100 ms + história de ingestão = considerar bicarbonato de sódio empírico!',
      },
      {
        kind: 'table',
        title: 'Tratamento por alteração de ECG',
        headers: ['Alteração', 'Tratamento'],
        rows: ECG_TREATMENT,
      },
    ],
  },
  {
    id: 'odores',
    label: 'Odores',
    blocks: [
      { kind: 'table', headers: ['Odor', 'Agentes'], rows: ODORS },
      {
        kind: 'note',
        tone: 'critical',
        lead: 'Alerta',
        text: 'Odor de alho + síndrome colinérgica = ORGANOFOSFORADO até prova em contrário!',
      },
    ],
  },
  {
    id: 'pupilas',
    label: 'Pupilas',
    blocks: [
      {
        kind: 'table',
        title: 'Midríase (pupilas dilatadas)',
        headers: ['Categoria', 'Agentes'],
        rows: MYDRIASIS,
      },
      {
        kind: 'table',
        title: 'Miose (pupilas contraídas)',
        headers: ['Categoria', 'Agentes'],
        rows: MIOSIS,
      },
      {
        kind: 'note',
        tone: 'neutral',
        lead: 'Macete',
        text: 'Miose + depressão respiratória = OPIOIDE (considere naloxona)',
      },
    ],
  },
  {
    id: 'bombas',
    label: 'Bombas-relógio',
    blocks: [
      {
        kind: 'table',
        title: '"Bombas-relógio" tóxicas',
        headers: ['Agente', 'Toxicidade tardia'],
        rows: DELAYED_TOXICITY,
      },
      {
        kind: 'note',
        tone: 'critical',
        lead: 'Regra',
        text: 'Paciente assintomático com ingestão de "bomba-relógio" = considere internar e monitorar.',
      },
      {
        kind: 'table',
        title: 'Exames obrigatórios em ingestão intencional',
        headers: ['Exame', 'Justificativa'],
        rows: INTENTIONAL_INGESTION_EXAMS,
      },
    ],
  },
];

export function isTableTabId(value: string): value is TableTabId {
  return (TABLE_TAB_IDS as readonly string[]).includes(value);
}
