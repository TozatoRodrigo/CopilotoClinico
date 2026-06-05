import { describe, it, expect } from 'vitest';
import { validateOutput, CopilotOutputSchema } from './output-validator';

const VALID_CHUNK_IDS = ['chunk-1', 'chunk-2', 'chunk-3'];

function makeValidOutput(overrides: Record<string, unknown> = {}): string {
  const base = {
    reasoning: 'Patient shows signs of hypertension',
    recommendations: [
      {
        action: 'Initiate ACE inhibitor therapy',
        rationale: 'BP consistently above 140/90',
        citationChunkId: 'chunk-1',
        confidence: 0.85,
      },
    ],
    uncertainty: false,
    uncertaintyReason: null,
  };
  return JSON.stringify({ ...base, ...overrides });
}

describe('validateOutput', () => {
  it('accepts valid output with matching citations', () => {
    const result = validateOutput(makeValidOutput(), VALID_CHUNK_IDS);
    expect(result.valid).toBe(true);
    expect(result.output).not.toBeNull();
    expect(result.errors).toEqual([]);
    expect(result.unfoundedRecommendations).toEqual([]);
  });

  it('rejects non-JSON output', () => {
    const result = validateOutput('not json at all', VALID_CHUNK_IDS);
    expect(result.valid).toBe(false);
    expect(result.output).toBeNull();
    expect(result.errors).toContain('Output is not valid JSON');
  });

  it('rejects output that fails schema validation', () => {
    const result = validateOutput(JSON.stringify({ reasoning: '' }), VALID_CHUNK_IDS);
    expect(result.valid).toBe(false);
    expect(result.output).toBeNull();
    expect(result.errors[0]).toBe('Schema validation failed');
    expect(result.errors.length).toBeGreaterThan(1);
  });

  it('rejects output without citations when chunk IDs are provided but none match', () => {
    const result = validateOutput(
      makeValidOutput({
        recommendations: [
          {
            action: 'Test',
            rationale: 'Test rationale',
            citationChunkId: 'FAKE-ID',
            confidence: 0.9,
          },
        ],
      }),
      VALID_CHUNK_IDS,
    );
    expect(result.valid).toBe(false);
    expect(result.unfoundedRecommendations).toEqual([0]);
  });

  it('flags recommendations with fabricated chunk IDs as unfounded', () => {
    const result = validateOutput(
      makeValidOutput({
        recommendations: [
          {
            action: 'A',
            rationale: 'R',
            citationChunkId: 'chunk-1',
            confidence: 0.9,
          },
          {
            action: 'B',
            rationale: 'R',
            citationChunkId: 'FABRICATED',
            confidence: 0.8,
          },
          {
            action: 'C',
            rationale: 'R',
            citationChunkId: 'chunk-3',
            confidence: 0.7,
          },
        ],
      }),
      VALID_CHUNK_IDS,
    );
    expect(result.unfoundedRecommendations).toEqual([1]);
    expect(result.valid).toBe(true);
  });

  it('accepts output with uncertainty=true and no recommendations', () => {
    const result = validateOutput(
      makeValidOutput({
        recommendations: [],
        uncertainty: true,
        uncertaintyReason: 'Insufficient data',
      }),
      VALID_CHUNK_IDS,
    );
    expect(result.valid).toBe(true);
  });

  it('rejects output with no recommendations and uncertainty=false', () => {
    const result = validateOutput(
      makeValidOutput({ recommendations: [], uncertainty: false }),
      VALID_CHUNK_IDS,
    );
    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      'Output has no recommendations and uncertainty is not declared',
    );
  });

  it('rejects output with uncertainty=true but null uncertaintyReason', () => {
    const result = validateOutput(
      makeValidOutput({ uncertainty: true, uncertaintyReason: null }),
      VALID_CHUNK_IDS,
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('uncertaintyReason'))).toBe(true);
  });

  it('rejects output with uncertainty=true but empty string uncertaintyReason', () => {
    const result = validateOutput(
      makeValidOutput({ uncertainty: true, uncertaintyReason: '' }),
      VALID_CHUNK_IDS,
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('uncertaintyReason'))).toBe(true);
  });

  it('accepts output with uncertainty=false and null uncertaintyReason', () => {
    const result = validateOutput(
      makeValidOutput({ uncertainty: false, uncertaintyReason: null }),
      VALID_CHUNK_IDS,
    );
    expect(result.valid).toBe(true);
  });

  it('handles JSON wrapped in markdown code blocks', () => {
    const raw = '```json\n' + makeValidOutput() + '\n```';
    const result = validateOutput(raw, VALID_CHUNK_IDS);
    expect(result.valid).toBe(true);
    expect(result.output).not.toBeNull();
  });

  it('validates confidence range (0-1)', () => {
    const highResult = validateOutput(
      makeValidOutput({
        recommendations: [
          {
            action: 'A',
            rationale: 'R',
            citationChunkId: 'chunk-1',
            confidence: 1.5,
          },
        ],
      }),
      VALID_CHUNK_IDS,
    );
    expect(highResult.valid).toBe(false);
    expect(highResult.output).toBeNull();

    const lowResult = validateOutput(
      makeValidOutput({
        recommendations: [
          {
            action: 'A',
            rationale: 'R',
            citationChunkId: 'chunk-1',
            confidence: -0.1,
          },
        ],
      }),
      VALID_CHUNK_IDS,
    );
    expect(lowResult.valid).toBe(false);
    expect(lowResult.output).toBeNull();
  });

  it('validates all required fields exist', () => {
    const missingFields = JSON.stringify({
      reasoning: 'Some reasoning',
    });
    const result = validateOutput(missingFields, VALID_CHUNK_IDS);
    expect(result.valid).toBe(false);
    expect(result.output).toBeNull();
    expect(result.errors[0]).toBe('Schema validation failed');
    expect(result.errors.length).toBeGreaterThan(1);
  });

  it('returns unfounded indices for fabricated citations', () => {
    const result = validateOutput(
      makeValidOutput({
        recommendations: [
          {
            action: 'A',
            rationale: 'R',
            citationChunkId: 'FAKE-1',
            confidence: 0.9,
          },
          {
            action: 'B',
            rationale: 'R',
            citationChunkId: 'FAKE-2',
            confidence: 0.8,
          },
        ],
      }),
      VALID_CHUNK_IDS,
    );
    expect(result.unfoundedRecommendations).toEqual([0, 1]);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      'All recommendations have unfounded citations — no valid chunk IDs found',
    );
  });

  it('accepts valid output when all chunk IDs match', () => {
    const result = validateOutput(
      makeValidOutput({
        recommendations: [
          {
            action: 'A',
            rationale: 'R1',
            citationChunkId: 'chunk-1',
            confidence: 0.9,
          },
          {
            action: 'B',
            rationale: 'R2',
            citationChunkId: 'chunk-2',
            confidence: 0.8,
          },
          {
            action: 'C',
            rationale: 'R3',
            citationChunkId: 'chunk-3',
            confidence: 0.7,
          },
        ],
      }),
      VALID_CHUNK_IDS,
    );
    expect(result.valid).toBe(true);
    expect(result.unfoundedRecommendations).toEqual([]);
    expect(result.output?.recommendations.length).toBe(3);
  });
});

describe('CopilotOutputSchema', () => {
  it('accepts confidence at boundary 0', () => {
    const result = CopilotOutputSchema.safeParse({
      reasoning: 'test',
      recommendations: [
        {
          action: 'A',
          rationale: 'R',
          citationChunkId: 'chunk-1',
          confidence: 0,
        },
      ],
      uncertainty: false,
      uncertaintyReason: null,
    });
    expect(result.success).toBe(true);
  });

  it('accepts confidence at boundary 1', () => {
    const result = CopilotOutputSchema.safeParse({
      reasoning: 'test',
      recommendations: [
        {
          action: 'A',
          rationale: 'R',
          citationChunkId: 'c1',
          confidence: 1,
        },
      ],
      uncertainty: false,
      uncertaintyReason: null,
    });
    expect(result.success).toBe(true);
  });
});
