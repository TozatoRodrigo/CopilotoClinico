import { formatCompact, formatDecimal, parseDecimal } from '../numbers';
import { validateNumber, type NumericRange } from '../ranges';
import { DEFAULT_LACTATE_UNIT, LACTATE_UNITS, readLactate, type LactateUnit } from './lactate';
import {
  classifyPerfusion,
  getPerfusionQuadrant,
  PERFUSION_INPUTS,
  type PerfusionQuadrantId,
} from './perfusion-quadrant';
import {
  adjustNorepinephrineDose,
  CAPILLARY_REFILL,
  ECHO_FINDINGS,
  FLUID_RESPONSIVENESS_METHODS,
  FLUIDS,
  PROFILE_FINDING_THRESHOLDS as LIMITS,
  PROFILE_NOT_RECOMMENDED,
  PROFILE_SUGGESTIONS,
  profileLabel,
  PULSE_PRESSURE,
  RECOGNITION_CRITERIA,
  SEPTIC_STEPS,
  VASOPRESSOR,
  type EchoFindingId,
  type FluidMethodId,
  type ProfileFinding,
  type ProfileItem,
  type ProfileNotRecommendedId,
  type ProfileSuggestionId,
  type PulsePressureMode,
  type RecognitionCriterionId,
  type SepticStep,
  type ShockComponent,
  type TecMode,
  type YesNo,
} from './septic-shock';
import { computeVneri, vneriZone } from './vneri';

/**
 * Estado do roteiro do choque séptico (CC-316) como reducer puro: o passo
 * atual, o que foi digitado, as respostas e a linha do tempo. O tempo entra
 * pela ação (`at`, epoch em ms), nunca por `Date.now()` aqui dentro — o mesmo
 * roteiro dá o mesmo estado em qualquer máquina, e a tela pode salvar o estado
 * na sessão e voltar ao mesmo ponto depois de abrir as Infusões.
 */

/** Campos digitados; o texto cru fica no estado para a tela voltar como estava. */
export const SEPTIC_TEXT_FIELDS = [
  'lactate',
  'pp',
  'pas',
  'pad',
  'fc',
  'doseNE',
  'svco2',
  'gapCO2',
] as const;
export type SepticTextField = (typeof SEPTIC_TEXT_FIELDS)[number];

/** Faixa de cada campo numérico (o lactato depende da unidade; ver `lactate.ts`). */
export const SEPTIC_FIELD_RANGES: Record<Exclude<SepticTextField, 'lactate'>, NumericRange> = {
  pp: PULSE_PRESSURE.inputs.pp,
  pas: PULSE_PRESSURE.inputs.pas,
  pad: VASOPRESSOR.inputs.pad,
  fc: VASOPRESSOR.inputs.fc,
  doseNE: VASOPRESSOR.inputs.doseNE,
  svco2: PERFUSION_INPUTS.svco2,
  gapCO2: PERFUSION_INPUTS.gapCO2,
};

/**
 * TEC em vigor e de onde veio. Como no ANY, vale o último: a faixa escolhida,
 * o valor digitado ou a última reavaliação.
 */
export interface TecReading {
  source: 'faixa' | 'digitado' | 'reavaliacao';
  value: number;
}

/** Registro da linha do tempo. Guarda os números; o texto sai de `describeSepticEvent`. */
export type SepticEvent =
  | { kind: 'reconhecimento'; at: number; tec: number | null; lactateMmol: number | null }
  | { kind: 'fluidos'; at: number; pulsePressure: number; bolusTotalMl: number }
  | { kind: 'bolus'; at: number; totalMl: number }
  | { kind: 'tec-normalizado'; at: number; after: 'fluidos' | 'vasopressor' }
  | {
      kind: 'vasopressor';
      at: number;
      doseNE: number | null;
      pad: number;
      fc: number | null;
      vneri: number | null;
    }
  | {
      kind: 'perfusao';
      at: number;
      svco2: number | null;
      gapCO2: number | null;
      quadrant: PerfusionQuadrantId | null;
    }
  | { kind: 'teste-pam'; at: number; normalized: boolean }
  | { kind: 'teste-dobutamina'; at: number; normalized: boolean }
  | { kind: 'reavaliacao-tec'; at: number; value: number };

export interface SepticShockState {
  step: SepticStep;
  criteria: Readonly<Record<RecognitionCriterionId, boolean>>;
  lactateUnit: LactateUnit;
  tecMode: TecMode | null;
  /** Texto do campo "TEC medido". */
  tecRaw: string;
  tec: TecReading | null;
  pulsePressureMode: PulsePressureMode;
  fields: Readonly<Record<SepticTextField, string>>;
  fluidMethod: FluidMethodId | null;
  fluidResponsive: YesNo | null;
  bolusTotalMl: number;
  echo: Readonly<Record<EchoFindingId, boolean>>;
  chronicHypertension: YesNo | null;
  mapTest: YesNo | null;
  dobutamineTest: YesNo | null;
  events: readonly SepticEvent[];
}

export type SepticShockAction =
  | { type: 'ir-para'; step: SepticStep }
  | { type: 'marcar-criterio'; criterion: RecognitionCriterionId }
  | { type: 'digitar'; field: SepticTextField; raw: string }
  | { type: 'unidade-do-lactato'; unit: LactateUnit }
  | { type: 'tec-por-faixa'; mode: TecMode }
  | { type: 'tec-digitado'; raw: string }
  | { type: 'modo-da-pressao-de-pulso'; mode: PulsePressureMode }
  | { type: 'metodo-de-fluidorresponsividade'; method: FluidMethodId }
  | { type: 'responsivo-a-fluidos'; answer: YesNo }
  /** "Iniciar Tier 1": registra o reconhecimento e vai para os fluidos (só com TEC > 3 s). */
  | { type: 'iniciar-tier-1'; at: number }
  | { type: 'adicionar-bolus'; at: number }
  | { type: 'tec-apos-fluidos'; normalized: boolean; at: number }
  | { type: 'tec-apos-vasopressor'; normalized: boolean; at: number }
  /** Botões − e + da dose de noradrenalina. */
  | { type: 'ajustar-noradrenalina'; delta: number }
  | { type: 'marcar-eco'; finding: EchoFindingId }
  | { type: 'hipertensao-cronica'; answer: YesNo }
  | { type: 'teste-pam'; answer: YesNo; at: number }
  | { type: 'teste-dobutamina'; answer: YesNo; at: number }
  /** "Próximo passo": registra o passo atual na linha do tempo e segue. */
  | { type: 'avancar'; at: number }
  | { type: 'reavaliar-tec'; value: number; at: number }
  | { type: 'recomecar' };

const EMPTY_FIELDS: Record<SepticTextField, string> = {
  lactate: '',
  pp: '',
  pas: '',
  pad: '',
  fc: '',
  doseNE: '',
  svco2: '',
  gapCO2: '',
};

export const INITIAL_SEPTIC_STATE: SepticShockState = {
  step: 'reconhecimento',
  criteria: { infeccao: false, lactato: false, noradrenalina: false, fluidos: false },
  lactateUnit: DEFAULT_LACTATE_UNIT,
  tecMode: null,
  tecRaw: '',
  tec: null,
  pulsePressureMode: 'direto',
  fields: EMPTY_FIELDS,
  fluidMethod: null,
  fluidResponsive: null,
  bolusTotalMl: 0,
  echo: { 've-hipocinetico': false, 'vd-dilatado': false, 'outra-disfuncao': false },
  chronicHypertension: null,
  mapTest: null,
  dobutamineTest: null,
  events: [],
};

// ---- Leitura dos valores ----

function readField(state: SepticShockState, field: Exclude<SepticTextField, 'lactate'>) {
  const checked = validateNumber(state.fields[field], SEPTIC_FIELD_RANGES[field]);
  return checked.ok ? checked.value : null;
}

/** Valores válidos do roteiro; campo vazio, ilegível ou fora da faixa vira `null`. */
export interface SepticValues {
  tec: number | null;
  lactateMmol: number | null;
  /** PP digitada ou PAS − PAD, conforme o modo. */
  pulsePressure: number | null;
  /** No modo calculado, PAD ≥ PAS (os dois válidos): não há PP. */
  pulsePressureInvalid: boolean;
  pas: number | null;
  pad: number | null;
  fc: number | null;
  doseNE: number | null;
  vneri: number | null;
  svco2: number | null;
  gapCO2: number | null;
  quadrant: PerfusionQuadrantId | null;
}

export function readSepticValues(state: SepticShockState): SepticValues {
  const lactate = readLactate(state.fields.lactate, state.lactateUnit);
  const pas = readField(state, 'pas');
  const pad = readField(state, 'pad');
  const fc = readField(state, 'fc');
  const doseNE = readField(state, 'doseNE');
  const svco2 = readField(state, 'svco2');
  const gapCO2 = readField(state, 'gapCO2');

  let pulsePressure: number | null = null;
  let pulsePressureInvalid = false;
  if (state.pulsePressureMode === 'direto') {
    pulsePressure = readField(state, 'pp');
  } else if (pas !== null && pad !== null) {
    if (pas > pad) pulsePressure = pas - pad;
    else pulsePressureInvalid = true;
  }

  return {
    tec: state.tec?.value ?? null,
    lactateMmol: lactate.ok ? lactate.value : null,
    pulsePressure,
    pulsePressureInvalid,
    pas,
    pad,
    fc,
    doseNE,
    vneri: pad !== null && fc !== null && doseNE !== null ? computeVneri(pad, doseNE, fc) : null,
    svco2,
    gapCO2,
    quadrant: svco2 !== null && gapCO2 !== null ? classifyPerfusion(svco2, gapCO2).id : null,
  };
}

/** TEC > 3 s: o roteiro segue para a ressuscitação. */
export function hasHypoperfusion(state: SepticShockState): boolean {
  const tec = state.tec?.value;
  return tec !== undefined && tec > CAPILLARY_REFILL.normalUpTo;
}

/** Reavaliações do TEC com horário, da mais antiga para a mais nova. */
export function tecReevaluations(
  state: SepticShockState,
): Extract<SepticEvent, { kind: 'reavaliacao-tec' }>[] {
  return state.events.filter(
    (event): event is Extract<SepticEvent, { kind: 'reavaliacao-tec' }> =>
      event.kind === 'reavaliacao-tec',
  );
}

// ---- Reducer ----

function nextStep(step: SepticStep): SepticStep {
  const index = SEPTIC_STEPS.indexOf(step);
  return SEPTIC_STEPS[Math.min(index + 1, SEPTIC_STEPS.length - 1)] ?? step;
}

function withEvent(state: SepticShockState, event: SepticEvent | null): SepticShockState {
  return event ? { ...state, events: [...state.events, event] } : state;
}

/** Registro do passo 2 (`saveStep2` do ANY): só com PP. */
function fluidsEvent(state: SepticShockState, at: number): SepticEvent | null {
  const { pulsePressure } = readSepticValues(state);
  return pulsePressure === null
    ? null
    : { kind: 'fluidos', at, pulsePressure, bolusTotalMl: state.bolusTotalMl };
}

/** Registro do passo 3 (`saveStep3` do ANY): só com PAD. */
function vasopressorEvent(state: SepticShockState, at: number): SepticEvent | null {
  const values = readSepticValues(state);
  if (values.pad === null) return null;
  return {
    kind: 'vasopressor',
    at,
    doseNE: values.doseNE,
    pad: values.pad,
    fc: values.fc,
    vneri: values.vneri,
  };
}

/**
 * Registro do passo 4 (`saveStep4` do ANY). O ANY gravava "Perfusão: " mesmo
 * sem nenhum dado; aqui só entra se houver SvcO2 ou gap.
 */
function perfusionEvent(state: SepticShockState, at: number): SepticEvent | null {
  const { svco2, gapCO2, quadrant } = readSepticValues(state);
  if (svco2 === null && gapCO2 === null) return null;
  return { kind: 'perfusao', at, svco2, gapCO2, quadrant };
}

function addBolus(state: SepticShockState, at: number): SepticShockState {
  if (state.bolusTotalMl >= FLUIDS.bolusMaxMl) return state;
  const totalMl = state.bolusTotalMl + FLUIDS.bolusStepMl;
  return withEvent({ ...state, bolusTotalMl: totalMl }, { kind: 'bolus', at, totalMl });
}

function readTecInput(raw: string): TecReading | null {
  const checked = validateNumber(raw, CAPILLARY_REFILL.input);
  return checked.ok ? { source: 'digitado', value: checked.value } : null;
}

export function septicShockReducer(
  state: SepticShockState,
  action: SepticShockAction,
): SepticShockState {
  switch (action.type) {
    case 'ir-para':
      return { ...state, step: action.step };
    case 'marcar-criterio':
      return {
        ...state,
        criteria: { ...state.criteria, [action.criterion]: !state.criteria[action.criterion] },
      };
    case 'digitar':
      return { ...state, fields: { ...state.fields, [action.field]: action.raw } };
    case 'unidade-do-lactato':
      return { ...state, lactateUnit: action.unit };
    case 'tec-por-faixa':
      return {
        ...state,
        tecMode: action.mode,
        tecRaw: '',
        tec: { source: 'faixa', value: CAPILLARY_REFILL.modeValues[action.mode] },
      };
    case 'tec-digitado':
      return { ...state, tecMode: null, tecRaw: action.raw, tec: readTecInput(action.raw) };
    case 'modo-da-pressao-de-pulso':
      return { ...state, pulsePressureMode: action.mode };
    case 'metodo-de-fluidorresponsividade':
      return { ...state, fluidMethod: action.method };
    case 'responsivo-a-fluidos':
      return { ...state, fluidResponsive: action.answer };
    case 'iniciar-tier-1': {
      if (!hasHypoperfusion(state)) return state;
      const values = readSepticValues(state);
      return withEvent(
        { ...state, step: 'fluidos' },
        {
          kind: 'reconhecimento',
          at: action.at,
          tec: values.tec,
          lactateMmol: values.lactateMmol,
        },
      );
    }
    case 'adicionar-bolus':
      return addBolus(state, action.at);
    case 'tec-apos-fluidos':
      if (action.normalized) {
        return withEvent(
          { ...state, step: 'perfil' },
          { kind: 'tec-normalizado', at: action.at, after: 'fluidos' },
        );
      }
      return state.bolusTotalMl < FLUIDS.bolusMaxMl
        ? addBolus(state, action.at)
        : { ...state, step: 'vasopressor' };
    case 'tec-apos-vasopressor': {
      const saved = withEvent(state, vasopressorEvent(state, action.at));
      return action.normalized
        ? withEvent(
            { ...saved, step: 'perfil' },
            { kind: 'tec-normalizado', at: action.at, after: 'vasopressor' },
          )
        : { ...saved, step: 'perfusao' };
    }
    case 'ajustar-noradrenalina': {
      const parsed = parseDecimal(state.fields.doseNE);
      const dose = adjustNorepinephrineDose(parsed.ok ? parsed.value : null, action.delta);
      return { ...state, fields: { ...state.fields, doseNE: formatCompact(dose, 2) } };
    }
    case 'marcar-eco':
      return { ...state, echo: { ...state.echo, [action.finding]: !state.echo[action.finding] } };
    case 'hipertensao-cronica':
      return { ...state, chronicHypertension: action.answer };
    case 'teste-pam':
      return withEvent(
        { ...state, mapTest: action.answer },
        { kind: 'teste-pam', at: action.at, normalized: action.answer === 'sim' },
      );
    case 'teste-dobutamina':
      return withEvent(
        { ...state, dobutamineTest: action.answer },
        { kind: 'teste-dobutamina', at: action.at, normalized: action.answer === 'sim' },
      );
    case 'avancar': {
      // Do reconhecimento só se sai por "Iniciar Tier 1"; o perfil é o fim.
      if (state.step === 'reconhecimento' || state.step === 'perfil') return state;
      const event =
        state.step === 'fluidos'
          ? fluidsEvent(state, action.at)
          : state.step === 'vasopressor'
            ? vasopressorEvent(state, action.at)
            : perfusionEvent(state, action.at);
      return withEvent({ ...state, step: nextStep(state.step) }, event);
    }
    case 'reavaliar-tec': {
      const { value } = action;
      const { min, max } = CAPILLARY_REFILL.input;
      if (!Number.isFinite(value) || value < min || value > max) return state;
      // A reavaliação passa a ser o TEC em vigor; a faixa e o valor digitado antes saem da tela.
      return withEvent(
        { ...state, tecMode: null, tecRaw: '', tec: { source: 'reavaliacao', value } },
        { kind: 'reavaliacao-tec', at: action.at, value },
      );
    }
    case 'recomecar':
      return INITIAL_SEPTIC_STATE;
  }
}

// ---- Perfil (passo 5) ----

export interface SepticProfile {
  label: string;
  findings: readonly ProfileFinding[];
  suggestions: readonly ProfileItem[];
  notRecommended: readonly ProfileItem[];
}

function suggestion(id: ProfileSuggestionId): ProfileItem {
  return { id, text: PROFILE_SUGGESTIONS[id] };
}

function notRecommended(id: ProfileNotRecommendedId): ProfileItem {
  return { id, text: PROFILE_NOT_RECOMMENDED[id] };
}

/** Perfil hemodinâmico: a mesma regra do `perfil` do ShockPath, item por item. */
export function computeSepticProfile(state: SepticShockState): SepticProfile {
  const values = readSepticValues(state);
  const findings: ProfileFinding[] = [];
  const components: ShockComponent[] = [];
  const suggestions: ProfileItem[] = [];
  const avoid: ProfileItem[] = [];
  const { tec, lactateMmol, pulsePressure, pad, vneri, svco2, gapCO2, quadrant } = values;

  if (tec !== null) {
    findings.push({
      id: 'tec',
      text: `TEC: ${formatDecimal(tec)} segundos`,
      tone: tec > CAPILLARY_REFILL.normalUpTo ? 'critical' : 'neutral',
    });
  }
  if (lactateMmol !== null) {
    findings.push({
      id: 'lactato',
      text: `Lactato: ${formatDecimal(lactateMmol)} mmol/L`,
      tone:
        lactateMmol >= LIMITS.lactateCritical
          ? 'critical'
          : lactateMmol >= LIMITS.lactateAttention
            ? 'attention'
            : 'neutral',
    });
  }
  if (pulsePressure !== null) {
    findings.push({
      id: 'pressao-de-pulso',
      text: `Pressão de pulso: ${formatDecimal(pulsePressure, 0)} mmHg`,
      tone: pulsePressure < LIMITS.pulsePressureLow ? 'attention' : 'neutral',
    });
  }
  if (state.bolusTotalMl > 0) {
    findings.push({
      id: 'fluidos',
      text: `Fluidos administrados: ${state.bolusTotalMl} mL`,
      tone: 'neutral',
    });
  }
  if (state.fluidResponsive !== null) {
    findings.push({
      id: 'responsivo',
      text: `Responsivo a fluidos: ${state.fluidResponsive === 'sim' ? 'Sim' : 'Não'}`,
      tone: 'neutral',
    });
  }
  if (pad !== null) {
    findings.push({
      id: 'pad',
      text: `PAD: ${formatDecimal(pad, 0)} mmHg`,
      tone: pad < LIMITS.padLow ? 'attention' : 'neutral',
    });
    if (pad < LIMITS.padLow) components.push('vasoplégico');
  }
  if (vneri !== null) {
    const zone = vneriZone(vneri);
    findings.push({
      id: 'vneri',
      text: `VNERi: ${formatDecimal(vneri, 1)} (${zone.label})`,
      tone: zone.tone,
    });
    if (vneri < LIMITS.vneriVasoplegic) components.push('vasoplégico');
  }
  if (state.echo['ve-hipocinetico']) {
    findings.push({ id: 'eco-ve', text: 'Ecocardiograma: VE hipocinético', tone: 'critical' });
    components.push('cardiogênico');
  }
  if (state.echo['vd-dilatado']) {
    findings.push({ id: 'eco-vd', text: 'Ecocardiograma: VD dilatado', tone: 'attention' });
    components.push('obstrutivo');
  }
  if (svco2 !== null) {
    findings.push({
      id: 'svco2',
      text: `SvcO2: ${formatDecimal(svco2, 0)}%`,
      tone: svco2 < LIMITS.svco2Low ? 'attention' : 'neutral',
    });
  }
  if (gapCO2 !== null) {
    findings.push({
      id: 'gap-co2',
      text: `Gap CO2: ${formatDecimal(gapCO2, 1)} mmHg`,
      tone: gapCO2 > LIMITS.gapCO2High ? 'attention' : 'neutral',
    });
  }
  if (quadrant !== null) {
    const { label, tone } = getPerfusionQuadrant(quadrant);
    findings.push({ id: 'quadrante', text: `Quadrante: ${label}`, tone });
  }

  if (tec !== null && tec > CAPILLARY_REFILL.normalUpTo)
    suggestions.push(suggestion('reavaliarTec'));
  if (pad !== null && pad < LIMITS.padLow) suggestions.push(suggestion('titularNoradrenalina'));
  if (vneri !== null && vneri < LIMITS.vneriVasoplegic) suggestions.push(suggestion('adjuvante'));
  if (state.echo['ve-hipocinetico']) suggestions.push(suggestion('dobutaminaVe'));
  if (quadrant === 'baixo-debito') suggestions.push(suggestion('inotropicoBaixoDebito'));
  if (quadrant === 'disoxia-anemica') suggestions.push(suggestion('hemoglobina'));
  if (state.chronicHypertension === 'sim' && state.mapTest === null) {
    suggestions.push(suggestion('testePam'));
  }
  if (state.mapTest === 'sim') suggestions.push(suggestion('manterPam'));
  if (state.dobutamineTest === 'sim') suggestions.push(suggestion('manterDobutamina'));
  if (suggestions.length === 0) suggestions.push(suggestion('monitorizacao'));

  avoid.push(notRecommended('fluidosLiberais'));
  if (state.fluidResponsive === 'nao') avoid.push(notRecommended('maisFluidos'));
  if (vneri !== null && vneri < LIMITS.vneriVasoplegic) avoid.push(notRecommended('escalarNe'));

  return { label: profileLabel(components), findings, suggestions, notRecommended: avoid };
}

// ---- Linha do tempo e prontuário ----

/** Texto de um registro da linha do tempo, igual ao que o ANY gravava. */
export function describeSepticEvent(event: SepticEvent): string {
  switch (event.kind) {
    case 'reconhecimento':
      return `Reconhecimento: TEC ${formatDecimal(event.tec)} s, Lactato ${formatDecimal(event.lactateMmol)} mmol/L`;
    case 'fluidos':
      return `PP: ${formatDecimal(event.pulsePressure, 0)} mmHg. Fluidos: ${event.bolusTotalMl} mL`;
    case 'bolus':
      return `Bolus cristaloide ${FLUIDS.bolusStepMl} mL (total: ${event.totalMl} mL)`;
    case 'tec-normalizado':
      return event.after === 'fluidos'
        ? 'TEC normalizado após fluidos'
        : 'TEC normalizado após vasopressor';
    case 'vasopressor': {
      const base = `Vasopressor: NE ${formatDecimal(event.doseNE, 2)} mcg/kg/min, PAD ${formatDecimal(event.pad, 0)}, FC ${formatDecimal(event.fc, 0)}`;
      return event.vneri === null ? base : `${base}, VNERi ${formatDecimal(event.vneri, 1)}`;
    }
    case 'perfusao': {
      let text = 'Perfusão: ';
      if (event.svco2 !== null) text += `SvcO2 ${formatDecimal(event.svco2, 0)}%, `;
      if (event.gapCO2 !== null) text += `Gap CO2 ${formatDecimal(event.gapCO2, 1)} mmHg`;
      if (event.quadrant !== null) text += ` (${getPerfusionQuadrant(event.quadrant).label})`;
      return text;
    }
    case 'teste-pam':
      return `Teste PAM 80-85: TEC ${event.normalized ? 'normalizado' : 'não normalizado'}`;
    case 'teste-dobutamina':
      return `Teste dobutamina 5 mcg/kg/min: TEC ${event.normalized ? 'normalizado' : 'não normalizado'}`;
    case 'reavaliacao-tec':
      return `Reavaliação TEC: ${formatDecimal(event.value, 1)}s`;
  }
}

/**
 * Texto para o prontuário: perfil, achados, condutas, linha do tempo e
 * referência. O horário de cada registro vem do formatador da tela (fuso do
 * aparelho); nada identifica o paciente.
 */
export function buildSepticChartNote(
  state: SepticShockState,
  formatTime: (at: number) => string,
  citation: string,
): string {
  const profile = computeSepticProfile(state);
  const lines = [
    `Choque séptico (ANDROMEDA-SHOCK 2) — ${profile.label}.`,
    ...profile.findings.map(({ text }) => `- ${text}`),
    'Condutas sugeridas:',
    ...profile.suggestions.map(({ text }, index) => `${index + 1}. ${text}`),
    'Não recomendado:',
    ...profile.notRecommended.map(({ text }) => `- ${text}`),
  ];
  if (state.events.length > 0) {
    lines.push('Linha do tempo:');
    for (const event of state.events) {
      lines.push(`- ${formatTime(event.at)} ${describeSepticEvent(event)}`);
    }
  }
  lines.push(`Referência: ${citation}`);
  return lines.join('\n');
}

// ---- Estado salvo na sessão ----

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function oneOf<T extends string>(value: unknown, options: readonly T[]): value is T {
  return typeof value === 'string' && (options as readonly string[]).includes(value);
}

function yesNo(value: unknown): YesNo | null {
  return oneOf(value, ['sim', 'nao'] as const) ? value : null;
}

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function finiteOrNull(value: unknown): value is number | null {
  return value === null || finite(value);
}

/** Texto curto; o que passar disso não é algo que a tela tenha escrito. */
function shortText(value: unknown): string {
  return typeof value === 'string' && value.length <= 20 ? value : '';
}

const QUADRANT_IDS: readonly PerfusionQuadrantId[] = [
  'baixo-debito',
  'disoxia-anemica',
  'microcirculacao-inadequada',
  'hipoxia-citopatica',
];

function parseEvent(value: unknown): SepticEvent | null {
  if (!isRecord(value) || !finite(value.at)) return null;
  const { at } = value;
  switch (value.kind) {
    case 'reconhecimento':
      return finiteOrNull(value.tec) && finiteOrNull(value.lactateMmol)
        ? { kind: 'reconhecimento', at, tec: value.tec, lactateMmol: value.lactateMmol }
        : null;
    case 'fluidos':
      return finite(value.pulsePressure) && finite(value.bolusTotalMl)
        ? {
            kind: 'fluidos',
            at,
            pulsePressure: value.pulsePressure,
            bolusTotalMl: value.bolusTotalMl,
          }
        : null;
    case 'bolus':
      return finite(value.totalMl) ? { kind: 'bolus', at, totalMl: value.totalMl } : null;
    case 'tec-normalizado':
      return oneOf(value.after, ['fluidos', 'vasopressor'] as const)
        ? { kind: 'tec-normalizado', at, after: value.after }
        : null;
    case 'vasopressor':
      return finite(value.pad) &&
        finiteOrNull(value.doseNE) &&
        finiteOrNull(value.fc) &&
        finiteOrNull(value.vneri)
        ? {
            kind: 'vasopressor',
            at,
            pad: value.pad,
            doseNE: value.doseNE,
            fc: value.fc,
            vneri: value.vneri,
          }
        : null;
    case 'perfusao':
      return finiteOrNull(value.svco2) &&
        finiteOrNull(value.gapCO2) &&
        (value.quadrant === null || oneOf(value.quadrant, QUADRANT_IDS))
        ? {
            kind: 'perfusao',
            at,
            svco2: value.svco2,
            gapCO2: value.gapCO2,
            quadrant: value.quadrant,
          }
        : null;
    case 'teste-pam':
    case 'teste-dobutamina':
      return typeof value.normalized === 'boolean'
        ? { kind: value.kind, at, normalized: value.normalized }
        : null;
    case 'reavaliacao-tec':
      return finite(value.value) ? { kind: 'reavaliacao-tec', at, value: value.value } : null;
    default:
      return null;
  }
}

function parseFlags<K extends string>(value: unknown, keys: readonly K[]): Record<K, boolean> {
  const source = isRecord(value) ? value : {};
  return Object.fromEntries(keys.map((key) => [key, source[key] === true])) as Record<K, boolean>;
}

/**
 * Estado salvo na sessão da aba, lido sem confiar no formato: o que não for
 * reconhecível volta ao valor inicial, e um estado sem passo válido vira
 * `null` (a tela começa do zero). Só números, ids e o texto digitado — nada
 * que identifique o paciente.
 */
export function parseSepticShockState(value: unknown): SepticShockState | null {
  if (!isRecord(value) || !oneOf(value.step, SEPTIC_STEPS)) return null;
  const fields = isRecord(value.fields) ? value.fields : {};
  const tec = isRecord(value.tec) ? value.tec : null;
  const tecValue = tec?.value;
  const events = Array.isArray(value.events) ? value.events.map(parseEvent) : [];
  return {
    step: value.step,
    criteria: parseFlags(
      value.criteria,
      RECOGNITION_CRITERIA.map(({ id }) => id),
    ),
    lactateUnit: oneOf(value.lactateUnit, LACTATE_UNITS) ? value.lactateUnit : DEFAULT_LACTATE_UNIT,
    tecMode: oneOf(value.tecMode, ['normal', 'anormal'] as const) ? value.tecMode : null,
    tecRaw: shortText(value.tecRaw),
    tec:
      tec && oneOf(tec.source, ['faixa', 'digitado', 'reavaliacao'] as const) && finite(tecValue)
        ? { source: tec.source, value: tecValue }
        : null,
    pulsePressureMode: oneOf(value.pulsePressureMode, ['direto', 'calculado'] as const)
      ? value.pulsePressureMode
      : 'direto',
    fields: Object.fromEntries(
      Object.keys(EMPTY_FIELDS).map((key) => [key, shortText(fields[key])]),
    ) as Record<SepticTextField, string>,
    fluidMethod: oneOf(
      value.fluidMethod,
      FLUID_RESPONSIVENESS_METHODS.map(({ id }) => id),
    )
      ? value.fluidMethod
      : null,
    fluidResponsive: yesNo(value.fluidResponsive),
    bolusTotalMl:
      finite(value.bolusTotalMl) &&
      value.bolusTotalMl >= 0 &&
      value.bolusTotalMl <= FLUIDS.bolusMaxMl
        ? value.bolusTotalMl
        : 0,
    echo: parseFlags(
      value.echo,
      ECHO_FINDINGS.map(({ id }) => id),
    ),
    chronicHypertension: yesNo(value.chronicHypertension),
    mapTest: yesNo(value.mapTest),
    dobutamineTest: yesNo(value.dobutamineTest),
    events: events.filter((event): event is SepticEvent => event !== null),
  };
}

/** O roteiro ainda está como começou (nada digitado nem respondido). */
export function isPristineSepticState(state: SepticShockState): boolean {
  return JSON.stringify(state) === JSON.stringify(INITIAL_SEPTIC_STATE);
}
