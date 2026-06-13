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
});

const DifferentialSchema = z.object({
  hypothesis: z.string().min(1),
  whyConsider: z.string().min(1),
  whatDistinguishes: z.string().min(1),
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

  if (!output.uncertainty && output.recommendations.length === 0) {
    errors.push('Output has no recommendations and uncertainty is not declared');
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
