import type { ResultTone } from '../tone';

/**
 * As 12 categorias do TEP (A1 a E2) com destino, anticoagulação,
 * monitorização, terapia avançada e seguimento: o `getManagement` do
 * `TepGuide.tsx` do ANY, como dado. Só a acentuação foi corrigida;
 * tests/clinical-tools/tep-differential.spec.ts confere cada texto contra o
 * ANY.
 */

export const TEP_CATEGORY_IDS = [
  'A1',
  'A2',
  'B1',
  'B2',
  'C1',
  'C2',
  'C3',
  'D',
  'D1',
  'D2',
  'E1',
  'E2',
] as const;

export type TepCategoryId = (typeof TEP_CATEGORY_IDS)[number];

export interface TepCategory {
  id: TepCategoryId;
  description: string;
  /** Conduta sugerida, em itens. */
  actions: readonly string[];
  destination: string;
  anticoagulation: string;
  monitoring: string;
  advancedTherapy: string;
  /** Orientação de retorno (só A e B). */
  followUp?: string;
  /**
   * Tom da categoria. No ANY a cor ia do azul (A) e verde (B) ao vermelho
   * escuro (E); aqui A e B ficam neutros, C atenção, D e E críticos (ADR-017).
   */
  tone: ResultTone;
  /** Alerta de TEP subsegmentar isolado (A1 e B1). */
  subsegmental: boolean;
  /** Red flags de deterioração (C2 em diante). */
  redFlags: boolean;
  /** A anticoagulação indicada inclui HNF: a tela liga ao protocolo de heparina. */
  heparin: boolean;
}

const FOLLOW_UP =
  'Retorno em 1–2 semanas. Procure atendimento imediato se: dispneia progressiva, síncope, dor torácica ou hemoptise.';

export const TEP_CATEGORIES: Readonly<Record<TepCategoryId, TepCategory>> = {
  A1: {
    id: 'A1',
    description: 'TEP incidental, assintomático, subsegmentar.',
    actions: [
      'Avaliar necessidade de anticoagulação (considerar presença de TVP, contexto clínico)',
      'Considere alta do DE com seguimento ambulatorial',
    ],
    destination: 'Alta do DE',
    anticoagulation: 'Avaliar caso a caso',
    monitoring: 'Ambulatorial',
    advancedTherapy: 'Não indicada',
    followUp: FOLLOW_UP,
    tone: 'neutral',
    subsegmental: true,
    redFlags: false,
    heparin: false,
  },
  A2: {
    id: 'A2',
    description: 'TEP incidental, assintomático, segmentar ou mais proximal.',
    actions: ['Anticoagulação recomendada', 'Alta do DE com seguimento ambulatorial'],
    destination: 'Alta do DE',
    anticoagulation: 'DOAC (preferido)',
    monitoring: 'Ambulatorial',
    advancedTherapy: 'Não indicada',
    followUp: FOLLOW_UP,
    tone: 'neutral',
    subsegmental: false,
    redFlags: false,
    heparin: false,
  },
  B1: {
    id: 'B1',
    description: 'TEP sintomático, baixo risco, subsegmentar.',
    actions: [
      'Avaliar necessidade de anticoagulação (considerar TVP, contexto)',
      'Se anticoagular: avaliar tratamento ambulatorial (Hestia negativo → razoável)',
      'Seguimento ambulatorial em 1–2 semanas',
    ],
    destination: 'Alta / observação breve',
    anticoagulation: 'Avaliar caso a caso',
    monitoring: 'Ambulatorial',
    advancedTherapy: 'Não indicada',
    followUp: FOLLOW_UP,
    tone: 'neutral',
    subsegmental: true,
    redFlags: false,
    heparin: false,
  },
  B2: {
    id: 'B2',
    description: 'TEP sintomático, baixo risco, segmentar ou mais proximal.',
    actions: [
      'Anticoagulação',
      'Avaliar tratamento ambulatorial (Hestia negativo → razoável)',
      'DOAC preferido',
      'Seguimento ambulatorial em 1–2 semanas',
    ],
    destination: 'Alta (se Hestia neg.) / observação',
    anticoagulation: 'DOAC (preferido)',
    monitoring: 'Ambulatorial',
    advancedTherapy: 'Não indicada',
    followUp: FOLLOW_UP,
    tone: 'neutral',
    subsegmental: false,
    redFlags: false,
    heparin: false,
  },
  C1: {
    id: 'C1',
    description:
      'TEP sintomático, risco elevado. Sem biomarcadores alterados e sem disfunção de VD.',
    actions: [
      'Internação em enfermaria',
      'Anticoagulação (DOAC preferido)',
      'Monitorização padrão',
    ],
    destination: 'Enfermaria',
    anticoagulation: 'DOAC (preferido)',
    monitoring: 'Padrão enfermaria',
    advancedTherapy: 'Não indicada',
    tone: 'attention',
    subsegmental: false,
    redFlags: false,
    heparin: false,
  },
  C2: {
    id: 'C2',
    description: 'TEP sintomático, risco elevado. Biomarcadores elevados OU disfunção de VD.',
    actions: ['Internação', 'Anticoagulação', 'Monitorização próxima'],
    destination: 'Enfermaria / semi-intensiva',
    anticoagulation: 'DOAC ou HBPM',
    monitoring: 'Monitorização próxima',
    advancedTherapy: 'Não indicada (salvo deterioração)',
    tone: 'attention',
    subsegmental: false,
    redFlags: true,
    heparin: false,
  },
  C3: {
    id: 'C3',
    description: 'TEP sintomático, risco elevado. Biomarcadores elevados E disfunção de VD.',
    actions: [
      'Internação em semi/UTI',
      'Anticoagulação (considere HBPM se possibilidade de escalar terapia)',
      'Monitorização intensiva 24–72 h (PEITHO: deterioração média em 1,5 dias)',
      'Se deterioração → considere terapias avançadas',
    ],
    destination: 'Semi-intensiva / UTI',
    anticoagulation: 'HBPM ou DOAC',
    monitoring: 'Intensiva 24–72 h',
    advancedTherapy: 'Considerar se deterioração',
    tone: 'attention',
    subsegmental: false,
    redFlags: true,
    heparin: false,
  },
  D: {
    id: 'D',
    description:
      'Pré-falência cardiopulmonar. Hipotensão transitória ou sinais de hipoperfusão (classificado via instabilidade).',
    actions: [
      'UTI',
      'Anticoagulação parenteral (HBPM ou HNF)',
      'Vasopressores se necessário',
      'Considere terapias avançadas conforme evolução',
      'Reavaliar e subclassificar em D1 ou D2 quando estabilizado',
    ],
    destination: 'UTI',
    anticoagulation: 'HBPM ou HNF',
    monitoring: 'UTI contínua',
    advancedTherapy: 'Pode ser considerada',
    tone: 'critical',
    subsegmental: false,
    redFlags: true,
    heparin: true,
  },
  D1: {
    id: 'D1',
    description:
      'Pré-falência cardiopulmonar. Hipotensão transitória/recorrente sem sinais de hipoperfusão.',
    actions: [
      'UTI',
      'Anticoagulação parenteral (HBPM ou HNF)',
      'Vasopressores se necessário',
      'Terapias avançadas podem ser consideradas',
    ],
    destination: 'UTI',
    anticoagulation: 'HBPM ou HNF',
    monitoring: 'UTI contínua',
    advancedTherapy: 'Pode ser considerada',
    tone: 'critical',
    subsegmental: false,
    redFlags: true,
    heparin: true,
  },
  D2: {
    id: 'D2',
    description:
      'Pré-falência cardiopulmonar. Hipoperfusão ou disfunção orgânica sem hipotensão persistente.',
    actions: [
      'UTI',
      'Anticoagulação parenteral',
      'Vasopressores (norepinefrina 1ª escolha)',
      'Terapias avançadas podem ser consideradas',
    ],
    destination: 'UTI',
    anticoagulation: 'HNF (preferível)',
    monitoring: 'UTI contínua',
    advancedTherapy: 'Pode ser considerada',
    tone: 'critical',
    subsegmental: false,
    redFlags: true,
    heparin: true,
  },
  E1: {
    id: 'E1',
    description: 'Falência cardiopulmonar. Hipotensão persistente (PAS < 90 mmHg por ≥ 15 min).',
    actions: [
      'UTI',
      'Anticoagulação parenteral (HNF)',
      'Vasopressores + inotrópicos',
      'Terapia avançada recomendada (trombólise sistêmica, CDL, MT ou embolectomia)',
    ],
    destination: 'UTI',
    anticoagulation: 'HNF',
    monitoring: 'UTI + hemodinâmica invasiva',
    advancedTherapy: 'Recomendada',
    tone: 'critical',
    subsegmental: false,
    redFlags: true,
    heparin: true,
  },
  E2: {
    id: 'E2',
    description: 'Falência cardiopulmonar. Choque refratário ou parada cardiorrespiratória.',
    actions: [
      'UTI',
      'Anticoagulação parenteral (HNF)',
      'Vasopressores + inotrópicos',
      'Considere VA-ECMO',
      'Terapia avançada recomendada',
    ],
    destination: 'UTI',
    anticoagulation: 'HNF',
    monitoring: 'UTI + hemodinâmica invasiva',
    advancedTherapy: 'Recomendada + considere ECMO',
    tone: 'critical',
    subsegmental: false,
    redFlags: true,
    heparin: true,
  },
};

/** "C2", ou "C2R" com o modificador respiratório. */
export function categoryLabel(id: TepCategoryId, respiratory: boolean): string {
  return respiratory ? `${id}R` : id;
}

export const SUBSEGMENTAL_ALERT = {
  title: 'TEP subsegmentar isolado',
  text: 'A decisão de anticoagular pode considerar presença de TVP concomitante, risco de recorrência e contexto clínico. Considere discussão com equipe assistente.',
} as const;

export const RED_FLAGS = {
  title: 'Red flags de deterioração',
  items: [
    'Queda de PAS < 90 mmHg ou PAM < 80 mmHg',
    'Taquicardia progressiva refratária',
    'Dessaturação / necessidade crescente de O₂',
    'Alteração do nível de consciência',
    'Lactato em elevação',
    'Sinais de hipoperfusão (extremidades frias, TEC alargado, oligúria)',
  ],
  footer: 'Presença de qualquer sinal: considere reclassificar e escalar a terapia.',
} as const;

/** Rótulos do quadro de destino, na ordem do ANY. */
export const DISPOSITION_LABELS = {
  destination: 'Destino',
  anticoagulation: 'Anticoagulação',
  monitoring: 'Monitorização',
  advancedTherapy: 'Terapia avançada',
  followUp: 'Seguimento',
} as const;
