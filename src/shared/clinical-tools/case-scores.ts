import type { CaseToolFacts, CaseToolSuggestions } from '../contracts/clinical';
import { evaluateCalculator, formatResultValue, type CalculatorDefinition } from './calculator';
import { caseCalculatorDefinition, TOOL_CASE_INPUTS } from './case-prefill';
import { caseToolFacts, mentions, type CaseReading } from './case-suggestions';
import { normalizeSearchText } from './catalog';
import { formatCompact } from './numbers';
import type { ContentProvenance } from './provenance';

/**
 * Escore do plano calculado pelo código, não pelo modelo (CC-333). O
 * Copiloto lê do caso as entradas de cada escore (sinais vitais e idade do
 * entendimento; ureia, estado mental e O₂ do texto), calcula com o mesmo
 * motor das Ferramentas e confere o número que a análise escreveu. Nada de
 * IA aqui: a mesma entrada dá sempre o mesmo valor.
 *
 * Regra de segurança, a mesma do preenchimento (case-prefill.ts): quando o
 * dado do caso não decide o item, ele fica sem resposta, o escore não sai e o
 * plano pede o dado. Um escore calculado com um item chutado seria pior que o
 * do modelo, porque viria com a autoridade do sistema.
 *
 * O que cada item lê do caso é conteúdo clínico: está versionado em
 * `CASE_SCORES_PROVENANCE`, com revisão pendente do Dr. Ripardo
 * (docs/ferramentas/revisao-clinica/escores-pelo-motor.md).
 */

export const CASE_SCORES_PROVENANCE: ContentProvenance = {
  source: 'Copiloto · dados do caso → entradas dos escores (CC-333)',
  version: '1.0.0',
  updatedAt: '2026-10-15',
  review: { status: 'pendente', assignedTo: 'Dr. Ripardo' },
};

// ── Dados do caso ────────────────────────────────────────────────────────

/**
 * Estado mental dito no caso, na escala ACVPU quando o texto decide.
 * `rebaixado`: alterado, sem dizer em que nível (sonolento, torporoso,
 * "rebaixamento do nível de consciência").
 */
export type MentalStatus = 'alerta' | 'confusao' | 'voz' | 'dor' | 'irresponsivo' | 'rebaixado';

export interface CaseUrea {
  value: number;
  unit: 'mg/dL' | 'mmol/L';
}

/** Os números de CaseToolFacts e o que os escores leem a mais do texto do caso. */
export interface CaseScoreFacts extends CaseToolFacts {
  urea: CaseUrea | null;
  /** Glasgow que o caso informa (o mais recente, quando há mais de um). */
  gcs: number | null;
  mentalStatus: MentalStatus | null;
  /** Em ar ambiente ou com O₂ suplementar; `null` quando o texto não diz, ou diz os dois. */
  oxygen: 'ar' | 'o2' | null;
}

const NO_TOOL_FACTS: CaseToolFacts = {
  ageYears: null,
  sex: null,
  weightKg: null,
  systolicBp: null,
  diastolicBp: null,
  heartRate: null,
  respiratoryRate: null,
  spo2: null,
  temperature: null,
  glucose: null,
};

/**
 * Do mais grave para o menos grave: com duas menções, vale a pior ("lúcido,
 * porém desorientado no tempo" é confusão). Padrões sobre texto normalizado.
 */
const MENTAL_STATUS_PATTERNS: ReadonlyArray<readonly [MentalStatus, RegExp]> = [
  [
    'irresponsivo',
    /\b(arresponsiv[oa]|irresponsiv[oa]|comatos[oa]|em coma|nao responsiv[oa]|sem resposta a estimulos)\b/,
  ],
  ['dor', /\bresponde (apenas |so )?(a|ao estimulo) dor(oso)?\b/],
  ['voz', /\bresponde (apenas |so )?(a voz|ao chamado|ao comando verbal)\b/],
  [
    'rebaixado',
    /\b(sonolent[oa]|torporos[oa]|obnubilad[oa]|rebaixamento (do nivel )?de consciencia|rebaixad[oa])\b/,
  ],
  ['confusao', /\b(confus[oa]|confusao mental|confusao aguda|desorientad[oa]|delirium)\b/],
  [
    'alerta',
    /\b(lucid[oa]|lote|alert[oa] e orientad[oa]|orientad[oa] (em|no|na|nos|nas|auto|alo|globalmente))\b/,
  ],
];

/** "em ar ambiente", "SpO2 92% aa". */
const ROOM_AIR = /\b(em )?ar ambiente\b|\baa\b/;
/** Cateter, máscara, VNI, alto fluxo, ventilação mecânica: O₂ suplementar. */
const SUPPLEMENTAL_OXYGEN =
  /\b(cateter nasal|cateter de o2|cn de o2|mascara (de |com )?(o2|oxigenio|reservatorio|venturi|nao reinalante)|venturi|o2 suplementar|oxigenio suplementar|oxigenoterapia|em uso de o2|com o2|recebendo o2|o2 a \d+|vni|cnaf|alto fluxo|intubad[oa]|ventilacao mecanica)\b/;

/**
 * "ureia 64", "uréia: 64 mg/dL", "Ur 64 Cr 1,4", "ureia 9 mmol/L". Sem
 * unidade, mg/dL (como os laboratórios no Brasil laudam). BUN não entra: é
 * outra medida.
 */
const UREA_MENTION =
  /\b(?:ureia|ur)\b(?:\s+serica)?\s*(?:de|:|=)?\s*(\d{1,3}(?:[.,]\d{1,2})?)\s*(mg\/dl|mmol\/l)?/g;
const UREA_PLAUSIBLE: Readonly<Record<CaseUrea['unit'], [number, number]>> = {
  'mg/dL': [5, 600],
  'mmol/L': [1, 100],
};

/** Ureia dita no texto. Dois valores diferentes não decidem (antes e depois, dois exames). */
export function ureaFromText(normalized: string): CaseUrea | null {
  const found = new Map<string, CaseUrea>();
  for (const match of normalized.matchAll(UREA_MENTION)) {
    const unit: CaseUrea['unit'] = match[2] === 'mmol/l' ? 'mmol/L' : 'mg/dL';
    const value = Number((match[1] ?? '').replace(',', '.'));
    const [min, max] = UREA_PLAUSIBLE[unit];
    if (!Number.isFinite(value) || value < min || value > max) continue;
    found.set(`${value}${unit}`, { value, unit });
  }
  return found.size === 1 ? ([...found.values()][0] ?? null) : null;
}

export function mentalStatusFromText(normalized: string): MentalStatus | null {
  for (const [status, pattern] of MENTAL_STATUS_PATTERNS) {
    if (mentions(pattern, normalized)) return status;
  }
  return null;
}

export function oxygenFromText(normalized: string): CaseScoreFacts['oxygen'] {
  const air = mentions(ROOM_AIR, normalized);
  const oxygen = mentions(SUPPLEMENTAL_OXYGEN, normalized);
  if (air === oxygen) return null;
  return air ? 'ar' : 'o2';
}

/**
 * Tudo o que os escores leem do caso. Sinais vitais, idade e sexo vêm do
 * entendimento (`caseToolFacts`); sem ele, ficam vazios: nada é tirado do
 * texto livre por aproximação. Ureia, estado mental e O₂ vêm do texto do caso
 * e dos achados do entendimento; o Glasgow, só do texto do médico.
 */
export function caseScoreFacts(reading: CaseReading | null, caseText: string): CaseScoreFacts {
  const findings = reading
    ? [
        ...reading.structuredData.keyFindings,
        ...reading.structuredData.relevantContext,
        ...reading.instability.findings,
      ]
    : [];
  const normalized = normalizeSearchText([caseText, ...findings].join('\n'));
  return {
    ...(reading ? caseToolFacts(reading, caseText) : NO_TOOL_FACTS),
    urea: ureaFromText(normalized),
    gcs: reportedScores(caseText).get('gcs') ?? null,
    mentalStatus: mentalStatusFromText(normalized),
    oxygen: oxygenFromText(normalized),
  };
}

// ── Entradas de cada escore ──────────────────────────────────────────────

interface ItemSource {
  item: string;
  /** Opção escolhida a partir do caso; `null` quando o caso não decide. */
  answer: (facts: CaseScoreFacts) => string | null;
  /** A entrada usada, como o médico lê ("FR 32 irpm"). Só chamada com resposta. */
  input: (facts: CaseScoreFacts) => string;
  /** O dado que falta, para "falta saber: …". */
  need: string;
}

interface FieldSource {
  input: string;
  value: (facts: CaseScoreFacts) => number | null;
  describe: (facts: CaseScoreFacts) => string;
  need: string;
}

interface CaseScoreBinding {
  items?: readonly ItemSource[];
  inputs?: readonly FieldSource[];
}

type NumericFact = 'ageYears' | 'heartRate' | 'respiratoryRate' | 'spo2' | 'temperature';

/** Faixa pelo primeiro limite superior que cabe (os rótulos dos itens do NEWS2). */
function band(
  fact: NumericFact | 'systolicBp',
  limits: ReadonlyArray<readonly [number, string]>,
  above: string,
) {
  return (facts: CaseScoreFacts): string | null => {
    const value = facts[fact];
    if (value === null) return null;
    return limits.find(([upTo]) => value <= upTo)?.[1] ?? above;
  };
}

function yesNo(fact: NumericFact | 'systolicBp', isYes: (value: number) => boolean) {
  return (facts: CaseScoreFacts): string | null => {
    const value = facts[fact];
    if (value === null) return null;
    return isYes(value) ? 'sim' : 'nao';
  };
}

const MENTAL_STATUS_TEXT: Readonly<Record<MentalStatus, string>> = {
  alerta: 'alerta e orientado',
  confusao: 'confusão',
  voz: 'responde à voz',
  dor: 'responde à dor',
  irresponsivo: 'não responsivo',
  rebaixado: 'rebaixamento do nível de consciência',
};

const ALTERED: ReadonlySet<MentalStatus> = new Set([
  'confusao',
  'voz',
  'dor',
  'irresponsivo',
  'rebaixado',
]);

/**
 * Glasgow e texto dizendo coisas diferentes (Glasgow 15 e "confuso") não
 * decidem nada: o item fica vazio.
 */
function mentalStatusConflict({ gcs, mentalStatus }: CaseScoreFacts): boolean {
  if (gcs === null || mentalStatus === null) return false;
  return (gcs === 15) === ALTERED.has(mentalStatus);
}

/** qSOFA: "Alteração do nível de consciência (GCS < 15)". */
function alteredConsciousness(facts: CaseScoreFacts): string | null {
  if (mentalStatusConflict(facts)) return null;
  if (facts.gcs !== null) return facts.gcs < 15 ? 'sim' : 'nao';
  if (facts.mentalStatus === null) return null;
  return ALTERED.has(facts.mentalStatus) ? 'sim' : 'nao';
}

/**
 * CURB-65: "Confusão mental (nova desorientação…)". Glasgow abaixo de 15
 * sozinho não decide: o 14 pode ser só a abertura ocular.
 */
function newConfusion(facts: CaseScoreFacts): string | null {
  if (mentalStatusConflict(facts)) return null;
  if (facts.mentalStatus !== null) return ALTERED.has(facts.mentalStatus) ? 'sim' : 'nao';
  return facts.gcs === 15 ? 'nao' : null;
}

/** NEWS2 ACVPU. "Rebaixado" sem o nível, ou Glasgow < 15 sozinho, não escolhe a letra. */
function acvpu(facts: CaseScoreFacts): string | null {
  if (mentalStatusConflict(facts)) return null;
  switch (facts.mentalStatus) {
    case 'alerta':
      return 'a';
    case 'confusao':
      return 'c';
    case 'voz':
      return 'v';
    case 'dor':
      return 'p';
    case 'irresponsivo':
      return 'u';
    case 'rebaixado':
      return null;
    case null:
      return facts.gcs === 15 ? 'a' : null;
  }
}

function mentalStatusInput({ gcs, mentalStatus }: CaseScoreFacts): string {
  const parts = [
    ...(gcs !== null ? [`Glasgow ${formatCompact(gcs)}`] : []),
    ...(mentalStatus !== null ? [`estado mental: ${MENTAL_STATUS_TEXT[mentalStatus]}`] : []),
  ];
  return parts.join(', ');
}

function bloodPressureInput({ systolicBp, diastolicBp }: CaseScoreFacts): string {
  if (systolicBp !== null && diastolicBp !== null) {
    return `PA ${formatCompact(systolicBp)}x${formatCompact(diastolicBp)} mmHg`;
  }
  return systolicBp !== null
    ? `PAS ${formatCompact(systolicBp)} mmHg`
    : `PAD ${formatCompact(diastolicBp ?? 0)} mmHg`;
}

const vital =
  (fact: NumericFact | 'systolicBp', prefix: string, unit: string) => (facts: CaseScoreFacts) =>
    `${prefix} ${formatCompact(facts[fact] ?? 0)}${unit}`;

const ageInput = vital('ageYears', 'idade', ' anos');
const rrInput = vital('respiratoryRate', 'FR', ' irpm');
const hrInput = vital('heartRate', 'FC', ' bpm');
const sbpInput = vital('systolicBp', 'PAS', ' mmHg');
const tempInput = vital('temperature', 'temperatura', ' °C');

function spo2Input({ spo2, oxygen }: CaseScoreFacts): string {
  const where = oxygen === 'ar' ? ' em ar ambiente' : oxygen === 'o2' ? ' com O₂' : '';
  return `SpO₂ ${formatCompact(spo2 ?? 0)}%${where}`;
}

const NEED = {
  age: 'idade',
  rr: 'frequência respiratória',
  hr: 'frequência cardíaca',
  sbp: 'pressão arterial sistólica',
  bp: 'pressão arterial (sistólica e diastólica)',
  spo2: 'SpO₂',
  temp: 'temperatura',
} as const;

/**
 * O que o caso responde em cada escore, pelo id da definição. Os limiares
 * repetem os rótulos dos itens, como em CALCULATOR_CASE_BINDINGS (CC-332):
 * o teste confere os dois lados de cada limiar e que os itens que as duas
 * tabelas leem dão a mesma resposta. Escore fora da lista não é calculado
 * pelo Copiloto: citado com número, vira pedido do dado.
 */
export const CASE_SCORE_BINDINGS: Readonly<Record<string, CaseScoreBinding>> = {
  curb65: {
    items: [
      {
        item: 'confusion',
        answer: newConfusion,
        input: mentalStatusInput,
        need: 'estado mental (confusão nova)',
      },
      {
        item: 'urea',
        answer: ({ urea }) => {
          if (urea === null) return null;
          const limit = urea.unit === 'mg/dL' ? 42 : 7;
          return urea.value > limit ? 'sim' : 'nao';
        },
        input: ({ urea }) => `ureia ${formatCompact(urea?.value ?? 0)} ${urea?.unit ?? ''}`.trim(),
        need: 'ureia',
      },
      {
        item: 'rr',
        answer: yesNo('respiratoryRate', (rr) => rr >= 30),
        input: rrInput,
        need: NEED.rr,
      },
      {
        item: 'bp',
        answer: ({ systolicBp, diastolicBp }) => {
          if (
            (systolicBp !== null && systolicBp < 90) ||
            (diastolicBp !== null && diastolicBp <= 60)
          ) {
            return 'sim';
          }
          // O Não exige as duas pressões, como no preenchimento da CC-332.
          return systolicBp !== null && diastolicBp !== null ? 'nao' : null;
        },
        input: bloodPressureInput,
        need: NEED.bp,
      },
      {
        item: 'age',
        answer: yesNo('ageYears', (age) => age >= 65),
        input: ageInput,
        need: NEED.age,
      },
    ],
  },
  qsofa: {
    items: [
      {
        item: 'rr',
        answer: yesNo('respiratoryRate', (rr) => rr >= 22),
        input: rrInput,
        need: NEED.rr,
      },
      {
        item: 'sbp',
        answer: yesNo('systolicBp', (sbp) => sbp <= 100),
        input: sbpInput,
        need: NEED.sbp,
      },
      {
        item: 'gcs',
        answer: alteredConsciousness,
        input: mentalStatusInput,
        need: 'nível de consciência (Glasgow)',
      },
    ],
  },
  news2: {
    items: [
      {
        item: 'rr',
        answer: band(
          'respiratoryRate',
          [
            [8, 'lte8'],
            [11, '9-11'],
            [20, '12-20'],
            [24, '21-24'],
          ],
          'gte25',
        ),
        input: rrInput,
        need: NEED.rr,
      },
      {
        item: 'spo2',
        answer: band(
          'spo2',
          [
            [91, 'lte91'],
            [93, '92-93'],
            [95, '94-95'],
          ],
          'gte96',
        ),
        input: spo2Input,
        need: NEED.spo2,
      },
      {
        item: 'o2',
        answer: ({ oxygen }) => oxygen,
        input: ({ oxygen }) => (oxygen === 'o2' ? 'em O₂ suplementar' : 'em ar ambiente'),
        need: 'uso de O₂ suplementar',
      },
      {
        item: 'temp',
        answer: band(
          'temperature',
          [
            [35, 'lte35'],
            [36, '35.1-36'],
            [38, '36.1-38'],
            [39, '38.1-39'],
          ],
          'gte39.1',
        ),
        input: tempInput,
        need: NEED.temp,
      },
      {
        item: 'sbp',
        answer: band(
          'systolicBp',
          [
            [90, 'lte90'],
            [100, '91-100'],
            [110, '101-110'],
            [219, '111-219'],
          ],
          'gte220',
        ),
        input: sbpInput,
        need: NEED.sbp,
      },
      {
        item: 'hr',
        answer: band(
          'heartRate',
          [
            [40, 'lte40'],
            [50, '41-50'],
            [90, '51-90'],
            [110, '91-110'],
            [130, '111-130'],
          ],
          'gte131',
        ),
        input: hrInput,
        need: NEED.hr,
      },
      {
        item: 'consciousness',
        answer: acvpu,
        input: mentalStatusInput,
        need: 'nível de consciência (ACVPU)',
      },
    ],
  },
  'shock-index': {
    inputs: [
      { input: 'hr', value: ({ heartRate }) => heartRate, describe: hrInput, need: NEED.hr },
      { input: 'sbp', value: ({ systolicBp }) => systolicBp, describe: sbpInput, need: NEED.sbp },
    ],
  },
  'perc-rule': {
    items: [
      {
        item: 'age',
        answer: yesNo('ageYears', (age) => age >= 50),
        input: ageInput,
        need: NEED.age,
      },
      {
        item: 'hr',
        answer: yesNo('heartRate', (hr) => hr >= 100),
        input: hrInput,
        need: NEED.hr,
      },
      {
        // "SpO₂ < 95% em ar ambiente": o Não só com a medida em ar ambiente.
        // Abaixo de 95% com O₂, em ar seria ainda menor: Sim.
        item: 'spo2',
        answer: ({ spo2, oxygen }) => {
          if (spo2 === null) return null;
          if (spo2 < 95) return 'sim';
          return oxygen === 'ar' ? 'nao' : null;
        },
        input: spo2Input,
        need: 'SpO₂ em ar ambiente',
      },
    ],
  },
  'wells-tep': {
    items: [
      { item: 'hr', answer: yesNo('heartRate', (hr) => hr > 100), input: hrInput, need: NEED.hr },
    ],
  },
  'heart-score': {
    items: [
      {
        item: 'age',
        answer: ({ ageYears }) =>
          ageYears === null ? null : ageYears < 45 ? 'lt45' : ageYears < 65 ? '45-64' : 'gte65',
        input: ageInput,
        need: NEED.age,
      },
    ],
  },
  'ottawa-hsa': {
    items: [
      {
        item: 'age40',
        answer: yesNo('ageYears', (age) => age >= 40),
        input: ageInput,
        need: NEED.age,
      },
    ],
  },
  alvarado: {
    items: [
      {
        item: 'temp',
        answer: yesNo('temperature', (temp) => temp >= 37.3),
        input: tempInput,
        need: NEED.temp,
      },
    ],
  },
};

// ── Cálculo ──────────────────────────────────────────────────────────────

export type CaseScoreResult =
  | {
      status: 'complete';
      calculatorId: string;
      /** Nome curto ("CURB-65"). */
      label: string;
      value: number;
      /** "5 pontos", "1,39", "0 critérios". */
      valueText: string;
      /** Rótulo da faixa ("Alta gravidade"). */
      band: string;
      /** Entradas usadas, como o médico lê. */
      inputs: string[];
    }
  | {
      status: 'incomplete';
      calculatorId: string;
      label: string;
      /** Os dados que faltam, na ordem dos itens. */
      missing: string[];
    };

/** "Hemoptise" → "hemoptise"; sigla fica como está ("TEP mais provável…", "SpO₂ < 95%"). */
function lowerFirst(text: string): string {
  const firstWord = text.split(/\s/, 1)[0] ?? '';
  return firstWord.slice(1) === firstWord.slice(1).toLowerCase()
    ? text.charAt(0).toLowerCase() + text.slice(1)
    : text;
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

/** Nome curto do escore: o da citação ou, fora do catálogo, o da definição. */
export function scoreLabel(calculatorId: string): string {
  return (
    SCORE_CITATIONS.find((entry) => entry.calculatorId === calculatorId)?.label ??
    caseCalculatorDefinition(calculatorId)?.name ??
    calculatorId
  );
}

/**
 * Calcula o escore com o motor a partir do caso, ou diz o que falta. Só
 * calcula com todos os itens respondidos pelo caso; `null` para id que não
 * existe no motor.
 */
export function computeCaseScore(
  calculatorId: string,
  facts: CaseScoreFacts,
): CaseScoreResult | null {
  const definition = caseCalculatorDefinition(calculatorId);
  if (!definition) return null;
  const binding = CASE_SCORE_BINDINGS[calculatorId] ?? {};
  const label = scoreLabel(calculatorId);

  const items: Record<string, string> = {};
  const fields: Record<string, string> = {};
  const inputs: string[] = [];
  const missing: string[] = [];

  for (const item of definition.items ?? []) {
    const source = binding.items?.find(({ item: id }) => id === item.id);
    const optionId = source?.answer(facts) ?? null;
    if (source && optionId !== null && item.options.some(({ id }) => id === optionId)) {
      items[item.id] = optionId;
      inputs.push(source.input(facts));
    } else {
      missing.push(source?.need ?? lowerFirst(item.label));
    }
  }

  for (const input of formulaInputs(definition)) {
    const source = binding.inputs?.find(({ input: id }) => id === input.id);
    const value = source?.value(facts) ?? null;
    if (source && value !== null && value >= input.min && value <= input.max) {
      fields[input.id] = formatCompact(value);
      inputs.push(source.describe(facts));
    } else if (!input.optional) {
      missing.push(source?.need ?? lowerFirst(input.label));
    }
  }

  if (missing.length > 0) {
    return { status: 'incomplete', calculatorId, label, missing: unique(missing) };
  }

  const evaluation = evaluateCalculator(definition, { items, inputs: fields });
  if (evaluation.status !== 'complete') {
    // Combinação que a própria calculadora recusa (`check`): não sai número.
    return {
      status: 'incomplete',
      calculatorId,
      label,
      missing: unique([...evaluation.missing, ...Object.keys(evaluation.errors)].map(lowerFirst)),
    };
  }
  return {
    status: 'complete',
    calculatorId,
    label,
    value: evaluation.value,
    valueText: formatResultValue(definition, evaluation.value) ?? formatCompact(evaluation.value),
    band: evaluation.band.label,
    inputs: unique(inputs),
  };
}

function formulaInputs(definition: CalculatorDefinition) {
  return definition.kind === 'formula' ? definition.inputs : [];
}

/**
 * Calculadoras que o plano sugere para o caso (CC-332): as sugeridas
 * diretamente e as de dentro de um roteiro sugerido (Wells e PERC no TEP).
 */
export function suggestedCalculatorIds(suggestions: CaseToolSuggestions): string[] {
  const ids = suggestions.suggestions.flatMap(({ target }) =>
    target.kind === 'calculator'
      ? [target.calculatorId]
      : [...(TOOL_CASE_INPUTS[target.toolId]?.calculators ?? [])],
  );
  return unique(ids).filter((id) => caseCalculatorDefinition(id) !== undefined);
}

/** "ureia", "ureia e idade", "a, b e c"; mais de três: os dois primeiros e quantos faltam. */
export function describeMissing(missing: readonly string[], totalItems: number): string {
  if (missing.length > 3 && missing.length === totalItems) return `os ${missing.length} itens`;
  if (missing.length > 3) {
    return `${missing.slice(0, 2).join(', ')} e mais ${missing.length - 2} itens`;
  }
  if (missing.length <= 1) return missing[0] ?? '';
  return `${missing.slice(0, -1).join(', ')} e ${missing.at(-1)}`;
}

/** Quantos dados o escore pede (itens e campos obrigatórios). */
export function scoreItemCount(calculatorId: string): number {
  const definition = caseCalculatorDefinition(calculatorId);
  if (!definition) return 0;
  return (
    (definition.items?.length ?? 0) +
    formulaInputs(definition).filter((input) => !input.optional).length
  );
}

// ── Escores citados num texto ────────────────────────────────────────────

export interface ScoreCitationPattern {
  calculatorId: string;
  /** Nome curto, como o plano e o prompt escrevem. */
  label: string;
  /** O nome do escore no texto; as flags valem para a citação inteira. */
  name: RegExp;
}

/**
 * Escores que o Copiloto reconhece citados com número. Lista fechada, com o
 * nome escrito como no plantão: um padrão genérico pelo nome da definição
 * pegaria "PAM", "DPP" e "EVA" no meio de qualquer frase. HEART, GRACE e NEWS
 * diferenciam maiúsculas ("heart" e "news" são palavras). Escalas que o
 * médico mede à beira do leito sem conta (RASS, EVA) ficam de fora: "meta de
 * RASS 0" é alvo, não resultado.
 */
export const SCORE_CITATIONS: readonly ScoreCitationPattern[] = [
  { calculatorId: 'curb65', label: 'CURB-65', name: /\bCURB[\s-]?65\b/i },
  { calculatorId: 'qsofa', label: 'qSOFA', name: /\b(?:q|quick)[\s-]?SOFA\b/i },
  { calculatorId: 'sofa', label: 'SOFA', name: /(?<![\w-])(?<!\bq\s)(?<!quick\s)SOFA\b/i },
  // "NEWS 2" sozinho é o nome do escore, nunca NEWS = 2: o nome sem o "2" só
  // vale quando o que vem depois não é o "2" do nome.
  {
    calculatorId: 'news2',
    label: 'NEWS2',
    name: /\bNEWS(?:[\s-]?2|(?![\s-]?2\b))(?![\w²])/,
  },
  {
    calculatorId: 'shock-index',
    label: 'Índice de choque',
    name: /(?<![\wÀ-ÿ])(?:[íi]ndice de choque|shock index)(?!\s+modificado)/i,
  },
  {
    calculatorId: 'gcs',
    label: 'Glasgow',
    name: /\bGlasgow\b(?![\s-]*Blatchford)|\bGCS\b/i,
  },
  {
    calculatorId: 'glasgow-blatchford',
    label: 'Glasgow-Blatchford',
    name: /\bGlasgow[\s-]*Blatchford\b|(?<!Glasgow[\s-]*)\bBlatchford\b/i,
  },
  { calculatorId: 'nihss', label: 'NIHSS', name: /\bNIHSS\b/i },
  { calculatorId: 'heart-score', label: 'HEART', name: /\bHEART\b/ },
  // "Fluxo TIMI 3" é o grau de fluxo da angiografia, não o escore de risco.
  { calculatorId: 'timi-nstemi', label: 'TIMI', name: /(?<![Ff]luxo\s)\bTIMI\b/ },
  { calculatorId: 'grace-score', label: 'GRACE', name: /\bGRACE\b/ },
  {
    calculatorId: 'wells-tep',
    label: 'Wells (TEP)',
    name: /\bWells\b(?:\s+(?:para|de|do)\s+(?:TEP|embolia pulmonar|tromboembolismo pulmonar))?(?!\s+(?:para|de|do)\s+(?:TVP|trombose))/i,
  },
  { calculatorId: 'perc-rule', label: 'PERC', name: /\bPERC\b/i },
  { calculatorId: 'add-rs', label: 'ADD-RS', name: /\bADD[\s-]?RS\b/i },
  {
    calculatorId: 'ottawa-hsa',
    label: 'Ottawa (HSA)',
    name: /\bOttawa\s+(?:para\s+)?(?:HSA|SAH)\b/i,
  },
  { calculatorId: 'alvarado', label: 'Alvarado', name: /\bAlvarado\b/i },
  { calculatorId: 'chadsvasc', label: 'CHA₂DS₂-VASc', name: /\bCHA[2₂]?DS[2₂]?[\s-]*VASc\b/i },
  { calculatorId: 'has-bled', label: 'HAS-BLED', name: /\bHAS[\s-]?BLED\b/i },
  { calculatorId: 'abcd2', label: 'ABCD2', name: /\bABCD[2²](?!\w)/i },
  {
    calculatorId: 'centor-mcisaac',
    label: 'Centor/McIsaac',
    name: /\bCentor(?:\s*\/\s*McIsaac)?\b|\bMcIsaac\b/i,
  },
  { calculatorId: 'ich-score', label: 'ICH score', name: /\bICH score\b|\bescore ICH\b/i },
  { calculatorId: 'apache-ii', label: 'APACHE II', name: /\bAPACHE[\s-]?(?:II|2)\b/i },
  { calculatorId: 'child-pugh', label: 'Child-Pugh', name: /\bChild[\s-]*Pugh\b/i },
  { calculatorId: 'meld-na', label: 'MELD-Na', name: /\bMELD(?:[\s-]?Na)?\b/i },
  { calculatorId: 'rockall', label: 'Rockall', name: /\bRockall\b/i },
];

/**
 * Entre o nome e o número: ":", "=", "de", "em", "igual a", "com" ou só
 * espaço, com "score" e um parêntese opcionais ("NEWS2 (National…): 5",
 * a forma do texto de prontuário das Ferramentas). Comparador ("≥ 2",
 * "acima de 4") não entra: isso é limiar, não valor.
 */
const SEPARATOR = String.raw`(?<sep>(?:\s+[Ss]core)?(?:\s*\([^()\n]{1,60}\))?(?:\s*[:=]\s*|\s+(?:de|em|igual\s+a|com)\s+|\s+))`;
const VALUE = String.raw`(?<value>\d{1,3}(?:[.,]\d{1,2})?)(?![\d.,]?\d)(?![A-Za-zÀ-ÿ])`;
/**
 * Faixa ("0–1", "4 a 6"), limiar ("2 ou mais"), intervalo ("de 1 em 1 hora"),
 * percentual, idade, unidade e tempo logo depois do número: não é o valor do
 * escore.
 */
const NOT_A_VALUE = String.raw`(?!(?:\s*(?:pontos?|pts?\.?))?\s*(?:[-–—]\s*\d|a\s+\d|em\s+\d|ou\s+(?:mais|menos|maior|menor|acima|abaixo)|\+|%|°|anos?\b|mmhg|bpm|irpm|mg\b|kg\b|h\b|horas?\b|min\b|dias?\b|semanas?\b|meses\b|vez(?:es)?\b|x\s*\d))`;
const POINTS = String.raw`(?<points>\s*(?:pontos?|pts?\.?)(?![A-Za-zÀ-ÿ]))?`;
const OUT_OF = String.raw`(?<outOf>\s*\/\s*\d{1,2})?`;

const CITATION_REGEXES = SCORE_CITATIONS.map((entry) => ({
  entry,
  regex: new RegExp(
    `(?<name>${entry.name.source})${SEPARATOR}${VALUE}${NOT_A_VALUE}${POINTS}${OUT_OF}`,
    `${entry.name.flags.replace('g', '')}g`,
  ),
}));

export interface ScoreCitation {
  calculatorId: string;
  label: string;
  /** Do nome ao fim do número ("CURB-65 de 3 pontos", "qSOFA 2/3"). */
  start: number;
  end: number;
  /** O nome como escrito. */
  nameText: string;
  value: number;
  /** Casas decimais escritas ("1,4" → 1). */
  decimals: number;
  valueStart: number;
  valueEnd: number;
  /** "ponto(s)" logo depois do número, para concordar ao corrigir. */
  points: { start: number; end: number; text: string } | null;
}

/** Escores citados com número no texto, em ordem e sem sobreposição. */
export function findScoreCitations(text: string): ScoreCitation[] {
  const found: ScoreCitation[] = [];
  for (const { entry, regex } of CITATION_REGEXES) {
    for (const match of text.matchAll(regex)) {
      const groups = match.groups ?? {};
      const name = groups.name ?? '';
      const sep = groups.sep ?? '';
      const valueText = groups.value ?? '';
      const pointsText = groups.points ?? '';
      const start = match.index ?? 0;
      const valueStart = start + name.length + sep.length;
      const valueEnd = valueStart + valueText.length;
      found.push({
        calculatorId: entry.calculatorId,
        label: entry.label,
        start,
        end: start + match[0].length,
        nameText: name,
        value: Number(valueText.replace(',', '.')),
        decimals: valueText.split(/[.,]/)[1]?.length ?? 0,
        valueStart,
        valueEnd,
        points: pointsText
          ? { start: valueEnd, end: valueEnd + pointsText.length, text: pointsText }
          : null,
      });
    }
  }
  found.sort((left, right) => left.start - right.start || right.end - left.end);
  return found.filter(
    (citation, index) => !found.slice(0, index).some((kept) => citation.start < kept.end),
  );
}

/**
 * Valores de escore que o próprio caso informa: o médico escreveu "Glasgow
 * 13", ou anexou o resultado de uma ferramenta ("CURB-65: 3 pontos"). Com
 * mais de um, vale o último (o texto do caso cresce com as respostas).
 */
export function reportedScores(caseText: string): Map<string, number> {
  const reported = new Map<string, number>();
  for (const citation of findScoreCitations(caseText)) {
    reported.set(citation.calculatorId, citation.value);
  }
  return reported;
}

/**
 * O número citado bate com a referência? Igual, ou arredondado do mesmo
 * jeito que a citação ("1,4" para 1,39). Inteiro citado para valor com
 * casas não bate: "índice de choque 1" esconde se é 1,0 ou 1,4.
 */
export function sameScoreValue(
  citation: Pick<ScoreCitation, 'value' | 'decimals'>,
  reference: number,
): boolean {
  if (Math.abs(citation.value - reference) < 1e-9) return true;
  if (citation.decimals === 0) return false;
  const factor = 10 ** citation.decimals;
  return Math.abs(Math.round(reference * factor) / factor - citation.value) < 1e-9;
}
