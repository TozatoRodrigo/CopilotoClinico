import type { CopilotOutput } from '../../copilot/guardrails/output-validator';

export interface PrescricaoDocument {
  paciente: string;
  data: string;
  medicamentos: MedicamentoItem[];
  orientacoes: string;
  incerteza: boolean;
  avisoRevisao: string | null;
}

export interface MedicamentoItem {
  medicamento: string;
  dosagem: string;
  via: string;
  frequencia: string;
  duracao: string;
}

const MED_PATTERN =
  /([A-ZÀ-Ú][a-zA-ZÀ-ú\s]+?)\s+(\d+[\d,.]*\s*(?:mg|g|mcg|UI|ml|%)[^,;.]*)?(?:,\s*(?:via\s+)?([a-zA-ZÀ-ú]+))?,\s*([^,;.]+(?:x|vezes)[^,;.]+)(?:,\s*(?:por\s+)?(\d+[\s\w]+))?/gi;

function extractMedicamentos(text: string): MedicamentoItem[] {
  const items: MedicamentoItem[] = [];
  const lines = text.split(/[\n;]/);

  for (const line of lines) {
    const lower = line.toLowerCase();
    if (
      lower.includes('prescrever') ||
      lower.includes('administrar') ||
      lower.includes('iniciar') ||
      lower.includes('mg') ||
      lower.includes('comprimido') ||
      lower.includes('ampola') ||
      lower.includes('dose')
    ) {
      items.push({
        medicamento: line.trim().replace(/^[-•*]\s*/, ''),
        dosagem: '',
        via: '',
        frequencia: '',
        duracao: '',
      });
    }
  }

  return items;
}

export function generatePrescricao(
  caseText: string,
  copilotOutput: CopilotOutput,
  patientRef?: string,
): PrescricaoDocument {
  const allText = `${caseText}\n${copilotOutput.recommendations.map((r) => r.action).join('\n')}`;
  const medicamentos = extractMedicamentos(allText);

  const hasMeds = medicamentos.length > 0;

  const orientacoesLines = copilotOutput.recommendations
    .filter((r) => {
      const a = r.action.toLowerCase();
      return (
        a.includes('orientar') ||
        a.includes('repouso') ||
        a.includes('dieta') ||
        a.includes('retornar') ||
        a.includes('retorno')
      );
    })
    .map((r) => `- ${r.action}`);

  return {
    paciente: patientRef ?? 'Identificação do paciente',
    data: new Date().toLocaleDateString('pt-BR'),
    medicamentos: hasMeds
      ? medicamentos
      : [
          {
            medicamento: '⚠ Nenhum medicamento identificado automaticamente — preencher manualmente',
            dosagem: '',
            via: '',
            frequencia: '',
            duracao: '',
          },
        ],
    orientacoes:
      orientacoesLines.length > 0
        ? orientacoesLines.join('\n')
        : copilotOutput.recommendations.slice(0, 3).map((r) => `- ${r.action}`).join('\n') ||
          'Orientações a serem preenchidas pelo médico',
    incerteza: copilotOutput.uncertainty,
    avisoRevisao: copilotOutput.uncertainty
      ? `REVISÃO OBRIGATÓRIA: ${copilotOutput.uncertaintyReason ?? 'Evidência insuficiente — prescrição requer validação médica antes de dispensação'}`
      : hasMeds
        ? null
        : 'Prescrição gerada sem medicamentos identificados — revise e complete antes de assinar',
  };
}
