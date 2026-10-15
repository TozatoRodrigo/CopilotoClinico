import { formatDecimal, parseDecimal } from '../numbers';
import { validateNumber, type NumericFieldError, type NumericRange } from '../ranges';
import {
  anionGap,
  correctedSodium,
  deltaDelta,
  dkaResolution,
  dkaSeverity,
  effectiveOsmolality,
  freeWaterDeficit,
  glucoseFall,
  hhsVolumeDeficit,
  insulinGate,
  insulinRate,
  kclMEqPerMl,
  kclPreparation,
  minutesSince,
  potassiumBand,
  subcutaneousTransition,
  type DeltaDelta,
  type GlucoseFall,
  type InsulinGate,
  type KclPreparation,
  type Sex,
  type SubcutaneousTransition,
} from './calc';
import {
  CONSCIOUSNESS_OPTIONS,
  INSULIN_RATES,
  KCL_PRESENTATIONS,
  KCL_ROUTES,
  KETONURIA_OPTIONS,
  LAB_FIELDS,
  PRECIPITANTS,
  TRACK_OPTIONS,
  TRANSITION_OVERLAP,
  VOLEMIC_STATES,
  type CadEhhTrack,
  type Consciousness,
  type DkaSeverity,
  type InsulinRate,
  type KclPresentationId,
  type KclRouteId,
  type Ketonuria,
  type LabFieldId,
  type PotassiumBandId,
  type PrecipitantId,
  type SubcutaneousInsulinId,
  type VolemicStateId,
} from './content';

/**
 * Estado do roteiro de CAD e EHH (CC-326) como reducer puro: a tela atual, o
 * painel de exames (texto cru, para a tela voltar como estava), as escolhas e
 * o ciclo de reavaliação. O tempo entra pela ação (`at`, epoch em ms), nunca
 * por `Date.now()` aqui dentro, e as contas que dependem do relógio recebem
 * `now`: o mesmo roteiro dá o mesmo resultado em qualquer máquina.
 *
 * O peso fica fora do estado: é o peso adulto comum às ferramentas (no ANY,
 * o `WeightContext`), e as leituras o recebem como parâmetro.
 */

// ---- Telas ----

export const CAD_EHH_SCREENS = [
  'inicio',
  'h1',
  'h2',
  'h3',
  'e1',
  'e2',
  'e3',
  'e4',
  'e5',
  'ciclo',
  'reconhecimento',
  'calculadoras',
  'planilha',
  'armadilhas',
  'precipitante',
  'referencias',
] as const;
export type CadEhhScreen = (typeof CAD_EHH_SCREENS)[number];

export type CadEhhPhase = 'primeira-hora' | 'apos-exames';

export interface CadEhhStep {
  id: Extract<CadEhhScreen, 'h1' | 'h2' | 'h3' | 'e1' | 'e2' | 'e3' | 'e4' | 'e5'>;
  /** 1 a 8. */
  n: number;
  title: string;
  subtitle: string;
  phase: CadEhhPhase;
}

/**
 * Os oito passos, na ordem em que os dados chegam (ANY): a primeira hora não
 * espera exame; depois dos exames vêm classificação, reposição, potássio,
 * insulina e fosfato. Daí em diante é ciclo, não passo.
 */
export const CAD_EHH_STEPS: readonly CadEhhStep[] = [
  { id: 'h1', n: 1, title: 'Reconhecer', subtitle: 'suspeita clínica', phase: 'primeira-hora' },
  { id: 'h2', n: 2, title: 'Hidratar', subtitle: 'não espera exame', phase: 'primeira-hora' },
  { id: 'h3', n: 3, title: 'Confirmar', subtitle: 'o que coletar', phase: 'primeira-hora' },
  {
    id: 'e1',
    n: 4,
    title: 'Classificar',
    subtitle: 'trilha, gravidade, bicarbonato',
    phase: 'apos-exames',
  },
  { id: 'e2', n: 5, title: 'Reposição', subtitle: 'governada pelo sódio', phase: 'apos-exames' },
  { id: 'e3', n: 6, title: 'Potássio', subtitle: 'libera a insulina', phase: 'apos-exames' },
  { id: 'e4', n: 7, title: 'Insulina', subtitle: 'travada até o potássio', phase: 'apos-exames' },
  { id: 'e5', n: 8, title: 'Fosfato', subtitle: 'raramente indicado', phase: 'apos-exames' },
];

export const PHASE_LABEL: Record<CadEhhPhase, string> = {
  'primeira-hora': 'Primeira hora',
  'apos-exames': 'Após os exames',
};

export type CadEhhConsultScreen = Extract<
  CadEhhScreen,
  'reconhecimento' | 'calculadoras' | 'planilha' | 'armadilhas' | 'precipitante' | 'referencias'
>;

export const CONSULT_SCREEN_TITLE: Record<CadEhhConsultScreen, string> = {
  reconhecimento: 'Reconhecimento',
  calculadoras: 'Calculadoras',
  planilha: 'Planilha de acompanhamento',
  armadilhas: 'Armadilhas',
  precipitante: 'Fator precipitante',
  referencias: 'Referências',
};

/** Cartões da tela inicial, na ordem do ANY; os três primeiros em destaque. */
export const HOME_CARDS: readonly {
  screen: CadEhhScreen;
  title: string;
  subtitle: string;
  highlight: boolean;
}[] = [
  {
    screen: 'h1',
    title: 'Primeira hora',
    subtitle: 'suspeita · hidratação · dx',
    highlight: true,
  },
  { screen: 'e1', title: 'Após os exames', subtitle: 'reposição · K · insulina', highlight: true },
  { screen: 'ciclo', title: 'Reavaliação', subtitle: 'ciclo até a resolução', highlight: true },
  {
    screen: 'calculadoras',
    title: 'Calculadoras',
    subtitle: 'AG · Na · Osm · Δ/Δ',
    highlight: false,
  },
  {
    screen: 'reconhecimento',
    title: 'Reconhecer',
    subtitle: 'critérios e alertas',
    highlight: false,
  },
  { screen: 'planilha', title: 'Planilha', subtitle: 'imprimir', highlight: false },
  { screen: 'armadilhas', title: 'Armadilhas', subtitle: '7 riscos', highlight: false },
  { screen: 'precipitante', title: 'Precipitante', subtitle: 'checklist', highlight: false },
  { screen: 'referencias', title: 'Referências', subtitle: '6 fontes', highlight: false },
];

export function stepOf(screen: CadEhhScreen): CadEhhStep | null {
  return CAD_EHH_STEPS.find((step) => step.id === screen) ?? null;
}

// ---- Campos ----

/** As variáveis que se repetem a cada rodada do ciclo (sem a ureia). */
export const CYCLE_FIELDS = [
  'glicemia',
  'potassio',
  'sodio',
  'cloro',
  'phVenoso',
  'bicarbonato',
] as const satisfies readonly LabFieldId[];
export type CycleFieldId = (typeof CYCLE_FIELDS)[number];

const LAB_RANGE = new Map<LabFieldId, NumericRange>(
  LAB_FIELDS.map((field) => [field.id, { min: field.min, max: field.max, unit: field.unit }]),
);

export function labRange(field: LabFieldId): NumericRange {
  const range = LAB_RANGE.get(field);
  if (!range) throw new Error(`Campo "${field}" fora do painel de exames.`);
  return range;
}

export type KclFieldId = 'ml' | 'mEq' | 'volume' | 'rate';

/**
 * Faixas da calculadora de KCl. O ANY não tinha nenhuma (o campo aceitava
 * qualquer número); estas foram definidas no porte e precisam de confirmação
 * clínica (achados, seção de faixas).
 */
export const KCL_FIELD_RANGES: Record<KclFieldId, NumericRange> = {
  ml: { min: 0.1, max: 150, unit: 'mL' },
  mEq: { min: 1, max: 200, unit: 'mEq' },
  volume: { min: 50, max: 3000, unit: 'mL' },
  rate: { min: 1, max: 40, unit: 'mEq/h' },
};

/** Velocidade de KCl acima da qual aparece o alerta de efeito osmótico. */
export const KCL_OSMOTIC_ALERT_ABOVE = 20;

// ---- Estado ----

export interface CycleRound {
  values: Readonly<Record<CycleFieldId, number | null>>;
  /** Quando a rodada foi fechada (epoch em ms). */
  at: number;
}

export interface CadEhhState {
  screen: CadEhhScreen;
  panel: Readonly<Record<LabFieldId, string>>;
  ketonuria: Ketonuria | null;
  consciousness: Consciousness | null;
  track: CadEhhTrack;
  volemicState: VolemicStateId | null;
  kcl: {
    presentation: KclPresentationId;
    route: KclRouteId;
    mlRaw: string;
    mEqRaw: string;
    volumeRaw: string;
    rateRaw: string;
  };
  insulinRate: InsulinRate;
  cycle: {
    /** Número da rodada em andamento (começa em 1). */
    round: number;
    previous: CycleRound | null;
    current: Readonly<Record<CycleFieldId, string>>;
  };
  subcutaneous: SubcutaneousInsulinId;
  hypoglycemiaRisk: boolean;
  /** Sexo e idade do déficit de água livre (tela Calculadoras). */
  sex: Sex;
  elderly: boolean;
  precipitants: readonly PrecipitantId[];
}

export type CadEhhAction =
  | { type: 'ir-para'; screen: CadEhhScreen }
  | { type: 'digitar-exame'; field: LabFieldId; raw: string }
  /** Tocar de novo na opção marcada desmarca, como no ANY. */
  | { type: 'cetonuria'; value: Ketonuria }
  | { type: 'consciencia'; value: Consciousness }
  | { type: 'trilha'; track: CadEhhTrack }
  | { type: 'estado-volemico'; id: VolemicStateId }
  | { type: 'kcl-apresentacao'; id: KclPresentationId }
  | { type: 'kcl-via'; id: KclRouteId }
  /** mL e mEq se espelham: quem digita um reescreve o outro. */
  | { type: 'kcl-ml'; raw: string }
  | { type: 'kcl-meq'; raw: string }
  | { type: 'kcl-volume'; raw: string }
  | { type: 'kcl-velocidade'; raw: string }
  | { type: 'taxa-insulina'; rate: InsulinRate }
  | { type: 'digitar-rodada'; field: CycleFieldId; raw: string }
  /** Fecha a rodada: o que está na tela vira a anterior e abre a próxima. */
  | { type: 'nova-rodada'; at: number }
  | { type: 'insulina-subcutanea'; id: SubcutaneousInsulinId }
  | { type: 'risco-hipoglicemia' }
  | { type: 'sexo'; sex: Sex }
  | { type: 'idoso' }
  | { type: 'precipitante'; id: PrecipitantId }
  | { type: 'recomecar' };

const EMPTY_PANEL: Record<LabFieldId, string> = {
  glicemia: '',
  sodio: '',
  potassio: '',
  cloro: '',
  bicarbonato: '',
  phVenoso: '',
  ureia: '',
};

const EMPTY_ROUND: Record<CycleFieldId, string> = {
  glicemia: '',
  potassio: '',
  sodio: '',
  cloro: '',
  phVenoso: '',
  bicarbonato: '',
};

export const INITIAL_CAD_EHH_STATE: CadEhhState = {
  screen: 'inicio',
  panel: EMPTY_PANEL,
  ketonuria: null,
  consciousness: null,
  track: 'cad',
  volemicState: null,
  // Como no ANY: KCl 10%, acesso periférico e 10 mEq/h já escolhidos.
  kcl: {
    presentation: '10',
    route: 'periferica',
    mlRaw: '',
    mEqRaw: '',
    volumeRaw: '',
    rateRaw: '10',
  },
  insulinRate: 0.1,
  cycle: { round: 1, previous: null, current: EMPTY_ROUND },
  subcutaneous: 'rapido',
  hypoglycemiaRisk: false,
  sex: 'M',
  elderly: false,
  precipitants: [],
};

function presentation(id: KclPresentationId) {
  const found = KCL_PRESENTATIONS.find((item) => item.id === id);
  if (!found) throw new Error(`Apresentação de KCl "${id}" não existe.`);
  return found;
}

function route(id: KclRouteId) {
  const found = KCL_ROUTES.find((item) => item.id === id);
  if (!found) throw new Error(`Via "${id}" não existe.`);
  return found;
}

/** Número digitado, ou `null` se vazio ou ilegível (para o espelho mL ↔ mEq). */
function typedNumber(raw: string): number | null {
  const parsed = parseDecimal(raw);
  return parsed.ok ? parsed.value : null;
}

function readCycleValue(raw: string, field: CycleFieldId): number | null {
  const checked = validateNumber(raw, labRange(field));
  return checked.ok ? checked.value : null;
}

export function cadEhhReducer(state: CadEhhState, action: CadEhhAction): CadEhhState {
  switch (action.type) {
    case 'ir-para':
      return { ...state, screen: action.screen };
    case 'digitar-exame':
      return { ...state, panel: { ...state.panel, [action.field]: action.raw } };
    case 'cetonuria':
      return { ...state, ketonuria: state.ketonuria === action.value ? null : action.value };
    case 'consciencia':
      return {
        ...state,
        consciousness: state.consciousness === action.value ? null : action.value,
      };
    case 'trilha':
      return { ...state, track: action.track };
    case 'estado-volemico':
      return {
        ...state,
        volemicState: state.volemicState === action.id ? null : action.id,
      };
    case 'kcl-apresentacao': {
      // O mL manda: o volume aspirado é o que já foi decidido.
      const ml = typedNumber(state.kcl.mlRaw);
      const mEqRaw =
        ml !== null
          ? formatDecimal(ml * kclMEqPerMl(presentation(action.id)), 1)
          : state.kcl.mEqRaw;
      return { ...state, kcl: { ...state.kcl, presentation: action.id, mEqRaw } };
    }
    case 'kcl-via':
      return { ...state, kcl: { ...state.kcl, route: action.id } };
    case 'kcl-ml': {
      const ml = typedNumber(action.raw);
      const perMl = kclMEqPerMl(presentation(state.kcl.presentation));
      return {
        ...state,
        kcl: {
          ...state.kcl,
          mlRaw: action.raw,
          mEqRaw: ml !== null ? formatDecimal(ml * perMl, 1) : '',
        },
      };
    }
    case 'kcl-meq': {
      const mEq = typedNumber(action.raw);
      const perMl = kclMEqPerMl(presentation(state.kcl.presentation));
      return {
        ...state,
        kcl: {
          ...state.kcl,
          mEqRaw: action.raw,
          mlRaw: mEq !== null ? formatDecimal(mEq / perMl, 1) : '',
        },
      };
    }
    case 'kcl-volume':
      return { ...state, kcl: { ...state.kcl, volumeRaw: action.raw } };
    case 'kcl-velocidade':
      return { ...state, kcl: { ...state.kcl, rateRaw: action.raw } };
    case 'taxa-insulina':
      return { ...state, insulinRate: action.rate };
    case 'digitar-rodada':
      return {
        ...state,
        cycle: { ...state.cycle, current: { ...state.cycle.current, [action.field]: action.raw } },
      };
    case 'nova-rodada': {
      const values = Object.fromEntries(
        CYCLE_FIELDS.map((field) => [field, readCycleValue(state.cycle.current[field], field)]),
      ) as Record<CycleFieldId, number | null>;
      return {
        ...state,
        cycle: {
          round: state.cycle.round + 1,
          previous: { values, at: action.at },
          current: EMPTY_ROUND,
        },
      };
    }
    case 'insulina-subcutanea':
      return { ...state, subcutaneous: action.id };
    case 'risco-hipoglicemia':
      return { ...state, hypoglycemiaRisk: !state.hypoglycemiaRisk };
    case 'sexo':
      return { ...state, sex: action.sex };
    case 'idoso':
      return { ...state, elderly: !state.elderly };
    case 'precipitante':
      return {
        ...state,
        precipitants: state.precipitants.includes(action.id)
          ? state.precipitants.filter((id) => id !== action.id)
          : [...state.precipitants, action.id],
      };
    case 'recomecar':
      return INITIAL_CAD_EHH_STATE;
  }
}

/** Nada foi digitado nem escolhido: não há o que avisar ao retomar. */
export function isPristineCadEhhState(state: CadEhhState): boolean {
  return (
    JSON.stringify({ ...state, screen: INITIAL_CAD_EHH_STATE.screen }) ===
    JSON.stringify(INITIAL_CAD_EHH_STATE)
  );
}

// ---- Leitura: painel ----

export interface PanelReading {
  /** Valor válido de cada exame; vazio, ilegível ou fora da faixa vira `null`. */
  values: Readonly<Record<LabFieldId, number | null>>;
  /** Erro de cada campo preenchido com valor inválido (vazio não é erro). */
  errors: Readonly<Partial<Record<LabFieldId, NumericFieldError>>>;
}

export function readPanel(panel: Readonly<Record<LabFieldId, string>>): PanelReading {
  const values = {} as Record<LabFieldId, number | null>;
  const errors: Partial<Record<LabFieldId, NumericFieldError>> = {};
  for (const field of LAB_FIELDS) {
    const checked = validateNumber(panel[field.id], labRange(field.id));
    values[field.id] = checked.ok ? checked.value : null;
    if (!checked.ok && checked.error.kind !== 'empty') errors[field.id] = checked.error;
  }
  return { values, errors };
}

/** Fluido de manutenção da fase B pelo sódio corrigido: abaixo de 135 isotônica. */
export type MaintenanceFluid = 'below135' | 'atOrAbove135';

export function maintenanceFluid(correctedNa: number): MaintenanceFluid {
  return correctedNa < 135 ? 'below135' : 'atOrAbove135';
}

/** O que os passos derivam do painel e do peso. `null`: falta dado para a conta. */
export interface PanelGuidance {
  correctedNa: number | null;
  maintenance: MaintenanceFluid | null;
  anionGap: number | null;
  effectiveOsmolality: number | null;
  /** Só na trilha EHH ou mista, como no ANY. */
  freeWaterDeficit: number | null;
  /** Só na trilha EHH ou mista. */
  hhsVolumeDeficit: { min: number; max: number } | null;
  severity: DkaSeverity | null;
  potassiumBand: PotassiumBandId | null;
  insulinGate: InsulinGate;
  /** U/h = mL/h (1 U/mL), na taxa escolhida. `null` sem peso. */
  insulinRate: number | null;
  /** Glicemia < 200: "glicemia normal não descarta CAD". */
  glucoseBelow200: boolean;
}

export function isHhsTrack(track: CadEhhTrack): boolean {
  return track === 'ehh' || track === 'misto';
}

export function panelGuidance(
  state: Pick<CadEhhState, 'track' | 'consciousness' | 'insulinRate' | 'sex' | 'elderly'>,
  values: PanelReading['values'],
  weight: number | null,
): PanelGuidance {
  const { glicemia, sodio, potassio, cloro, bicarbonato, phVenoso } = values;
  const correctedNa = sodio !== null && glicemia !== null ? correctedSodium(sodio, glicemia) : null;
  const hhs = isHhsTrack(state.track);
  return {
    correctedNa,
    maintenance: correctedNa !== null ? maintenanceFluid(correctedNa) : null,
    anionGap:
      sodio !== null && cloro !== null && bicarbonato !== null
        ? anionGap(sodio, cloro, bicarbonato)
        : null,
    effectiveOsmolality:
      sodio !== null && glicemia !== null ? effectiveOsmolality(sodio, glicemia) : null,
    freeWaterDeficit:
      hhs && weight !== null && correctedNa !== null
        ? freeWaterDeficit(weight, state.sex, state.elderly, correctedNa)
        : null,
    hhsVolumeDeficit: hhs && weight !== null ? hhsVolumeDeficit(weight) : null,
    severity: dkaSeverity(phVenoso, bicarbonato, state.consciousness),
    potassiumBand: potassio !== null ? potassiumBand(potassio) : null,
    insulinGate: insulinGate(potassio),
    insulinRate: weight !== null ? insulinRate(weight, state.insulinRate) : null,
    glucoseBelow200: glicemia !== null && glicemia < 200,
  };
}

// ---- Leitura: KCl ----

export interface KclReading {
  presentation: (typeof KCL_PRESENTATIONS)[number];
  route: (typeof KCL_ROUTES)[number];
  mEqPerMl: number;
  errors: Readonly<Partial<Record<KclFieldId, NumericFieldError>>>;
  /** `null` enquanto a dose em mEq não for válida. */
  result: {
    dose: number;
    /** `null` se a velocidade estiver vazia ou inválida. */
    rate: number | null;
    preparation: KclPreparation;
    finalVolumeMl: number;
    diluentMl: number;
    /** Horas para correr a dose; `null` sem velocidade. */
    hours: number | null;
  } | null;
  /** Velocidade acima de 20 mEq/h: efeito osmótico (troca para 0,45%). */
  osmoticAlert: boolean;
}

function checkKcl(
  raw: string,
  field: KclFieldId,
  errors: Partial<Record<KclFieldId, NumericFieldError>>,
) {
  const checked = validateNumber(raw, KCL_FIELD_RANGES[field]);
  if (checked.ok) return checked.value;
  if (checked.error.kind !== 'empty') errors[field] = checked.error;
  return null;
}

export function readKcl(kcl: CadEhhState['kcl']): KclReading {
  const chosen = presentation(kcl.presentation);
  const via = route(kcl.route);
  const errors: Partial<Record<KclFieldId, NumericFieldError>> = {};
  checkKcl(kcl.mlRaw, 'ml', errors);
  const dose = checkKcl(kcl.mEqRaw, 'mEq', errors);
  const volume = checkKcl(kcl.volumeRaw, 'volume', errors);
  const rate = checkKcl(kcl.rateRaw, 'rate', errors);
  // Volume final digitado mas inválido não cai no mínimo calado: espera correção.
  const volumeBlocked = kcl.volumeRaw.trim() !== '' && volume === null;

  let result: KclReading['result'] = null;
  if (dose !== null && !volumeBlocked) {
    const preparation = kclPreparation(
      dose,
      chosen.mEqPerAmpoule,
      chosen.mlPerAmpoule,
      via.maxMEqPerLiter,
      rate ?? 0,
      volume ?? undefined,
    );
    const finalVolumeMl = volume ?? preparation.minimumVolumeMl;
    result = {
      dose,
      rate,
      preparation,
      finalVolumeMl,
      diluentMl: Math.max(0, finalVolumeMl - preparation.kclVolumeMl),
      hours: rate !== null ? dose / rate : null,
    };
  }
  return {
    presentation: chosen,
    route: via,
    mEqPerMl: kclMEqPerMl(chosen),
    errors,
    result,
    osmoticAlert: rate !== null && rate > KCL_OSMOTIC_ALERT_ABOVE,
  };
}

// ---- Leitura: ciclo de reavaliação ----

export interface CycleReading {
  values: Readonly<Record<CycleFieldId, number | null>>;
  errors: Readonly<Partial<Record<CycleFieldId, NumericFieldError>>>;
  /** Minutos desde o fechamento da rodada anterior; `null` na primeira. */
  minutes: number | null;
  fall: GlucoseFall | null;
  /** Glicemia < 250: dextrose e insulina a 0,05 U/kg/h. */
  glucoseBelow250: boolean;
  /** Insulina a 0,05 U/kg/h (U/h = mL/h); `null` sem peso. */
  reducedInsulinRate: number | null;
  correctedNa: number | null;
  maintenance: MaintenanceFluid | null;
  potassiumBand: PotassiumBandId | null;
  anionGap: number | null;
  deltaDelta: DeltaDelta | null;
  resolution: ReturnType<typeof dkaResolution>;
  transition: SubcutaneousTransition | null;
}

export function readCycle(
  state: Pick<CadEhhState, 'cycle' | 'hypoglycemiaRisk'>,
  weight: number | null,
  now: number,
): CycleReading {
  const values = {} as Record<CycleFieldId, number | null>;
  const errors: Partial<Record<CycleFieldId, NumericFieldError>> = {};
  for (const field of CYCLE_FIELDS) {
    const checked = validateNumber(state.cycle.current[field], labRange(field));
    values[field] = checked.ok ? checked.value : null;
    if (!checked.ok && checked.error.kind !== 'empty') errors[field] = checked.error;
  }
  const { previous } = state.cycle;
  const minutes = previous ? minutesSince(previous.at, now) : null;
  const previousGlucose = previous?.values.glicemia ?? null;
  const fall =
    minutes !== null && previousGlucose !== null && values.glicemia !== null
      ? glucoseFall(values.glicemia, previousGlucose, minutes)
      : null;
  const { glicemia, sodio, potassio, cloro, bicarbonato, phVenoso } = values;
  const correctedNa = sodio !== null && glicemia !== null ? correctedSodium(sodio, glicemia) : null;
  const ag =
    sodio !== null && cloro !== null && bicarbonato !== null
      ? anionGap(sodio, cloro, bicarbonato)
      : null;
  return {
    values,
    errors,
    minutes,
    fall,
    glucoseBelow250: glicemia !== null && glicemia < 250,
    reducedInsulinRate: weight !== null ? insulinRate(weight, 0.05) : null,
    correctedNa,
    maintenance: correctedNa !== null ? maintenanceFluid(correctedNa) : null,
    potassiumBand: potassio !== null ? potassiumBand(potassio) : null,
    anionGap: ag,
    deltaDelta: ag !== null && bicarbonato !== null ? deltaDelta(ag, bicarbonato) : null,
    resolution: dkaResolution(phVenoso, bicarbonato, glicemia),
    transition: weight !== null ? subcutaneousTransition(weight, state.hypoglycemiaRisk) : null,
  };
}

// ---- Estado salvo na sessão da aba ----

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isOneOf<T extends string | number>(value: unknown, options: readonly T[]): value is T {
  return options.includes(value as T);
}

function readTexts<K extends string>(value: unknown, keys: readonly K[]): Record<K, string> | null {
  if (!isRecord(value)) return null;
  const out = {} as Record<K, string>;
  for (const key of keys) {
    const text = value[key];
    if (typeof text !== 'string' || text.length > 20) return null;
    out[key] = text;
  }
  return out;
}

function readRound(value: unknown): CycleRound | null {
  if (!isRecord(value) || typeof value.at !== 'number' || !isRecord(value.values)) return null;
  const values = {} as Record<CycleFieldId, number | null>;
  for (const field of CYCLE_FIELDS) {
    const number = value.values[field];
    if (number !== null && typeof number !== 'number') return null;
    values[field] = number;
  }
  return { values, at: value.at };
}

const LAB_FIELD_IDS = LAB_FIELDS.map(({ id }) => id);
const PRECIPITANT_IDS = PRECIPITANTS.map(({ id }) => id);

/**
 * Lê o estado salvo sem confiar no formato: qualquer campo estranho (outra
 * versão, edição à mão) devolve `null`, e o roteiro começa do zero.
 */
export function parseCadEhhState(value: unknown): CadEhhState | null {
  if (!isRecord(value)) return null;
  const panel = readTexts(value.panel, LAB_FIELD_IDS);
  const kcl = isRecord(value.kcl) ? value.kcl : null;
  const kclTexts = kcl
    ? readTexts(kcl, ['mlRaw', 'mEqRaw', 'volumeRaw', 'rateRaw'] as const)
    : null;
  const cycle = isRecord(value.cycle) ? value.cycle : null;
  const current = cycle ? readTexts(cycle.current, CYCLE_FIELDS) : null;
  const previous = cycle?.previous === null ? null : readRound(cycle?.previous);
  if (
    !panel ||
    !kcl ||
    !kclTexts ||
    !cycle ||
    !current ||
    (cycle.previous !== null && previous === null) ||
    typeof cycle.round !== 'number' ||
    !Number.isInteger(cycle.round) ||
    cycle.round < 1 ||
    !isOneOf(value.screen, CAD_EHH_SCREENS) ||
    !(value.ketonuria === null || isOneOf(value.ketonuria, KETONURIA_OPTIONS)) ||
    !(
      value.consciousness === null ||
      isOneOf(
        value.consciousness,
        CONSCIOUSNESS_OPTIONS.map(({ id }) => id),
      )
    ) ||
    !isOneOf(
      value.track,
      TRACK_OPTIONS.map(({ id }) => id),
    ) ||
    !(
      value.volemicState === null ||
      isOneOf(
        value.volemicState,
        VOLEMIC_STATES.map(({ id }) => id),
      )
    ) ||
    !isOneOf(
      kcl.presentation,
      KCL_PRESENTATIONS.map(({ id }) => id),
    ) ||
    !isOneOf(
      kcl.route,
      KCL_ROUTES.map(({ id }) => id),
    ) ||
    !isOneOf(value.insulinRate, INSULIN_RATES) ||
    !isOneOf(
      value.subcutaneous,
      TRANSITION_OVERLAP.map(({ id }) => id),
    ) ||
    typeof value.hypoglycemiaRisk !== 'boolean' ||
    !isOneOf(value.sex, ['M', 'F'] as const) ||
    typeof value.elderly !== 'boolean' ||
    !Array.isArray(value.precipitants) ||
    !value.precipitants.every((id) => isOneOf(id, PRECIPITANT_IDS))
  ) {
    return null;
  }
  return {
    screen: value.screen,
    panel,
    ketonuria: value.ketonuria,
    consciousness: value.consciousness,
    track: value.track,
    volemicState: value.volemicState,
    kcl: { presentation: kcl.presentation, route: kcl.route, ...kclTexts },
    insulinRate: value.insulinRate,
    cycle: { round: cycle.round, previous, current },
    subcutaneous: value.subcutaneous,
    hypoglycemiaRisk: value.hypoglycemiaRisk,
    sex: value.sex,
    elderly: value.elderly,
    precipitants: [...new Set(value.precipitants as PrecipitantId[])],
  };
}
