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
    expect(result.output?.recommendations[0]?.category).toBe('therapeutic');
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

  it('accepts an explicit recommendation category from the LLM', () => {
    const result = validateOutput(
      makeValidOutput({
        recommendations: [
          {
            action: 'Iniciar cristalóide EV',
            rationale: 'Paciente instável hemodinamicamente',
            citationChunkId: 'chunk-1',
            confidence: 0.97,
            category: 'stabilization',
          },
        ],
      }),
      VALID_CHUNK_IDS,
    );

    expect(result.valid).toBe(true);
    expect(result.output?.recommendations[0]?.category).toBe('stabilization');
  });

  it('accepts up to 3 anti-anchoring differentials and defaults to empty otherwise', () => {
    const withDifferentials = validateOutput(
      makeValidOutput({
        differentials: [
          {
            hypothesis: 'Dissecção de aorta abdominal',
            whyConsider: 'Lombalgia aguda em idoso hipertenso pode mascarar etiologia vascular.',
            whatDistinguishes: 'Dor súbita intensa, pulso assimétrico e angioTC.',
          },
          {
            hypothesis: 'Abscesso epidural',
            whyConsider: 'Dor lombar com sinais sistêmicos pode ter foco infeccioso profundo.',
            whatDistinguishes: 'Febre, déficit neurológico e ressonância.',
          },
          {
            hypothesis: 'Cauda equina',
            whyConsider: 'Atraso no reconhecimento muda prognóstico neurológico.',
            whatDistinguishes: 'Anestesia em sela, retenção urinária e déficit motor.',
          },
        ],
      }),
      VALID_CHUNK_IDS,
    );

    expect(withDifferentials.valid).toBe(true);
    expect(withDifferentials.output?.differentials).toHaveLength(3);

    const defaulted = validateOutput(makeValidOutput(), VALID_CHUNK_IDS);
    expect(defaulted.output?.differentials).toEqual([]);
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

  it('accepts output with valid clarifyingQuestions', () => {
    const result = validateOutput(
      makeValidOutput({
        clarifyingQuestions: [
          {
            id: 'q1',
            question: 'O paciente é imunossuprimido?',
            why: 'Define necessidade de cobertura antibiótica ampliada',
            criticality: 'important',
            expectedAnswerType: 'boolean',
          },
        ],
      }),
      VALID_CHUNK_IDS,
    );
    expect(result.valid).toBe(true);
    expect(result.output?.clarifyingQuestions).toHaveLength(1);
  });

  it('rejects output with a blocker clarifying question and a non-preliminary recommendation', () => {
    const result = validateOutput(
      makeValidOutput({
        clarifyingQuestions: [
          {
            id: 'q1',
            question: 'Há quanto tempo iniciaram os sintomas?',
            why: 'Define se o quadro é agudo ou crônico',
            criticality: 'blocker',
            expectedAnswerType: 'choice',
            choices: ['<48h', '>=48h'],
          },
        ],
      }),
      VALID_CHUNK_IDS,
    );
    expect(result.valid).toBe(false);
    expect(result.output).toBeNull();
    expect(result.errors[0]).toBe('Schema validation failed');
    expect(result.errors.some((e) => e.includes('recommendations'))).toBe(true);
  });

  it('accepts output with a blocker clarifying question when recommendations are marked preliminary', () => {
    const result = validateOutput(
      makeValidOutput({
        recommendations: [
          {
            action: 'Initiate ACE inhibitor therapy',
            rationale: 'BP consistently above 140/90',
            citationChunkId: 'chunk-1',
            confidence: 0.85,
            preliminary: true,
          },
        ],
        clarifyingQuestions: [
          {
            id: 'q1',
            question: 'O paciente é imunossuprimido?',
            why: 'Define necessidade de cobertura antibiótica ampliada',
            criticality: 'blocker',
            expectedAnswerType: 'boolean',
          },
        ],
      }),
      VALID_CHUNK_IDS,
    );
    expect(result.valid).toBe(true);
    expect(result.output?.recommendations[0]?.preliminary).toBe(true);
  });

  it('remains backward-compatible with output that has no clarifyingQuestions field', () => {
    const result = validateOutput(makeValidOutput(), VALID_CHUNK_IDS);
    expect(result.valid).toBe(true);
    expect(result.output?.clarifyingQuestions).toEqual([]);
    expect(result.output?.recommendations[0]?.preliminary).toBe(false);
  });

  it('accepts output with exactly 3 clarifyingQuestions', () => {
    const question = (id: string) => ({
      id,
      question: `Pergunta ${id}?`,
      why: 'Define a conduta conforme a diretriz X',
      criticality: 'important' as const,
      expectedAnswerType: 'boolean' as const,
    });
    const result = validateOutput(
      makeValidOutput({
        recommendations: [
          {
            action: 'Initiate ACE inhibitor therapy',
            rationale: 'BP consistently above 140/90',
            citationChunkId: 'chunk-1',
            confidence: 0.85,
            preliminary: true,
          },
        ],
        clarifyingQuestions: [question('q1'), question('q2'), question('q3')],
      }),
      VALID_CHUNK_IDS,
    );
    expect(result.valid).toBe(true);
    expect(result.output?.clarifyingQuestions).toHaveLength(3);
  });

  it('rejects output with more than 3 clarifyingQuestions (DEC-003)', () => {
    const question = (id: string) => ({
      id,
      question: `Pergunta ${id}?`,
      why: 'Define a conduta conforme a diretriz X',
      criticality: 'important' as const,
      expectedAnswerType: 'boolean' as const,
    });
    const result = validateOutput(
      makeValidOutput({
        recommendations: [
          {
            action: 'Initiate ACE inhibitor therapy',
            rationale: 'BP consistently above 140/90',
            citationChunkId: 'chunk-1',
            confidence: 0.85,
            preliminary: true,
          },
        ],
        clarifyingQuestions: [question('q1'), question('q2'), question('q3'), question('q4')],
      }),
      VALID_CHUNK_IDS,
    );
    expect(result.valid).toBe(false);
    expect(result.output).toBeNull();
    expect(result.errors[0]).toBe('Schema validation failed');
    expect(
      result.errors.some((e) => e.includes('clarifyingQuestions') && e.includes('at most 3')),
    ).toBe(true);
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

describe('redFlags', () => {
  it('defaults to empty array when redFlags is omitted', () => {
    const result = validateOutput(makeValidOutput(), VALID_CHUNK_IDS);
    expect(result.valid).toBe(true);
    expect(result.output?.redFlags).toEqual([]);
  });

  it('accepts output with valid red flags', () => {
    const result = validateOutput(
      makeValidOutput({
        redFlags: [
          {
            finding: 'Taquicardia sustentada > 130 bpm',
            severity: 'high',
            action: 'Monitorar ritmo cardíaco contínuo e investigar causa',
          },
          {
            finding: 'Febre persistente há 5 dias',
            severity: 'moderate',
            action: 'Investigar foco infeccioso e considerar hemocultura',
          },
        ],
      }),
      VALID_CHUNK_IDS,
    );
    expect(result.valid).toBe(true);
    expect(result.output?.redFlags).toHaveLength(2);
    expect(result.output?.redFlags[0]?.severity).toBe('high');
  });

  it('accepts output with moderate severity red flags', () => {
    const result = validateOutput(
      makeValidOutput({
        redFlags: [
          {
            finding: 'Febre persistente há 5 dias',
            severity: 'moderate',
            action: 'Investigar foco infeccioso e considerar hemocultura',
          },
        ],
      }),
      VALID_CHUNK_IDS,
    );
    expect(result.valid).toBe(true);
    expect(result.output?.redFlags[0]?.severity).toBe('moderate');
  });

  it('rejects red flag with invalid severity', () => {
    const result = validateOutput(
      makeValidOutput({
        redFlags: [
          {
            finding: 'Test',
            severity: 'invalid',
            action: 'Test',
          },
        ],
      }),
      VALID_CHUNK_IDS,
    );
    expect(result.valid).toBe(false);
    expect(result.output).toBeNull();
  });

  it('rejects red flag missing required fields', () => {
    const result = validateOutput(
      makeValidOutput({
        redFlags: [{ finding: 'Test' }],
      }),
      VALID_CHUNK_IDS,
    );
    expect(result.valid).toBe(false);
    expect(result.output).toBeNull();
  });

  it('allows critical red flags with stabilization recommendations', () => {
    const result = validateOutput(
      makeValidOutput({
        redFlags: [
          {
            finding: 'Hipotensão severa',
            severity: 'critical',
            action: 'Reposição volêmica imediata',
          },
        ],
        recommendations: [
          {
            action: 'Iniciar cristalóide EV em bolus',
            rationale: 'Paciente instável',
            citationChunkId: 'chunk-1',
            confidence: 0.95,
            preliminary: false,
            category: 'stabilization',
          },
        ],
      }),
      VALID_CHUNK_IDS,
    );
    expect(result.valid).toBe(true);
  });

  it('rejects critical red flags when non-stabilization recommendations are definitive', () => {
    const result = validateOutput(
      makeValidOutput({
        redFlags: [
          {
            finding: 'Hipotensão severa',
            severity: 'critical',
            action: 'Reposição volêmica imediata',
          },
        ],
        recommendations: [
          {
            action: 'Iniciar IECA',
            rationale: 'HAS',
            citationChunkId: 'chunk-1',
            confidence: 0.85,
            preliminary: false,
            category: 'therapeutic',
          },
        ],
      }),
      VALID_CHUNK_IDS,
    );
    expect(result.valid).toBe(false);
  });

  it('allows critical red flags when non-stabilization recommendations are preliminary', () => {
    const result = validateOutput(
      makeValidOutput({
        redFlags: [
          {
            finding: 'Hipotensão severa',
            severity: 'critical',
            action: 'Reposição volêmica imediata',
          },
        ],
        recommendations: [
          {
            action: 'Considerar IECA',
            rationale: 'HAS',
            citationChunkId: 'chunk-1',
            confidence: 0.7,
            preliminary: true,
            category: 'therapeutic',
          },
        ],
      }),
      VALID_CHUNK_IDS,
    );
    expect(result.valid).toBe(true);
  });

  it('allows high severity red flags with any recommendations', () => {
    const result = validateOutput(
      makeValidOutput({
        redFlags: [
          {
            finding: 'Taquicardia > 130 bpm',
            severity: 'high',
            action: 'Monitorar ritmo cardíaco',
          },
        ],
        recommendations: [
          {
            action: 'Iniciar IECA',
            rationale: 'HAS',
            citationChunkId: 'chunk-1',
            confidence: 0.85,
            preliminary: false,
            category: 'therapeutic',
          },
        ],
      }),
      VALID_CHUNK_IDS,
    );
    expect(result.valid).toBe(true);
  });
});
