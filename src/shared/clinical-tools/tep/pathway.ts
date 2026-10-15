import {
  evaluateCalculator,
  findBand,
  formatResultValue,
  type CalculatorEvaluation,
  type Interpretation,
} from '../calculator';
import { TEP_CATEGORIES, TEP_CATEGORY_IDS, categoryLabel, type TepCategoryId } from './categories';
import { ECHO_RV } from './echo';
import { TEP_PROVENANCE } from './provenance';
import { WELLS_TEP } from './wells';

/**
 * Roteiro do TEP como reducer puro (CC-318): o estado que o `TepGuide.tsx` do
 * ANY espalhava em `useState` (painel, pergunta, respostas, categoria,
 * modificador R, investigação, trombólise e eco) num objeto só, e cada toque
 * do médico como uma ação tipada. As transições são as do ANY
 * (`classAnswer`, `classifyUnstable`, os botões de cada passo);
 * tests/clinical-tools/tep-differential.spec.ts percorre todos os caminhos
 * nos dois e compara.
 *
 * O estado é só dado (JSON): a tela guarda na sessão e volta ao mesmo ponto
 * depois de abrir a heparina em Infusões. Ação fora de hora (responder sem
 * estar na classificação, opção de outra pergunta) não muda nada: o estado
 * salvo pode vir de qualquer lugar, e o reducer não pode quebrar com ele.
 */

/** Passos do roteiro. `instavel` é o desvio do passo 1, como no ANY. */
export const TEP_STEPS = [
  'estabilidade',
  'instavel',
  'diagnostico',
  'classificacao',
  'conduta',
] as const;
export type TepStep = (typeof TEP_STEPS)[number];

/** Perguntas da classificação, na ordem em que podem aparecer (Q1 a Q4 do ANY). */
export const TEP_QUESTIONS = [
  'sintomas',
  'spesi',
  'hestia',
  'localizacao',
  'biomarcadores',
  'pre-falencia',
  'respiratorio',
] as const;
export type TepQuestionId = (typeof TEP_QUESTIONS)[number];

/** Respostas aceitas em cada pergunta. */
export const TEP_ANSWERS = {
  sintomas: ['assintomatico', 'sintomatico'],
  spesi: ['baixo-risco', 'risco-elevado'],
  hestia: ['hestia-negativo', 'hestia-positivo'],
  localizacao: ['subsegmentar', 'segmentar'],
  biomarcadores: ['c1', 'c2', 'c3'],
  'pre-falencia': ['d1', 'd2', 'manter-c3'],
  respiratorio: ['sem-r', 'com-r'],
} as const satisfies Record<TepQuestionId, readonly string[]>;
export type TepAnswer = (typeof TEP_ANSWERS)[TepQuestionId][number];

export type TestResult = 'negativo' | 'positivo';
export const WELLS_LEVELS = ['baixa', 'intermediaria', 'alta'] as const;
export type WellsLevel = (typeof WELLS_LEVELS)[number];

/** Categorias que o paciente instável recebe direto (ANY `classifyUnstable`). */
export type UnstableCategory = 'E2' | 'E1' | 'D';

export const THROMBOLYSIS_STAGES = [
  'contraindicacao',
  'contraindicada',
  'risco-hemorragico',
  'dose-reduzida',
  'dose-padrao',
] as const;
export type ThrombolysisStage = (typeof THROMBOLYSIS_STAGES)[number];
export type ThrombolysisAnswer =
  | 'contraindicada'
  | 'sem-contraindicacao'
  | 'risco-alto'
  | 'risco-padrao'
  | 'reavaliar';

export interface TepClassification {
  symptomatic?: boolean;
  risk?: 'baixo' | 'elevado';
  location?: 'subsegmentar' | 'segmentar';
  /** Coletado como no ANY; não muda a categoria, só aparece no resumo. */
  hestia?: TestResult;
}

export interface TepDiagnosis {
  pregnant: boolean;
  wells: WellsLevel | null;
  perc: TestResult | null;
  dDimer: TestResult | null;
  yearsPregnancy: TestResult | null;
}

/** Achados do eco no formato de resposta do motor (id do item → `nao`/`sim`). */
export type EchoAnswers = Readonly<Record<string, 'nao' | 'sim'>>;

export interface TepPathwayState {
  step: TepStep;
  question: TepQuestionId;
  classification: TepClassification;
  category: TepCategoryId | null;
  /** Modificador respiratório (R). O instável recebe R sempre, como no ANY. */
  respiratory: boolean;
  diagnosis: TepDiagnosis;
  thrombolysis: ThrombolysisStage;
  echo: EchoAnswers;
}

export type TepAction =
  | { type: 'estabilidade'; stable: boolean }
  | { type: 'voltar' }
  | { type: 'gestante'; pregnant: boolean }
  | { type: 'wells'; level: WellsLevel }
  | { type: 'perc'; result: TestResult }
  | { type: 'd-dimero'; result: TestResult }
  | { type: 'years-gestante'; result: TestResult }
  | { type: 'confirmar-tep' }
  | { type: 'responder'; answer: TepAnswer }
  | { type: 'classificar-instavel'; category: UnstableCategory }
  | { type: 'trombolise'; answer: ThrombolysisAnswer }
  | { type: 'eco'; finding: string; present: boolean }
  | { type: 'reiniciar' };

const EMPTY_DIAGNOSIS: TepDiagnosis = {
  pregnant: false,
  wells: null,
  perc: null,
  dDimer: null,
  yearsPregnancy: null,
};

/** O que o `resetClassification` do ANY zera. */
const EMPTY_CLASSIFICATION = {
  question: 'sintomas',
  classification: {},
  category: null,
  respiratory: false,
} as const satisfies Pick<
  TepPathwayState,
  'question' | 'classification' | 'category' | 'respiratory'
>;

export const INITIAL_TEP_STATE: TepPathwayState = {
  step: 'estabilidade',
  ...EMPTY_CLASSIFICATION,
  diagnosis: EMPTY_DIAGNOSIS,
  thrombolysis: 'contraindicacao',
  echo: {},
};

/** PERC só na probabilidade baixa (fora da gestação). */
export function showsPerc(diagnosis: TepDiagnosis): boolean {
  return !diagnosis.pregnant && diagnosis.wells === 'baixa';
}

/** D-dímero: Wells baixo com PERC positivo, ou Wells intermediário. */
export function showsDDimer(diagnosis: TepDiagnosis): boolean {
  if (diagnosis.pregnant) return false;
  return (
    (diagnosis.wells === 'baixa' && diagnosis.perc === 'positivo') ||
    diagnosis.wells === 'intermediaria'
  );
}

const THROMBOLYSIS_NEXT: Record<
  ThrombolysisStage,
  Partial<Record<ThrombolysisAnswer, ThrombolysisStage>>
> = {
  contraindicacao: { contraindicada: 'contraindicada', 'sem-contraindicacao': 'risco-hemorragico' },
  'risco-hemorragico': { 'risco-alto': 'dose-reduzida', 'risco-padrao': 'dose-padrao' },
  contraindicada: { reavaliar: 'contraindicacao' },
  'dose-reduzida': { reavaliar: 'contraindicacao' },
  'dose-padrao': { reavaliar: 'contraindicacao' },
};

const ECHO_FINDINGS = new Set(ECHO_RV.items.map(({ id }) => id));

function acceptsAnswer(question: TepQuestionId, answer: TepAnswer): boolean {
  return (TEP_ANSWERS[question] as readonly TepAnswer[]).includes(answer);
}

function toQuestion(state: TepPathwayState, question: TepQuestionId): TepPathwayState {
  return { ...state, question };
}

function withCategory(
  state: TepPathwayState,
  category: TepCategoryId,
  question: TepQuestionId = 'respiratorio',
): TepPathwayState {
  return { ...state, category, question };
}

/**
 * Localização do trombo (ANY `classAnswer` 'subseg'/'segPlus'): assintomático
 * vira A, baixo risco vira B. O ramo que volta para os biomarcadores existe no
 * ANY mas não é alcançável pela tela (risco elevado não passa pela
 * localização); fica igual por paridade.
 */
function answerLocation(
  state: TepPathwayState,
  location: 'subsegmentar' | 'segmentar',
): TepPathwayState {
  const classification = { ...state.classification, location };
  const next = { ...state, classification };
  const subsegmental = location === 'subsegmentar';
  if (!classification.symptomatic) return withCategory(next, subsegmental ? 'A1' : 'A2');
  if (classification.risk === 'baixo') return withCategory(next, subsegmental ? 'B1' : 'B2');
  return toQuestion(next, 'biomarcadores');
}

function answerQuestion(state: TepPathwayState, answer: TepAnswer): TepPathwayState {
  const classification = state.classification;
  switch (answer) {
    case 'assintomatico':
      return toQuestion(
        { ...state, classification: { ...classification, symptomatic: false } },
        'localizacao',
      );
    case 'sintomatico':
      return toQuestion(
        { ...state, classification: { ...classification, symptomatic: true } },
        'spesi',
      );
    case 'baixo-risco':
      return toQuestion(
        { ...state, classification: { ...classification, risk: 'baixo' } },
        'hestia',
      );
    case 'risco-elevado':
      return toQuestion(
        { ...state, classification: { ...classification, risk: 'elevado' } },
        'biomarcadores',
      );
    case 'hestia-negativo':
    case 'hestia-positivo':
      return toQuestion(
        {
          ...state,
          classification: {
            ...classification,
            hestia: answer === 'hestia-negativo' ? 'negativo' : 'positivo',
          },
        },
        'localizacao',
      );
    case 'subsegmentar':
    case 'segmentar':
      return answerLocation(state, answer);
    case 'c1':
      return withCategory(state, 'C1');
    case 'c2':
      return withCategory(state, 'C2');
    case 'c3':
      return withCategory(state, 'C3', 'pre-falencia');
    case 'd1':
      return withCategory(state, 'D1');
    case 'd2':
      return withCategory(state, 'D2');
    case 'manter-c3':
      return withCategory(state, 'C3');
    case 'sem-r':
    case 'com-r':
      // A Q4 só aparece com a categoria já definida; sem ela, nada a fazer.
      if (state.category === null) return state;
      return { ...state, respiratory: answer === 'com-r', step: 'conduta' };
  }
}

function updateDiagnosis(state: TepPathwayState, diagnosis: TepDiagnosis): TepPathwayState {
  return { ...state, diagnosis };
}

export function tepReducer(state: TepPathwayState, action: TepAction): TepPathwayState {
  const { diagnosis } = state;
  switch (action.type) {
    case 'estabilidade':
      if (state.step !== 'estabilidade') return state;
      return { ...state, step: action.stable ? 'diagnostico' : 'instavel' };

    case 'voltar':
      switch (state.step) {
        case 'instavel':
        case 'diagnostico':
          return { ...state, step: 'estabilidade' };
        case 'classificacao':
          // "Voltar ao diagnóstico" do ANY zera a classificação.
          return { ...state, ...EMPTY_CLASSIFICATION, step: 'diagnostico' };
        default:
          return state;
      }

    case 'gestante':
      if (state.step !== 'diagnostico') return state;
      // Trocar o modo zera a investigação, como o Toggle do ANY.
      return updateDiagnosis(state, { ...EMPTY_DIAGNOSIS, pregnant: action.pregnant });

    case 'wells':
      if (state.step !== 'diagnostico' || diagnosis.pregnant) return state;
      return updateDiagnosis(state, {
        ...diagnosis,
        wells: action.level,
        perc: null,
        dDimer: null,
      });

    case 'perc':
      if (state.step !== 'diagnostico' || !showsPerc(diagnosis)) return state;
      return updateDiagnosis(state, { ...diagnosis, perc: action.result });

    case 'd-dimero':
      if (state.step !== 'diagnostico' || !showsDDimer(diagnosis)) return state;
      return updateDiagnosis(state, { ...diagnosis, dDimer: action.result });

    case 'years-gestante':
      if (state.step !== 'diagnostico' || !diagnosis.pregnant) return state;
      return updateDiagnosis(state, { ...diagnosis, yearsPregnancy: action.result });

    case 'confirmar-tep':
      if (state.step !== 'diagnostico') return state;
      return { ...state, ...EMPTY_CLASSIFICATION, step: 'classificacao' };

    case 'responder':
      if (state.step !== 'classificacao' || !acceptsAnswer(state.question, action.answer)) {
        return state;
      }
      return answerQuestion(state, action.answer);

    case 'classificar-instavel':
      if (state.step !== 'instavel') return state;
      return { ...state, category: action.category, respiratory: true, step: 'conduta' };

    case 'trombolise': {
      if (state.step !== 'instavel') return state;
      const next = THROMBOLYSIS_NEXT[state.thrombolysis][action.answer];
      return next ? { ...state, thrombolysis: next } : state;
    }

    case 'eco':
      if (state.step !== 'instavel' || !ECHO_FINDINGS.has(action.finding)) return state;
      return {
        ...state,
        echo: { ...state.echo, [action.finding]: action.present ? 'sim' : 'nao' },
      };

    case 'reiniciar':
      // O ANY zerava classificação e investigação, mas mantinha o eco e a
      // trombólise do paciente anterior; aqui o roteiro recomeça do zero.
      return INITIAL_TEP_STATE;
  }
}

/** Passo atual nos quatro do ANY (o instável conta como passo 1). */
export function tepStepNumber(step: TepStep): 1 | 2 | 3 | 4 {
  switch (step) {
    case 'estabilidade':
    case 'instavel':
      return 1;
    case 'diagnostico':
      return 2;
    case 'classificacao':
      return 3;
    case 'conduta':
      return 4;
  }
}

// ---- Calculadoras dentro do roteiro ----------------------------------------------------------

type Complete = Extract<CalculatorEvaluation, { status: 'complete' }>;

function isTestResult(id: string): id is TestResult {
  return id === 'negativo' || id === 'positivo';
}

function testResult(evaluation: Complete): TestResult {
  const { id } = evaluation.band;
  if (!isTestResult(id)) throw new Error(`Faixa "${id}" não é resultado de teste.`);
  return id;
}

/** Nível de Wells pela pontuação: as faixas da própria calculadora (< 2, 2–6, > 6). */
export function wellsLevelFor(score: number): WellsLevel {
  const { id } = findBand(WELLS_TEP.interpretation as Interpretation, score);
  const level = WELLS_LEVELS.find((candidate) => candidate === id);
  if (!level) throw new Error(`Faixa de Wells "${id}" sem nível no roteiro.`);
  return level;
}

/** Calculadora do passo de investigação que move o roteiro quando completa. */
export type DiagnosisCalculator = 'wells' | 'perc' | 'dDimer' | 'years' | 'yearsPregnancy';

/**
 * Ação do roteiro que uma calculadora da investigação dispara ao completar,
 * como o ANY fazia ao marcar o item ou digitar o D-dímero (Wells fixa o nível;
 * PERC, D-dímero e YEARS fixam o resultado do passo).
 */
export function diagnosisActionFor(
  calculator: DiagnosisCalculator,
  evaluation: Complete,
): TepAction {
  switch (calculator) {
    case 'wells':
      return { type: 'wells', level: wellsLevelFor(evaluation.value) };
    case 'perc':
      return { type: 'perc', result: testResult(evaluation) };
    case 'dDimer':
    case 'years':
      return { type: 'd-dimero', result: testResult(evaluation) };
    case 'yearsPregnancy':
      return { type: 'years-gestante', result: testResult(evaluation) };
  }
}

/** Calculadora da classificação com botão "Prosseguir" (sPESI, PESI, Hestia). */
export type ClassificationCalculator = 'spesi' | 'pesi' | 'hestia';

const PESI_LOW_RISK_CLASSES = new Set(['classe-i', 'classe-ii']);

/**
 * Resposta que o "Prosseguir" de cada calculadora dá: sPESI 0 e PESI classe
 * I–II (≤ 85 no ANY) são baixo risco; Hestia sem critério é negativo.
 */
export function classificationAnswerFor(
  calculator: ClassificationCalculator,
  evaluation: Complete,
): TepAnswer {
  const { id } = evaluation.band;
  switch (calculator) {
    case 'spesi':
      return id === 'baixo-risco' ? 'baixo-risco' : 'risco-elevado';
    case 'pesi':
      return PESI_LOW_RISK_CLASSES.has(id) ? 'baixo-risco' : 'risco-elevado';
    case 'hestia':
      return id === 'negativo' ? 'hestia-negativo' : 'hestia-positivo';
  }
}

// ---- Sessão -----------------------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function oneOf<T extends string>(values: readonly T[], value: unknown): value is T {
  return typeof value === 'string' && (values as readonly string[]).includes(value);
}

function isOptional<T>(value: unknown, guard: (candidate: unknown) => candidate is T): boolean {
  return value === undefined || guard(value);
}

const TEST_RESULTS = ['negativo', 'positivo'] as const;
const isTest = (value: unknown): value is TestResult => oneOf(TEST_RESULTS, value);
const isNullableTest = (value: unknown) => value === null || isTest(value);

function isClassification(value: unknown): value is TepClassification {
  if (!isRecord(value)) return false;
  return (
    isOptional(value.symptomatic, (v): v is boolean => typeof v === 'boolean') &&
    isOptional(value.risk, (v): v is 'baixo' | 'elevado' => oneOf(['baixo', 'elevado'], v)) &&
    isOptional(value.location, (v): v is 'subsegmentar' | 'segmentar' =>
      oneOf(['subsegmentar', 'segmentar'], v),
    ) &&
    isOptional(value.hestia, isTest)
  );
}

function isDiagnosis(value: unknown): value is TepDiagnosis {
  if (!isRecord(value)) return false;
  return (
    typeof value.pregnant === 'boolean' &&
    (value.wells === null || oneOf(WELLS_LEVELS, value.wells)) &&
    isNullableTest(value.perc) &&
    isNullableTest(value.dDimer) &&
    isNullableTest(value.yearsPregnancy)
  );
}

function isEcho(value: unknown): value is EchoAnswers {
  if (!isRecord(value)) return false;
  return Object.entries(value).every(
    ([finding, answer]) => ECHO_FINDINGS.has(finding) && (answer === 'nao' || answer === 'sim'),
  );
}

/**
 * Lê o estado guardado na sessão sem confiar no formato: qualquer campo
 * estranho (versão antiga, edição à mão) devolve `null` e o roteiro recomeça.
 * Conduta sem categoria também não passa: a tela não teria o que mostrar.
 */
export function parseTepPathwayState(value: unknown): TepPathwayState | null {
  if (!isRecord(value)) return null;
  const state = {
    step: value.step,
    question: value.question,
    classification: value.classification,
    category: value.category,
    respiratory: value.respiratory,
    diagnosis: value.diagnosis,
    thrombolysis: value.thrombolysis,
    echo: value.echo,
  };
  if (
    !oneOf(TEP_STEPS, state.step) ||
    !oneOf(TEP_QUESTIONS, state.question) ||
    !isClassification(state.classification) ||
    !(state.category === null || oneOf(TEP_CATEGORY_IDS, state.category)) ||
    typeof state.respiratory !== 'boolean' ||
    !isDiagnosis(state.diagnosis) ||
    !oneOf(THROMBOLYSIS_STAGES, state.thrombolysis) ||
    !isEcho(state.echo)
  ) {
    return null;
  }
  if (state.step === 'conduta' && state.category === null) return null;
  return {
    step: state.step,
    question: state.question,
    classification: state.classification,
    category: state.category,
    respiratory: state.respiratory,
    diagnosis: state.diagnosis,
    thrombolysis: state.thrombolysis,
    echo: state.echo,
  };
}

// ---- Prontuário -------------------------------------------------------------------------------

const WELLS_TEXT: Record<WellsLevel, string> = {
  baixa: 'baixa probabilidade (< 2)',
  intermediaria: 'probabilidade intermediária (2–6)',
  alta: 'alta probabilidade (> 6)',
};

function yesNo(value: boolean): string {
  return value ? 'sim' : 'não';
}

function diagnosisLines(diagnosis: TepDiagnosis): string[] {
  const lines: string[] = [];
  if (diagnosis.pregnant) {
    lines.push('- Gestante: YEARS adaptado');
    if (diagnosis.yearsPregnancy) lines.push(`- YEARS gestante: ${diagnosis.yearsPregnancy}`);
    return lines;
  }
  if (diagnosis.wells) lines.push(`- Wells: ${WELLS_TEXT[diagnosis.wells]}`);
  if (diagnosis.perc) lines.push(`- PERC: ${diagnosis.perc}`);
  if (diagnosis.dDimer) lines.push(`- D-dímero: ${diagnosis.dDimer}`);
  return lines;
}

/** Eco do paciente instável, quando todos os achados foram respondidos. */
function echoLines(echo: EchoAnswers): string[] {
  const evaluation = evaluateCalculator(ECHO_RV, { items: echo });
  if (evaluation.status !== 'complete') return [];
  const count = formatResultValue(ECHO_RV, evaluation.value);
  return [`Eco à beira-leito: ${evaluation.band.label} (${count}).`];
}

function classificationLines(state: TepPathwayState): string[] {
  const { classification } = state;
  if (classification.symptomatic === undefined) {
    return ['- Classificado pela instabilidade hemodinâmica'];
  }
  const lines = [`- Sintomático: ${yesNo(classification.symptomatic)}`];
  if (classification.risk) lines.push(`- Risco (sPESI/PESI): ${classification.risk}`);
  if (classification.hestia) lines.push(`- Hestia: ${classification.hestia}`);
  if (classification.location) {
    lines.push(
      `- Localização do trombo: ${classification.location === 'subsegmentar' ? 'subsegmentar isolado' : 'segmentar ou mais proximal'}`,
    );
  }
  lines.push(`- Modificador respiratório (R): ${state.respiratory ? 'presente' : 'ausente'}`);
  return lines;
}

/**
 * Texto para o prontuário na conduta: categoria, quadro de destino, conduta
 * sugerida e o caminho que levou até ela. Sem dado de paciente (o prontuário
 * carimba nome e hora). `null` antes da conduta.
 */
export function buildTepChartNote(state: TepPathwayState): string | null {
  if (state.step !== 'conduta' || state.category === null) return null;
  const category = TEP_CATEGORIES[state.category];
  const label = categoryLabel(category.id, state.respiratory);
  const diagnosis = diagnosisLines(state.diagnosis);
  const lines = [
    `TEP — categoria ${label} (classificação AHA/ACC): ${category.description}`,
    `Destino: ${category.destination}.`,
    `Anticoagulação: ${category.anticoagulation}.`,
    `Monitorização: ${category.monitoring}.`,
    `Terapia avançada: ${category.advancedTherapy}.`,
    ...(category.followUp ? [`Seguimento: ${category.followUp}`] : []),
    'Conduta sugerida:',
    ...category.actions.map((action) => `- ${action}`),
    'Classificação:',
    ...classificationLines(state),
    ...(diagnosis.length > 0 ? ['Investigação:', ...diagnosis] : []),
    ...echoLines(state.echo),
    `Fonte: ${TEP_PROVENANCE.source}, conteúdo ${TEP_PROVENANCE.version} (revisão clínica ${TEP_PROVENANCE.review.status}).`,
  ];
  return lines.join('\n');
}
