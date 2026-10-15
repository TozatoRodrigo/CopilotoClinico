import { byRule, requireValue, type FormulaCalculator } from '../calculator';
import { formatCompact, formatDecimal } from '../numbers';
import { ANY_V4_CALCULATOR_SOURCE } from '../provenance';
import { assessRumackMatthew, rumackMatthewLine } from '../toxicology/rumack-matthew';

/**
 * Porte do `nomogramaRumack` do ANY. A conta é a do motor
 * (`toxicology/rumack-matthew`), a mesma que o roteiro de Toxicologia vai
 * usar (CC-308: uma implementação só). O valor é a linha de tratamento na
 * hora informada; a faixa compara o nível com ela. A ação de lá dizia
 * "iniciar NAC imediatamente"; virou sugestão sem demora (ADR-017).
 */
export const NOMOGRAMA_RUMACK: FormulaCalculator = {
  kind: 'formula',
  id: 'nomograma-rumack',
  name: 'Nomograma de Rumack-Matthew (paracetamol)',
  aliases: [
    'rumack',
    'matthew',
    'paracetamol',
    'acetaminofeno',
    'intóxicação',
    'nac',
    'n-acetilcisteina',
  ],
  category: 'Toxicologia',
  description: 'Avalia a necessidade de N-acetilcisteína na intoxicação por paracetamol.',
  reference: {
    why: 'Identifica pacientes com risco de hepatotoxicidade que necessitam de tratamento com NAC.',
    whenToUse:
      'Pacientes com ingestão aguda de paracetamol e nível sérico disponível 4–24 h após a ingestão.',
    pearlsPitfalls: [
      'A linha de tratamento original inicia em 200 mcg/mL às 4 h e 25 mcg/mL às 16 h.',
      'Nos EUA, usa-se a linha de Rumack-Matthew (150 mcg/mL às 4 h). No Brasil, considere a mesma.',
      'Nível acima da linha de tratamento = iniciar NAC sem demora.',
      'Não aplicável se a hora da ingestão for desconhecida ou > 24 h: tratar empiricamente.',
      'Se apresentação > 8 h após a ingestão: iniciar NAC empiricamente e esperar o nível.',
      'A NAC é mais eficaz se iniciada < 8 h após a ingestão.',
    ],
    citation:
      'Rumack BH, Matthew H. Acetaminophen poisoning and toxicity. Pediatrics. 1975;55(6):871-6.',
  },
  provenance: {
    source: ANY_V4_CALCULATOR_SOURCE,
    version: '1.0.0',
    updatedAt: '2026-10-15',
    review: { status: 'pendente' },
  },
  inputs: [
    { id: 'hours', label: 'Horas após a ingestão', unit: 'h', min: 4, max: 24, step: 0.5 },
    {
      id: 'level',
      label: 'Nível sérico de paracetamol',
      unit: 'mcg/mL',
      min: 0,
      max: 1000,
      step: 1,
    },
  ],
  decimals: 1,
  unit: 'mcg/mL',
  formatValue: (line) => `linha ${formatDecimal(line, 1)} mcg/mL`,
  compute: (values) => rumackMatthewLine(requireValue(values, 'hours')),
  details: (_line, values) => [
    {
      label: 'Nível informado',
      value: `${formatCompact(requireValue(values, 'level'))} mcg/mL às ${formatCompact(requireValue(values, 'hours'))} h`,
    },
  ],
  interpretation: byRule(
    [
      {
        id: 'acima',
        label: 'Acima da linha de tratamento',
        tone: 'critical',
        action:
          'Risco de hepatotoxicidade. Considere iniciar N-acetilcisteína (NAC) sem demora: protocolo IV de 21 h ou oral de 72 h.',
      },
      {
        id: 'abaixo',
        label: 'Abaixo da linha de tratamento',
        tone: 'neutral',
        action:
          'Nível abaixo da linha de tratamento. NAC provavelmente desnecessária neste momento. Considere monitorar a função hepática.',
      },
    ],
    (_line, values) =>
      assessRumackMatthew(requireValue(values, 'hours'), requireValue(values, 'level')).aboveLine
        ? 'acima'
        : 'abaixo',
  ),
};
