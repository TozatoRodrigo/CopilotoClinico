import { describe, it, expect } from 'vitest';
import { generatePrescricao } from './prescricao.generator';
import type { CopilotOutput } from '../../copilot/guardrails/output-validator';

const baseOutput: CopilotOutput = {
  reasoning: 'Paciente com SCA — STEMI inferior. Iniciado protocolo de reperfusão.',
  recommendations: [
    {
      action: 'Prescrever AAS 300mg via oral dose de ataque',
      rationale: 'Antiagregação imediata',
      citationChunkId: 'c1',
      confidence: 0.95,
    },
    {
      action: 'Administrar Clopidogrel 300mg VO',
      rationale: 'Dupla antiagregação',
      citationChunkId: 'c2',
      confidence: 0.93,
    },
    {
      action: 'Orientar repouso relativo nas próximas 24h',
      rationale: 'Reduzir demanda miocárdica',
      citationChunkId: 'c3',
      confidence: 0.85,
    },
  ],
  uncertainty: false,
  uncertaintyReason: null,
};

describe('generatePrescricao', () => {
  it('gera prescrição com medicamentos identificados no texto', () => {
    const result = generatePrescricao(
      'Paciente com dor precordial. Prescrever AAS 300mg VO. Administrar Clopidogrel 300mg.',
      baseOutput,
      'João Silva',
    );

    expect(result.paciente).toBe('João Silva');
    expect(result.medicamentos.length).toBeGreaterThan(0);
    expect(result.incerteza).toBe(false);
    expect(result.avisoRevisao).toBeNull();
  });

  it('gera aviso quando não há medicamentos identificados', () => {
    const outputSemMed: CopilotOutput = {
      ...baseOutput,
      recommendations: [
        {
          action: 'Orientar repouso',
          rationale: 'Recuperação',
          citationChunkId: 'c1',
          confidence: 0.8,
        },
      ],
    };

    const result = generatePrescricao('Caso clínico sem medicamentos claros.', outputSemMed);

    expect(result.medicamentos[0].medicamento).toContain('⚠');
    expect(result.avisoRevisao).not.toBeNull();
  });

  it('inclui aviso de revisão quando há incerteza', () => {
    const outputIncerto: CopilotOutput = {
      ...baseOutput,
      uncertainty: true,
      uncertaintyReason: 'Dados insuficientes para diagnóstico definitivo',
    };

    const result = generatePrescricao('Caso com incerteza.', outputIncerto);

    expect(result.incerteza).toBe(true);
    expect(result.avisoRevisao).toContain('REVISÃO OBRIGATÓRIA');
  });
});
