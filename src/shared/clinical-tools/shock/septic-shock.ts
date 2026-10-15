import type { NumericInput } from '../calculator';
import type { ResultTone } from '../tone';
import { pickBand, VNERI_INPUTS, type UpperBound } from './vneri';

/**
 * Conteúdo do roteiro do choque séptico (CC-316), porte do ShockPath do ANY
 * (ANDROMEDA-SHOCK 2, protocolo CRT-PHR): reconhecimento, fluidos,
 * vasopressor, perfusão e perfil. Textos, limiares e doses iguais aos do ANY;
 * só a acentuação e as ordens ("Titular", "Manter") viraram sugestão. A tela
 * só desenha o que está aqui.
 */

export const SEPTIC_STEPS = [
  'reconhecimento',
  'fluidos',
  'vasopressor',
  'perfusao',
  'perfil',
] as const;
export type SepticStep = (typeof SEPTIC_STEPS)[number];

export const SEPTIC_STEP_CONTENT: Record<
  SepticStep,
  { title: string; short: string; subtitle: string }
> = {
  reconhecimento: {
    title: 'Reconhecimento do choque séptico',
    short: 'Reconhecimento',
    subtitle: 'Passo 1 de 5',
  },
  fluidos: { title: 'Avaliação de fluidos', short: 'Fluidos', subtitle: 'Passo 2 de 5 — Tier 1' },
  vasopressor: {
    title: 'Vasopressor — titulação',
    short: 'Vasopressor',
    subtitle: 'Passo 3 de 5 — Tier 1',
  },
  perfusao: {
    title: 'Avaliação de perfusão',
    short: 'Perfusão',
    subtitle: 'Passo 4 de 5 — Tier 2',
  },
  perfil: { title: 'Perfil hemodinâmico', short: 'Perfil', subtitle: 'Passo 5 de 5' },
};

export type YesNo = 'sim' | 'nao';

export const YES_NO_OPTIONS: readonly { id: YesNo; label: string }[] = [
  { id: 'sim', label: 'Sim' },
  { id: 'nao', label: 'Não' },
];

/** Texto informativo com título (as caixas de método e de teste do ANY). */
export interface InfoText {
  title: string;
  text: string;
}

/** Resultado com tom e rótulo: estado nunca só por cor. */
export interface ToneText extends InfoText {
  tone: ResultTone;
}

/**
 * Drogas que o roteiro manda calcular em Infusões. Os ids são os das
 * Infusões contínuas (CC-311), que abrem a droga direto por `?droga=<id>`.
 */
export const SHOCK_INFUSION_DRUGS = {
  noradrenalina: 'Noradrenalina',
  vasopressina: 'Vasopressina',
  dobutamina: 'Dobutamina',
} as const;
export type ShockInfusionDrug = keyof typeof SHOCK_INFUSION_DRUGS;

/** Atalhos de cada passo para as Infusões, como no ANY. */
export const SEPTIC_INFUSION_LINKS = {
  vasopressor: ['noradrenalina', 'vasopressina'],
  perfusao: ['dobutamina'],
  perfil: ['noradrenalina', 'vasopressina', 'dobutamina'],
} as const satisfies Record<string, readonly ShockInfusionDrug[]>;

// ---- Passo 1: reconhecimento ----

export const RECOGNITION_CRITERIA = [
  { id: 'infeccao', label: 'Infecção suspeita ou confirmada' },
  { id: 'lactato', label: 'Lactato ≥ 2 mmol/L (ou ≥ 18 mg/dL)' },
  { id: 'noradrenalina', label: 'Noradrenalina necessária para PAM ≥ 65 mmHg' },
  { id: 'fluidos', label: 'Fluidos ≥ 1000 mL já administrados' },
] as const;
export type RecognitionCriterionId = (typeof RECOGNITION_CRITERIA)[number]['id'];

export const RECOGNITION_CRITERIA_HINT = 'Marcação visual — não bloqueia a navegação.';

export type TecMode = 'normal' | 'anormal';

export const CAPILLARY_REFILL = {
  title: 'Tempo de enchimento capilar (TEC)',
  technique:
    'Pressione o leito ungueal por 10 segundos, solte e cronometre (Hernandez et al. JAMA 2025).',
  /** TEC até este valor (inclusive) é normal. */
  normalUpTo: 3,
  /**
   * Valor que o ANY assume quando o médico escolhe a faixa em vez de digitar:
   * "normal" vira 3 s e "anormal" vira 4 s (e aparece assim no perfil).
   */
  modeValues: { normal: 3, anormal: 4 } as const satisfies Record<TecMode, number>,
  modes: [
    { id: 'normal', label: 'Normal ≤ 3 s' },
    { id: 'anormal', label: 'Anormal > 3 s' },
  ] as const satisfies readonly { id: TecMode; label: string }[],
  input: {
    id: 'tec',
    label: 'TEC medido',
    unit: 's',
    min: 0.1,
    max: 20,
    step: 0.1,
  } satisfies NumericInput,
  normal: {
    title: 'TEC normal',
    tone: 'neutral',
    text: 'Considere monitorização periódica, reavaliando o TEC a cada 1 hora por 6 horas (Hernandez et al. JAMA 2025).',
  } satisfies ToneText,
  abnormal: {
    title: 'Hipoperfusão presente',
    tone: 'critical',
    text: 'TEC prolongado indica hipoperfusão tecidual. Considere iniciar ressuscitação guiada por TEC (protocolo CRT-PHR).',
  } satisfies ToneText,
  startTier1: 'Iniciar Tier 1',
} as const;

/**
 * Tom de cada reavaliação do TEC (bolinha do histórico no ANY): até 3 s
 * verde, até 4,5 s amarelo, acima disso vermelho. O 4,5 não tem referência
 * no ANY; está na revisão clínica.
 */
export const TEC_REEVALUATION_TONES: readonly {
  tone: ResultTone;
  /** Rótulo da faixa ao lado da cor (no ANY era só a bolinha). */
  label: string;
  upTo?: UpperBound;
}[] = [
  { tone: 'neutral', label: '≤ 3 s', upTo: { value: 3, inclusive: true } },
  { tone: 'attention', label: '> 3 a 4,5 s', upTo: { value: 4.5, inclusive: true } },
  { tone: 'critical', label: '> 4,5 s' },
];

export function capillaryRefillResult(tec: number): ToneText {
  return tec <= CAPILLARY_REFILL.normalUpTo ? CAPILLARY_REFILL.normal : CAPILLARY_REFILL.abnormal;
}

export function tecReevaluationBand(tec: number): (typeof TEC_REEVALUATION_TONES)[number] {
  return pickBand(TEC_REEVALUATION_TONES, tec);
}

export function tecReevaluationTone(tec: number): ResultTone {
  return tecReevaluationBand(tec).tone;
}

// ---- Passo 2: fluidos ----

export type PulsePressureMode = 'direto' | 'calculado';

export const PULSE_PRESSURE = {
  title: 'Pressão de pulso (PP)',
  explanation: 'PP = PAS − PAD. Reflete o volume sistólico (Hernandez et al. JAMA 2025).',
  /** PP abaixo disso sugere volume sistólico baixo (mmHg). */
  lowerThan: 40,
  modes: [
    { id: 'direto', label: 'Valor direto' },
    { id: 'calculado', label: 'Calcular PAS − PAD' },
  ] as const satisfies readonly { id: PulsePressureMode; label: string }[],
  inputs: {
    pp: { id: 'pp', label: 'Pressão de pulso (PP)', unit: 'mmHg', min: 5, max: 200, step: 1 },
    pas: {
      id: 'pas',
      label: 'Pressão arterial sistólica (PAS)',
      unit: 'mmHg',
      min: 40,
      max: 300,
      step: 1,
    },
  } satisfies Record<string, NumericInput>,
  /** No modo calculado, PAD maior ou igual à PAS não dá PP. */
  invalidDifference: 'A PAD precisa ser menor que a PAS para calcular a PP.',
  low: {
    title: 'PP < 40 mmHg — baixo volume sistólico provável',
    tone: 'attention',
    text: 'Considere avaliar a responsividade a fluidos antes de administrar volume (Hernandez et al. JAMA 2025).',
  } satisfies ToneText,
  adequate: {
    title: 'PP ≥ 40 mmHg — volume sistólico provavelmente adequado',
    tone: 'neutral',
    text: 'Considere prosseguir para a otimização do vasopressor sem bolus adicionais.',
  } satisfies ToneText,
} as const;

export function pulsePressureResult(pp: number): ToneText {
  return pp < PULSE_PRESSURE.lowerThan ? PULSE_PRESSURE.low : PULSE_PRESSURE.adequate;
}

export const FLUID_RESPONSIVENESS_METHODS = [
  {
    id: 'elevacao-mmii',
    label: 'Elevação de MMII',
    title: 'Elevação passiva de MMII',
    text: 'Elevar os membros inferiores a 45 graus por 60-90 segundos. Considere responsivo se aumento ≥ 10% no volume sistólico ou no débito cardíaco.',
  },
  {
    id: 'delta-pp',
    label: 'Delta PP',
    title: 'Delta PP',
    text: 'Em ventilação mecânica com Vt ≥ 8 mL/kg. Considere responsivo se a variação da PP for > 13%.',
  },
  {
    id: 'pocus',
    label: 'POCUS',
    title: 'POCUS',
    text: 'Avalie a variação da veia cava inferior com a ventilação. Considere responsivo se a variação for > 18% (ventilação mecânica).',
  },
  {
    id: 'fluid-challenge',
    label: 'Fluid challenge',
    title: 'Fluid challenge',
    text: 'Considere 250-500 mL em 10-15 min e avaliar a resposta hemodinâmica. Preferir quando os outros métodos não estiverem disponíveis.',
  },
] as const;
export type FluidMethodId = (typeof FLUID_RESPONSIVENESS_METHODS)[number]['id'];

export const FLUIDS = {
  methodsTitle: 'Método de avaliação de responsividade',
  responsiveQuestion: 'Responsivo a fluidos?',
  bolus: {
    title: 'Bolus de cristaloide',
    text: 'Considere 500 mL de cristaloide balanceado em 30 minutos (Hernandez et al. JAMA 2025). Máximo recomendado neste passo: 1000 mL.',
  } satisfies InfoText,
  /** Cada toque soma um bolus de 500 mL, até 1000 mL no passo (como no ANY). */
  bolusStepMl: 500,
  bolusMaxMl: 1000,
  tecNormalizedQuestion: 'TEC normalizou após fluidos?',
  notResponsive: {
    title: 'Não responsivo a volume',
    tone: 'critical',
    text: 'Considere otimizar o vasopressor antes de mais fluidos e prosseguir para a avaliação do vasopressor.',
  } satisfies ToneText,
  toVasopressor: 'Vasopressor — Tier 1b',
} as const;

// ---- Passo 3: vasopressor ----

export const VASOPRESSOR = {
  inputs: { pad: VNERI_INPUTS.pad, fc: VNERI_INPUTS.fc, doseNE: VNERI_INPUTS.doseNE },
  /** PAD abaixo disso sugere vasoplegia (mmHg). */
  padLowerThan: 50,
  vasoplegia: {
    title: 'Vasoplegia provável',
    tone: 'attention',
    text: 'PAD < 50 mmHg sugere tônus vascular reduzido. Considere titular a noradrenalina para PAD ≥ 50 mmHg (Bertrand et al. Ann Intensive Care 2025).',
  } satisfies ToneText,
  /** Botões − e + da dose (mcg/kg/min), com a dose de partida e os limites do ANY. */
  doseStep: 0.05,
  doseDefault: 0.1,
  doseMin: 0.01,
  doseMax: 3,
  vneriTitle: 'VNERi — responsividade vascular',
  vneriFormula: 'Fórmula: PAD / (dose NE × FC)',
  vneriSource: 'Goury et al. Ann Intensive Care 2025',
  tecNormalizedQuestion: 'TEC normalizou?',
} as const;

/**
 * Botão − / + da dose de noradrenalina: parte da dose digitada (ou 0,10),
 * arredonda para 2 casas e fica entre 0,01 e 3 — a conta do `adjustDoseNE`.
 */
export function adjustNorepinephrineDose(current: number | null, delta: number): number {
  const base = current ?? VASOPRESSOR.doseDefault;
  const next = Math.round((base + delta) * 100) / 100;
  return Math.min(VASOPRESSOR.doseMax, Math.max(VASOPRESSOR.doseMin, next));
}

// ---- Passo 4: perfusão ----

export const ECHO_FINDINGS = [
  { id: 've-hipocinetico', label: 'VE hipocinético' },
  { id: 'vd-dilatado', label: 'VD dilatado' },
  { id: 'outra-disfuncao', label: 'Outra disfunção (valvar, tamponamento)' },
] as const;
export type EchoFindingId = (typeof ECHO_FINDINGS)[number]['id'];

export const PERFUSION_STEP = {
  echoTitle: 'Ecocardiograma à beira-leito',
  echoHint: 'Considere avaliação ecocardiográfica quando disponível.',
  markersTitle: 'Marcadores de perfusão',
  markersHint:
    'SvcO2 e gap CO2 guiam a interpretação do mecanismo de hipoperfusão (Ltaief et al. Critical Care 2021).',
  extraTestsTitle: 'Testes adicionais',
  chronicHypertensionQuestion: 'Hipertensão arterial crônica?',
  mapTest: {
    title: 'Teste de PAM elevada',
    text: 'Considere titular a PAM para 80-85 mmHg por 1 hora e reavaliar o TEC após o período. Indicado em hipertensos crônicos, que podem ter a autorregulação deslocada (Hernandez et al. JAMA 2025).',
  } satisfies InfoText,
  mapTestQuestion: 'TEC normalizou com PAM 80-85?',
  dobutamineTest: {
    title: 'Teste de dobutamina',
    text: 'Considere dobutamina 5 mcg/kg/min por 1 hora e reavaliar o TEC, em pacientes com suspeita de disfunção miocárdica ou baixo débito (Hernandez et al. JAMA 2025).',
  } satisfies InfoText,
  dobutamineTestQuestion: 'TEC normalizou com dobutamina?',
} as const;

// ---- Passo 5: perfil ----

export const PROFILE_STEP = {
  mechanismTitle: 'Mecanismo predominante',
  findingsTitle: 'Achados',
  noFindings: 'Nenhum dado registrado',
  suggestionsTitle: 'Condutas sugeridas',
  notRecommendedTitle: 'Não recomendado',
  goal: {
    title: 'Meta',
    text: 'TEC ≤ 3 segundos. Considere reavaliar em 1 hora (Hernandez et al. JAMA 2025).',
  } satisfies InfoText,
  timelineTitle: 'Linha do tempo',
  emptyTimeline: 'Nenhuma intervenção registrada',
  reevaluationTitle: 'Reavaliação do TEC',
} as const;

/** Achado do perfil: o texto do ANY e o tom (a bolinha colorida de lá). */
export interface ProfileFinding {
  id: string;
  text: string;
  tone: ResultTone;
}

/** Conduta sugerida e "não recomendado" do perfil, com id para teste e prontuário. */
export interface ProfileItem {
  id: string;
  text: string;
}

/** Condutas do perfil, na ordem do ANY. */
export const PROFILE_SUGGESTIONS = {
  reavaliarTec: 'Considere reavaliar o TEC a cada 1 hora por 6 horas.',
  titularNoradrenalina:
    'Considere titular a noradrenalina para PAD ≥ 50 mmHg (Bertrand et al. 2025).',
  adjuvante:
    'Considere vasopressina 0,01-0,04 UI/min ou hidrocortisona 200 mg/dia (Goury et al. 2025).',
  dobutaminaVe: 'Considere dobutamina 5-20 mcg/kg/min para disfunção de VE.',
  inotropicoBaixoDebito: 'Considere inotrópico para baixo débito cardíaco (Ltaief et al. 2021).',
  hemoglobina: 'Considere checar a hemoglobina e a SaO2, e transfusão se Hb < 7 g/dL.',
  testePam: 'Considere teste de PAM 80-85 mmHg por 1 hora (hipertenso crônico).',
  manterPam: 'Considere manter a PAM alvo de 80-85 mmHg (teste positivo).',
  manterDobutamina: 'Considere manter a dobutamina (teste positivo).',
  monitorizacao: 'Monitorização clínica. Considere reavaliar o TEC a cada 1 hora.',
} as const;
export type ProfileSuggestionId = keyof typeof PROFILE_SUGGESTIONS;

/** "Não recomendado" do perfil, como o ANY (são proibições, não ordens). */
export const PROFILE_NOT_RECOMMENDED = {
  fluidosLiberais:
    'Evitar fluidos liberais sem avaliação de responsividade (Hernandez et al. 2025).',
  maisFluidos: 'Não administrar mais fluidos em paciente não responsivo a volume.',
  escalarNe: 'Não escalar NE isoladamente em hiporresponsividade grave (Goury et al. 2025).',
} as const;
export type ProfileNotRecommendedId = keyof typeof PROFILE_NOT_RECOMMENDED;

/** Componentes do mecanismo, como o ANY os nomeia no rótulo do perfil. */
export type ShockComponent = 'vasoplégico' | 'cardiogênico' | 'obstrutivo';

/** Rótulo do perfil a partir dos componentes achados, na regra do ANY. */
export function profileLabel(components: readonly ShockComponent[]): string {
  const unique = [...new Set(components)];
  if (unique.length > 1) return `Choque misto — ${unique.join(' + ')}`;
  if (unique.length === 1) return `Choque séptico — componente ${unique[0]}`;
  return 'Choque séptico';
}

/** Tons dos achados do perfil (as cores fixas das bolinhas do ANY). */
export const PROFILE_FINDING_THRESHOLDS = {
  /** Lactato ≥ 4 vermelho, ≥ 2 amarelo (mmol/L). */
  lactateCritical: 4,
  lactateAttention: 2,
  /** PP < 40 amarela. */
  pulsePressureLow: 40,
  /** PAD < 50 amarela e "vasoplégico". */
  padLow: 50,
  /** VNERi < 2,6 entra como "vasoplégico". */
  vneriVasoplegic: 2.6,
  /** SvcO2 < 70 amarela; gap > 6 amarelo. */
  svco2Low: 70,
  gapCO2High: 6,
} as const;
