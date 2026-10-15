import type {
  CaseToolFacts,
  CaseToolSuggestion,
  CaseToolSuggestions,
  CaseToolTarget,
  CaseUnderstanding,
  PsSyndrome,
} from '../contracts/clinical';
import { normalizeSearchText, TOOLS } from './catalog';
import { INFUSION_DRUGS } from './infusions/drugs';
import { CASE_LINK_PARAM, toolPath, withQuery } from './links';
import { AGE_RANGE } from './pediatrics/weight';
import type { ContentProvenance } from './provenance';
import { WEIGHT_RANGES, type WeightPopulation } from './ranges';
import { getCalculator } from './registry';

/**
 * Ferramenta certa no plano do Copiloto (CC-332): o entendimento do caso
 * (síndrome, sinais vitais, idade, achados e hipóteses, ADR-013/014) e as
 * condutas do plano escolhem, por regra fixa, os roteiros e as calculadoras
 * que abrem já preenchidos com o caso. Nada de IA aqui: a mesma entrada dá
 * sempre a mesma sugestão, e cada regra diz por que existe.
 *
 * O mapeamento é conteúdo clínico: está versionado em
 * `CASE_TOOL_MAPPING_PROVENANCE` e a revisão médica (Dr. Ripardo) decide
 * regra por regra (docs/ferramentas/revisao-clinica/ferramentas-no-plano.md).
 * Mudou uma regra, sobe a versão.
 *
 * Roda na API (o caso inteiro, com a leitura do Copiloto guiado, só existe
 * lá) e devolve só o necessário à tela: as sugestões e os números do caso
 * que preenchem as ferramentas. CC-333 vai reaproveitar `caseToolFacts` para
 * a API calcular o escore citado no plano com o motor.
 */

export const CASE_TOOL_MAPPING_PROVENANCE: ContentProvenance = {
  source: 'Copiloto · síndrome de PS e dados do caso → ferramenta (CC-332)',
  version: '1.0.0',
  updatedAt: '2026-10-15',
  review: { status: 'pendente', assignedTo: 'Dr. Ripardo' },
};

/** Sugestões por plano: mais que isso vira lista, e lista ninguém lê no plantão. */
export const MAX_CASE_TOOL_SUGGESTIONS = 3;

// ── Dados do caso ────────────────────────────────────────────────────────

/** O que a sugestão lê do entendimento do caso. */
export type CaseReading = Pick<
  CaseUnderstanding,
  | 'syndrome'
  | 'syndromeNote'
  | 'problemRepresentation'
  | 'structuredData'
  | 'instability'
  | 'cannotMiss'
  | 'likely'
>;

export interface CaseToolInput {
  reading: CaseReading;
  /**
   * Texto do caso e respostas do médico, já redigidos. Só serve para achar o
   * peso, que o entendimento não estrutura.
   */
  caseText: string;
  /** Condutas do plano (`action`): "plano com droga vasoativa" sai daqui. */
  planActions: readonly string[];
}

/**
 * Faixas plausíveis, as mesmas da conversa do caso (web/src/lib/case-conversation.ts):
 * número fora delas é erro de leitura e não preenche nada.
 */
const PLAUSIBLE: Readonly<
  Record<Exclude<keyof CaseToolFacts, 'sex' | 'weightKg'>, [number, number]>
> = {
  ageYears: [0, 120],
  systolicBp: [20, 300],
  diastolicBp: [10, 200],
  heartRate: [10, 300],
  respiratoryRate: [2, 80],
  spo2: [30, 100],
  temperature: [25, 45],
  glucose: [10, 2000],
};

function plausible(value: number | null | undefined, [min, max]: [number, number]): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max
    ? value
    : null;
}

/** Criança para as Ferramentas: a faixa de idade da Pediatria (0 a 18 anos, exclusive). */
export function isPediatricAge(ageYears: number | null): boolean {
  return ageYears !== null && ageYears < AGE_RANGE.max;
}

export function weightPopulation(ageYears: number | null): WeightPopulation {
  return isPediatricAge(ageYears) ? 'pediatrico' : 'adulto';
}

/**
 * "peso 70 kg", "pesando 72,5 kg", "peso estimado: 18 kg". Exige a palavra
 * peso antes do número: "perdeu 5 kg" e "dose de 0,3 mg/kg" não são peso.
 */
const WEIGHT_MENTION =
  /\b(peso|pesando|pesa)\b([^\d\n]{0,25}?)(\d{1,3}(?:[.,]\d{1,2})?)\s*(kg|quilos?)\b/g;
/** "perda de peso de 5 kg", "ganho de peso"; "peso ideal/predito" (VM) não é o peso do paciente. */
const NOT_BODY_WEIGHT_BEFORE = /(perd|ganh|emagrec|reduc|variac)\w*\s+(de\s+)?$/;
const NOT_BODY_WEIGHT_BETWEEN = /ideal|predito|alvo|seco/;

/**
 * Peso dito no texto do caso. Duas menções diferentes (peso de antes e de
 * agora, dois pacientes no mesmo texto) não decidem: fica sem peso.
 */
export function weightFromText(text: string, ageYears: number | null): number | null {
  const normalized = normalizeSearchText(text);
  const values = new Set<number>();
  for (const match of normalized.matchAll(WEIGHT_MENTION)) {
    const before = normalized.slice(Math.max(0, (match.index ?? 0) - 20), match.index);
    if (NOT_BODY_WEIGHT_BEFORE.test(before) || NOT_BODY_WEIGHT_BETWEEN.test(match[2] ?? '')) {
      continue;
    }
    values.add(Number((match[3] ?? '').replace(',', '.')));
  }
  if (values.size !== 1) return null;
  const [kg] = [...values];
  const range = WEIGHT_RANGES[weightPopulation(ageYears)];
  return kg !== undefined && kg >= range.min && kg <= range.max ? kg : null;
}

/**
 * Os números do caso que preenchem ferramentas: só o que o caso informou e
 * cabe na faixa plausível. Nada é estimado aqui.
 */
export function caseToolFacts(reading: CaseReading, caseText: string): CaseToolFacts {
  const { structuredData } = reading;
  const { vitals } = structuredData;
  const ageYears = plausible(structuredData.age, PLAUSIBLE.ageYears);
  const findingsText = [
    caseText,
    ...structuredData.keyFindings,
    ...structuredData.relevantContext,
  ].join('\n');
  return {
    ageYears,
    sex: structuredData.sex === 'F' || structuredData.sex === 'M' ? structuredData.sex : null,
    weightKg: weightFromText(findingsText, ageYears),
    systolicBp: plausible(vitals.systolicBp, PLAUSIBLE.systolicBp),
    diastolicBp: plausible(vitals.diastolicBp, PLAUSIBLE.diastolicBp),
    heartRate: plausible(vitals.heartRate, PLAUSIBLE.heartRate),
    respiratoryRate: plausible(vitals.respiratoryRate, PLAUSIBLE.respiratoryRate),
    spo2: plausible(vitals.spo2, PLAUSIBLE.spo2),
    temperature: plausible(vitals.temperature, PLAUSIBLE.temperature),
    glucose: plausible(vitals.glucose, PLAUSIBLE.glucose),
  };
}

// ── Sinais que as regras leem ────────────────────────────────────────────

export interface CaseSignals {
  syndrome: PsSyndrome;
  facts: CaseToolFacts;
  /** Hipóteses (graves e prováveis) e a descrição da síndrome, normalizadas. */
  hypotheses: string;
  /** O que aconteceu: representação do problema, achados, instabilidade e contexto. */
  findings: string;
  /** Condutas do plano, normalizadas. */
  plan: string;
}

export function caseSignals(input: CaseToolInput): CaseSignals {
  const { reading } = input;
  const join = (parts: readonly (string | null | undefined)[]) =>
    normalizeSearchText(parts.filter(Boolean).join(' \n '));
  return {
    syndrome: reading.syndrome,
    facts: caseToolFacts(reading, input.caseText),
    hypotheses: join([
      reading.syndromeNote,
      ...reading.cannotMiss.map(({ hypothesis }) => hypothesis),
      ...reading.likely.map(({ hypothesis }) => hypothesis),
    ]),
    findings: join([
      reading.syndromeNote,
      reading.problemRepresentation,
      ...reading.structuredData.keyFindings,
      ...reading.instability.findings,
      ...reading.structuredData.relevantContext,
    ]),
    plan: join(input.planActions),
  };
}

// Padrões sobre texto normalizado (minúsculas, sem acento).

/** "sem hipotensão", "nega febre", "TEP afastado": a menção negada não conta. */
const NEGATION = /\b(sem|nega|negou|negando|nao|ausencia|afast\w*|descart\w*|exclu\w*)\b/;

/**
 * O texto menciona o padrão sem negação logo antes, na mesma frase (até a
 * vírgula anterior): "sem febre, hipotenso" ainda é hipotensão.
 */
export function mentions(pattern: RegExp, text: string): boolean {
  for (const match of text.matchAll(new RegExp(pattern.source, 'g'))) {
    const start = match.index ?? 0;
    const before =
      text
        .slice(Math.max(0, start - 30), start)
        .split(/[.,;:\n]/)
        .at(-1) ?? '';
    if (!NEGATION.test(before)) return true;
  }
  return false;
}

/** Parada no caso. "PCR" sozinho fica de fora: no Brasil também é proteína C-reativa. */
const CARDIAC_ARREST =
  /parada cardio(respiratoria)?|parada cardiaca|\bassistolia\b|\baesp\b|atividade eletrica sem pulso|fibrilacao ventricular|\btv sem pulso\b|taquicardia ventricular sem pulso|\brcp\b|reanimacao cardiopulmonar|\brce\b|retorno da circulacao espontanea/;
const INTUBATION_PLANNED =
  /\biot\b|\bintubacao\b|\bintubar\b|sequencia rapida|\bisr\b|via aerea definitiva|via aerea avancada/;
const ALREADY_INTUBATED = /\bintubad[oa]\b|em ventilacao mecanica|\bem vm\b|\btot\b/;
const PULMONARY_EMBOLISM =
  /\btep\b|tromboembolismo pulmonar|tromboembolia pulmonar|embolia pulmonar/;
const SEPSIS = /\bsepse\b|\bseptic[oa]\b|\bsepsis\b/;
const HYPOTENSION_WORDS = /hipotens|\bchoque\b/;
const DENGUE = /\bdengue\b|arbovirose/;
const HYPERGLYCEMIC_CRISIS =
  /cetoacidose|\bcad\b|estado hiperosmolar|\behh\b|hiperosmolar|crise hiperglicemica/;
const PNEUMONIA = /pneumonia|\bpac\b|broncopneumonia/;
const ACS = /sindrome coronariana|\bsca\b|\biam\b|infarto|angina|isquemia miocardica/;
const AORTIC_DISSECTION = /disseccao (aguda )?d[ae] aorta|disseccao aortica|sindrome aortica aguda/;
const SUBARACHNOID_HEMORRHAGE = /hemorragia subaracnoide|\bhsa\b/;
const APPENDICITIS = /apendicite/;

/**
 * Hipotensão: a síndrome já é febre com hipotensão ou choque, PAS < 90 mmHg
 * ou PAM < 65 mmHg (as metas da sepse), ou o caso diz hipotensão/choque.
 * PAM = (PAS + 2 × PAD) / 3.
 */
function hasHypotension(signals: CaseSignals): boolean {
  if (signals.syndrome === 'febre-hipotensao' || signals.syndrome === 'choque') return true;
  const { systolicBp, diastolicBp } = signals.facts;
  if (systolicBp !== null && systolicBp < 90) return true;
  if (systolicBp !== null && diastolicBp !== null && (systolicBp + 2 * diastolicBp) / 3 < 65) {
    return true;
  }
  return mentions(HYPOTENSION_WORDS, signals.findings);
}

function hasSepsis(signals: CaseSignals): boolean {
  return (
    signals.syndrome === 'febre-hipotensao' ||
    mentions(SEPSIS, signals.hypotheses) ||
    mentions(SEPSIS, signals.findings)
  );
}

/**
 * Critério D da CAD no próprio roteiro (DKA_CRITERIA, cad-ehh/content.ts):
 * glicemia ≥ 200 mg/dL.
 */
export const HYPERGLYCEMIA_MG_DL = 200;

/**
 * Apelidos curtos das Infusões ("vaso", "ne", "dopa", "nitro") são palavras
 * comuns no texto clínico ("oclusão de grande vaso"): só nome e apelido com 6
 * letras ou mais.
 */
const MIN_DRUG_ALIAS_LENGTH = 6;

/**
 * Drogas em infusão contínua que o plano pode citar: vasopressores,
 * inotrópicos e vasodilatadores das Infusões. A adrenalina fica de fora: no
 * PS ela aparece mais em bolus (PCR, anafilaxia IM) do que em bomba.
 */
const VASOACTIVE_DRUGS = INFUSION_DRUGS.filter(
  ({ id, category }) =>
    (category === 'vasopressors' || category === 'vasodilators') && id !== 'adrenalina',
).map(({ id, name, aliases }) => ({
  id,
  pattern: new RegExp(
    `\\b(${[name, ...aliases]
      .map(normalizeSearchText)
      .filter((text) => text.length >= MIN_DRUG_ALIAS_LENGTH)
      .map((text) => text.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&'))
      .join('|')})\\b`,
  ),
}));
const VASOACTIVE_GENERIC = /droga(s)? vasoativa(s)?|\bdva\b|vasopressor/;

/** Droga do plano que abre em Infusões; `grupo` quando o plano só diz "droga vasoativa". */
export function vasoactiveTarget(plan: string): CaseToolTarget | null {
  const drug = VASOACTIVE_DRUGS.find(({ pattern }) => mentions(pattern, plan));
  if (drug) return { kind: 'tool', toolId: 'infusoes', query: { droga: drug.id } };
  if (mentions(VASOACTIVE_GENERIC, plan)) {
    return { kind: 'tool', toolId: 'infusoes', query: { grupo: 'vasopressors' } };
  }
  return null;
}

// ── Regras ───────────────────────────────────────────────────────────────

/**
 * Para quem a ferramenta serve. Roteiro adulto (dose para 40–200 kg, ACLS,
 * ANDROMEDA) não aparece para criança, e a Pediatria não aparece para adulto.
 * Idade não informada conta como adulto: a Pediatria só aparece com idade.
 */
export type CaseToolPopulation = 'adulto' | 'pediatrico' | 'qualquer';

export interface CaseToolRule {
  id: string;
  target: CaseToolTarget | ((signals: CaseSignals) => CaseToolTarget | null);
  population: CaseToolPopulation;
  /** Uma linha, na tela, ao lado do botão: por que esta ferramenta. */
  reason: string;
  /** Por que a regra existe, para a revisão clínica. Não vai para a tela. */
  rationale: string;
  applies: (signals: CaseSignals) => boolean;
}

const tool = (toolId: string, query?: Record<string, string>): CaseToolTarget =>
  query ? { kind: 'tool', toolId, query } : { kind: 'tool', toolId };
const calculator = (calculatorId: string): CaseToolTarget => ({ kind: 'calculator', calculatorId });
const always = () => true;

/**
 * Regras de dado: valem em qualquer síndrome, porque o que as dispara é o
 * dado (parada, IOT, idade, droga no plano), não a apresentação. Em ordem de
 * prioridade: a parada vem antes de tudo.
 */
export const DATA_RULES: readonly CaseToolRule[] = [
  {
    id: 'parada-acls',
    target: tool('acls'),
    population: 'adulto',
    reason: 'Parada cardiorrespiratória ou pós-parada',
    rationale:
      'Roteiro do ACLS (ciclos, adrenalina, choques) e cuidados pós-RCE. Dispara pelo que aconteceu (achados, instabilidade), não por hipótese.',
    applies: (s) => mentions(CARDIAC_ARREST, s.findings),
  },
  {
    id: 'crianca-pediatria',
    target: tool('pediatria'),
    population: 'pediatrico',
    reason: 'Criança: doses, infusões e cenários por peso',
    rationale:
      'Idade abaixo do teto da Pediatria (AGE_RANGE, 18 anos). As doses adultas das outras ferramentas não servem; os cenários pediátricos (PCR, anafilaxia, estado de mal) ficam lá.',
    applies: (s) => isPediatricAge(s.facts.ageYears),
  },
  {
    id: 'iot-via-aerea',
    target: tool('via-aerea'),
    population: 'adulto',
    reason: 'O plano fala em intubação',
    rationale:
      'Plano ou achados com IOT/sequência rápida: intubação em passos, doses por peso e plano de resgate.',
    applies: (s) =>
      !mentions(ALREADY_INTUBATED, s.findings) &&
      (mentions(INTUBATION_PLANNED, s.plan) || mentions(INTUBATION_PLANNED, s.findings)),
  },
  {
    id: 'intubado-vm',
    target: tool('ventilacao-mecanica'),
    population: 'adulto',
    reason: 'Paciente intubado: ajuste da ventilação',
    rationale: 'Já intubado ou em VM: peso predito, volume corrente e mecânica.',
    applies: (s) => mentions(ALREADY_INTUBATED, s.findings),
  },
  {
    id: 'sepse-hipotensao-choque-septico',
    target: tool('choque-septico'),
    population: 'adulto',
    reason: 'Sepse com hipotensão',
    rationale:
      'Suspeita de sepse (síndrome febre com hipotensão, ou sepse nas hipóteses/achados) com PAS < 90, PAM < 65 ou choque descrito: ANDROMEDA-SHOCK 2.',
    applies: (s) => hasSepsis(s) && hasHypotension(s),
  },
  {
    id: 'suspeita-tep',
    target: tool('tep'),
    population: 'adulto',
    reason: 'Suspeita de TEP: Wells, PERC e conduta',
    rationale:
      'TEP entre as hipóteses (graves ou prováveis): o roteiro traz Wells → PERC → D-dímero, estratificação e anticoagulação.',
    applies: (s) => mentions(PULMONARY_EMBOLISM, s.hypotheses),
  },
  {
    id: 'plano-droga-vasoativa',
    target: (s) => vasoactiveTarget(s.plan),
    population: 'adulto',
    reason: 'O plano usa droga em infusão contínua',
    rationale:
      'Vasopressor, inotrópico ou vasodilatador citado no plano: dose ↔ mL/h com o peso do caso.',
    applies: (s) => vasoactiveTarget(s.plan) !== null,
  },
  {
    id: 'crise-hiperglicemica-cad-ehh',
    target: tool('cad-ehh'),
    population: 'adulto',
    reason: 'Suspeita de CAD ou estado hiperosmolar',
    rationale: 'CAD ou EHH nas hipóteses ou nos achados, em qualquer apresentação.',
    applies: (s) =>
      mentions(HYPERGLYCEMIC_CRISIS, s.hypotheses) || mentions(HYPERGLYCEMIC_CRISIS, s.findings),
  },
  {
    id: 'suspeita-dengue',
    target: tool('dengue'),
    population: 'adulto',
    reason: 'Suspeita de dengue: grupo e hidratação',
    rationale:
      'Dengue ou arbovirose nas hipóteses ou nos achados: classificação A–D e hidratação por peso.',
    applies: (s) => mentions(DENGUE, s.hypotheses) || mentions(DENGUE, s.findings),
  },
];

export type SyndromeDecision =
  | { kind: 'ferramentas'; rules: readonly CaseToolRule[] }
  | {
      kind: 'nenhuma';
      /** Por que a apresentação sozinha não pede ferramenta (as regras de dado ainda valem). */
      why: string;
    };

/**
 * Decisão por síndrome de PS: todas as síndromes do catálogo
 * (`PS_SYNDROMES`) têm uma, ferramenta ou nenhuma. O tipo obriga: síndrome
 * nova no catálogo não compila sem decisão aqui.
 */
export const SYNDROME_DECISIONS: Readonly<Record<PsSyndrome, SyndromeDecision>> = {
  'agitacao-psicomotora': {
    kind: 'ferramentas',
    rules: [
      {
        id: 'agitacao-sedacao',
        target: tool('sedacao'),
        population: 'adulto',
        reason: 'Paciente agitado: contenção química e doses',
        rationale: 'O roteiro de Sedação traz o manejo do paciente agitado (SedaPath do ANY).',
        applies: always,
      },
    ],
  },
  cefaleia: {
    kind: 'ferramentas',
    rules: [
      {
        id: 'cefaleia-hsa-ottawa',
        target: calculator('ottawa-hsa'),
        population: 'adulto',
        reason: 'Hemorragia subaracnóidea entre as hipóteses',
        rationale:
          'Regra de Ottawa para HSA quando a HSA está entre as hipóteses. Vale para ≥ 15 anos, alerta, cefaleia não traumática com pico em 1 h.',
        applies: (s) => mentions(SUBARACHNOID_HEMORRHAGE, s.hypotheses),
      },
    ],
  },
  choque: {
    kind: 'ferramentas',
    rules: [
      {
        id: 'choque-indiferenciado',
        target: tool('choque-indiferenciado'),
        population: 'adulto',
        reason: 'Choque sem causa definida: VNERi, gap CO₂ e VTI',
        rationale:
          'Choque sem sinal de sepse. Com sepse, a regra de dado leva ao Choque séptico no lugar.',
        applies: (s) => !hasSepsis(s),
      },
    ],
  },
  'crise-convulsiva': {
    kind: 'nenhuma',
    why: 'Sem roteiro adulto de estado de mal no ANY; na criança, a Pediatria entra pela idade.',
  },
  'deficit-neurologico-focal': {
    kind: 'ferramentas',
    rules: [
      {
        id: 'deficit-focal-nihss',
        target: calculator('nihss'),
        population: 'adulto',
        reason: 'Déficit neurológico focal: gravidade do AVC',
        rationale: 'NIHSS antes da decisão de trombólise e trombectomia.',
        applies: always,
      },
    ],
  },
  'diarreia-vomitos': {
    kind: 'nenhuma',
    why: 'Sem ferramenta específica; na criança, a Pediatria entra pela idade.',
  },
  'disturbio-glicemico': {
    kind: 'ferramentas',
    rules: [
      {
        id: 'hiperglicemia-cad-ehh',
        target: tool('cad-ehh'),
        population: 'adulto',
        reason: 'Hiperglicemia: CAD ou estado hiperosmolar',
        rationale: `Distúrbio glicêmico com glicemia ≥ ${HYPERGLYCEMIA_MG_DL} mg/dL (critério D do roteiro). Hipoglicemia não tem ferramenta.`,
        applies: (s) => s.facts.glucose !== null && s.facts.glucose >= HYPERGLYCEMIA_MG_DL,
      },
    ],
  },
  dispneia: {
    kind: 'nenhuma',
    why: 'A apresentação sozinha não escolhe ferramenta: TEP, intubação e VM entram pelas regras de dado.',
  },
  'dor-abdominal': {
    kind: 'ferramentas',
    rules: [
      {
        id: 'dor-abdominal-apendicite-alvarado',
        target: calculator('alvarado'),
        population: 'qualquer',
        reason: 'Apendicite entre as hipóteses',
        rationale: 'Escore de Alvarado quando a apendicite está entre as hipóteses.',
        applies: (s) => mentions(APPENDICITIS, s.hypotheses),
      },
    ],
  },
  'dor-lombar-flanco': { kind: 'nenhuma', why: 'Sem ferramenta específica.' },
  'dor-toracica': {
    kind: 'ferramentas',
    rules: [
      {
        id: 'dor-toracica-sca-heart',
        target: calculator('heart-score'),
        population: 'adulto',
        reason: 'Síndrome coronariana entre as hipóteses',
        rationale: 'HEART para estratificar dor torácica com suspeita de SCA.',
        applies: (s) => mentions(ACS, s.hypotheses),
      },
      {
        id: 'dor-toracica-disseccao-add-rs',
        target: calculator('add-rs'),
        population: 'adulto',
        reason: 'Dissecção de aorta entre as hipóteses',
        rationale: 'ADD-RS quando a dissecção aguda de aorta está entre as hipóteses.',
        applies: (s) => mentions(AORTIC_DISSECTION, s.hypotheses),
      },
    ],
  },
  febre: {
    kind: 'nenhuma',
    why: 'Sem ferramenta pela febre sozinha: sepse com hipotensão e dengue entram pelas regras de dado.',
  },
  'febre-hipotensao': {
    kind: 'ferramentas',
    rules: [
      {
        id: 'febre-hipotensao-choque-septico',
        target: tool('choque-septico'),
        population: 'adulto',
        reason: 'Febre com hipotensão: choque séptico',
        rationale: 'A própria síndrome é febre com hipotensão: ANDROMEDA-SHOCK 2.',
        applies: always,
      },
    ],
  },
  'infeccao-respiratoria': {
    kind: 'ferramentas',
    rules: [
      {
        id: 'pneumonia-curb65',
        target: calculator('curb65'),
        population: 'adulto',
        reason: 'Pneumonia: gravidade e local de tratamento',
        rationale: 'CURB-65 quando pneumonia (PAC) está entre as hipóteses ou nos achados.',
        applies: (s) => mentions(PNEUMONIA, s.hypotheses) || mentions(PNEUMONIA, s.findings),
      },
    ],
  },
  intoxicacao: {
    kind: 'ferramentas',
    rules: [
      {
        id: 'intoxicacao-toxicologia',
        target: tool('toxicologia'),
        population: 'qualquer',
        reason: 'Intoxicação: toxíndrome, antídoto e dose tóxica',
        rationale: 'Roteiro de intoxicações do ANY (antídotos, descontaminação, CIATox).',
        applies: always,
      },
    ],
  },
  'pele-partes-moles': { kind: 'nenhuma', why: 'Sem ferramenta específica.' },
  'pressao-arterial-elevada': {
    kind: 'nenhuma',
    why: 'Sem escore; vasodilatador em infusão no plano entra pela regra de droga vasoativa.',
  },
  'reacao-alergica': {
    kind: 'nenhuma',
    why: 'Adrenalina IM não pede cálculo no adulto; na criança, a Pediatria (cenário de anafilaxia) entra pela idade.',
  },
  'rebaixamento-consciencia': {
    kind: 'ferramentas',
    rules: [
      {
        id: 'rebaixamento-gcs',
        target: calculator('gcs'),
        population: 'adulto',
        reason: 'Rebaixamento de consciência: Glasgow',
        rationale:
          'Escala de Coma de Glasgow (adulto) para registrar e acompanhar o nível de consciência.',
        applies: always,
      },
    ],
  },
  'sintomas-urinarios': { kind: 'nenhuma', why: 'Sem ferramenta específica.' },
  vertigem: {
    kind: 'ferramentas',
    rules: [
      {
        id: 'vertigem-hints-plus',
        target: calculator('hints-plus'),
        population: 'adulto',
        reason: 'Vertigem: HINTS+ separa central × periférica',
        rationale:
          'HINTS+ na síndrome vestibular aguda (vertigem contínua com nistagmo). Fora dela o exame não vale.',
        applies: always,
      },
    ],
  },
  outro: {
    kind: 'nenhuma',
    why: 'Síndrome fora do catálogo: só as regras de dado.',
  },
};

// ── Sugestão ─────────────────────────────────────────────────────────────

/** Nome da ferramenta como a tela das Ferramentas mostra. */
export function caseToolName(target: CaseToolTarget): string | null {
  if (target.kind === 'calculator') return getCalculator(target.calculatorId)?.name ?? null;
  const entry = TOOLS.find(({ id, status }) => id === target.toolId && status === 'disponivel');
  return entry?.name ?? null;
}

function targetKey(target: CaseToolTarget): string {
  return target.kind === 'calculator'
    ? `calculadora:${target.calculatorId}`
    : `ferramenta:${target.toolId}`;
}

function fitsPopulation(population: CaseToolPopulation, ageYears: number | null): boolean {
  if (population === 'qualquer') return true;
  return (population === 'pediatrico') === isPediatricAge(ageYears);
}

/** Regras na ordem em que são lidas: as de dado (prioridade) e depois as da síndrome. */
export function rulesFor(syndrome: PsSyndrome): readonly CaseToolRule[] {
  const decision = SYNDROME_DECISIONS[syndrome];
  return decision.kind === 'ferramentas' ? [...DATA_RULES, ...decision.rules] : DATA_RULES;
}

/**
 * As ferramentas que o plano sugere para o caso, até
 * `MAX_CASE_TOOL_SUGGESTIONS`, sem repetir ferramenta. Ferramenta que ainda
 * não abre no Copiloto ("em breve") não é sugerida.
 */
export function suggestCaseTools(input: CaseToolInput): CaseToolSuggestions {
  const signals = caseSignals(input);
  const seen = new Set<string>();
  const suggestions: CaseToolSuggestion[] = [];

  for (const rule of rulesFor(signals.syndrome)) {
    if (suggestions.length >= MAX_CASE_TOOL_SUGGESTIONS) break;
    if (!fitsPopulation(rule.population, signals.facts.ageYears) || !rule.applies(signals))
      continue;
    const target = typeof rule.target === 'function' ? rule.target(signals) : rule.target;
    if (!target) continue;
    const name = caseToolName(target);
    const key = targetKey(target);
    if (!name || seen.has(key)) continue;
    seen.add(key);
    suggestions.push({ ruleId: rule.id, target, name, reason: rule.reason });
  }

  return {
    mappingVersion: CASE_TOOL_MAPPING_PROVENANCE.version,
    facts: signals.facts,
    suggestions,
  };
}

/**
 * Endereço da ferramenta sugerida, com o token opaco da ida a partir do caso
 * (`?caso=`). Só o id da ferramenta, o lugar dentro dela e o token: nenhum
 * dado do paciente vai no endereço. O dado vai pela sessão da aba.
 */
export function caseToolHref(target: CaseToolTarget, token: string): string {
  const path =
    target.kind === 'calculator'
      ? `/ferramentas/calculadoras/${target.calculatorId}`
      : toolPath(target.toolId);
  const query = target.kind === 'tool' ? (target.query ?? {}) : {};
  return withQuery(path, { ...query, [CASE_LINK_PARAM]: token });
}
