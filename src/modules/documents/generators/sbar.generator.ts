import type { CopilotOutput } from '../../copilot/guardrails/output-validator';

export interface SbarDocument {
  situation: string;
  background: string;
  assessment: string;
  recommendation: string;
}

export function generateSBAR(caseText: string, copilotOutput: CopilotOutput): SbarDocument {
  const topRecs = copilotOutput.recommendations
    .slice(0, 5)
    .map((r) => `${r.action} [confiança: ${Math.round(r.confidence * 100)}%]`)
    .join('; ');

  return {
    situation: `Caso clínico: ${caseText.substring(0, 200)}`,
    background: copilotOutput.reasoning,
    assessment: copilotOutput.uncertainty
      ? `ALERTA: ${copilotOutput.uncertaintyReason ?? 'Evidência insuficiente'} — decisão clínica necessária`
      : `${copilotOutput.recommendations.length} recomendações com base em diretrizes`,
    recommendation: topRecs || 'Nenhuma recomendação específica',
  };
}
