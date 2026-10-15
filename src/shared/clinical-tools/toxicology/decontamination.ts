import { formatCompact } from '../numbers';
import type { NumericRange } from '../ranges';
import type { ResultTone } from '../tone';
import { DISQUE_INTOXICACAO } from './ciatox';
import { toxChartSourceLine } from './provenance';

/**
 * Descontaminação gastrointestinal em 5 passos (CC-323), do ToxPath do ANY.
 * Lá a regra era um `switch` dentro do componente; aqui cada opção diz para
 * onde vai (próximo passo ou resultado), e o estado do roteiro é só a lista
 * de respostas, num reducer puro.
 */

export const DECONTAMINATION_STEP_IDS = [1, 2, 3, 4, 5] as const;
export type DecontaminationStepId = (typeof DECONTAMINATION_STEP_IDS)[number];

export const DECONTAMINATION_RESULT_IDS = [
  'caustico',
  'incerto',
  'nao-indicado-tempo',
  'nao-indicado-adsorcao',
  'nao-indicado-contraindicacao',
  'proteger-via-aerea',
  'indicado',
] as const;
export type DecontaminationResultId = (typeof DECONTAMINATION_RESULT_IDS)[number];

export type DecontaminationOption = { label: string; value: string } & (
  | { next: DecontaminationStepId; result?: never }
  | { result: DecontaminationResultId; next?: never }
);

export interface DecontaminationStep {
  id: DecontaminationStepId;
  question: string;
  hint: string;
  options: readonly DecontaminationOption[];
}

/** Tela de abertura: o ANY explica o fluxo antes do passo 1. */
export const DECONTAMINATION_INTRO = {
  title: 'Quando considerar descontaminação gastrointestinal?',
  text: 'Este fluxo auxilia na decisão sobre carvão ativado ou lavagem gástrica em intoxicações agudas.',
  principle: {
    title: 'Princípio geral',
    text: 'A descontaminação GI apresenta benefício limitado na maioria dos casos. A decisão deve considerar tempo, substância e estado clínico do paciente.',
  },
  caution: `Este fluxo é um auxílio à decisão. A conduta final deve ser individualizada e, em caso de dúvida, recomenda-se contato com o Disque-Intoxicação (${DISQUE_INTOXICACAO.phone}).`,
} as const;

export const DECONTAMINATION_STEPS: readonly DecontaminationStep[] = [
  {
    id: 1,
    question: 'A substância ingerida é cáustica, hidrocarboneto ou tem risco de aspiração?',
    hint: 'Álcalis fortes, ácidos, produtos de limpeza, derivados de petróleo',
    options: [
      { label: 'Sim, substância cáustica', value: 'caustico', result: 'caustico' },
      { label: 'Não', value: 'nao', next: 2 },
      { label: 'Não sei / Incerto', value: 'incerto', result: 'incerto' },
    ],
  },
  {
    id: 2,
    question: 'Quanto tempo desde a ingestão?',
    hint: 'O tempo é fator crítico na decisão de descontaminação',
    options: [
      { label: 'Menos de 1 hora', value: 'menos_1h', next: 3 },
      { label: '1-2 horas', value: '1_2h', next: 3 },
      { label: 'Mais de 2 horas', value: 'mais_2h', result: 'nao-indicado-tempo' },
      { label: 'Desconhecido', value: 'desconhecido', next: 3 },
    ],
  },
  {
    id: 3,
    question: 'A substância é adsorvida pelo carvão ativado?',
    hint: 'Carvão não adsorve: metais (ferro, lítio), álcoois, solventes',
    options: [
      { label: 'Sim, é adsorvida', value: 'adsorvida', next: 4 },
      { label: 'Não é adsorvida', value: 'nao_adsorvida', result: 'nao-indicado-adsorcao' },
      { label: 'Não sei', value: 'incerto_subst', result: 'incerto' },
    ],
  },
  {
    id: 4,
    question: 'O paciente está consciente e com via aérea protegida?',
    hint: 'Avaliar Glasgow, reflexo de deglutição, risco de aspiração',
    options: [
      { label: 'Consciente e via aérea ok', value: 'consciente', next: 5 },
      { label: 'Rebaixado / VA não protegida', value: 'rebaixado', result: 'proteger-via-aerea' },
    ],
  },
  {
    id: 5,
    question: 'Há outras contraindicações?',
    hint: 'Cirurgia abdominal recente, perfuração intestinal, obstrução',
    options: [
      { label: 'Sem contraindicações', value: 'sem_ci', result: 'indicado' },
      { label: 'Com contraindicação', value: 'com_ci', result: 'nao-indicado-contraindicacao' },
    ],
  },
];

export interface DecontaminationResultContent {
  id: DecontaminationResultId;
  title: string;
  text: string;
  /** Contraindicação e via aérea em vermelho; "não indicado" e dúvida em laranja (ANY). */
  tone: ResultTone;
}

export const DECONTAMINATION_RESULTS: Readonly<
  Record<DecontaminationResultId, DecontaminationResultContent>
> = {
  caustico: {
    id: 'caustico',
    title: 'Contraindicação absoluta',
    text: 'Substâncias cáusticas e hidrocarbonetos apresentam risco de perfuração e aspiração. Descontaminação GI está contraindicada.',
    tone: 'critical',
  },
  incerto: {
    id: 'incerto',
    title: 'Considere contatar o CIATox',
    text: 'Na dúvida sobre a substância ingerida, considere entrar em contato com o Disque-Intoxicação para orientação específica.',
    tone: 'attention',
  },
  'nao-indicado-tempo': {
    id: 'nao-indicado-tempo',
    title: 'Tempo superior a 2 horas desde a ingestão',
    text: 'Após 2 horas, a maior parte da absorção já ocorreu. O benefício da descontaminação é improvável.',
    tone: 'attention',
  },
  'nao-indicado-adsorcao': {
    id: 'nao-indicado-adsorcao',
    title: 'Substância não é efetivamente adsorvida pelo carvão',
    text: 'Álcoois, metais (ferro, lítio) e solventes não são bem adsorvidos.',
    tone: 'attention',
  },
  'nao-indicado-contraindicacao': {
    id: 'nao-indicado-contraindicacao',
    title: 'Presença de contraindicação relativa',
    text: 'Avalie o risco-benefício individual.',
    tone: 'attention',
  },
  'proteger-via-aerea': {
    id: 'proteger-via-aerea',
    title: 'Via aérea não protegida',
    text: 'Considere intubação orotraqueal antes da descontaminação. Carvão ativado em paciente rebaixado sem IOT apresenta risco de aspiração.',
    tone: 'critical',
  },
  indicado: {
    id: 'indicado',
    title: 'Carvão ativado pode ser considerado',
    text: 'Todos os critérios de elegibilidade foram atendidos',
    tone: 'neutral',
  },
};

/**
 * Subtítulo do "indicado" quando a ingestão foi há 1–2 h ou em hora
 * desconhecida (no ANY, a marca `tempo_incerto`).
 */
export const REDUCED_BENEFIT_TEXT = 'Benefício possível, porém reduzido — avalie individualmente';

/** Nota do ANY abaixo da dose de carvão. */
export const CHARCOAL_NOTE = 'Diluir em água ou SNG. Dose única na maioria dos casos.';

// ---- Carvão ativado ----------------------------------------------------------------------

/**
 * Dose do ANY (BLOCKER-04, Goldfrank 11ª ed.): 1 g/kg, no mínimo 25 g e no
 * máximo 100 g, arredondada ao grama.
 */
export const ACTIVATED_CHARCOAL = { gramsPerKg: 1, minGrams: 25, maxGrams: 100 } as const;

/**
 * Peso aceito no roteiro de Toxicologia: do mínimo pediátrico do ADR-017
 * (0,5 kg) ao teto que o ANY aceitava no peso do carvão (300 kg).
 */
export const TOX_WEIGHT_RANGE: NumericRange = { min: 0.5, max: 300, unit: 'kg' };

export function activatedCharcoalDose(weightKg: number): number {
  const { gramsPerKg, minGrams, maxGrams } = ACTIVATED_CHARCOAL;
  return Math.min(maxGrams, Math.max(minGrams, Math.round(weightKg * gramsPerKg)));
}

/** "1 g/kg (mín. 25 g, máx. 100 g) — via oral ou SNG". */
export const CHARCOAL_RULE_TEXT = `${formatCompact(ACTIVATED_CHARCOAL.gramsPerKg)} g/kg (mín. ${ACTIVATED_CHARCOAL.minGrams} g, máx. ${ACTIVATED_CHARCOAL.maxGrams} g) — via oral ou SNG`;

// ---- Estado do roteiro -------------------------------------------------------------------

export interface DecontaminationAnswer {
  stepId: DecontaminationStepId;
  value: string;
}

export interface DecontaminationFlowState {
  /** Saiu da tela de abertura ("Iniciar avaliação"). */
  started: boolean;
  answers: readonly DecontaminationAnswer[];
}

export type DecontaminationFlowAction =
  | { type: 'start' }
  | { type: 'answer'; value: string }
  | { type: 'back' }
  | { type: 'restart' };

export const INITIAL_DECONTAMINATION_FLOW: DecontaminationFlowState = {
  started: false,
  answers: [],
};

export interface AnsweredStep {
  step: DecontaminationStep;
  option: DecontaminationOption;
}

export type DecontaminationView =
  | { kind: 'intro' }
  | { kind: 'question'; step: DecontaminationStep }
  | {
      kind: 'result';
      result: DecontaminationResultContent;
      /** Só no "indicado": ingestão há 1–2 h ou em hora desconhecida. */
      reducedBenefit: boolean;
      answered: readonly AnsweredStep[];
    };

const STEP_BY_ID = new Map(DECONTAMINATION_STEPS.map((step) => [step.id, step]));

function stepById(id: DecontaminationStepId): DecontaminationStep {
  const step = STEP_BY_ID.get(id);
  if (!step) throw new Error(`Passo ${id} não existe na descontaminação.`);
  return step;
}

/** Tempo da ingestão que, no ANY, reduz o benefício do carvão "indicado". */
const REDUCED_BENEFIT_TIMES = new Set(['1_2h', 'desconhecido']);

export function decontaminationView(state: DecontaminationFlowState): DecontaminationView {
  if (!state.started) return { kind: 'intro' };
  let current = stepById(1);
  const answered: AnsweredStep[] = [];
  for (const [index, answer] of state.answers.entries()) {
    const option = current.options.find(({ value }) => value === answer.value);
    if (answer.stepId !== current.id || !option) {
      throw new Error(`Resposta ${index + 1} não cabe no passo ${current.id}.`);
    }
    answered.push({ step: current, option });
    if (option.result !== undefined) {
      const time = state.answers.find(({ stepId }) => stepId === 2)?.value;
      return {
        kind: 'result',
        result: DECONTAMINATION_RESULTS[option.result],
        reducedBenefit:
          option.result === 'indicado' && time !== undefined && REDUCED_BENEFIT_TIMES.has(time),
        answered,
      };
    }
    current = stepById(option.next);
  }
  return { kind: 'question', step: current };
}

/** Barra do ANY: passo atual sobre 5 (abertura = 0), 100% no resultado. */
export function decontaminationProgress(state: DecontaminationFlowState): number {
  const view = decontaminationView(state);
  if (view.kind === 'result') return 100;
  if (view.kind === 'intro') return 0;
  return (view.step.id / DECONTAMINATION_STEPS.length) * 100;
}

export function decontaminationFlowReducer(
  state: DecontaminationFlowState,
  action: DecontaminationFlowAction,
): DecontaminationFlowState {
  switch (action.type) {
    case 'start':
      return state.started ? state : { started: true, answers: [] };
    case 'answer': {
      const view = decontaminationView(state);
      if (view.kind !== 'question') return state;
      const option = view.step.options.find(({ value }) => value === action.value);
      if (!option) return state;
      return {
        ...state,
        answers: [...state.answers, { stepId: view.step.id, value: option.value }],
      };
    }
    case 'back':
      if (state.answers.length > 0) return { ...state, answers: state.answers.slice(0, -1) };
      return state.started ? INITIAL_DECONTAMINATION_FLOW : state;
    case 'restart':
      return INITIAL_DECONTAMINATION_FLOW;
  }
}

/** Ponto final só quando o texto do ANY não tem. */
function sentence(text: string): string {
  return /[.!?]$/.test(text) ? text : `${text}.`;
}

/**
 * Texto para o prontuário no fim do fluxo: o resultado, as respostas e, se
 * houver peso, a dose de carvão. Sem dado de paciente.
 */
export function buildDecontaminationChartNote(
  state: DecontaminationFlowState,
  weightKg: number | null,
): string | null {
  const view = decontaminationView(state);
  if (view.kind !== 'result') return null;
  const lines = [
    `Descontaminação GI: ${view.result.title}.`,
    ...view.answered.map(({ step, option }) => `- ${step.question} ${option.label}`),
    sentence(view.reducedBenefit ? REDUCED_BENEFIT_TEXT : view.result.text),
  ];
  if (view.result.id === 'indicado' && weightKg !== null) {
    lines.push(
      `Carvão ativado: ${activatedCharcoalDose(weightKg)} g para ${formatCompact(weightKg, 1)} kg (${CHARCOAL_RULE_TEXT}). ${CHARCOAL_NOTE}`,
    );
  }
  lines.push(toxChartSourceLine());
  return lines.join('\n');
}
