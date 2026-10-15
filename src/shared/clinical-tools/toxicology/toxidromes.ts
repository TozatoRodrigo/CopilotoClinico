import { DISQUE_INTOXICACAO } from './ciatox';
import { toxChartSourceLine } from './provenance';

/**
 * Identificação de toxíndrome (CC-323): a árvore de 11 perguntas do ToxPath
 * do ANY, que termina numa de 8 toxíndromes. Perguntas, opções, destinos e
 * textos iguais aos do ANY, só com acentuação corrigida; os ids das
 * perguntas são os de lá (1 a 20, com buracos), para o teste diferencial
 * andar pela mesma árvore.
 */

export const TOXIDROME_IDS = [
  'simpaticomimetico',
  'anticolinergico',
  'opioide',
  'sedativo',
  'colinergico',
  'serotoninergico',
  'misto',
  'normal',
] as const;

export type ToxidromeId = (typeof TOXIDROME_IDS)[number];

/** Seta do sinal vital no ANY: aumentado, diminuído ou sem desvio. */
export type VitalTrend = 'up' | 'down' | 'normal';

export interface VitalSign {
  value: string;
  trend: VitalTrend;
}

/** Ordem e rótulo das linhas do "Padrão de sinais vitais", como no ANY. */
export const VITAL_SIGN_LABELS = {
  consciencia: 'Consciência',
  fc: 'FC',
  pa: 'PA',
  fr: 'FR',
  temp: 'Temperatura',
  pupilas: 'Pupilas',
  pele: 'Pele',
} as const;

export type VitalSignKey = keyof typeof VITAL_SIGN_LABELS;

export interface Toxidrome {
  id: ToxidromeId;
  name: string;
  /** "Sinais esperados". */
  signs: readonly string[];
  vitals: Readonly<Record<VitalSignKey, VitalSign>>;
  /** "Agentes possíveis". */
  agents: string;
  /** "Recomendações terapêuticas": o próximo passo que o ANY mostra. */
  treatment: string;
}

export const QUESTION_IDS = [1, 2, 3, 4, 5, 6, 8, 10, 11, 12, 20] as const;
export type ToxidromeQuestionId = (typeof QUESTION_IDS)[number];

/** Opção de resposta: leva a outra pergunta ou fecha numa toxíndrome. */
export type ToxidromeOption = { label: string; value: string } & (
  | { next: ToxidromeQuestionId; result?: never }
  | { result: ToxidromeId; next?: never }
);

export interface ToxidromeQuestion {
  id: ToxidromeQuestionId;
  text: string;
  hint: string;
  options: readonly ToxidromeOption[];
}

export const TOXIDROME_QUESTIONS: readonly ToxidromeQuestion[] = [
  {
    id: 1,
    text: 'O paciente está agitado ou com alteração do nível de consciência?',
    hint: 'Avalie se há excitação psicomotora, confusão, letargia ou coma',
    options: [
      { label: 'Agitado', value: 'agitado', next: 2 },
      { label: 'Rebaixado', value: 'rebaixado', next: 10 },
      { label: 'Normal', value: 'normal', next: 20 },
    ],
  },
  {
    id: 2,
    text: 'Como estão as pupilas?',
    hint: 'Observe tamanho e reatividade pupilar',
    options: [
      { label: 'Midríase (dilatadas)', value: 'midriase', next: 3 },
      { label: 'Miose (contraídas)', value: 'miose', next: 8 },
      { label: 'Normais', value: 'normais', next: 6 },
    ],
  },
  {
    id: 3,
    text: 'A pele está úmida (diaforética) ou seca?',
    hint: 'Palpe axilas, testa, tórax',
    options: [
      { label: 'Úmida/Diaforética', value: 'umida', next: 4 },
      { label: 'Seca e quente', value: 'seca', next: 5 },
      { label: 'Normal', value: 'normal', next: 4 },
    ],
  },
  {
    id: 4,
    text: 'Há hiperreflexia, tremores ou clonus?',
    hint: 'Especialmente em membros inferiores',
    options: [
      { label: 'Sim', value: 'sim', result: 'serotoninergico' },
      { label: 'Não', value: 'nao', result: 'simpaticomimetico' },
    ],
  },
  {
    id: 5,
    text: 'Há diminuição de ruídos hidroaéreos, retenção urinária ou mucosas secas?',
    hint: 'Ausculte abdome, pergunte sobre diurese',
    options: [
      { label: 'Sim', value: 'sim', result: 'anticolinergico' },
      { label: 'Não', value: 'nao', result: 'simpaticomimetico' },
    ],
  },
  {
    id: 6,
    text: 'Há sinais de excitação simpática? (taquicardia, hipertensão, sudorese)',
    hint: 'Verifique FC > 100, PA elevada',
    options: [
      { label: 'Sim', value: 'sim', next: 4 },
      { label: 'Não', value: 'nao', result: 'misto' },
    ],
  },
  {
    id: 8,
    text: 'Há bradicardia e hipersecreção? (sialorreia, broncorreia, lacrimejamento)',
    hint: 'Sinais colinérgicos clássicos',
    options: [
      { label: 'Sim', value: 'sim', result: 'colinergico' },
      { label: 'Não', value: 'nao', result: 'misto' },
    ],
  },
  {
    id: 10,
    text: 'Como estão as pupilas?',
    hint: 'Observe tamanho e reatividade pupilar',
    options: [
      { label: 'Miose puntiforme', value: 'miose', next: 11 },
      { label: 'Midríase ou normais', value: 'midriase', next: 12 },
    ],
  },
  {
    id: 11,
    text: 'Há depressão respiratória (FR < 12 ou apneia)?',
    hint: 'Conte frequência respiratória por 1 minuto',
    options: [
      { label: 'Sim', value: 'sim', result: 'opioide' },
      { label: 'Não', value: 'nao', next: 12 },
    ],
  },
  {
    id: 12,
    text: 'Há hipersecreção brônquica, sialorreia, fasciculações musculares?',
    hint: 'Sinais colinérgicos típicos de organofosforados',
    options: [
      { label: 'Sim', value: 'sim', result: 'colinergico' },
      { label: 'Não', value: 'nao', result: 'sedativo' },
    ],
  },
  {
    id: 20,
    text: 'Há algum sinal ou sintoma sugestivo de intoxicação?',
    hint: 'Náuseas, vômitos, alterações de ECG, distúrbios metabólicos',
    options: [
      { label: 'Sim, investigar', value: 'sim', result: 'misto' },
      { label: 'Não, paciente estável', value: 'nao', result: 'normal' },
    ],
  },
];

export const TOXIDROMES: Readonly<Record<ToxidromeId, Toxidrome>> = {
  simpaticomimetico: {
    id: 'simpaticomimetico',
    name: 'Simpaticomiméticos',
    signs: ['Midríase', 'Taquicardia', 'Hipertensão', 'Hipertermia', 'Diaforese', 'Agitação'],
    vitals: {
      consciencia: { value: 'Agitação/Delirium', trend: 'up' },
      fc: { value: 'Aumentada', trend: 'up' },
      pa: { value: 'Aumentada', trend: 'up' },
      fr: { value: 'Aumentada', trend: 'up' },
      temp: { value: 'Hipertermia', trend: 'up' },
      pupilas: { value: 'Midríase', trend: 'up' },
      pele: { value: 'Úmida', trend: 'normal' },
    },
    agents:
      'Cocaína, anfetaminas, metanfetamina, efedrina, pseudoefedrina, cafeína, teofilina, MDMA (ecstasy), catinonas sintéticas',
    treatment: 'Considere suporte + benzodiazepínicos para agitação',
  },
  anticolinergico: {
    id: 'anticolinergico',
    name: 'Anticolinérgico',
    signs: [
      'Midríase',
      'Taquicardia',
      'Pele seca e quente',
      'Retenção urinária',
      'Diminuição de RHA',
      'Mucosas secas',
    ],
    vitals: {
      consciencia: { value: 'Agitação/Delirium', trend: 'up' },
      fc: { value: 'Taquicardia', trend: 'up' },
      pa: { value: 'Normal ou aumentada', trend: 'normal' },
      fr: { value: 'Aumentada', trend: 'up' },
      temp: { value: 'Hipertermia', trend: 'up' },
      pupilas: { value: 'Midríase', trend: 'up' },
      pele: { value: 'Seca, quente, ruborizada', trend: 'up' },
    },
    agents:
      'Anti-histamínicos (difenidramina), antidepressivos tricíclicos, atropina, escopolamina, antipsicóticos, ciclobenzaprina, plantas (Datura/trombeteira)',
    treatment: 'Fisostigmina (não disponível) — considere benzodiazepínicos',
  },
  opioide: {
    id: 'opioide',
    name: 'Opioide',
    signs: [
      'Miose puntiforme',
      'Depressão respiratória',
      'Rebaixamento de consciência',
      'Hipotensão',
      'Bradicardia',
    ],
    vitals: {
      consciencia: { value: 'Sedação/Coma', trend: 'down' },
      fc: { value: 'Diminuída ou normal', trend: 'down' },
      pa: { value: 'Hipotensão', trend: 'down' },
      fr: { value: 'Bradipneia/Apneia', trend: 'down' },
      temp: { value: 'Diminuída ou normal', trend: 'down' },
      pupilas: { value: 'Miose puntiforme', trend: 'down' },
      pele: { value: 'Variável', trend: 'normal' },
    },
    agents:
      'Morfina, fentanil, heroína, metadona, oxicodona, codeína, tramadol, loperamida (doses altas)',
    treatment: 'Considere NALOXONA — Disponível',
  },
  sedativo: {
    id: 'sedativo',
    name: 'Sedativo-hipnótico',
    signs: ['Rebaixamento de consciência', 'Hipotensão', 'Hipotermia', 'Hiporreflexia', 'Ataxia'],
    vitals: {
      consciencia: { value: 'Sedação/Coma', trend: 'down' },
      fc: { value: 'Diminuída ou normal', trend: 'down' },
      pa: { value: 'Diminuída ou normal', trend: 'down' },
      fr: { value: 'Diminuída ou normal', trend: 'down' },
      temp: { value: 'Hipotermia', trend: 'down' },
      pupilas: { value: 'Variável', trend: 'normal' },
      pele: { value: 'Variável', trend: 'normal' },
    },
    agents:
      'Benzodiazepínicos, barbitúricos, etanol, zolpidem, GHB, baclofeno, gabapentina, pregabalina',
    treatment:
      'Flumazenil (BZD) — uso restrito, risco de convulsão. Considere apenas em casos selecionados',
  },
  colinergico: {
    id: 'colinergico',
    name: 'Colinérgico',
    signs: [
      'Miose',
      'Bradicardia',
      'Sialorreia',
      'Broncorreia',
      'Lacrimejamento',
      'Diarreia',
      'Incontinência',
      'Fasciculações',
    ],
    vitals: {
      consciencia: { value: 'Confusão/Coma', trend: 'down' },
      fc: { value: 'Bradicardia', trend: 'down' },
      pa: { value: 'Diminuída ou normal', trend: 'down' },
      fr: { value: 'Variável', trend: 'normal' },
      temp: { value: 'Normal', trend: 'normal' },
      pupilas: { value: 'Miose', trend: 'down' },
      pele: { value: 'Úmida/Diaforética', trend: 'normal' },
    },
    agents: 'Organofosforados, carbamatos, fisostigmina, pilocarpina, nicotina, agentes nervosos',
    treatment: 'Considere ATROPINA — Disponível (Pralidoxima NÃO disponível)',
  },
  serotoninergico: {
    id: 'serotoninergico',
    name: 'Serotoninérgico',
    signs: [
      'Agitação',
      'Hipertermia',
      'Diaforese',
      'Midríase',
      'Tremor',
      'Hiperreflexia',
      'Clonus',
      'Rigidez',
    ],
    vitals: {
      consciencia: { value: 'Agitação/Confusão', trend: 'up' },
      fc: { value: 'Taquicardia', trend: 'up' },
      pa: { value: 'Hipertensão', trend: 'up' },
      fr: { value: 'Taquipneia', trend: 'up' },
      temp: { value: 'Hipertermia grave', trend: 'up' },
      pupilas: { value: 'Midríase', trend: 'up' },
      pele: { value: 'Úmida/Ruborizada', trend: 'up' },
    },
    agents:
      'ISRS + IMAO, ISRS + tramadol, ISRS + triptanos, linezolida + ISRS, meperidina + IMAO, dextrometorfano + ISRS',
    treatment:
      'Considere suporte + benzodiazepínicos + ciproeptadina (se disponível) + resfriamento',
  },
  misto: {
    id: 'misto',
    name: 'Apresentação mista/atípica',
    signs: ['Achados não característicos', 'Possível poli-intoxicação', 'Evolução atípica'],
    vitals: {
      consciencia: { value: 'Variável', trend: 'normal' },
      fc: { value: 'Variável', trend: 'normal' },
      pa: { value: 'Variável', trend: 'normal' },
      fr: { value: 'Variável', trend: 'normal' },
      temp: { value: 'Variável', trend: 'normal' },
      pupilas: { value: 'Variável', trend: 'normal' },
      pele: { value: 'Variável', trend: 'normal' },
    },
    agents:
      'Considerar: poli-intoxicação, intoxicação em evolução, agentes atípicos, metais pesados, álcoois tóxicos, salicilatos, paracetamol',
    treatment: 'Recomenda-se investigação com exames complementares — considere contatar CIATox',
  },
  normal: {
    id: 'normal',
    name: 'Sem toxíndrome evidente',
    signs: ['Paciente estável', 'Sem achados sugestivos'],
    vitals: {
      consciencia: { value: 'Normal', trend: 'normal' },
      fc: { value: 'Normal', trend: 'normal' },
      pa: { value: 'Normal', trend: 'normal' },
      fr: { value: 'Normal', trend: 'normal' },
      temp: { value: 'Normal', trend: 'normal' },
      pupilas: { value: 'Normais', trend: 'normal' },
      pele: { value: 'Normal', trend: 'normal' },
    },
    agents:
      'Se história positiva para ingestão, considerar observação de 4-6h. Dosar paracetamol e salicilatos se ingestão intencional.',
    treatment: 'Considere observação clínica — avaliar necessidade de descontaminação',
  },
};

const QUESTION_BY_ID = new Map(TOXIDROME_QUESTIONS.map((question) => [question.id, question]));

function question(id: ToxidromeQuestionId): ToxidromeQuestion {
  const found = QUESTION_BY_ID.get(id);
  if (!found) throw new Error(`Pergunta ${id} não existe na árvore de toxíndromes.`);
  return found;
}

// ---- Estado do roteiro -------------------------------------------------------------------

export interface ToxidromeAnswer {
  questionId: ToxidromeQuestionId;
  value: string;
}

/** O roteiro é só a lista de respostas; pergunta atual e resultado saem dela. */
export interface ToxidromeFlowState {
  answers: readonly ToxidromeAnswer[];
}

export type ToxidromeFlowAction =
  | { type: 'answer'; value: string }
  | { type: 'back' }
  | { type: 'restart' };

export const INITIAL_TOXIDROME_FLOW: ToxidromeFlowState = { answers: [] };

export type ToxidromeStep =
  | {
      kind: 'question';
      question: ToxidromeQuestion;
      /** "Pergunta N": quantas já foram respondidas + 1. */
      number: number;
    }
  | { kind: 'result'; toxidrome: Toxidrome };

/** Uma resposta já dada, com o texto da pergunta e da opção (resumo e prontuário). */
export interface AnsweredQuestion {
  question: ToxidromeQuestion;
  option: ToxidromeOption;
}

interface Walk {
  step: ToxidromeStep;
  answered: readonly AnsweredQuestion[];
}

/**
 * Anda pela árvore desde a pergunta 1 com as respostas dadas. Resposta que
 * não cabe na pergunta da vez é erro de programação: o reducer nunca a grava.
 */
function walk(state: ToxidromeFlowState): Walk {
  let current = question(1);
  const answered: AnsweredQuestion[] = [];
  for (const [index, answer] of state.answers.entries()) {
    const option = current.options.find(({ value }) => value === answer.value);
    if (answer.questionId !== current.id || !option) {
      throw new Error(`Resposta ${index + 1} não cabe na pergunta ${current.id}.`);
    }
    answered.push({ question: current, option });
    if (option.result !== undefined) {
      if (index !== state.answers.length - 1) {
        throw new Error('Há respostas depois do resultado da árvore de toxíndromes.');
      }
      return { step: { kind: 'result', toxidrome: TOXIDROMES[option.result] }, answered };
    }
    current = question(option.next);
  }
  return { step: { kind: 'question', question: current, number: answered.length + 1 }, answered };
}

export function toxidromeStep(state: ToxidromeFlowState): ToxidromeStep {
  return walk(state).step;
}

export function toxidromeAnswers(state: ToxidromeFlowState): readonly AnsweredQuestion[] {
  return walk(state).answered;
}

/**
 * Barra de progresso do ANY: cada resposta vale 20% (a árvore mais longa tem
 * 5 perguntas), sem passar de 95% antes do resultado.
 */
export function toxidromeProgress(state: ToxidromeFlowState): number {
  const done = toxidromeStep(state).kind === 'result';
  return Math.min((state.answers.length / 5) * 100, done ? 100 : 95);
}

/** Reducer puro do roteiro (a tela usa com `useReducer`). */
export function toxidromeFlowReducer(
  state: ToxidromeFlowState,
  action: ToxidromeFlowAction,
): ToxidromeFlowState {
  switch (action.type) {
    case 'answer': {
      const step = toxidromeStep(state);
      if (step.kind !== 'question') return state;
      const option = step.question.options.find(({ value }) => value === action.value);
      if (!option) return state;
      return { answers: [...state.answers, { questionId: step.question.id, value: option.value }] };
    }
    case 'back':
      return state.answers.length === 0 ? state : { answers: state.answers.slice(0, -1) };
    case 'restart':
      return INITIAL_TOXIDROME_FLOW;
  }
}

/**
 * Texto para o prontuário quando a árvore termina: a toxíndrome provável, o
 * caminho de respostas e o próximo passo. Sem dado de paciente.
 */
export function buildToxidromeChartNote(state: ToxidromeFlowState): string | null {
  const { step, answered } = walk(state);
  if (step.kind !== 'result') return null;
  const { toxidrome } = step;
  return [
    `Toxicologia — possível toxíndrome: ${toxidrome.name}.`,
    ...answered.map(({ question: asked, option }) => `- ${asked.text} ${option.label}`),
    `Sinais esperados: ${toxidrome.signs.join(', ')}.`,
    `Agentes possíveis: ${toxidrome.agents}.`,
    `Sugestão: ${toxidrome.treatment}. Disque-Intoxicação: ${DISQUE_INTOXICACAO.phone}.`,
    toxChartSourceLine(),
  ].join('\n');
}
