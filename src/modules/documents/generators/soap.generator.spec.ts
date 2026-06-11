import { describe, it, expect } from 'vitest';
import { generateSOAP } from './soap.generator';
import type { CopilotOutput } from '../../copilot/guardrails/output-validator';

function makeCopilotOutput(overrides: Partial<CopilotOutput> = {}): CopilotOutput {
  return {
    reasoning: 'Patient shows signs of hypertension with elevated BP readings',
    recommendations: [
      {
        action: 'Initiate ACE inhibitor therapy',
        rationale: 'BP consistently above 140/90',
        citationChunkId: 'chunk-1',
        confidence: 0.85,
        preliminary: false,
      },
      {
        action: 'Order renal function panel',
        rationale: 'Baseline before medication',
        citationChunkId: 'chunk-2',
        confidence: 0.9,
        preliminary: false,
      },
    ],
    uncertainty: false,
    uncertaintyReason: null,
    clarifyingQuestions: [],
    ...overrides,
  };
}

describe('generateSOAP', () => {
  it('generates all 4 SOAP sections', () => {
    const result = generateSOAP('Paciente com dor torácica', makeCopilotOutput());

    expect(result).toHaveProperty('subjective');
    expect(result).toHaveProperty('objective');
    expect(result).toHaveProperty('assessment');
    expect(result).toHaveProperty('plan');
  });

  it('includes case text in subjective', () => {
    const caseText = 'Paciente com dor torácica após trauma';
    const result = generateSOAP(caseText, makeCopilotOutput());

    expect(result.subjective).toBe(caseText);
  });

  it('includes recommendations in plan', () => {
    const result = generateSOAP('Caso clínico', makeCopilotOutput());

    expect(result.plan).toContain('Initiate ACE inhibitor therapy');
    expect(result.plan).toContain('BP consistently above 140/90');
    expect(result.plan).toContain('Order renal function panel');
    expect(result.plan).toContain('Baseline before medication');
  });

  it('handles uncertainty flag', () => {
    const result = generateSOAP(
      'Caso clínico',
      makeCopilotOutput({
        uncertainty: true,
        uncertaintyReason: 'Evidência insuficiente para diagnóstico definitivo',
      }),
    );

    expect(result.assessment).toContain('Incerteza');
    expect(result.assessment).toContain('Evidência insuficiente para diagnóstico definitivo');
  });

  it('handles uncertainty without reason', () => {
    const result = generateSOAP(
      'Caso clínico',
      makeCopilotOutput({
        uncertainty: true,
        uncertaintyReason: null,
      }),
    );

    expect(result.assessment).toContain('Incerteza');
    expect(result.assessment).toContain('Evidência insuficiente para avaliação definitiva');
  });

  it('shows recommendation count in assessment when no uncertainty', () => {
    const result = generateSOAP('Caso clínico', makeCopilotOutput());

    expect(result.assessment).toContain('2 recomendações');
    expect(result.assessment).toContain('diretrizes');
  });

  it('includes clinical reasoning in objective', () => {
    const result = generateSOAP('Caso clínico', makeCopilotOutput());

    expect(result.objective).toContain('Raciocínio clínico');
    expect(result.objective).toContain('Patient shows signs of hypertension');
  });
});
