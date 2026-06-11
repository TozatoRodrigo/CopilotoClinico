import { describe, it, expect } from 'vitest';
import { generateAtestado } from './atestado.generator';
import type { CopilotOutput } from '../../copilot/guardrails/output-validator';

const baseOutput: CopilotOutput = {
  reasoning: 'Paciente com crise asmática moderada. Tratamento broncodilatador realizado.',
  recommendations: [
    {
      action: 'Prescrever repouso por 3 dias',
      rationale: 'Recuperação pós-crise',
      citationChunkId: 'c1',
      confidence: 0.85,
      preliminary: false,
    },
  ],
  uncertainty: false,
  uncertaintyReason: null,
  clarifyingQuestions: [],
};

describe('generateAtestado', () => {
  it('detecta tipo comparecimento como padrão', () => {
    const result = generateAtestado('Paciente compareceu para consulta de rotina.', baseOutput, 'Carlos Souza');

    expect(result.tipo).toBe('comparecimento');
    expect(result.paciente).toBe('Carlos Souza');
    expect(result.periodoAfastamento).toBeNull();
    expect(result.assinaturaPlaceholder).toContain('CRM');
  });

  it('detecta tipo afastamento e extrai período', () => {
    const result = generateAtestado(
      'Paciente necessita de afastamento por 5 dias devido a crise asmática.',
      baseOutput,
    );

    expect(result.tipo).toBe('afastamento');
    expect(result.periodoAfastamento).toContain('5');
  });

  it('sugere CID quando identificado no texto', () => {
    const result = generateAtestado(
      'Paciente com asma brônquica em crise. Afastamento necessário.',
      baseOutput,
    );

    expect(result.cidSugerido).toBe('CID J45');
  });

  it('gera aviso de revisão com incerteza', () => {
    const result = generateAtestado('Caso com dados insuficientes.', {
      ...baseOutput,
      uncertainty: true,
      uncertaintyReason: 'Diagnóstico diferencial pendente',
    });

    expect(result.incerteza).toBe(true);
    expect(result.avisoRevisao).toContain('REVISÃO');
  });

  it('gera documento sem CID quando não identificado', () => {
    const result = generateAtestado('Consulta de acompanhamento geral sem diagnóstico específico.', {
      ...baseOutput,
      reasoning: 'Consulta de rotina.',
    });

    expect(result.cidSugerido).toBeNull();
    expect(result.descricao.length).toBeGreaterThan(0);
  });
});
