import { z } from 'zod';

const RecommendationSchema = z.object({
  action: z.string().min(1),
  rationale: z.string().min(1),
  citationChunkId: z.string().min(1),
  confidence: z.number().min(0).max(1),
});

export const CopilotOutputSchema = z
  .object({
    reasoning: z.string().min(1),
    recommendations: z.array(RecommendationSchema).min(0),
    uncertainty: z.boolean(),
    uncertaintyReason: z.string().nullable(),
  })
  .refine(
    (data) =>
      !data.uncertainty || (data.uncertaintyReason !== null && data.uncertaintyReason.length > 0),
    {
      message: 'uncertaintyReason is required and must be non-empty when uncertainty is true',
      path: ['uncertaintyReason'],
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
