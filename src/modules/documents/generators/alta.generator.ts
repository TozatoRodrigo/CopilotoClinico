import type { CopilotOutput } from '../../copilot/guardrails/output-validator';

export interface AltaDocument {
  paciente: string;
  data: string;
  resumo: string;
  diagnosticos: string[];
  procedimentos: string[];
  condicaoNaAlta: string;
  orientacoes: string[];
  medicamentosAlta: string[];
  retorno: string;
  incerteza: boolean;
  avisoRevisao: string | null;
}

function extractDiagnosticos(text: string): string[] {
  const diags: string[] = [];
  const lines = text.split(/[\n]/);
  for (const line of lines) {
    const lower = line.toLowerCase();
    if (
      lower.includes('diagnóstico') ||
      lower.includes('diagnostico') ||
      lower.includes('cid') ||
      lower.includes('síndrome') ||
      lower.includes('sindrome') ||
      lower.includes('insuficiência') ||
      lower.includes('infarto') ||
      lower.includes('avc') ||
      lower.includes('sepse') ||
      lower.includes('pneumonia')
    ) {
      diags.push(line.trim().replace(/^[-•*]\s*/, ''));
    }
  }
  return diags.length > 0 ? diags : ['A ser preenchido pelo médico'];
}

export function generateAlta(
  caseText: string,
  copilotOutput: CopilotOutput,
  patientRef?: string,
): AltaDocument {
  const diagnosticos = extractDiagnosticos(caseText);

  const orientacoes = copilotOutput.recommendations
    .filter((r) => {
      const a = r.action.toLowerCase();
      return (
        a.includes('orientar') ||
        a.includes('repouso') ||
        a.includes('dieta') ||
        a.includes('retornar') ||
        a.includes('acompanhamento') ||
        a.includes('ambulatorial')
      );
    })
    .map((r) => r.action);

  const medicamentosAlta = copilotOutput.recommendations
    .filter((r) => {
      const a = r.action.toLowerCase();
      return a.includes('mg') || a.includes('prescrever') || a.includes('manter');
    })
    .map((r) => r.action);

  const procedimentos = copilotOutput.recommendations
    .filter((r) => {
      const a = r.action.toLowerCase();
      return (
        a.includes('solicitar') ||
        a.includes('realizar') ||
        a.includes('exame') ||
        a.includes('ecocardiograma') ||
        a.includes('tomografia')
      );
    })
    .map((r) => r.action);

  return {
    paciente: patientRef ?? 'Identificação do paciente',
    data: new Date().toLocaleDateString('pt-BR'),
    resumo: copilotOutput.reasoning.substring(0, 500),
    diagnosticos,
    procedimentos: procedimentos.length > 0 ? procedimentos : ['A ser preenchido pelo médico'],
    condicaoNaAlta: copilotOutput.uncertainty
      ? 'Condição clínica com incerteza — avaliar antes da alta'
      : 'Estável, com critérios de alta',
    orientacoes:
      orientacoes.length > 0
        ? orientacoes
        : copilotOutput.recommendations.slice(0, 3).map((r) => r.action),
    medicamentosAlta:
      medicamentosAlta.length > 0 ? medicamentosAlta : ['A ser preenchido pelo médico'],
    retorno: 'Retorno ambulatorial em 7-14 dias ou conforme orientação médica',
    incerteza: copilotOutput.uncertainty,
    avisoRevisao: copilotOutput.uncertainty
      ? `ALERTA CLÍNICO: ${copilotOutput.uncertaintyReason ?? 'Análise com incerteza — revisar critérios de alta antes de assinar'}`
      : null,
  };
}
