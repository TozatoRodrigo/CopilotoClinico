import { describe, it, expect } from 'vitest';
import { generateAlta } from './alta.generator';
import type { CopilotOutput } from '../../copilot/guardrails/output-validator';

const baseOutput: CopilotOutput = {
  reasoning:
    'Paciente com diagnóstico de pneumonia bacteriana. Tratamento antibiótico completo. Estável para alta.',
  recommendations: [
    {
      action: 'Orientar ambulatorial em 7 dias',
      rationale: 'Seguimento pós-alta',
      citationChunkId: 'c1',
      confidence: 0.9,
    },
    {
      action: 'Manter Amoxicilina 500mg 8/8h por mais 5 dias',
      rationale: 'Completar antibioticoterapia',
      citationChunkId: 'c2',
      confidence: 0.88,
    },
    {
      action: 'Solicitar RX de controle em 4 semanas',
      rationale: 'Confirmar resolução da pneumonia',
      citationChunkId: 'c3',
      confidence: 0.85,
    },
  ],
  uncertainty: false,
  uncertaintyReason: null,
};

describe('generateAlta', () => {
  it('gera documento de alta completo com dados disponíveis', () => {
    const result = generateAlta(
      'Diagnóstico: Pneumonia bacteriana CID J18. Paciente estável.',
      baseOutput,
      'Maria Santos',
    );

    expect(result.paciente).toBe('Maria Santos');
    expect(result.diagnosticos.length).toBeGreaterThan(0);
    expect(result.diagnosticos[0]).not.toBe('A ser preenchido pelo médico');
    expect(result.resumo.length).toBeGreaterThan(0);
    expect(result.incerteza).toBe(false);
    expect(result.avisoRevisao).toBeNull();
  });

  it('gera alta com dados incompletos sem quebrar', () => {
    const result = generateAlta('Caso com dados limitados.', {
      ...baseOutput,
      recommendations: [],
    });

    expect(result.diagnosticos).toEqual(['A ser preenchido pelo médico']);
    expect(result.condicaoNaAlta).toContain('Estável');
    expect(result.orientacoes).toBeDefined();
  });

  it('sinaliza alerta quando há incerteza', () => {
    const result = generateAlta('Caso com suspeita de sepse sem foco definido.', {
      ...baseOutput,
      uncertainty: true,
      uncertaintyReason: 'Foco infeccioso não identificado',
    });

    expect(result.incerteza).toBe(true);
    expect(result.condicaoNaAlta).toContain('incerteza');
    expect(result.avisoRevisao).toContain('ALERTA CLÍNICO');
  });
});
