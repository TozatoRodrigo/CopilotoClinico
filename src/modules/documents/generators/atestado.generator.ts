import type { CopilotOutput } from '../../copilot/guardrails/output-validator';

export type AtestadoTipo = 'comparecimento' | 'afastamento' | 'acompanhamento';

export interface AtestadoDocument {
  tipo: AtestadoTipo;
  paciente: string;
  data: string;
  cidSugerido: string | null;
  periodoAfastamento: string | null;
  descricao: string;
  assinaturaPlaceholder: string;
  incerteza: boolean;
  avisoRevisao: string | null;
}

function detectTipo(text: string): AtestadoTipo {
  const lower = text.toLowerCase();
  if (lower.includes('afastamento') || lower.includes('repouso') || lower.includes('licença')) {
    return 'afastamento';
  }
  if (lower.includes('acompanhamento') || lower.includes('acompanhar')) {
    return 'acompanhamento';
  }
  return 'comparecimento';
}

function extractCid(text: string): string | null {
  const cidMatch = text.match(/\bCID[-\s]?([A-Z]\d{2}(?:\.\d)?)\b/i);
  if (cidMatch) return cidMatch[0].toUpperCase();

  const lower = text.toLowerCase();
  if (lower.includes('infarto') || lower.includes('sca')) return 'CID I21';
  if (lower.includes('avc') || lower.includes('acidente vascular')) return 'CID I63';
  if (lower.includes('sepse') || lower.includes('sepsis')) return 'CID A41';
  if (lower.includes('pneumonia')) return 'CID J18';
  if (lower.includes('asma') || lower.includes('broncoespasmo')) return 'CID J45';
  if (lower.includes('trauma')) return 'CID T14';

  return null;
}

function buildDescricao(tipo: AtestadoTipo, caseText: string): string {
  const snippet = caseText.substring(0, 200).replace(/\n/g, ' ');
  switch (tipo) {
    case 'afastamento':
      return `Atesto que o(a) paciente esteve sob meus cuidados médicos e necessita de afastamento de suas atividades habituais conforme avaliação clínica. ${snippet}`;
    case 'acompanhamento':
      return `Atesto que o(a) paciente necessita de acompanhamento médico especializado e esteve presente em consulta nesta data. ${snippet}`;
    default:
      return `Atesto que o(a) paciente compareceu a atendimento médico nesta data. ${snippet}`;
  }
}

export function generateAtestado(
  caseText: string,
  copilotOutput: CopilotOutput,
  patientRef?: string,
): AtestadoDocument {
  const allText = `${caseText}\n${copilotOutput.recommendations.map((r) => r.action).join('\n')}`;
  const tipo = detectTipo(caseText);
  const cidSugerido = extractCid(caseText);

  const periodoAfastamento =
    tipo === 'afastamento'
      ? (() => {
          const match = allText.match(/(\d+)\s*(?:dias?|semanas?)/i);
          return match ? match[0] : 'período a ser definido pelo médico';
        })()
      : null;

  return {
    tipo,
    paciente: patientRef ?? 'Identificação do paciente',
    data: new Date().toLocaleDateString('pt-BR'),
    cidSugerido,
    periodoAfastamento,
    descricao: buildDescricao(tipo, caseText),
    assinaturaPlaceholder: '___________________________\nMédico(a) Responsável\nCRM: __________',
    incerteza: copilotOutput.uncertainty,
    avisoRevisao: copilotOutput.uncertainty
      ? `REVISÃO: ${copilotOutput.uncertaintyReason ?? 'Dados clínicos com incerteza — revisar antes de assinar'}`
      : null,
  };
}
