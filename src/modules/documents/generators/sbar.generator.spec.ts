import { describe, it, expect } from 'vitest';
import { generateSBAR } from './sbar.generator';
import type { CopilotOutput } from '../../copilot/guardrails/output-validator';

function makeCopilotOutput(overrides: Partial<CopilotOutput> = {}): CopilotOutput {
  return {
    reasoning: 'Patient shows signs of hypertension',
    recommendations: [
      {
        action: 'Initiate ACE inhibitor therapy',
        rationale: 'BP consistently above 140/90',
        citationChunkId: 'chunk-1',
        confidence: 0.85,
        preliminary: false,
        category: 'therapeutic',
      },
      {
        action: 'Order renal function panel',
        rationale: 'Baseline before medication',
        citationChunkId: 'chunk-2',
        confidence: 0.9,
        preliminary: false,
        category: 'diagnostic',
      },
      {
        action: 'Schedule follow-up in 2 weeks',
        rationale: 'Monitor treatment response',
        citationChunkId: 'chunk-3',
        confidence: 0.75,
        preliminary: false,
        category: 'verify',
      },
    ],
    uncertainty: false,
    uncertaintyReason: null,
    differentials: [],
    clarifyingQuestions: [],
    ...overrides,
  };
}

describe('generateSBAR', () => {
  it('generates all 4 SBAR sections', () => {
    const result = generateSBAR('Paciente com dor torácica', makeCopilotOutput());

    expect(result).toHaveProperty('situation');
    expect(result).toHaveProperty('background');
    expect(result).toHaveProperty('assessment');
    expect(result).toHaveProperty('recommendation');
  });

  it('includes top 5 recommendations with confidence', () => {
    const result = generateSBAR('Caso clínico', makeCopilotOutput());

    expect(result.recommendation).toContain('Initiate ACE inhibitor therapy');
    expect(result.recommendation).toContain('confiança: 85%');
    expect(result.recommendation).toContain('Order renal function panel');
    expect(result.recommendation).toContain('confiança: 90%');
    expect(result.recommendation).toContain('Schedule follow-up in 2 weeks');
    expect(result.recommendation).toContain('confiança: 75%');
  });

  it('limits to top 5 recommendations', () => {
    const manyRecs = Array.from({ length: 8 }, (_, i) => ({
      action: `Action ${i + 1}`,
      rationale: `Rationale ${i + 1}`,
      citationChunkId: `chunk-${i + 1}`,
      confidence: 0.8,
      preliminary: false,
      category: 'therapeutic' as const,
    }));
    const result = generateSBAR('Caso clínico', makeCopilotOutput({ recommendations: manyRecs }));

    const actionCount = (result.recommendation.match(/Action \d+/g) || []).length;
    expect(actionCount).toBe(5);
  });

  it('handles uncertainty with alert prefix', () => {
    const result = generateSBAR(
      'Caso clínico',
      makeCopilotOutput({
        uncertainty: true,
        uncertaintyReason: 'Dados laboratoriais incompletos',
      }),
    );

    expect(result.assessment).toContain('ALERTA');
    expect(result.assessment).toContain('Dados laboratoriais incompletos');
    expect(result.assessment).toContain('decisão clínica necessária');
  });

  it('handles uncertainty without reason', () => {
    const result = generateSBAR(
      'Caso clínico',
      makeCopilotOutput({
        uncertainty: true,
        uncertaintyReason: null,
      }),
    );

    expect(result.assessment).toContain('ALERTA');
    expect(result.assessment).toContain('Evidência insuficiente');
  });

  it('handles empty recommendations', () => {
    const result = generateSBAR(
      'Caso clínico',
      makeCopilotOutput({
        recommendations: [],
        uncertainty: true,
        uncertaintyReason: 'Insufficient data',
      }),
    );

    expect(result.recommendation).toBe('Nenhuma recomendação específica');
  });

  it('truncates long case text in situation to 200 chars', () => {
    const longText = 'A'.repeat(300);
    const result = generateSBAR(longText, makeCopilotOutput());

    expect(result.situation).toBe(`Caso clínico: ${longText.substring(0, 200)}`);
    expect(result.situation.length).toBeLessThan(longText.length + 20);
  });

  it('includes reasoning in background', () => {
    const result = generateSBAR('Caso clínico', makeCopilotOutput());

    expect(result.background).toBe('Patient shows signs of hypertension');
  });

  it('shows recommendation count in assessment when no uncertainty', () => {
    const result = generateSBAR('Caso clínico', makeCopilotOutput());

    expect(result.assessment).toContain('3 recomendações');
    expect(result.assessment).toContain('diretrizes');
  });
});
