import type { CopilotOutput } from '../../copilot/guardrails/output-validator';

export interface SoapDocument {
  subjective: string;
  objective: string;
  assessment: string;
  plan: string;
}

export function generateSOAP(caseText: string, copilotOutput: CopilotOutput): SoapDocument {
  const recommendations = copilotOutput.recommendations
    .map((r) => `- ${r.action} (${r.rationale})`)
    .join('\n');

  return {
    subjective: caseText,
    objective: `Raciocínio clínico: ${copilotOutput.reasoning}`,
    assessment: copilotOutput.uncertainty
      ? `Incerteza: ${copilotOutput.uncertaintyReason ?? 'Evidência insuficiente para avaliação definitiva'}`
      : `Baseado em ${copilotOutput.recommendations.length} recomendações fundamentadas em diretrizes`,
    plan: recommendations,
  };
}
