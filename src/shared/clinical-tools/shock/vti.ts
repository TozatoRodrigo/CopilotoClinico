import type { NumericInput } from '../calculator';
import { formatDecimal } from '../numbers';
import { validateNumber } from '../ranges';
import type { ResultTone } from '../tone';
import { PERFUSION_INPUTS, PERFUSION_THRESHOLDS } from './perfusion-quadrant';
import type { InfoText, ShockInfusionDrug, ToneText, YesNo } from './septic-shock';

/**
 * Classificação hemodinâmica do choque indiferenciado pelo VTI da via de
 * saída do VE (Mercadal et al. 2022), porte do módulo VTI do ShockPath do ANY
 * (CC-317): VTI < 16 cm investiga a causa do baixo débito, 16–20 cm é zona
 * cinzenta (perfusão decide) e > 20 cm é choque distributivo. Textos e cortes
 * iguais aos do ANY; ordens viraram sugestão.
 */

export const VTI_INPUT = {
  id: 'vti',
  label: 'VTI da via de saída do VE',
  unit: 'cm',
  min: 1,
  max: 40,
  step: 0.1,
} as const satisfies NumericInput;

/** Abaixo de 16 cm é baixo débito; de 16 a 20 cm (inclusive), zona cinzenta; acima, adequado. */
export const VTI_THRESHOLDS = { low: 16, high: 20 } as const;

/** A barra de referência do ANY vai de 0 a 40 cm. */
export const VTI_BAR_MAX = 40;

export type VtiZoneId = 'baixo-debito' | 'zona-cinzenta' | 'debito-adequado';

export interface VtiZone extends ToneText {
  id: VtiZoneId;
  /** Botão que leva ao próximo passo do algoritmo. */
  next: string;
}

export const VTI_ZONES: Record<VtiZoneId, VtiZone> = {
  'baixo-debito': {
    id: 'baixo-debito',
    title: 'VTI < 16 cm — Baixo débito cardíaco',
    tone: 'critical',
    text: 'O débito cardíaco está provavelmente reduzido. Considere investigar a causa da disfunção.',
    next: 'Investigar causa',
  },
  'zona-cinzenta': {
    id: 'zona-cinzenta',
    title: 'VTI 16-20 cm — Zona cinzenta',
    tone: 'attention',
    text: 'Débito cardíaco limítrofe. Considere avaliar variáveis de perfusão e congestão para direcionar a abordagem.',
    next: 'Avaliar perfusão',
  },
  'debito-adequado': {
    id: 'debito-adequado',
    title: 'VTI > 20 cm — Débito cardíaco adequado',
    tone: 'neutral',
    text: 'O débito cardíaco está provavelmente preservado. O problema predominante é a resistência vascular periférica.',
    next: 'Choque distributivo',
  },
};

export function classifyVti(vti: number): VtiZone {
  if (vti < VTI_THRESHOLDS.low) return VTI_ZONES['baixo-debito'];
  if (vti <= VTI_THRESHOLDS.high) return VTI_ZONES['zona-cinzenta'];
  return VTI_ZONES['debito-adequado'];
}

/** Posição do marcador na barra de 0 a 40 cm, em %. */
export function vtiBarPosition(vti: number): number {
  return Math.min(100, Math.max(0, (vti / VTI_BAR_MAX) * 100));
}

// ---- Telas de entrada e de medida ----

export const VTI_ENTRY = {
  title: 'Classificação hemodinâmica',
  subtitle: 'Algoritmo baseado no VTI — Mercadal et al. 2022',
  signsTitle: 'Sinais clínicos de choque',
  signs: [
    'Hipotensão (PAS < 90 mmHg ou PAM < 65 mmHg)',
    'Sinais de hipoperfusão (livedo, oligúria, alteração do sensório)',
    'Taquicardia',
    'Lactato elevado (≥ 2 mmol/L)',
  ],
  prerequisite: {
    title: 'Pré-requisito',
    text: 'Ecocardiograma transtorácico disponível à beira-leito. A medida do VTI no LVOT é o ponto de partida deste algoritmo.',
  } satisfies InfoText,
  start: 'Iniciar ecocardiografia básica',
} as const;

export const VTI_MEASUREMENT = {
  title: 'Medida do LVOT VTI',
  subtitle: 'Integral velocidade-tempo na via de saída do VE',
  howToTitle: 'Como medir o VTI',
  howTo: [
    'Janela apical 5 câmaras.',
    'Posicione o volume-amostra do Doppler pulsado no LVOT (anel aórtico).',
    'Alinhe o feixe paralelo ao fluxo (ângulo < 20 graus).',
    'Trace a envoltória do espectro Doppler (integral velocidade-tempo).',
    'Considere a média de 3-5 ciclos cardíacos.',
  ],
  barTitle: 'Referência do VTI',
} as const;

// ---- Tipos de choque ----

export const VTI_SHOCK_TYPES = [
  'tamponamento',
  'obstrutivo',
  'cardiogenico',
  'cardiogenico-valvar',
  'hipovolemico',
  'distributivo',
] as const;
export type VtiShockType = (typeof VTI_SHOCK_TYPES)[number];

export interface ListSection {
  title: 'Achados ecocardiográficos' | 'Causas a considerar' | 'Conduta sugerida';
  items: readonly string[];
}

export interface VtiShockTypeContent {
  id: VtiShockType;
  label: string;
  /**
   * Tom do ADR-017 a partir da cor do cartão do ANY: vermelho crítico,
   * amarelo atenção, verde neutro. Azul (cardiogênico) não tem tom de risco
   * no Copiloto e ficou neutro; está na revisão clínica.
   */
  tone: ResultTone;
  /** Cartão do tipo na investigação (achados, causas, conduta). */
  sections: readonly ListSection[];
  /** Resumo na tela de resultado. */
  summary: { subtitle: string; lines: readonly { label: string; text: string }[] };
  /** Atalhos para as Infusões no cartão do tipo. */
  infusions: readonly ShockInfusionDrug[];
}

export const VTI_SHOCK_TYPE_CONTENT: Record<VtiShockType, VtiShockTypeContent> = {
  tamponamento: {
    id: 'tamponamento',
    label: 'Tamponamento cardíaco',
    tone: 'critical',
    sections: [
      {
        title: 'Achados ecocardiográficos',
        items: [
          'Derrame pericárdico moderado-grave',
          'Colapso diastólico de AD e/ou VD',
          'VCI dilatada sem variação respiratória',
        ],
      },
      {
        title: 'Conduta sugerida',
        items: [
          'Considere expansão volêmica cautelosa',
          'Considere pericardiocentese ou drenagem pericárdica',
          'Avaliação cirúrgica conforme etiologia',
        ],
      },
    ],
    summary: {
      subtitle: 'Choque obstrutivo por comprometimento pericárdico',
      lines: [
        { label: 'Achados eco', text: 'Derrame pericárdico, colapso de AD/VD, VCI dilatada' },
        { label: 'Conduta', text: 'Considere pericardiocentese, expansão volêmica cautelosa' },
      ],
    },
    infusions: [],
  },
  obstrutivo: {
    id: 'obstrutivo',
    label: 'Choque obstrutivo',
    tone: 'attention',
    sections: [
      {
        title: 'Achados ecocardiográficos',
        items: [
          'Relação área VD/VE > 1',
          'TAPSE < 14 mm',
          'VCI dilatada sem variação respiratória',
          'Movimento paradoxal do septo interventricular',
        ],
      },
      {
        title: 'Causas a considerar',
        items: [
          'TEP maciço',
          'Pneumotórax hipertensivo',
          'Hipertensão pulmonar crônica',
          'Cor pulmonale agudo',
        ],
      },
    ],
    summary: {
      subtitle: 'Disfunção de VD com comprometimento hemodinâmico',
      lines: [
        { label: 'Achados eco', text: 'VD/VE > 1, TAPSE < 14 mm, septo paradoxal' },
        { label: 'Causas', text: 'TEP, pneumotórax hipertensivo, hipertensão pulmonar' },
      ],
    },
    infusions: [],
  },
  cardiogenico: {
    id: 'cardiogenico',
    label: 'Choque cardiogênico',
    tone: 'neutral',
    sections: [
      {
        title: 'Achados ecocardiográficos',
        items: ['VE dilatado (avaliação visual)', 'FEVE < 40%', 'Hipocinesia difusa ou segmentar'],
      },
      {
        title: 'Causas a considerar',
        items: [
          'Cardiomiopatia séptica',
          'Cardiomiopatia de estresse (Takotsubo)',
          'IAM / síndrome coronária aguda',
          'Cardiomiopatia prévia descompensada',
          'Miocardite aguda',
        ],
      },
      {
        title: 'Conduta sugerida',
        items: [
          'Considere inotrópico (dobutamina 5-20 mcg/kg/min)',
          'Considere vasopressor conforme PAM',
          'Avaliação de suporte mecânico circulatório em casos refratários',
        ],
      },
    ],
    summary: {
      subtitle: 'Disfunção sistólica de VE',
      lines: [
        { label: 'Achados eco', text: 'VE dilatado, FEVE < 40%' },
        { label: 'Conduta', text: 'Considere inotrópico, vasopressor, suporte mecânico' },
      ],
    },
    infusions: ['dobutamina'],
  },
  'cardiogenico-valvar': {
    id: 'cardiogenico-valvar',
    label: 'Choque cardiogênico valvar',
    tone: 'attention',
    sections: [
      {
        title: 'Achados ecocardiográficos',
        items: ['IM ou IA aguda maciça (avaliação 2D e color-flow Doppler)', 'EA ou EM crítica'],
      },
      {
        title: 'Conduta sugerida',
        items: [
          'Considere inotrópico',
          'Considere vasopressor ou vasodilatador conforme perfil',
          'Avaliação de BIA (balão intra-aórtico)',
          'Avaliação cirúrgica de urgência',
        ],
      },
    ],
    summary: {
      subtitle: 'Disfunção valvar aguda grave',
      lines: [
        { label: 'Achados eco', text: 'IM/IA maciça ou EA/EM crítica' },
        { label: 'Conduta', text: 'Considere inotrópico, BIA, cirurgia' },
      ],
    },
    infusions: [],
  },
  hipovolemico: {
    id: 'hipovolemico',
    label: 'Choque hipovolêmico',
    tone: 'neutral',
    sections: [
      {
        title: 'Conduta sugerida',
        items: [
          'Considere reposição volêmica com cristaloides balanceados',
          'Considere concentrado de hemácias se sangramento ativo',
        ],
      },
      {
        title: 'Causas a considerar',
        items: [
          'Sangramento (trauma, GI, pós-operatório)',
          'Terceiro espaço (TSFR)',
          'Perdas GI (vômitos, diarreia)',
          'Desidratação grave',
        ],
      },
    ],
    summary: {
      subtitle: 'Baixo débito responsivo a volume',
      lines: [
        { label: 'Conduta', text: 'Considere reposição volêmica, hemácias se sangramento' },
        { label: 'Causas', text: 'Sangramento, perdas GI, terceiro espaço' },
      ],
    },
    infusions: [],
  },
  distributivo: {
    id: 'distributivo',
    label: 'Choque distributivo',
    tone: 'neutral',
    sections: [
      {
        title: 'Causas a considerar',
        items: [
          'Sepse',
          'Anafilaxia',
          'SIRS (pós-CEC, pós-cirurgia de grande porte)',
          'Pancreatite aguda grave',
          'Pós-IAM extenso',
          'Pós-transfusão maciça',
        ],
      },
      {
        title: 'Conduta sugerida',
        items: [
          'Considere vasopressor (noradrenalina como primeira linha)',
          'Reavaliação ecocardiográfica seriada conforme evolução',
          'Tratamento da causa base',
        ],
      },
    ],
    summary: {
      subtitle: 'Débito cardíaco adequado, RVP reduzida',
      lines: [
        {
          label: 'Conduta',
          text: 'Considere vasopressor (noradrenalina), tratar causa base',
        },
        { label: 'Causas', text: 'Sepse, anafilaxia, SIRS, pancreatite' },
      ],
    },
    infusions: ['noradrenalina', 'vasopressina'],
  },
};

export const DISTRIBUTIVE_SCREEN = {
  title: 'Choque distributivo',
  subtitle: 'Débito cardíaco adequado — RVP reduzida',
  interpretation: {
    title: 'Interpretação',
    text: 'O débito cardíaco está preservado. O mecanismo predominante é a redução da resistência vascular periférica. Considere vasopressores e reavaliação conforme a evolução clínica.',
  } satisfies InfoText,
} as const;

/** Atalhos da tela de resultado para as Infusões, como no ANY. */
export const VTI_RESULT_INFUSIONS: readonly ShockInfusionDrug[] = [
  'noradrenalina',
  'vasopressina',
  'dobutamina',
];

// ---- Baixo débito: investigação em sequência ----

export const LOW_OUTPUT_QUESTIONS = [
  {
    id: 'pericardio',
    label: 'Função pericárdica comprometida?',
    hint: 'Derrame pericárdico moderado a grave, sinais de tamponamento.',
    yields: 'tamponamento',
  },
  {
    id: 'vd',
    label: 'Função do VD comprometida?',
    hint: 'Dilatação de VD, TAPSE reduzido, septo paradoxal.',
    yields: 'obstrutivo',
  },
  {
    id: 've',
    label: 'Função do VE comprometida?',
    hint: 'VE dilatado, hipocinesia global, FEVE visualmente reduzida.',
    yields: 'cardiogenico',
  },
  {
    id: 'valvar',
    label: 'Função valvar comprometida?',
    hint: 'Insuficiência mitral ou aórtica aguda maciça, estenose aórtica ou mitral crítica.',
    yields: 'cardiogenico-valvar',
  },
] as const satisfies readonly {
  id: string;
  label: string;
  hint: string;
  yields: VtiShockType;
}[];
export type LowOutputQuestionId = (typeof LOW_OUTPUT_QUESTIONS)[number]['id'];

export type VentilationMode = 'espontanea' | 'mecanica';

export const LOW_OUTPUT_FLUIDS = {
  title: 'Responsividade a fluidos?',
  hint: 'Avalie conforme o modo ventilatório.',
  modes: [
    { id: 'espontanea', label: 'Respiração espontânea' },
    { id: 'mecanica', label: 'Ventilação mecânica' },
  ] as const satisfies readonly { id: VentilationMode; label: string }[],
  methods: {
    espontanea: {
      title: 'Elevação passiva das pernas (PLR)',
      items: [
        'Elevar os membros inferiores a 45 graus.',
        'Considere responsivo se aumento do VTI > 12% após a manobra.',
      ],
      alternative: 'Alternativa: mini-fluid challenge (100 mL em 1 minuto).',
    },
    mecanica: {
      title: 'Variação dinâmica',
      items: [
        'Considere responsivo se distensibilidade da VCI > 13%.',
        'Ou se variação do VTI ou do pico de velocidade aórtica > 10%.',
      ],
      alternative: 'Alternativa: mini-fluid challenge (100 mL em 1 minuto).',
    },
  } as const satisfies Record<
    VentilationMode,
    { title: string; items: readonly string[]; alternative: string }
  >,
  question: 'Responsivo a fluidos?',
  notResponsive: {
    title: 'Não responsivo a fluidos',
    tone: 'attention',
    text: 'Baixo débito sem causa estrutural evidente e sem responsividade a volume. Considere reavaliar o ecocardiograma com mais detalhes ou avaliação hemodinâmica invasiva.',
  } satisfies ToneText,
} as const;

export interface LowOutputAnswers {
  pericardio: YesNo | null;
  vd: YesNo | null;
  ve: YesNo | null;
  valvar: YesNo | null;
  ventilation: VentilationMode | null;
  fluidResponsive: YesNo | null;
}

export const EMPTY_LOW_OUTPUT_ANSWERS: LowOutputAnswers = {
  pericardio: null,
  vd: null,
  ve: null,
  valvar: null,
  ventilation: null,
  fluidResponsive: null,
};

export interface LowOutputEvaluation {
  /** Perguntas estruturais na tela, em ordem (a próxima só aparece depois de um "Não"). */
  questions: readonly LowOutputQuestionId[];
  /** O bloco de fluidorresponsividade aparece (todas as causas estruturais negadas). */
  fluidBlock: boolean;
  /** A pergunta "Responsivo a fluidos?" aparece (modo ventilatório escolhido). */
  fluidQuestion: boolean;
  /** Tipo de choque achado, "sem causa" (não responsivo) ou nada ainda. */
  outcome: VtiShockType | 'sem-causa' | null;
}

/**
 * Mesma cascata do ShockPath: pericárdio, VD, VE, valvas e, só se tudo for
 * "Não", fluidorresponsividade. O primeiro "Sim" decide o tipo.
 */
export function evaluateLowOutput(answers: LowOutputAnswers): LowOutputEvaluation {
  const questions: LowOutputQuestionId[] = [];
  for (const question of LOW_OUTPUT_QUESTIONS) {
    questions.push(question.id);
    const answer = answers[question.id];
    if (answer === 'sim') {
      return { questions, fluidBlock: false, fluidQuestion: false, outcome: question.yields };
    }
    if (answer !== 'nao') {
      return { questions, fluidBlock: false, fluidQuestion: false, outcome: null };
    }
  }
  const outcome =
    answers.fluidResponsive === 'sim'
      ? 'hipovolemico'
      : answers.fluidResponsive === 'nao'
        ? 'sem-causa'
        : null;
  return { questions, fluidBlock: true, fluidQuestion: answers.ventilation !== null, outcome };
}

// ---- Zona cinzenta ----

export type LactateTrend = 'crescente' | 'estavel';

export const GREY_ZONE = {
  title: 'Zona cinzenta',
  subtitle: 'VTI 16-20 cm — avaliação de perfusão',
  interpretation: {
    title: 'Interpretação',
    text: 'Na zona cinzenta, variáveis de perfusão ajudam a definir se o padrão se assemelha mais a baixo débito ou a choque distributivo.',
  } satisfies InfoText,
  inputs: {
    svco2: PERFUSION_INPUTS.svco2,
    gapCO2: { ...PERFUSION_INPUTS.gapCO2, label: 'Gap de pCO2' },
  },
  lactateTrend: {
    label: 'Tendência do lactato',
    options: [
      { id: 'crescente', label: 'Crescente' },
      { id: 'estavel', label: 'Estável/decrescente' },
    ] as const satisfies readonly { id: LactateTrend; label: string }[],
  },
} as const;

export type GreyZonePatternId = 'baixo-debito' | 'distributivo' | 'inconclusivo';

export const GREY_ZONE_PATTERNS: Record<GreyZonePatternId, ToneText> = {
  'baixo-debito': {
    title: 'Padrão compatível com baixo débito',
    tone: 'critical',
    text: 'SvcO2 < 70% + lactato crescente + gap de pCO2 > 6 mmHg sugerem inadequação do débito cardíaco. Considere abordar como baixo débito.',
  },
  distributivo: {
    title: 'Padrão compatível com choque distributivo',
    tone: 'neutral',
    text: 'SvcO2 ≥ 70% + lactato estável/decrescente + gap de pCO2 ≤ 6 mmHg sugerem que o débito cardíaco é suficiente. Considere tratar como choque distributivo.',
  },
  inconclusivo: {
    title: 'Padrão misto ou inconclusivo',
    tone: 'attention',
    text: 'Os marcadores de perfusão não convergem claramente para um perfil. Considere reavaliação clínica e ecocardiográfica mais detalhada.',
  },
};

/** Os três marcadores precisam concordar; o resto é inconclusivo, como no ANY. */
export function classifyGreyZone(
  svco2: number,
  gapCO2: number,
  trend: LactateTrend,
): GreyZonePatternId {
  const lowSvco2 = svco2 < PERFUSION_THRESHOLDS.svco2;
  const wideGap = gapCO2 > PERFUSION_THRESHOLDS.gapCO2;
  if (lowSvco2 && trend === 'crescente' && wideGap) return 'baixo-debito';
  if (!lowSvco2 && trend === 'estavel' && !wideGap) return 'distributivo';
  return 'inconclusivo';
}

export interface GreyZoneInput {
  svco2: string;
  gapCO2: string;
  lactateTrend: LactateTrend | null;
}

export const EMPTY_GREY_ZONE: GreyZoneInput = { svco2: '', gapCO2: '', lactateTrend: null };

/** Padrão da zona cinzenta, ou `null` enquanto falta (ou está fora da faixa) algum marcador. */
export function evaluateGreyZone(input: GreyZoneInput): GreyZonePatternId | null {
  const svco2 = validateNumber(input.svco2, GREY_ZONE.inputs.svco2);
  const gapCO2 = validateNumber(input.gapCO2, GREY_ZONE.inputs.gapCO2);
  if (!svco2.ok || !gapCO2.ok || input.lactateTrend === null) return null;
  return classifyGreyZone(svco2.value, gapCO2.value, input.lactateTrend);
}

// ---- Estado do algoritmo ----

export const VTI_SCREENS = [
  'inicio',
  'medida',
  'baixo-debito',
  'zona-cinzenta',
  'distributivo',
  'resultado',
] as const;
export type VtiScreen = (typeof VTI_SCREENS)[number];

export interface VtiState {
  screen: VtiScreen;
  /** Texto do campo do VTI. */
  vtiRaw: string;
  lowOutput: LowOutputAnswers;
  greyZone: GreyZoneInput;
  shockType: VtiShockType | null;
}

export type VtiAction =
  | { type: 'ir-para'; screen: VtiScreen }
  | { type: 'digitar-vti'; raw: string }
  /** "Investigar causa": abre a cascata do baixo débito do zero. */
  | { type: 'investigar-baixo-debito' }
  /** "Avaliar perfusão": abre a zona cinzenta do zero. */
  | { type: 'avaliar-perfusao' }
  | { type: 'choque-distributivo' }
  | { type: 'responder'; question: LowOutputQuestionId | 'fluidResponsive'; answer: YesNo }
  | { type: 'modo-ventilatorio'; mode: VentilationMode }
  | { type: 'digitar-zona-cinzenta'; field: 'svco2' | 'gapCO2'; raw: string }
  | { type: 'tendencia-do-lactato'; trend: LactateTrend }
  /** "Ver resumo": fixa o tipo achado e vai ao resultado. */
  | { type: 'ver-resumo' }
  | { type: 'reiniciar' };

export const INITIAL_VTI_STATE: VtiState = {
  screen: 'inicio',
  vtiRaw: '',
  lowOutput: EMPTY_LOW_OUTPUT_ANSWERS,
  greyZone: EMPTY_GREY_ZONE,
  shockType: null,
};

/** VTI válido digitado, ou `null`. */
export function readVti(state: VtiState): number | null {
  const checked = validateNumber(state.vtiRaw, VTI_INPUT);
  return checked.ok ? checked.value : null;
}

export function vtiReducer(state: VtiState, action: VtiAction): VtiState {
  switch (action.type) {
    case 'ir-para':
      return { ...state, screen: action.screen };
    case 'digitar-vti':
      return { ...state, vtiRaw: action.raw };
    case 'investigar-baixo-debito':
      return {
        ...state,
        screen: 'baixo-debito',
        lowOutput: { ...EMPTY_LOW_OUTPUT_ANSWERS, ventilation: state.lowOutput.ventilation },
        shockType: null,
      };
    case 'avaliar-perfusao':
      return { ...state, screen: 'zona-cinzenta', greyZone: EMPTY_GREY_ZONE };
    case 'choque-distributivo':
      return { ...state, screen: 'distributivo', shockType: 'distributivo' };
    case 'responder':
      return { ...state, lowOutput: { ...state.lowOutput, [action.question]: action.answer } };
    case 'modo-ventilatorio':
      return { ...state, lowOutput: { ...state.lowOutput, ventilation: action.mode } };
    case 'digitar-zona-cinzenta':
      return { ...state, greyZone: { ...state.greyZone, [action.field]: action.raw } };
    case 'tendencia-do-lactato':
      return { ...state, greyZone: { ...state.greyZone, lactateTrend: action.trend } };
    case 'ver-resumo': {
      if (state.screen === 'distributivo') return { ...state, screen: 'resultado' };
      const { outcome } = evaluateLowOutput(state.lowOutput);
      if (state.screen !== 'baixo-debito' || outcome === null || outcome === 'sem-causa') {
        return state;
      }
      return { ...state, screen: 'resultado', shockType: outcome };
    }
    case 'reiniciar':
      return INITIAL_VTI_STATE;
  }
}

/**
 * Texto para o prontuário do resultado: tipo, VTI, respostas e conduta, sem
 * dado do paciente.
 */
export function buildVtiChartNote(state: VtiState, citation: string): string | null {
  if (state.shockType === null) return null;
  const content = VTI_SHOCK_TYPE_CONTENT[state.shockType];
  const vti = readVti(state);
  const lines = [
    `Classificação hemodinâmica pelo VTI: ${content.label} — ${content.summary.subtitle}.`,
  ];
  if (vti !== null) lines.push(`- VTI: ${formatDecimal(vti, 1)} cm (${classifyVti(vti).title})`);
  if (state.shockType !== 'distributivo') {
    const evaluation = evaluateLowOutput(state.lowOutput);
    for (const id of evaluation.questions) {
      const question = LOW_OUTPUT_QUESTIONS.find((candidate) => candidate.id === id);
      const answer = state.lowOutput[id];
      if (question && answer) lines.push(`- ${question.label} ${answer === 'sim' ? 'Sim' : 'Não'}`);
    }
    if (state.lowOutput.fluidResponsive) {
      lines.push(
        `- ${LOW_OUTPUT_FLUIDS.question} ${state.lowOutput.fluidResponsive === 'sim' ? 'Sim' : 'Não'}`,
      );
    }
  }
  for (const line of content.summary.lines) lines.push(`${line.label}: ${line.text}.`);
  lines.push(`Referência: ${citation}`);
  return lines.join('\n');
}
