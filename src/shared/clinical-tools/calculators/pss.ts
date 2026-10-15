import type { ClassificationCalculator } from '../calculator';
import { ANY_V4_CALCULATOR_SOURCE } from '../provenance';
import { bandIsResult, choiceItem } from './items';

/** Porte do `pss` do ANY. Graus e faixas iguais; ações como sugestão. */
export const PSS: ClassificationCalculator = {
  kind: 'classification',
  id: 'pss',
  name: 'PSS (Poisoning Severity Score)',
  aliases: ['pss', 'intóxicação', 'envenenamento', 'gravidade', 'toxicologia'],
  category: 'Toxicologia',
  description: 'Classificação de gravidade da intoxicação aguda em 4 graus.',
  reference: {
    why: 'Padrão internacional para classificar a gravidade de intoxicações, facilitando a comunicação e a pesquisa.',
    whenToUse:
      'Pacientes com intoxicação aguda, para classificar a gravidade e guiar o nível de cuidado.',
    pearlsPitfalls: [
      'Grau 0 (nenhum): sem sinais ou sintomas.',
      'Grau 1 (leve): sintomas leves e transitórios, que resolvem espontaneamente.',
      'Grau 2 (moderado): sintomas pronunciados ou prolongados, potencialmente ameaçadores.',
      'Grau 3 (grave): sintomas graves ou potencialmente fatais.',
      'Avaliar no pior momento clínico. Pode ser retrospectivo.',
    ],
    citation:
      'Persson HE et al. Poisoning severity score. Grading of acute poisoning. J Toxicol Clin Toxicol. 1998;36(3):205-13.',
  },
  provenance: {
    source: ANY_V4_CALCULATOR_SOURCE,
    version: '1.0.0',
    updatedAt: '2026-10-15',
    review: { status: 'pendente' },
  },
  items: [
    choiceItem('grade', 'Gravidade da intoxicação', [
      ['0', 'Grau 0 — nenhum: sem sinais ou sintomas relacionados à intoxicação', 0],
      ['1', 'Grau 1 — leve: sintomas leves, transitórios, resolvem espontaneamente', 1],
      ['2', 'Grau 2 — moderado: sintomas pronunciados ou prolongados', 2],
      ['3', 'Grau 3 — grave: sintomas graves ou potencialmente fatais', 3],
      ['fatal', 'Fatal — óbito causado diretamente pela intoxicação ou por suas complicações', 4],
    ]),
  ],
  formatValue: bandIsResult,
  interpretation: {
    bands: [
      {
        id: '0',
        upTo: { value: 0, inclusive: true },
        label: 'PSS 0 — nenhum',
        tone: 'neutral',
        action:
          'Sem sintomas. Considere observação conforme o agente envolvido e alta após período de observação adequado.',
      },
      {
        id: '1',
        upTo: { value: 1, inclusive: true },
        label: 'PSS 1 — leve',
        tone: 'neutral',
        action:
          'Intoxicação leve. Sintomas transitórios. Considere observação e tratamento de suporte. Alta provável.',
      },
      {
        id: '2',
        upTo: { value: 2, inclusive: true },
        label: 'PSS 2 — moderado',
        tone: 'attention',
        action:
          'Intoxicação moderada. Considere monitoramento próximo, tratamento de suporte e antídoto específico.',
      },
      {
        id: '3',
        upTo: { value: 3, inclusive: true },
        label: 'PSS 3 — grave',
        tone: 'critical',
        action:
          'Intoxicação grave. UTI recomendada. Considere tratamento agressivo de suporte e antídoto.',
      },
    ],
    otherwise: {
      id: 'fatal',
      label: 'Fatal',
      tone: 'critical',
      action: 'Óbito relacionado à intoxicação.',
    },
  },
};
