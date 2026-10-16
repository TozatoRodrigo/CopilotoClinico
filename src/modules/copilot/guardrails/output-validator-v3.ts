import {
  answerTypeMismatchError,
  deadEndError,
  parseModelOutput,
  probabilityLanguageError,
  type ValidationResult,
} from './output-validator';
import {
  CopilotOutputV2Schema,
  CopilotOutputV2WhySchema,
  dependsWithoutData,
  describeKnownDataQuestions,
  findQuestionsForKnownData,
  isCitable,
  modelKnowledgeWithCitation,
  modelKnowledgeWithDose,
  questionsWithoutSeparates,
  sourceWithoutValidCitation,
  uncoveredCannotMiss,
  type CopilotOutputV2,
  type DecisionV2Context,
  type KnownDataQuestion,
} from './output-validator-v2';
import { checkWhyLines } from './why-line';

/**
 * Validador da decisão v3 (emenda de 11/10/2026 ao ADR-013). Mesmo contrato
 * de saída da v2 (`CopilotOutputV2Schema`); muda o peso de cada regra.
 *
 * No experimento de 11/10/2026, 41% das análises v2 fizeram uma 2ª chamada
 * (cerca de +27 s). As causas, em ordem: hipótese grave não citada, pergunta
 * sobre dado já informado e linguagem de probabilidade — e esta última chegou
 * a bloquear uma resposta inteira (kb001-pc-002: o médico ficou sem nada).
 * Por isso, na v3:
 *
 * - `errors` (bloqueiam): só JSON/schema, beco sem saída e tipo de resposta
 *   incompatível — o que deixa a resposta inutilizável;
 * - `correctable` (um retry com feedback e, se persistir, aviso): linguagem de
 *   probabilidade e as regras corrigíveis da v2, menos as duas abaixo;
 * - pergunta sobre dado já presente no `structuredData`: correção
 *   determinística, sem retry — a pergunta sai da resposta e vira aviso;
 * - hipótese grave não citada e passar dos tetos da v3: só aviso. O card "O
 *   que eu entendi" já mostra ao médico todas as hipóteses graves.
 *
 * CC-601 — com `COPILOT_WHY_LINE`, o contrato ganha a linha de "por quê" e
 * as regras dela (why-line.ts), que nunca pedem um retry sozinhas.
 */

/** Tetos da v3 (regras 3 e 5 do prompt). O schema mantém o teto rígido de 3 perguntas da v2. */
export const DECISION_V3_LIMITS = { clarifyingQuestions: 2, now: 6, depends: 5 } as const;

export interface DecisionV3Context extends DecisionV2Context {
  /** CC-601 — `COPILOT_WHY_LINE` efetiva neste turno; ausente = desligada. */
  whyLine?: boolean;
}

export function validateOutputV3(
  rawOutput: string,
  validChunkIds: readonly string[],
  context: DecisionV3Context,
): ValidationResult {
  const parsed = context.whyLine
    ? parseModelOutput(rawOutput, CopilotOutputV2WhySchema)
    : parseModelOutput(rawOutput, CopilotOutputV2Schema);
  if (!parsed.success) return parsed.failure;

  // `written` é a resposta como o modelo a escreveu: os achados citam os
  // índices dela, que é a que ele vê num eventual retry. `output` é a que segue
  // para o médico, já sem as perguntas sobre dado informado e sem as linhas de
  // "por quê" acima do teto.
  const written: CopilotOutputV2 = parsed.output;
  const knownData = context.understanding
    ? findQuestionsForKnownData(written, context.understanding)
    : [];
  const known = dropQuestionsForKnownData(written, knownData);
  const whyLines = context.whyLine
    ? checkWhyLines(known.output)
    : { output: known.output, findings: [] };
  const { output } = whyLines;
  const { removed, warning } = known;
  const citableIds = new Set(validChunkIds);

  const errors = [deadEndError(output), answerTypeMismatchError(written, removed)].filter(
    (error): error is string => error !== null,
  );

  const probabilityLanguage = probabilityLanguageError(written);
  const correctable = [
    ...(probabilityLanguage ? [probabilityLanguage] : []),
    ...dependsWithoutData(written),
    ...sourceWithoutValidCitation(written, citableIds),
    ...modelKnowledgeWithCitation(written),
    ...modelKnowledgeWithDose(written),
    ...questionsWithoutSeparates(written, removed),
  ];
  // A linha de "por quê" só pega carona num retry que já vai acontecer.
  const retrying = errors.length > 0 || correctable.length > 0;

  const warnings = [
    ...(warning ? [warning] : []),
    ...(context.understanding ? uncoveredCannotMiss(written, context.understanding) : []),
    ...overTheLimits(output),
    ...(retrying ? [] : whyLines.findings),
  ];

  return {
    valid: errors.length === 0,
    output,
    errors,
    unfoundedRecommendations: output.recommendations.flatMap((rec, index) =>
      rec.basis === 'source' && !isCitable(rec.citationChunkId, citableIds) ? [index] : [],
    ),
    warnings,
    correctable: retrying ? [...correctable, ...whyLines.findings] : correctable,
  };
}

interface KnownDataCorrection {
  output: CopilotOutputV2;
  /** Índices, na resposta do modelo, das perguntas removidas. */
  removed: ReadonlySet<number>;
  warning: string | null;
}

/**
 * Pergunta sobre dado que o caso já informa sai da resposta, sem retry: um
 * retry custa cerca de 27 s de plantão para tirar uma pergunta que o código
 * tira sozinho. Exceção: se tirá-las deixaria a resposta sem recomendação e
 * sem pergunta (beco sem saída), elas ficam — o médico precisa de um próximo
 * passo — e o achado vira só aviso.
 */
function dropQuestionsForKnownData(
  output: CopilotOutputV2,
  knownData: readonly KnownDataQuestion[],
): KnownDataCorrection {
  if (knownData.length === 0) return { output, removed: new Set(), warning: null };

  const removed = new Set(knownData.map((question) => question.index));
  const remaining = output.clarifyingQuestions.filter((_, index) => !removed.has(index));
  const described = describeKnownDataQuestions(knownData);

  if (remaining.length === 0 && output.recommendations.length === 0) {
    return {
      output,
      removed: new Set(),
      warning:
        `QUESTION FOR KNOWN DATA KEPT: clarifyingQuestions ${described}, already given in the ` +
        'case (structuredData); kept because removing it would leave the physician with no next step.',
    };
  }
  return {
    output: { ...output, clarifyingQuestions: remaining },
    removed,
    warning:
      `QUESTION FOR KNOWN DATA REMOVED: clarifyingQuestions ${described}, already given in the ` +
      'case (structuredData); removed from the output without a retry.',
  };
}

/** Passar dos tetos da v3 só vira aviso: cortar condutas ou perguntas seria decidir pelo médico. */
function overTheLimits(output: CopilotOutputV2): string[] {
  const questions = output.clarifyingQuestions.length;
  const now = output.recommendations.filter((rec) => rec.layer === 'now').length;
  const depends = output.recommendations.filter((rec) => rec.layer === 'depends').length;
  const limits = DECISION_V3_LIMITS;
  return [
    questions > limits.clarifyingQuestions
      ? `OVER THE QUESTION LIMIT: ${questions} clarifyingQuestions; v3 allows at most ${limits.clarifyingQuestions}.`
      : null,
    now > limits.now
      ? `OVER THE "NOW" LIMIT: ${now} recommendations in "now"; v3 allows at most ${limits.now}.`
      : null,
    depends > limits.depends
      ? `OVER THE "DEPENDS" LIMIT: ${depends} recommendations in "depends"; v3 allows at most ${limits.depends}.`
      : null,
  ].filter((warning): warning is string => warning !== null);
}
