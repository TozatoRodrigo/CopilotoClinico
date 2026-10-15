import { z } from 'zod';
import type { CaseUnderstanding } from '../../../shared/contracts/clinical';
import { findDoseMentions } from './dose-detector';
import {
  answerTypeMismatchError,
  ClarifyingQuestionSchema,
  CopilotOutputBaseSchema,
  deadEndError,
  normalize,
  parseModelOutput,
  probabilityLanguageError,
  RecommendationBasisSchema,
  RecommendationCategorySchema,
  RecommendationLayerSchema,
  UNCERTAINTY_REASON_REQUIRED,
  type ValidationResult,
} from './output-validator';

/**
 * F1 — contrato e validador da decisão v2 (ADR-013, Etapa 3).
 *
 * A v2 não pede `preliminary` ao modelo: a camada (`layer`) diz o que depende
 * de dado e a contenção do orquestrador decide o rótulo. Por isso as regras
 * de "blocker ⇒ tudo preliminar" e "red flag crítica ⇒ preliminar" da v1 não
 * existem aqui.
 *
 * Dois níveis de erro:
 * - `errors` (bloqueiam, como na v1): JSON/schema, beco sem saída, linguagem
 *   de probabilidade, tipo de resposta incompatível;
 * - `correctable` (regras da v2): valem UM retry com feedback e, se ainda
 *   falharem, viram aviso — nunca deixam o médico sem resposta (emenda de
 *   10/10/2026 ao ADR-012).
 */

const RecommendationV2Schema = z
  .object({
    action: z.string().min(1),
    rationale: z.string().min(1),
    category: RecommendationCategorySchema.default('therapeutic'),
    layer: RecommendationLayerSchema,
    dependsOn: z.string().nullable(),
    basis: RecommendationBasisSchema,
    citationChunkId: z.string().min(1).nullable(),
    // Mantida para compatibilidade (ordenação, SBAR, auditoria); a UI não mostra.
    confidence: z.number().min(0).max(1),
  })
  // O rótulo final vem da contenção v2; até lá, o preliminar é a camada.
  .transform((recommendation) => ({
    ...recommendation,
    preliminary: recommendation.layer === 'depends',
  }));

const ClarifyingQuestionV2Schema = ClarifyingQuestionSchema.extend({
  // Sem mínimo no schema: pergunta sem `separates` é regra corrigível, não
  // motivo para descartar a resposta inteira.
  separates: z.array(z.string().min(1)),
});

export const CopilotOutputV2Schema = CopilotOutputBaseSchema.extend({
  recommendations: z.array(RecommendationV2Schema),
  clarifyingQuestions: z
    .array(ClarifyingQuestionV2Schema)
    .max(3, 'clarifyingQuestions must contain at most 3 items per turn')
    .default([]),
}).refine(UNCERTAINTY_REASON_REQUIRED.check, {
  message: UNCERTAINTY_REASON_REQUIRED.message,
  path: ['uncertaintyReason'],
});

export type CopilotOutputV2 = z.infer<typeof CopilotOutputV2Schema>;

export interface DecisionV2Context {
  /** Entendimento da Etapa 1; `null` quando ela falhou (as regras que dependem dele não rodam). */
  understanding: CaseUnderstanding | null;
}

export function validateOutputV2(
  rawOutput: string,
  validChunkIds: readonly string[],
  context: DecisionV2Context,
): ValidationResult {
  const parsed = parseModelOutput(rawOutput, CopilotOutputV2Schema);
  if (!parsed.success) return parsed.failure;

  const output = parsed.output;
  const citableIds = new Set(validChunkIds);
  const errors = [
    deadEndError(output),
    probabilityLanguageError(output),
    answerTypeMismatchError(output),
  ].filter((error): error is string => error !== null);

  const correctable = [
    ...dependsWithoutData(output),
    ...sourceWithoutValidCitation(output, citableIds),
    ...modelKnowledgeWithCitation(output),
    ...modelKnowledgeWithDose(output),
    ...questionsWithoutSeparates(output),
    ...(context.understanding ? questionsForKnownData(output, context.understanding) : []),
    ...(context.understanding ? uncoveredCannotMiss(output, context.understanding) : []),
  ];

  return {
    valid: errors.length === 0,
    output,
    errors,
    unfoundedRecommendations: output.recommendations.flatMap((rec, index) =>
      rec.basis === 'source' && !isCitable(rec.citationChunkId, citableIds) ? [index] : [],
    ),
    warnings: [],
    correctable,
  };
}

export function isCitable(
  citationChunkId: string | null,
  citableIds: ReadonlySet<string>,
): boolean {
  return citationChunkId !== null && citableIds.has(citationChunkId);
}

function indexesWhere<T>(items: readonly T[], predicate: (item: T) => boolean): number[] {
  return items.flatMap((item, index) => (predicate(item) ? [index] : []));
}

export function dependsWithoutData(output: CopilotOutputV2): string[] {
  const offending = indexesWhere(
    output.recommendations,
    (rec) => rec.layer === 'depends' && !rec.dependsOn?.trim(),
  );
  if (offending.length === 0) return [];
  return [
    `DEPENDS WITHOUT DATA: recommendations at index ${offending.join(', ')} have "layer": "depends" ` +
      'but no "dependsOn". Name in "dependsOn" the specific data that decides each of them (e.g. ' +
      '"TC de crânio sem contraste sem sangramento"), or move to "now" what is safe under every ' +
      'open hypothesis.',
  ];
}

export function sourceWithoutValidCitation(
  output: CopilotOutputV2,
  citableIds: ReadonlySet<string>,
): string[] {
  const offending = indexesWhere(
    output.recommendations,
    (rec) => rec.basis === 'source' && !isCitable(rec.citationChunkId, citableIds),
  );
  if (offending.length === 0) return [];
  const available = citableIds.size > 0 ? [...citableIds].join(', ') : 'none';
  return [
    `SOURCE WITHOUT VALID CITATION: recommendations at index ${offending.join(', ')} have "basis": ` +
      `"source" but "citationChunkId" is not one of the evidence ids provided (${available}). Cite ` +
      'the id of the excerpt that supports each of them, or use "basis": "model_knowledge" with ' +
      '"citationChunkId": null and no dose. Never invent an id.',
  ];
}

export function modelKnowledgeWithCitation(output: CopilotOutputV2): string[] {
  const offending = indexesWhere(
    output.recommendations,
    (rec) => rec.basis === 'model_knowledge' && rec.citationChunkId !== null,
  );
  if (offending.length === 0) return [];
  return [
    `MODEL KNOWLEDGE WITH CITATION: recommendations at index ${offending.join(', ')} have "basis": ` +
      '"model_knowledge" but a "citationChunkId". Use "basis": "source" when an evidence excerpt ' +
      'supports the action; otherwise set "citationChunkId" to null.',
  ];
}

export function modelKnowledgeWithDose(output: CopilotOutputV2): string[] {
  const offenses = output.recommendations.flatMap((rec, index) => {
    if (rec.basis !== 'model_knowledge') return [];
    const doses = findDoseMentions(`${rec.action} ${rec.rationale}`);
    return doses.length > 0 ? [`index ${index} ("${doses.join('", "')}")`] : [];
  });
  if (offenses.length === 0) return [];
  return [
    `DOSE WITHOUT SOURCE: recommendations ${offenses.join('; ')} state a dose, rate or ` +
      'concentration with "basis": "model_knowledge". Without a cited excerpt, never state a ' +
      'dose: write "dose conforme protocolo institucional", or cite the evidence id that gives ' +
      'the dose with "basis": "source".',
  ];
}

/**
 * `skip`: perguntas que a v3 já removeu da saída (dado já informado) — não
 * vale pedir correção do que o médico nunca vai ver. Os índices continuam os
 * da resposta que o modelo escreveu, que é a que ele vê no retry.
 */
export function questionsWithoutSeparates(
  output: CopilotOutputV2,
  skip: ReadonlySet<number> = new Set(),
): string[] {
  const offending = indexesWhere(
    output.clarifyingQuestions,
    (question) => question.separates.length === 0,
  ).filter((index) => !skip.has(index));
  if (offending.length === 0) return [];
  return [
    `QUESTION WITHOUT SEPARATES: clarifyingQuestions at index ${offending.join(', ')} do not say ` +
      'which open hypotheses the answer separates. Fill "separates" with at least one hypothesis ' +
      '(usually two), or drop a question whose answer does not change the conduct.',
  ];
}

type StructuredData = CaseUnderstanding['structuredData'];

/**
 * Palavras que, numa pergunta, pedem um dado do `structuredData`. Heurística
 * de propósito simples: o pior caso é um retry a mais e, depois dele, um
 * aviso no log. `keyFindings` e `relevantContext` são texto livre e ficam de
 * fora — casar texto livre com texto livre geraria mais ruído que sinal.
 */
const STRUCTURED_FIELD_QUESTIONS: Array<{
  label: string;
  isKnown: (data: StructuredData) => boolean;
  asks: RegExp;
}> = [
  { label: 'idade', isKnown: (data) => data.age !== null, asks: /\bidade\b|quantos anos/ },
  { label: 'sexo', isKnown: (data) => data.sex !== null, asks: /\bsexo\b/ },
  {
    label: 'pressão arterial',
    isKnown: (data) => data.vitals.systolicBp !== null || data.vitals.diastolicBp !== null,
    asks: /pressao arterial|\bpa\b/,
  },
  {
    label: 'frequência cardíaca',
    isKnown: (data) => data.vitals.heartRate !== null,
    asks: /frequencia cardiaca|\bfc\b/,
  },
  {
    label: 'frequência respiratória',
    isKnown: (data) => data.vitals.respiratoryRate !== null,
    asks: /frequencia respiratoria|\bfr\b/,
  },
  {
    label: 'saturação de O2',
    isKnown: (data) => data.vitals.spo2 !== null,
    asks: /saturacao|\bspo2\b/,
  },
  {
    label: 'temperatura',
    isKnown: (data) => data.vitals.temperature !== null,
    asks: /temperatura|\btax\b/,
  },
  {
    label: 'glicemia',
    isKnown: (data) => data.vitals.glucose !== null,
    asks: /glicemia|\bhgt\b|dextro/,
  },
  {
    label: 'início dos sintomas',
    isKnown: (data) => data.onset !== null,
    asks: /\binicio\b|ha quanto tempo|quando (?:comecou|iniciou|iniciaram|comecaram)|tempo de evolucao/,
  },
];

/** Pergunta que pede dado já presente no `structuredData`, com os dados que ela pede. */
export interface KnownDataQuestion {
  index: number;
  labels: string[];
}

/** Dados do `structuredData` que o texto de uma pergunta pede e o caso já informou. */
export function knownDataAskedBy(question: string, structuredData: StructuredData): string[] {
  const text = normalize(question);
  return STRUCTURED_FIELD_QUESTIONS.filter(
    (field) => field.isKnown(structuredData) && field.asks.test(text),
  ).map((field) => field.label);
}

export function findQuestionsForKnownData(
  output: Pick<CopilotOutputV2, 'clarifyingQuestions'>,
  understanding: CaseUnderstanding,
): KnownDataQuestion[] {
  return output.clarifyingQuestions.flatMap((question, index) => {
    const labels = knownDataAskedBy(question.question, understanding.structuredData);
    return labels.length > 0 ? [{ index, labels }] : [];
  });
}

/** Rótulo de cada pergunta nos achados: "index 1 asks for idade, sexo". */
export function describeKnownDataQuestions(questions: readonly KnownDataQuestion[]): string {
  return questions
    .map(({ index, labels }) => `index ${index} asks for ${labels.join(', ')}`)
    .join('; ');
}

function questionsForKnownData(
  output: CopilotOutputV2,
  understanding: CaseUnderstanding,
): string[] {
  const offending = findQuestionsForKnownData(output, understanding);
  if (offending.length === 0) return [];
  return [
    `QUESTION FOR KNOWN DATA: clarifyingQuestions ${describeKnownDataQuestions(offending)}, already given in the ` +
      'case (see structuredData in <case_understanding>). Ask only for data ABSENT from the case, ' +
      'starting from the missingDiscriminators.',
  ];
}

// Palavras que não identificam a hipótese ("AVC isquêmico POR oclusão DE
// grande vaso"); "aguda" e "grave" qualificam, não nomeiam.
const HYPOTHESIS_STOPWORDS = new Set([
  'de',
  'da',
  'do',
  'das',
  'dos',
  'por',
  'com',
  'sem',
  'em',
  'na',
  'no',
  'nas',
  'nos',
  'ou',
  'aguda',
  'agudo',
  'grave',
]);
// Radical de 6 letras: "hemorragia" e "hemorrágico" contam como a mesma hipótese.
const STEM_LENGTH = 6;

function keywordStems(hypothesis: string): string[] {
  return [
    ...new Set(
      normalize(hypothesis)
        .split(/[^a-z0-9]+/)
        .filter((word) => word.length >= 3 && !HYPOTHESIS_STOPWORDS.has(word))
        .map((word) => word.slice(0, STEM_LENGTH)),
    ),
  ];
}

/**
 * Coberta quando pelo menos metade das palavras-chave da hipótese aparece no
 * texto: "Hemorragia intracerebral" é coberta por "AVC hemorrágico",
 * "Hipoglicemia" só por "hipoglicemia".
 */
function isCovered(hypothesis: string, stemsInOutput: ReadonlySet<string>): boolean {
  const stems = keywordStems(hypothesis);
  if (stems.length === 0) return true;
  const found = stems.filter((stem) => stemsInOutput.has(stem)).length;
  return found >= Math.ceil(stems.length / 2);
}

function outputStems(output: CopilotOutputV2): Set<string> {
  const text = [
    output.reasoning,
    ...output.differentials.flatMap((differential) => [
      differential.hypothesis,
      differential.whyConsider,
      differential.whatDistinguishes,
    ]),
    ...output.redFlags.flatMap((redFlag) => [redFlag.finding, redFlag.action]),
  ].join(' ');
  return new Set(
    normalize(text)
      .split(/[^a-z0-9]+/)
      .filter((word) => word.length >= 3)
      .map((word) => word.slice(0, STEM_LENGTH)),
  );
}

export function uncoveredCannotMiss(
  output: CopilotOutputV2,
  understanding: CaseUnderstanding,
): string[] {
  const stems = outputStems(output);
  const missing = understanding.cannotMiss
    .map((item) => item.hypothesis)
    .filter((hypothesis) => !isCovered(hypothesis, stems));
  if (missing.length === 0) return [];
  return [
    `CANNOT-MISS NOT ADDRESSED: the understanding lists ${missing
      .map((hypothesis) => `"${hypothesis}"`)
      .join(', ')} as cannot-miss, but the output never names it. Put each of them in ` +
      '"differentials" (with what distinguishes it) or address it explicitly in "reasoning".',
  ];
}
