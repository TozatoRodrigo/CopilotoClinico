import { z } from 'zod';

export const RecommendationCategorySchema = z.enum([
  'stabilization',
  'diagnostic',
  'therapeutic',
  'verify',
]);

export const RedFlagSeveritySchema = z.enum(['critical', 'high', 'moderate']);

export const RedFlagSchema = z.object({
  finding: z.string().min(1),
  severity: RedFlagSeveritySchema,
  action: z.string().min(1),
});

const RecommendationSchema = z.object({
  action: z.string().min(1),
  rationale: z.string().min(1),
  citationChunkId: z.string().min(1),
  confidence: z.number().min(0).max(1),
  preliminary: z.boolean().default(false),
  category: RecommendationCategorySchema.default('therapeutic'),
});

const ClarifyingQuestionSchema = z.object({
  id: z.string().min(1),
  question: z.string().min(1),
  why: z.string().min(1),
  criticality: z.enum(['blocker', 'important', 'optional']),
  expectedAnswerType: z.enum(['boolean', 'choice', 'number', 'text']),
  choices: z.array(z.string()).optional(),
  // UX-01 — finalidade clínica para agrupar na UI (ex: "Estabilidade
  // hemodinâmica"). Opcional: modelos mais fracos ou turnos antigos podem
  // não preencher — o front degrada para lista simples nesse caso.
  purpose: z.string().optional(),
});

const DifferentialSchema = z.object({
  hypothesis: z.string().min(1),
  whyConsider: z.string().min(1),
  whatDistinguishes: z.string().min(1),
  // PI-03 — "não pode perder": mesmo bar de um red flag "critical" (risco
  // de morte/dano irreversível em minutos a horas). Default false para
  // outputs antigos/modelos mais fracos que não preencham o campo.
  cannotMiss: z.boolean().default(false),
  // Só faz sentido junto de cannotMiss=true; janela qualitativa, nunca
  // número ou percentual — ver PROBABILITY_LANGUAGE_PATTERN abaixo.
  timeToHarm: z.enum(['minutos', 'horas', 'dias']).optional(),
});

export const CopilotOutputSchema = z
  .object({
    reasoning: z.string().min(1),
    redFlags: z.array(RedFlagSchema).default([]),
    recommendations: z.array(RecommendationSchema).min(0),
    uncertainty: z.boolean(),
    uncertaintyReason: z.string().nullable(),
    differentials: z.array(DifferentialSchema).max(3).default([]),
    clarifyingQuestions: z
      .array(ClarifyingQuestionSchema)
      .max(3, 'clarifyingQuestions must contain at most 3 items per turn')
      .default([]),
  })
  .refine(
    (data) =>
      !data.uncertainty || (data.uncertaintyReason !== null && data.uncertaintyReason.length > 0),
    {
      message: 'uncertaintyReason is required and must be non-empty when uncertainty is true',
      path: ['uncertaintyReason'],
    },
  )
  .refine(
    (data) => {
      const hasBlocker = data.clarifyingQuestions.some((q) => q.criticality === 'blocker');
      if (!hasBlocker) return true;
      return (
        data.recommendations.length === 0 || data.recommendations.every((rec) => rec.preliminary)
      );
    },
    {
      message:
        'When clarifyingQuestions contains a blocker item, recommendations must be empty or all marked as preliminary',
      path: ['recommendations'],
    },
  )
  .refine(
    (data) => {
      const hasCriticalRedFlag = data.redFlags.some((rf) => rf.severity === 'critical');
      if (!hasCriticalRedFlag) return true;
      return data.recommendations.every(
        (rec) => rec.category === 'stabilization' || rec.preliminary,
      );
    },
    {
      message:
        'When redFlags contains a critical severity item, non-stabilization recommendations must be preliminary',
      path: ['redFlags'],
    },
  );

export type CopilotOutput = z.infer<typeof CopilotOutputSchema>;

export interface ValidationResult {
  valid: boolean;
  output: CopilotOutput | null;
  errors: string[];
  unfoundedRecommendations: number[];
}

export function validateOutput(rawOutput: string, validChunkIds: string[]): ValidationResult {
  const errors: string[] = [];

  let parsed: unknown;
  try {
    const cleaned = rawOutput
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim();
    parsed = JSON.parse(cleaned);
  } catch {
    return {
      valid: false,
      output: null,
      errors: ['Output is not valid JSON'],
      unfoundedRecommendations: [],
    };
  }

  const schemaResult = CopilotOutputSchema.safeParse(parsed);
  if (!schemaResult.success) {
    const fieldErrors = schemaResult.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`);
    return {
      valid: false,
      output: null,
      errors: ['Schema validation failed', ...fieldErrors],
      unfoundedRecommendations: [],
    };
  }

  const output = schemaResult.data;
  const chunkIdSet = new Set(validChunkIds);
  const unfoundedRecommendations: number[] = [];

  output.recommendations.forEach((rec, index) => {
    if (!chunkIdSet.has(rec.citationChunkId)) {
      unfoundedRecommendations.push(index);
    }
  });

  if (allRecommendationsUnfounded(output, validChunkIds) && output.recommendations.length > 0) {
    errors.push('All recommendations have unfounded citations — no valid chunk IDs found');
  }

  // CC-02 — "beco sem saída": um output que não recomenda nada e não pergunta
  // nada deixa o médico sem próximo passo. Isto é o que produziu a parede
  // vista na apresentação (caso de cefaleia pobre: "não há evidência
  // suficiente… 0 definitivas · 0 preliminares", sem nenhuma ação possível).
  //
  // Duas regras, deliberadamente sobrepostas (a primeira é um caso particular
  // da segunda, mantida por rastreabilidade de mensagem — ver output-validator.spec.ts):
  //
  // 1. Relaxamento: zero recomendações passa a ser legítimo quando há
  //    perguntas — perguntar é, por si só, um desfecho válido do turno.
  if (
    !output.uncertainty &&
    output.recommendations.length === 0 &&
    output.clarifyingQuestions.length === 0
  ) {
    errors.push('Output has no recommendations and uncertainty is not declared');
  }

  // 2. Regra dura: independentemente de `uncertainty`, nunca é aceitável
  //    devolver zero recomendações E zero perguntas. Esta é a regra que
  //    fecha o bug — antes dela, "uncertainty: true" sozinho bastava para
  //    passar na validação mesmo sem nenhuma pergunta, o que é exatamente
  //    a parede. A mensagem é escrita para ser acionável: ela é injetada
  //    literalmente no retry de correção (orchestrator.service.ts), então
  //    precisa dizer ao modelo o que fazer, não só o que está errado — é
  //    isto que inverte o gradiente do retry a favor de perguntar.
  if (output.recommendations.length === 0 && output.clarifyingQuestions.length === 0) {
    errors.push(
      'DEAD END: output must contain at least one recommendation or at least one ' +
        'clarifying question. Declaring uncertainty alone leaves the physician with ' +
        'no next step. If evidence is insufficient, ask the triage questions needed ' +
        'to narrow the case instead of stopping.',
    );
  }

  // PI-03 — guarda em runtime, não só instrução de prompt: nenhum campo de
  // differential pode conter linguagem de probabilidade/percentual. A
  // decisão de descartar isso foi do próprio Dr. Gustavo ("médico trabalha
  // muito mal com probabilidades") — `timeToHarm` já é um enum fechado que
  // barra isso estruturalmente, mas os campos de texto livre (hypothesis,
  // whyConsider, whatDistinguishes) ainda podem escapar. Rejeitar aqui
  // aciona o mesmo retry-com-feedback dos outros guard rails.
  const probabilityOffenses = findProbabilityLanguageInDifferentials(output.differentials);
  if (probabilityOffenses.length > 0) {
    errors.push(
      'PROBABILITY LANGUAGE NOT ALLOWED in differentials: found ' +
        probabilityOffenses.join('; ') +
        '. Differentials must use "cannotMiss" (boolean) and "timeToHarm" ' +
        '("minutos" | "horas" | "dias") only — never a percentage, score, or ' +
        'likelihood statement in any field.',
    );
  }

  // UX-07 — bug relatado ao vivo pelo médico piloto: o modelo pedia "quais
  // são os valores de PA, FC, FR, SpO2..." mas marcava a pergunta como
  // "boolean", oferecendo só Sim/Não/Não sei — o médico não tem como
  // responder um pedido de valores com uma dessas três opções. Como a
  // informação nunca chega, o turno seguinte pede a mesma coisa de novo:
  // é isto que o médico percebeu como "loop". Ver ANSWER TYPE MATCHING
  // RULE em prompt-builder.ts para a instrução que evita isto na origem;
  // esta é a barreira em runtime para quando a instrução não for seguida.
  const answerTypeOffenses = findAnswerTypeMismatches(output.clarifyingQuestions);
  if (answerTypeOffenses.length > 0) {
    errors.push(
      'ANSWER TYPE MISMATCH in clarifyingQuestions: ' +
        answerTypeOffenses.join('; ') +
        '. A question whose text asks "quais/qual/quando/quantos/quem/onde" ' +
        'requests a VALUE, not a yes/no fact — it cannot have ' +
        '"expectedAnswerType": "boolean" (the physician cannot answer ' +
        '"Sim/Não/Não sei" to a request for numbers or a list). Use "text" ' +
        '(or "number" for a single isolated value) instead.',
    );
  }

  return {
    valid: errors.length === 0,
    output,
    errors,
    unfoundedRecommendations,
  };
}

function allRecommendationsUnfounded(output: CopilotOutput, validChunkIds: string[]): boolean {
  if (validChunkIds.length === 0) return false;
  return output.recommendations.every((rec) => !new Set(validChunkIds).has(rec.citationChunkId));
}

// PI-03 — percentuais ("70%"), termos de probabilidade em pt/en, e razões
// de verossimilhança ("likelihood ratio", "LR+"). Deliberadamente não
// bloqueia números soltos (ex: "score de Wells") — só linguagem que
// expressa CHANCE/PROBABILIDADE de um diagnóstico específico.
const PROBABILITY_LANGUAGE_PATTERN =
  /\d+(\.\d+)?\s?%|\bprobabilidade\b|\bprobability\b|\blikelihood\b|\bchance\s+de\b|\bodds\b/i;

// UX-07 — pronomes/advérbios interrogativos que, em português, SEMPRE pedem
// um valor ou lista ("quais são os valores de PA...", "quando foi a última
// dose?", "quantos episódios?") — nenhum deles forma uma pergunta de
// sim/não genuína. Se aparecem em uma pergunta marcada "boolean", é sinal
// confiável de que o tipo de resposta está errado, não de falso positivo:
// nenhum fixture legítimo de pergunta boolean deste projeto contém essas
// palavras (ver output-validator.spec.ts).
const OPEN_VALUE_REQUEST_PATTERN = /\b(qual|quais|quando|quantos?|quantas?|quem|onde)\b/i;

function findAnswerTypeMismatches(
  clarifyingQuestions: CopilotOutput['clarifyingQuestions'],
): string[] {
  const offenses: string[] = [];
  clarifyingQuestions.forEach((q, index) => {
    if (q.expectedAnswerType === 'boolean' && OPEN_VALUE_REQUEST_PATTERN.test(q.question)) {
      offenses.push(`clarifyingQuestions[${index}] ("${q.question}")`);
    }
  });
  return offenses;
}

function findProbabilityLanguageInDifferentials(
  differentials: CopilotOutput['differentials'],
): string[] {
  const offenses: string[] = [];
  differentials.forEach((diff, index) => {
    const fields: Array<[string, string | undefined]> = [
      ['hypothesis', diff.hypothesis],
      ['whyConsider', diff.whyConsider],
      ['whatDistinguishes', diff.whatDistinguishes],
    ];
    for (const [fieldName, value] of fields) {
      if (value && PROBABILITY_LANGUAGE_PATTERN.test(value)) {
        offenses.push(`differentials[${index}].${fieldName}`);
      }
    }
  });
  return offenses;
}
