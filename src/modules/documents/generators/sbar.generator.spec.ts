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
    redFlags: [],
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

  // PI-04 — SBAR que blinda a transição de cuidado (pendências, vigilâncias, se piorar).
  describe('PI-04: pendências, vigilâncias e "se piorar"', () => {
    it('omits all three new sections when there is nothing to report (no SBAR bloat)', () => {
      const result = generateSBAR(
        'Caso clínico',
        makeCopilotOutput({
          recommendations: [
            {
              action: 'Tratamento sintomático',
              rationale: 'Quadro leve',
              citationChunkId: 'chunk-1',
              confidence: 0.9,
              preliminary: false,
              category: 'therapeutic',
            },
          ],
          redFlags: [],
          clarifyingQuestions: [],
        }),
      );

      expect(result.recommendation).not.toContain('Pendências');
      expect(result.recommendation).not.toContain('Vigilâncias');
      expect(result.recommendation).not.toContain('Se piorar');
    });

    it('lists diagnostic-category recommendations as pendências (exames pedidos)', () => {
      const result = generateSBAR(
        'Caso clínico',
        makeCopilotOutput({
          recommendations: [
            {
              action: 'Solicitar angioTC de tórax',
              rationale: 'Afastar TEP',
              citationChunkId: 'chunk-1',
              confidence: 0.8,
              preliminary: false,
              category: 'diagnostic',
            },
          ],
        }),
      );

      expect(result.recommendation).toContain('Pendências:');
      expect(result.recommendation).toContain('- Solicitar angioTC de tórax');
    });

    it('lists preliminary recommendations as pendências regardless of category', () => {
      const result = generateSBAR(
        'Caso clínico',
        makeCopilotOutput({
          recommendations: [
            {
              action: 'Considerar antibioticoterapia ampliada',
              rationale: 'Pendente confirmação de imunossupressão',
              citationChunkId: 'chunk-1',
              confidence: 0.6,
              preliminary: true,
              category: 'therapeutic',
            },
          ],
        }),
      );

      expect(result.recommendation).toContain('Pendências:');
      expect(result.recommendation).toContain('- Considerar antibioticoterapia ampliada');
    });

    it('does not duplicate within Pendências a recommendation that is both diagnostic and preliminary', () => {
      const result = generateSBAR(
        'Caso clínico',
        makeCopilotOutput({
          recommendations: [
            {
              action: 'Solicitar D-dímero',
              rationale: 'Pendente',
              citationChunkId: 'chunk-1',
              confidence: 0.5,
              preliminary: true,
              category: 'diagnostic',
            },
          ],
        }),
      );

      // Aparece no resumo top-5 (plano) E em Pendências (o que está em
      // aberto) — são propósitos diferentes, não duplicação. O que não
      // pode acontecer é aparecer duas vezes DENTRO da própria seção
      // Pendências (a mesma recomendação qualifica por dois critérios:
      // diagnostic E preliminary).
      const pendenciasSection = result.recommendation.split('Pendências:')[1] ?? '';
      const occurrencesInPendencias = (pendenciasSection.match(/Solicitar D-dímero/g) ?? []).length;
      expect(occurrencesInPendencias).toBe(1);
    });

    it('lists unanswered clarifying questions as pendências', () => {
      const result = generateSBAR(
        'Caso clínico',
        makeCopilotOutput({
          clarifyingQuestions: [
            {
              id: 'q1',
              question: 'O paciente é imunossuprimido?',
              why: 'Muda a cobertura antibiótica',
              criticality: 'blocker',
              expectedAnswerType: 'boolean',
            },
          ],
        }),
      );

      expect(result.recommendation).toContain('Pendências:');
      expect(result.recommendation).toContain(
        '- Aguardando resposta: O paciente é imunossuprimido?',
      );
    });

    it('formats red flags as actionable "se X, então Y" vigilâncias', () => {
      const result = generateSBAR(
        'Caso clínico',
        makeCopilotOutput({
          redFlags: [
            { finding: 'Hipotensão persistente', severity: 'high', action: 'Reavaliar PA a cada 15min' },
          ],
        }),
      );

      expect(result.recommendation).toContain('Vigilâncias:');
      expect(result.recommendation).toContain(
        '- Se hipotensão persistente → Reavaliar PA a cada 15min',
      );
    });

    it('builds "se piorar" from critical red flags\' actions', () => {
      const result = generateSBAR(
        'Caso clínico',
        makeCopilotOutput({
          redFlags: [
            { finding: 'Choque', severity: 'critical', action: 'Reposição volêmica imediata' },
            { finding: 'Febre baixa', severity: 'moderate', action: 'Monitorar temperatura' },
          ],
        }),
      );

      expect(result.recommendation).toContain('Se piorar:');
      expect(result.recommendation).toContain('- Reposição volêmica imediata');
      // Red flag "moderate" não entra em "se piorar" — só critical.
      const sePioraSection = result.recommendation.split('Se piorar:')[1] ?? '';
      expect(sePioraSection).not.toContain('Monitorar temperatura');
    });

    it('includes stabilization-category recommendations in "se piorar", deduplicated against red flag actions', () => {
      const result = generateSBAR(
        'Caso clínico',
        makeCopilotOutput({
          redFlags: [
            { finding: 'Choque', severity: 'critical', action: 'Reposição volêmica imediata' },
          ],
          recommendations: [
            {
              action: 'Reposição volêmica imediata',
              rationale: 'Choque',
              citationChunkId: 'chunk-1',
              confidence: 0.95,
              preliminary: false,
              category: 'stabilization',
            },
            {
              action: 'Monitorização cardíaca contínua',
              rationale: 'Instabilidade',
              citationChunkId: 'chunk-2',
              confidence: 0.9,
              preliminary: false,
              category: 'stabilization',
            },
          ],
        }),
      );

      // "Reposição volêmica imediata" qualifica tanto pela red flag
      // critical quanto pela recomendação de estabilização — não pode
      // aparecer duas vezes DENTRO da seção "Se piorar" (fora dela, no
      // resumo top-5, é esperado que apareça também).
      const sePioraSection = result.recommendation.split('Se piorar:')[1] ?? '';
      const occurrencesInSePiora = (sePioraSection.match(/Reposição volêmica imediata/g) ?? [])
        .length;
      expect(occurrencesInSePiora).toBe(1);
      expect(sePioraSection).toContain('- Monitorização cardíaca contínua');
    });

    // rawOutput vem do banco como Prisma.JsonValue sem re-validação via
    // CopilotOutputSchema na leitura (só é validado na escrita — ver
    // orchestrator.service.ts). Interações antigas, persistidas antes de
    // redFlags/clarifyingQuestions existirem no schema, legitimamente não
    // têm esses campos — o gerador não pode estourar ao montar SBAR para
    // um caso histórico.
    it('does not crash generating SBAR for a legacy interaction missing redFlags/clarifyingQuestions', () => {
      const legacyOutput = {
        reasoning: 'Caso antigo, anterior aos campos redFlags/clarifyingQuestions.',
        recommendations: [
          {
            action: 'Tratamento sintomático',
            rationale: 'Quadro leve',
            citationChunkId: 'chunk-1',
            confidence: 0.9,
            preliminary: false,
            category: 'therapeutic',
          },
        ],
        uncertainty: false,
        uncertaintyReason: null,
        differentials: [],
        // redFlags e clarifyingQuestions ausentes de propósito.
      } as unknown as CopilotOutput;

      expect(() => generateSBAR('Caso clínico', legacyOutput)).not.toThrow();
      const result = generateSBAR('Caso clínico', legacyOutput);
      expect(result.recommendation).not.toContain('Vigilâncias');
    });

    it('renders all three sections together, each on its own block, when the case has everything', () => {
      const result = generateSBAR(
        'Caso clínico',
        makeCopilotOutput({
          recommendations: [
            {
              action: 'Solicitar hemograma',
              rationale: 'Investigação',
              citationChunkId: 'chunk-1',
              confidence: 0.7,
              preliminary: false,
              category: 'diagnostic',
            },
          ],
          redFlags: [
            { finding: 'Taquicardia', severity: 'critical', action: 'Monitorização contínua' },
          ],
          clarifyingQuestions: [
            {
              id: 'q1',
              question: 'Há febre associada?',
              why: 'Discrimina etiologia',
              criticality: 'important',
              expectedAnswerType: 'boolean',
            },
          ],
        }),
      );

      const pendenciasIdx = result.recommendation.indexOf('Pendências:');
      const vigilanciasIdx = result.recommendation.indexOf('Vigilâncias:');
      const sePioraIdx = result.recommendation.indexOf('Se piorar:');
      expect(pendenciasIdx).toBeGreaterThan(-1);
      expect(vigilanciasIdx).toBeGreaterThan(pendenciasIdx);
      expect(sePioraIdx).toBeGreaterThan(vigilanciasIdx);
    });
  });
});
